import { createHash } from 'node:crypto';
import { fallo, validarId } from '../validaciones.js';
import { tercerosIngreso, tercerosSalida, activosMovimiento, activosRetorno, llavesRecojo, llavesDevolucion } from './schemas.js';
import { bienesValidados, registrarRetorno } from './reglasActivos.js';
import { validarEntrada, exigir, instante, fechaPosterior, revisionValida } from './primitivas.js';
import { adjuntarArchivo, identificarArchivo } from './archivos.js';

function normalizar(valor) {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.keys(valor).sort().map(k => [k, normalizar(valor[k])]));
  return valor;
}
const hash = valor => createHash('sha256').update(typeof valor === 'string' ? valor : JSON.stringify(normalizar(valor))).digest('hex');
const actor = usuario => {
  exigir(usuario?.id !== undefined && usuario?.id !== null, 'No se pudo identificar al usuario de la sesión.', 401);
  return String(usuario.id);
};
const tipos = tipo => exigir(['terceros', 'activos', 'llaves'].includes(tipo), 'Este control no se registra desde el ERP.', 400);

export function crearEscrituraService({ pool, almacen }) {
  async function transaccion(ejecutar) {
    const cliente = await pool.connect(), intentadas = [];
    let confirmando = false;
    try {
      await cliente.query('BEGIN');
      const resultado = await ejecutar(cliente, intentadas);
      confirmando = true;
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      try { await cliente.query('ROLLBACK'); } catch { /* Una conexión cerrada revierte una transacción no confirmada. */ }
      // Si la respuesta de COMMIT se perdió, conservamos los adjuntos: el reintento verifica la operación.
      if (!confirmando) for (const archivo of intentadas) {
        try { await almacen.borrar(archivo); } catch { console.error('Seguridad Patrimonial: quedó un adjunto de un envío no confirmado para revisión.'); }
      }
      throw error;
    } finally { cliente.release(); }
  }
  function repetida(operacion, clave, huella, usuarioId) {
    if (!operacion || operacion.clave !== clave) return false;
    exigir(operacion.huella === huella && operacion.usuarioId === usuarioId, 'Este envío ya se procesó con otros datos. Actualiza el listado para revisar el registro.', 409);
    return true;
  }
  return {
    async crear(tipo, entrada, file, usuario, clave) {
      tipos(tipo); validarId(clave);
      const usuarioId = actor(usuario);
      const datos = validarEntrada(tipo === 'terceros' ? tercerosIngreso : tipo === 'llaves' ? llavesRecojo : activosMovimiento, entrada);
      if (tipo === 'llaves') exigir(!file, 'El formulario de llaves no admite archivos.');
      const archivo = await identificarArchivo(file, tipo);
      const huella = hash({ tipo, datos, usuarioId, archivo: archivo ? { nombre: archivo.nombre, formato: archivo.formato, contenido: createHash('sha256').update(archivo.buffer).digest('hex') } : null });
      if (tipo === 'terceros') {
        const dnis = datos.dni.match(/\b\d{8}\b/g) || [];
        const resto = datos.dni.replace(/\b\d{8}\b/g, '').replace(/[\s/,;-]+/g, '');
        exigir(dnis.length > 0 && !resto && new Set(dnis).size === dnis.length, 'Indica DNI de ocho dígitos, sin duplicados.');
        const nombres = datos.nombre.replaceAll('/', '\n').split('\n').filter(n => n.trim());
        exigir(nombres.length === dnis.length, 'Indica un nombre y un DNI por persona, en el mismo orden.');
        datos.fecha = new Date(instante(`${datos.fechaIngreso}T${datos.horaIngreso}`)).toISOString();
        datos.estado = 'Registrado';
      } else if (tipo === 'llaves') {
        datos.estado = 'Fuera de garita';
      } else {
        datos.bienes = bienesValidados(datos.bienes);
        if (datos.movimiento === 'Salida' && datos.retorna === 'Sí' && datos.fechaPrevista) {
          exigir(datos.fechaPrevista >= new Date(instante(datos.fecha) - 5 * 3600000).toISOString().slice(0, 10), 'La fecha prevista de retorno no puede ser anterior al movimiento.');
        }
        datos.estado = datos.movimiento === 'Salida' && datos.retorna === 'Sí' ? 'Pendiente de retorno' : 'Cerrado';
        datos.retornos = [];
      }
      return transaccion(async (cliente, intentadas) => {
        await cliente.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`erp:${datos.id}`]);
        const actual = (await cliente.query('SELECT id,tipo,revision,datos FROM transreport.registros WHERE id=$1 FOR UPDATE', [datos.id])).rows[0];
        if (actual) {
          exigir(actual.tipo === tipo && repetida(actual.datos._erp?.creacion, clave, huella, usuarioId), 'Ya existe un registro con este identificador. Actualiza el listado.', 409);
          return { id: actual.id, revision: actual.revision, repetida: true };
        }
        if (tipo === 'llaves') {
          await cliente.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`llave:${datos.placa}`]);
          const abiertos = await cliente.query(`SELECT id FROM transreport.registros WHERE tipo='llaves'
            AND regexp_replace(upper(datos->>'placa'),'[[:space:]-]','','g')=$1
            AND datos->>'estado'='Fuera de garita'`, [datos.placa]);
          exigir(!abiertos.rows.length, 'Las llaves de esta unidad ya están fuera de garita.', 409);
        }
        datos.origenRegistro = 'ERP';
        datos._erp = { creacion: { clave, huella, usuarioId, fecha: new Date().toISOString() }, operaciones: [] };
        // Las FK de archivos son diferibles; ambas filas se confirman en la misma transacción.
        if (tipo !== 'llaves') datos[tipo === 'terceros' ? 'sctr' : 'sustento'] = await adjuntarArchivo(cliente, almacen, tipo, datos, archivo, intentadas);
        const row = (await cliente.query('INSERT INTO transreport.registros(id,tipo,base,datos) VALUES($1,$2,$3,$4) RETURNING id,revision', [datos.id, tipo, datos.base, datos])).rows[0];
        return { ...row, repetida: false };
      });
    },
    async cerrar(tipo, id, entrada, usuario, clave) {
      tipos(tipo); validarId(id); validarId(clave);
      const usuarioId = actor(usuario);
      const datos = validarEntrada(tipo === 'terceros' ? tercerosSalida : tipo === 'llaves' ? llavesDevolucion : activosRetorno, entrada);
      const huella = hash({ tipo, id, datos, usuarioId });
      return transaccion(async cliente => {
        const row = (await cliente.query('SELECT * FROM transreport.registros WHERE tipo=$1 AND id=$2 FOR UPDATE', [tipo, id])).rows[0];
        if (!row) throw fallo('El registro no está disponible.', 404);
        const anteriores = row.datos._erp?.operaciones || [];
        const operacion = anteriores.find(o => o.clave === clave);
        if (repetida(operacion, clave, huella, usuarioId)) return { id: row.id, revision: row.revision, repetida: true };
        revisionValida(row, datos.revision);
        let nuevo;
        if (tipo === 'terceros') {
          exigir(row.datos.estado === 'Registrado', 'La salida ya está registrada.', 409);
          fechaPosterior(datos.salida, row.datos.fecha || `${row.datos.fechaIngreso}T${row.datos.horaIngreso}`);
          nuevo = { ...row.datos, salidaReal: datos.salida, observacionesCierre: datos.observaciones, estado: 'Salida registrada' };
        } else if (tipo === 'llaves') {
          exigir(row.datos.estado === 'Fuera de garita', 'Las llaves ya fueron devueltas.', 409);
          fechaPosterior(datos.devolucionFecha, row.datos.fecha);
          nuevo = { ...row.datos, devolucionFecha: datos.devolucionFecha, recibe: datos.recibe,
            observacionesCierre: datos.observaciones, estado: 'Devuelta' };
        } else {
          exigir(Array.isArray(row.datos.bienes) && row.datos.bienes.length, 'El registro no contiene bienes para registrar el retorno.');
          nuevo = registrarRetorno(row.datos, datos);
        }
        nuevo._erp = { ...(row.datos._erp || {}), operaciones: [...anteriores, { clave, huella, usuarioId, fecha: new Date().toISOString() }] };
        return { ...(await cliente.query('UPDATE transreport.registros SET datos=$2,revision=revision+1,actualizado_en=now() WHERE id=$1 RETURNING id,revision', [id, nuevo])).rows[0], repetida: false };
      });
    },
  };
}

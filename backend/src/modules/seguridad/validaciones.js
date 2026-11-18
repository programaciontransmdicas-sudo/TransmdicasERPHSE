export const CONTROLES = [
  { id: 'vehiculos', nombre: 'Vehículos' },
  { id: 'personal', nombre: 'Personal' },
  { id: 'llaves', nombre: 'Llaves vehiculares' },
  { id: 'relevos', nombre: 'Relevos de turno' },
  { id: 'rondas', nombre: 'Rondas de supervisión' },
  { id: 'terceros', nombre: 'Terceros' },
  { id: 'activos', nombre: 'Activos' },
];
const BASES = ['Peruarbo', 'Moquegua', 'Espinar'];
export const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

export function validarTipo(tipo) {
  if (!CONTROLES.some(control => control.id === tipo)) throw fallo('Selecciona un control válido.');
  return tipo;
}

export function validarId(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
    throw fallo('El identificador del registro no es válido.');
  }
  return id;
}

function texto(valor, nombre, maximo) {
  if (valor === undefined) return '';
  if (typeof valor !== 'string' || valor.length > maximo) throw fallo(`Revisa el filtro ${nombre}.`);
  return valor.trim();
}

function dia(valor, nombre) {
  const fecha = texto(valor, nombre, 10);
  if (!fecha) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < '1900-01-01' || fecha > '9998-12-31') {
    throw fallo(`Revisa la fecha ${nombre}.`);
  }
  const instante = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== fecha) {
    throw fallo(`Revisa la fecha ${nombre}.`);
  }
  return fecha;
}

export function validarFiltros(consulta = {}) {
  const base = texto(consulta.base, 'base', 30);
  if (base && !BASES.includes(base)) throw fallo('Selecciona una base válida.');
  const desde = dia(consulta.desde, 'desde');
  const hasta = dia(consulta.hasta, 'hasta');
  if (desde && hasta && desde > hasta) throw fallo('La fecha inicial no puede superar la fecha final.');
  const pagina = consulta.pagina === undefined ? '1' : consulta.pagina;
  if (typeof pagina !== 'string' || !/^[1-9]\d{0,5}$/.test(pagina) || Number(pagina) > 100000) {
    throw fallo('La página solicitada no es válida.');
  }
  return {
    base: base || null,
    desde,
    hasta,
    busqueda: texto(consulta.busqueda, 'búsqueda', 100),
    estado: texto(consulta.estado, 'estado', 80),
    pagina: Number(pagina),
    limite: 25,
  };
}

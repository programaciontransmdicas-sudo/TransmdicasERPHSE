import { pool } from '../../../../config/database.js';
import { logAction } from '../../../../services/auditService.js';
import { ValidationError } from '../../comun.js';
import { normalizarQuincena } from '../service.js';
import { cargarEstado } from './repository.js';
import { planificar, efectiva, indice, quincena, MOTIVOS, nivelRegular, editable } from './planificador.js';
export async function destinosConDesplazamiento(programaId, visitaId) {
  const estado = await cargarEstado(pool, programaId, visitaId);
  if (!estado) throw new ValidationError('Visita no encontrada', 404);
  const visita = estado.visitas.find(v => v.id === visitaId);
  const destinos = [];
  const inicio = indice(efectiva(visita)) + 1;
  for (let i = inicio; i < inicio + 1; i++) {
    const fecha = quincena(i);
    try {
      if (fecha === efectiva(visita)) throw new ValidationError('Es la quincena efectiva actual.');
      const plan = planificar({
        ...estado,
        seleccionadaId: visitaId,
        destino: fecha
      });
      destinos.push({
        quincena: fecha,
        disponible: true,
        desplazadas: plan.cambios.filter(c => !c.manual && c.cambioFecha).length
      });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      destinos.push({
        quincena: fecha,
        disponible: false,
        motivo: error.message
      });
    }
  }
  return {
    fecha_negocio: estado.fechaNegocio,
    total: destinos.length,
    disponibles: destinos.filter(d => d.disponible).length,
    destinos,
    motivos: MOTIVOS,
    permite_desplazamiento: true,
    solo_siguiente_quincena: true,
    reprogramable: {
      puede: editable(visita),
      motivo: editable(visita) ? null : 'La visita tiene una orden o resultado histórico.'
    },
    mensaje: 'Solo se permite reprogramar a la siguiente quincena de la visita. Ese destino no está disponible; revise el motivo indicado.'
  };
}
async function moverSinColisiones(client, cambios, visitas) {
  const pendientes = cambios.filter(c => c.cambioFecha).map(c => ({
    ...c
  }));
  const ocupadas = new Map(visitas.filter(v => v.estado !== 'CANCELADO').map(v => [efectiva(v), v.id]));
  const actuales = new Map(visitas.map(v => [v.id, efectiva(v)]));
  let temporal = Math.max(...visitas.map(v => indice(efectiva(v)))) + 1;
  while (pendientes.length) {
    let pos = pendientes.findIndex(c => !ocupadas.has(c.despues.quincena_efectiva));
    if (pos < 0) {
      // Solo necesario al adelantar una visita y formar una permutación de slots.
      // Se libera dentro de la transacción y nunca se confirma la fecha temporal.
      const c = pendientes[0],
        q = quincena(temporal++),
        id = c.antes.id;
      await client.query('UPDATE programacion_mantenimiento SET quincena_reprogramada=$2::date WHERE id=$1', [id, q]);
      ocupadas.delete(actuales.get(id));
      ocupadas.set(q, id);
      actuales.set(id, q);
      continue;
    }
    const [c] = pendientes.splice(pos, 1),
      id = c.antes.id,
      q = c.despues.quincena_efectiva;
    await client.query(`UPDATE programacion_mantenimiento SET quincena_reprogramada=$2::date, estado='REPROGRAMADO' WHERE id=$1`, [id, q]);
    ocupadas.delete(actuales.get(id));
    ocupadas.set(q, id);
    actuales.set(id, q);
  }
}
export async function aplicarAjuste({
  programaId,
  visitaId,
  destino = null,
  nuevoNivel = null,
  motivo,
  req
}) {
  if (destino !== null) destino = normalizarQuincena('quincena_reprogramada', destino);
  if (destino && !MOTIVOS.includes(motivo)) throw new ValidationError('Seleccione un motivo válido de reprogramación.');
  if (nuevoNivel && !['M1', 'M2', 'M3'].includes(nuevoNivel)) throw new ValidationError('Seleccione M1, M2 o M3.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const estado = await cargarEstado(client, programaId, visitaId, true);
    if (!estado) throw new ValidationError('Visita no encontrada', 404);
    const plan = planificar({
      ...estado,
      seleccionadaId: visitaId,
      destino,
      nuevoNivel
    });
    if (!plan.cambios.length) {
      await client.query('COMMIT');
      return {
        success: true,
        sin_cambios: true,
        cambios: [],
        visita_id: visitaId
      };
    }
    await moverSinColisiones(client, plan.cambios, estado.visitas);
    for (const c of plan.cambios) {
      const nota = c.manual ? destino ? motivo : `Nivel regular elevado de ${plan.nivelAnterior} a ${nuevoNivel}.` : `Programación recalculada por el ajuste de la visita #${visitaId}.`;
      const actualizado = await client.query(`UPDATE programacion_mantenimiento
        SET version_programa_id=$2, nivel_regular_forzado=$3, planificacion_ajustada=$4,
          observaciones=COALESCE(NULLIF(observaciones,'') || E'\n\n','') ||
            '[' || to_char(now() AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI') || ' · ' || $5 || ' · autor ' || $6::text || '] ' || $7
        WHERE id=$1 RETURNING observaciones, updated_at`, [c.antes.id, c.despues.version_programa_id, c.despues.nivel_regular_forzado || null, true, c.manual && destino ? 'REPROGRAMACION' : 'AJUSTE_PLANIFICACION', req.user.id, nota]);
      c.despues.observaciones = actualizado.rows[0].observaciones;
      c.despues.updated_at = actualizado.rows[0].updated_at;
      for (const equipo of c.despues.equipos) {
        const previo = c.antes.equipos.find(e => e.id === equipo.id);
        if (previo.nivel_mantenimiento !== equipo.nivel_mantenimiento) {
          await client.query('UPDATE programacion_mantenimiento_equipos SET nivel_mantenimiento=$2 WHERE id=$1', [equipo.id, equipo.nivel_mantenimiento]);
        }
      }
    }
    const tipo = destino ? 'REPROGRAMACION' : 'ELEVACION_NIVEL';
    const descripcion = destino ? motivo : `Nivel regular ${plan.nivelAnterior} → ${nuevoNivel}`;
    await client.query(`INSERT INTO programacion_mantenimiento_ajustes
      (programa_id,programa_unidad_id,programacion_id,tipo,quincena_anterior,quincena_destino,motivo,creado_por,cambios)
      VALUES($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb)`, [programaId, estado.unidadId, visitaId, tipo, plan.origen, plan.destino, descripcion, req.user.id, JSON.stringify(plan.cambios)]);
    for (const c of plan.cambios.filter(c => !c.manual)) {
      await client.query(`INSERT INTO programacion_mantenimiento_ajustes
        (programa_id,programa_unidad_id,programacion_id,tipo,quincena_anterior,quincena_destino,motivo,creado_por,cambios)
        VALUES($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb)`, [programaId, estado.unidadId, c.antes.id, c.cambioFecha ? 'REPROGRAMACION' : 'RECALCULO_PLAN', efectiva(c.antes), c.despues.quincena_efectiva, `Ajuste por la visita #${visitaId}. ${descripcion}`, req.user.id, JSON.stringify([c])]);
    }
    await logAction(req.user.id, `${tipo}: visita #${visitaId} de ${estado.placa}. ${descripcion}`, 'programacion_mantenimiento', req, plan.cambios.map(c => c.antes), plan.cambios.map(c => c.despues), {
      client,
      propagarError: true
    });
    await client.query('COMMIT');
    return {
      success: true,
      visita_id: visitaId,
      placa: estado.placa,
      cambios: plan.cambios.map(c => ({
        id: c.antes.id,
        antes: efectiva(c.antes),
        despues: c.despues.quincena_efectiva,
        nivel_anterior: nivelRegular(c.antes),
        nivel_nuevo: nivelRegular(c.despues)
      }))
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Se ejecuta dentro de la misma transacción del cierre, después de que PostgreSQL
// actualice los ciclos reales. Una ejecución parcial no se cuenta como un M3 completo.
export async function recalcularTrasCierre(client, programaId, visitaId, usuarioId) {
  const estado = await cargarEstado(client, programaId, visitaId, true);
  if (!estado) throw new ValidationError('No se encontró la programación de la orden.', 409);
  const plan = planificar({
    ...estado,
    seleccionadaId: visitaId,
    soloRecalculo: true
  });
  for (const c of plan.cambios) {
    await client.query(`UPDATE programacion_mantenimiento SET version_programa_id=$2,
      planificacion_ajustada=true WHERE id=$1`, [c.antes.id, c.despues.version_programa_id]);
    for (const e of c.despues.equipos) {
      if (c.antes.equipos.find(a => a.id === e.id).nivel_mantenimiento !== e.nivel_mantenimiento) {
        await client.query('UPDATE programacion_mantenimiento_equipos SET nivel_mantenimiento=$2 WHERE id=$1', [e.id, e.nivel_mantenimiento]);
      }
    }
    await client.query(`INSERT INTO programacion_mantenimiento_ajustes
      (programa_id,programa_unidad_id,programacion_id,tipo,quincena_anterior,quincena_destino,motivo,creado_por,cambios)
      VALUES($1,$2,$3,'RECALCULO_CIERRE',$4::date,$4::date,$5,$6,$7::jsonb)`, [programaId, estado.unidadId, c.antes.id, efectiva(c.antes), `Programa ajustado al resultado real de la visita #${visitaId}.`, usuarioId, JSON.stringify([c])]);
  }
  return plan.cambios.length;
}

import {
  CODIGO, cargarInsumos, generar, materializar
} from '../../../scripts/ti-pr-01/generador-nucleo.mjs';
import { errorConfiguracionPrograma, prepararInicioPrograma } from './altaProgramaService.js';

// Se ejecuta con el MISMO cliente y transacción que el alta del vehículo/inventario.
export async function incorporarNuevaUnidad(cliente, placa, equipos) {
  const { rows: fecha } = await cliente.query(
    "SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS fecha_negocio"
  );
  const hoy = fecha[0].fecha_negocio;
  const { rows: programas } = await cliente.query(`
    SELECT id FROM programas_mantenimiento
    WHERE codigo = $1 AND estado = 'ACTIVO' FOR SHARE
  `, [CODIGO]);
  if (programas.length !== 1) {
    throw errorConfiguracionPrograma('Debe existir un programa TI-PR-01 activo para crear la unidad.');
  }
  const programaId = programas[0].id;
  const { rows: versiones } = await cliente.query(`
    SELECT id, periodo_inicio::text AS periodo_inicio, periodo_fin::text AS periodo_fin
    FROM programas_mantenimiento_versiones
    WHERE programa_id = $1 AND estado = 'VIGENTE'
      AND periodo_inicio <= $2::date AND periodo_fin >= $2::date
      AND vigencia_desde <= $2::date
      AND (vigencia_hasta IS NULL OR vigencia_hasta > $2::date)
    FOR SHARE
  `, [programaId, hoy]);
  if (versiones.length !== 1) {
    throw errorConfiguracionPrograma('Actualice el período vigente de TI-PR-01 antes de crear la unidad.');
  }
  const { rows: frecuencias } = await cliente.query(`
    SELECT tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
    FROM programa_mantenimiento_frecuencias WHERE programa_id = $1 FOR SHARE
  `, [programaId]);
  const inicio = prepararInicioPrograma(equipos, frecuencias, hoy);
  if (inicio.quincena < versiones[0].periodo_inicio) {
    throw errorConfiguracionPrograma('El período de TI-PR-01 debe incluir la quincena actual para incorporar la unidad.');
  }
  const { rows: unidades } = await cliente.query(`
    INSERT INTO programa_mantenimiento_unidades
      (programa_id, placa, quincena_incorporacion, habilitado, familias_confirmadas)
    VALUES ($1, $2, $3::date, true, '{}'::text[]) RETURNING id
  `, [programaId, placa, inicio.quincena]);
  const unidadId = unidades[0].id;
  for (const ancla of inicio.anclas) {
    await cliente.query(`
      INSERT INTO programa_mantenimiento_unidad_anclas
        (programa_unidad_id, programa_id, tipo_equipo, nivel_mantenimiento,
         quincena_ancla, origen, observaciones)
      VALUES ($1, $2, $3, $4, $5::date, 'MANUAL', $6)
    `, [unidadId, programaId, ancla.familia, ancla.nivel, ancla.quincena,
      'Inicio de planificación de la nueva unidad. No acredita una ejecución de mantenimiento.']);
  }

  const insumos = await cargarInsumos(cliente, programaId);
  // El generador es compartido. Este alta solo puede escribir la unidad recién creada.
  const propios = {
    ...insumos,
    refs: insumos.refs.filter(r => r.unidad === unidadId),
    uni: new Map([[unidadId, insumos.uni.get(unidadId)]]),
    ajustadas: new Set(),
    revisionAjustes: new Map()
  };
  const plan = generar(propios, inicio.quincena, versiones[0].periodo_fin);
  if (plan.colisiones.length || plan.visitas.some(v => v.unidad !== unidadId || !v.version_id)) {
    throw errorConfiguracionPrograma('No se pudo completar la programación de la nueva unidad. Revise TI-PR-01.');
  }
  const primeraRegular = plan.visitas.find(v => v.nivel_regular);
  if (inicio.regulares.length &&
      (!primeraRegular || primeraRegular.quincena !== inicio.quincena || primeraRegular.nivel_regular !== 'M1')) {
    throw errorConfiguracionPrograma('No se pudo iniciar el mantenimiento regular en M1. Revise las frecuencias de TI-PR-01.');
  }
  const resultado = await materializar(cliente, plan.seguras);
  if (resultado.red_de_seguridad.length || resultado.programaciones !== plan.visitas.length) {
    throw errorConfiguracionPrograma('La programación cambió durante el alta. Vuelva a intentar crear la unidad.');
  }
  // Las notas técnicas del generador no se muestran al usuario al crear su unidad.
  if (resultado.escritas.length) {
    await cliente.query(`UPDATE programacion_mantenimiento SET observaciones = $1
      WHERE programa_unidad_id = $2 AND id = ANY($3::integer[])`,
    ['Mantenimiento programado al incorporar la unidad.', unidadId,
      resultado.escritas.map(v => v.programacion_id)]);
  }
  return {
    programa_id: programaId, programa_unidad_id: unidadId, codigo: CODIGO,
    quincena_incorporacion: inicio.quincena,
    primera_regular: primeraRegular ? { quincena: primeraRegular.quincena, nivel: 'M1' } : null,
    visitas_creadas: resultado.programaciones, equipos_programados: inicio.regulares,
    pendientes: inicio.pendientes
  };
}

import { pool } from '../../config/database.js';

// ==========================================
// PROGRAMAS DE MANTENIMIENTO (TI-PR-01)
// SQL contra el modelo 013-016. Siempre parametrizado, columnas siempre explicitas.
// ==========================================
//
// EL ENCABEZADO SOLO DEVUELVE LO QUE SOBREVIVE AL CLEANUP.
// programas_mantenimiento tiene hoy 7 columnas condenadas: version, fecha_documento,
// periodo_inicio y periodo_fin las retira 20261001_901; frecuencia_m1/m2/m3_dias las
// retira 20261001_900. Exponerlas en la respuesta ataria el contrato de la API a columnas
// que van a desaparecer, asi que NO se seleccionan.
//
// Los mismos datos, ya normalizados, se leen de programas_mantenimiento_versiones, que es
// donde el 901 dice que viven. Hoy ambas copias coinciden, asi que la API no pierde
// informacion y no cambiara de forma el dia del cleanup.
//
// SIN N+1: las versiones de TODOS los programas del listado se traen en UNA consulta y se
// agrupan en memoria. La fecha de negocio viaja en la misma consulta, asi que el listado
// completo cuesta 2 viajes contra el pooler, sea uno o cien programas.
//
// Cada funcion acepta un cliente opcional para poder ejecutarse dentro de una transaccion
// de prueba con ROLLBACK. Por defecto usa el pool, igual que el resto de los modulos.

const COLUMNAS_PROGRAMA = `
  p.id,
  p.codigo,
  p.nombre,
  p.estado,
  p.created_at,
  p.updated_at`;

// Fechas como texto: date -> Date de JavaScript desplaza la zona horaria.
const COLUMNAS_VERSION = `
  v.id,
  v.programa_id,
  v.version,
  v.fecha_documento::text  AS fecha_documento,
  v.vigencia_desde::text   AS vigencia_desde,
  v.vigencia_hasta::text   AS vigencia_hasta,
  v.periodo_inicio::text   AS periodo_inicio,
  v.periodo_fin::text      AS periodo_fin,
  v.estado,
  v.observaciones,
  v.created_at,
  v.updated_at`;

// La fecha de negocio se calcula en la base con America/Lima, nunca con CURRENT_DATE: la
// sesion puede estar en UTC. Es la misma fecha que usa el generador.
//
// Se EXPORTA para que ningun otro modulo tenga que escribir su propia expresion temporal:
// obtenerVersionAplicable la reutiliza, y asi la fecha con la que se decide si una quincena
// ya paso es literalmente la misma que la API publica como fecha_negocio.
export const FECHA_NEGOCIO =
  `((now() AT TIME ZONE 'America/Lima')::date)::text AS fecha_negocio`;

// Devuelve { fecha_negocio, programas }: la fecha sale UNA vez, no repetida en cada fila.
// Asi el contrato no depende de que el controller se acuerde de quitarla de cada programa.
export const obtenerProgramas = async (
  { estado = null } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_PROGRAMA},
            ${FECHA_NEGOCIO},
            (SELECT count(*)::int
               FROM programas_mantenimiento_versiones v
              WHERE v.programa_id = p.id) AS total_versiones,
            (SELECT count(*)::int
               FROM programa_mantenimiento_unidades u
              WHERE u.programa_id = p.id AND u.habilitado) AS total_unidades
     FROM programas_mantenimiento p
     WHERE ($1::text IS NULL OR p.estado = $1)
     ORDER BY p.codigo ASC`,
    [estado]
  );

  return {
    fecha_negocio: result.rows.length > 0
      ? result.rows[0].fecha_negocio
      : null,
    programas: result.rows.map(
      ({ fecha_negocio, ...programa }) => programa
    )
  };
};

// Devuelve { fecha_negocio, programa }, por la misma razon. programa es null si no existe.
export const obtenerProgramaPorId = async (
  id,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_PROGRAMA},
            ${FECHA_NEGOCIO},
            (SELECT count(*)::int
               FROM programa_mantenimiento_unidades u
              WHERE u.programa_id = p.id AND u.habilitado) AS total_unidades
     FROM programas_mantenimiento p
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return { fecha_negocio: null, programa: null };
  }

  const {
    fecha_negocio,
    ...programa
  } = result.rows[0];

  return { fecha_negocio, programa };
};

// Una sola consulta para N programas. Orden por vigencia descendente: es el que ya sirve
// idx_versiones_programa_vigencia.
export const obtenerVersionesDeProgramas = async (
  programaIds,
  cliente = pool
) => {
  if (programaIds.length === 0) {
    return new Map();
  }

  const result = await cliente.query(
    `SELECT ${COLUMNAS_VERSION}
     FROM programas_mantenimiento_versiones v
     WHERE v.programa_id = ANY($1::int[])
     ORDER BY v.programa_id ASC, v.vigencia_desde DESC, v.id DESC`,
    [programaIds]
  );

  const porPrograma = new Map(
    programaIds.map(id => [id, []])
  );

  for (const version of result.rows) {
    porPrograma
      .get(version.programa_id)
      .push(version);
  }

  return porPrograma;
};

// LA VERSION APLICABLE HOY. Es la consulta CANONICA que documenta 20260922_003:
//
//     estado IN ('VIGENTE','SUPERSEDIDA')
//       AND vigencia_desde <= fecha
//       AND (vigencia_hasta IS NULL OR vigencia_hasta > fecha)      intervalo semiabierto
//
// Se usa esa y no `estado = 'VIGENTE'` porque es la que el modelo declara, y porque
// exc_version_vigencia_sin_solape -EXCLUDE gist sobre daterange, medido en la base- GARANTIZA
// que devuelve como maximo UNA fila. Con el filtro por estado a secas esa garantia no existe.
//
// La fecha sale de la MISMA expresion que publica la API como fecha_negocio y se usa tambien
// para comparar la vigencia: una sola fuente temporal, no dos que puedan discrepar.
//
// El LEFT JOIN desde una subconsulta de una fila hace que SIEMPRE haya resultado: si ninguna
// version aplica, version es null y la fecha de negocio llega igual. Sin eso, un programa sin
// version obligaria a un segundo viaje solo para saber que dia es.
//
// periodo_inicio y periodo_fin son NULLABLE en el DDL, asi que quien consuma esto tiene que
// tratar el caso "version sin periodo"; aqui se devuelven tal cual, sin inventar un rango.
export const obtenerVersionAplicable = async (
  programaId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT f.fecha_negocio,
            ${COLUMNAS_VERSION}
     FROM (SELECT ${FECHA_NEGOCIO}) f
     LEFT JOIN programas_mantenimiento_versiones v
            ON v.programa_id = $1
           AND v.estado IN ('VIGENTE', 'SUPERSEDIDA')
           AND v.vigencia_desde <= f.fecha_negocio::date
           AND (v.vigencia_hasta IS NULL
                OR v.vigencia_hasta > f.fecha_negocio::date)`,
    [programaId]
  );

  const {
    fecha_negocio,
    ...version
  } = result.rows[0];

  return {
    fecha_negocio,
    version: version.id === null
      ? null
      : version
  };
};

export const actualizarPrograma = async (
  id,
  campos,
  data,
  cliente = pool
) => {
  // Lista blanca: campos ya viene filtrada por CAMPOS_EDITABLES en el service, y aqui se
  // vuelve a restringir para que ningun nombre llegue a la sentencia sin pasar por ella.
  const permitidos = {
    nombre: 'nombre'
  };

  const asignaciones = [];
  const valores = [];

  for (const campo of campos) {
    const columna = permitidos[campo];

    if (!columna) {
      continue;
    }

    valores.push(data[campo]);
    asignaciones.push(
      `${columna} = $${valores.length}`
    );
  }

  // Inalcanzable con el service actual, que exige al menos un campo. Se devuelve la fila
  // tal cual, no la forma { fecha_negocio, programa }, para que el tipo de retorno de esta
  // funcion sea uno solo.
  if (asignaciones.length === 0) {
    const {
      programa
    } = await obtenerProgramaPorId(
      id,
      cliente
    );

    return programa;
  }

  valores.push(id);

  const result = await cliente.query(
    `UPDATE programas_mantenimiento p
     SET ${asignaciones.join(', ')}
     WHERE p.id = $${valores.length}
     RETURNING ${COLUMNAS_PROGRAMA}`,
    valores
  );

  return result.rows[0] ?? null;
};

export const actualizarEstadoPrograma = async (
  id,
  estado,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE programas_mantenimiento p
     SET estado = $2
     WHERE p.id = $1
     RETURNING ${COLUMNAS_PROGRAMA}`,
    [id, estado]
  );

  return result.rows[0] ?? null;
};

// =====================================================================================
// CATALOGO DE TECNICOS TI · F5.1
// =====================================================================================
// EL CRITERIO OFICIAL, decidido por negocio el 2026-10-09: un tecnico TI es una PERSONA
// que tiene una cuenta de TI activa. Ni el area ni el cargo ni ningun patron de texto
// sobre personal participan. Auditado antes de fijarlo: personal no tiene area 'TI'
// -0 filas-, area ILIKE '%TI%' solo acierta LOGISTICA y COESTI-CUSCO, y cargo ILIKE '%TI%'
// devuelve 140 de 362. No habia criterio textual utilizable.
//
//   usuarios.rol = 'ti'          la CUENTA pertenece a TI
//   usuarios.persona_id          que PERSONA REAL es esa cuenta
//   personal.id                  lo que se persiste en ordenes_trabajo.tecnico_id
//
// LO QUE SE DEVUELVE ES personal.id, NO usuarios.id. Son dos dominios distintos y la FK
// fk_ot_tecnico apunta a personal(id).
//
// UNA SOLA DEFINICION DEL PREDICADO, compartida por el listado y por la validacion del
// cierre. Tener dos seria poder ofrecer en el selector a alguien que el cierre rechaza.
//
// LA MISMA NORMALIZACION QUE LA LOGICA DE APLICACION, no una propia. usuarios.rol y
// usuarios.estado carecen de CHECK, asi que su contenido no es de fiar, y comparar en crudo
// abriria una grieta: un usuario que el backend reconoce como TI -esUsuarioTi() y el
// middleware normalizan con String(v || D).trim().toLowerCase()- podria no aparecer en el
// catalogo, de modo que se autoasignaria al cerrar pero nadie podria seleccionarlo.
//
// LA EXPRESION SE MIDIO, no se supuso. Se probaron cuatro candidatas sobre 23 caracteres
// contra PostgreSQL 18.6 y se compararon con trim() de JavaScript uno por uno:
//
//   trim(x)                        11 divergencias · solo recorta espacios
//   btrim(x, E' \t\n\r\v\f')        6 divergencias · ningun espacio Unicode
//   regexp [[:space:]]              1 divergencia  · el BOM U+FEFF
//   regexp [[:space:]﻿]        0 divergencias · EQUIVALENTE
//
// La ultima recorta los 18 caracteres que trim() de JS recorta -TAB, LF, VT, FF, CR, SP,
// NBSP, OGHAM, los Space_Separator, LS, PS, NNBSP, MMSP, IDEO SP y el ZWNBSP- y NINGUNO de
// los que JS no recorta: ZWSP U+200B y ZWJ U+200D se conservan. El BOM entra explicito
// porque el estandar de JS lo incluye en WhiteSpace y PostgreSQL no lo considera espacio.
//
// EL nullif ES EL `||` DE JAVASCRIPT. `String(v || D)` aplica el defecto al valor CRUDO, asi
// que una cadena VACIA tambien cae al defecto. Para una columna varchar los unicos valores
// falsy son NULL y '', y nullif(v, '') los convierte en el mismo NULL que recoge el coalesce.
// Medido: sin el nullif, un estado '' daba `activo` en el codigo y NO activo en SQL.
//
//   codigo   String(usuario.rol ?? '').trim().toLowerCase()        === 'ti'
//   codigo   String(usuario.estado || 'activo').trim().toLowerCase() === 'activo'
//
// personal.estado es la EXCEPCION y se compara EXACTO: tiene CHECK ('Activo','Inactivo'),
// asi que la base ya garantiza su dominio y normalizarlo seria disimular un valor imposible.
const RECORTE_JS = `E'^[[:space:]\\uFEFF]+|[[:space:]\\uFEFF]+$'`;

const COMO_JS = (
  columna,
  defecto
) => `lower(regexp_replace(
         coalesce(nullif(${columna}, ''), ${defecto}),
         ${RECORTE_JS}, '', 'g'))`;

const TECNICO_TI_ELEGIBLE = `
  FROM usuarios us
  JOIN personal pe ON pe.id = us.persona_id
 WHERE ${COMO_JS('us.rol', "''")} = 'ti'
   AND ${COMO_JS('us.estado', "'activo'")} = 'activo'
   AND us.persona_id IS NOT NULL
   AND pe.estado = 'Activo'`;

// DISTINCT porque usuarios.persona_id NO tiene restriccion unica: el modelo permite dos
// cuentas para la misma persona, y en ese caso la persona debe aparecer UNA vez.
//
// Se publican SOLO id y nombre. Nada de DNI, area, cargo ni el resto de personal: el modal
// de cierre no los necesita y son datos personales.
export const obtenerTecnicosTi = async (
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT DISTINCT pe.id,
            pe.nombre_completo AS nombre
     ${TECNICO_TI_ELEGIBLE}
     ORDER BY nombre ASC`
  );

  return result.rows;
};

// La MISMA elegibilidad, para una sola persona. La usa el cierre para no confiar en lo que
// mande el cliente: que el selector haya ofrecido algo no es prueba de nada.
export const esTecnicoTiElegible = async (
  personaId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT 1 AS elegible
     ${TECNICO_TI_ELEGIBLE}
       AND pe.id = $1
     LIMIT 1`,
    [personaId]
  );

  return result.rowCount > 0;
};

export const existePrograma = async (
  id,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT 1 AS existe
     FROM programas_mantenimiento
     WHERE id = $1`,
    [id]
  );

  return result.rowCount > 0;
};

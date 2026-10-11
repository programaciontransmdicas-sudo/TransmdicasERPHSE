import { pool } from './database.js';

const ESQUEMA_ESPERADO = {
  audit_logs: [
    'id',
    'user_id',
    'accion',
    'tabla_afectada',
    'fecha',
    'ip_address',
    'valores_anteriores',
    'valores_actuales'
  ],

  entregas_ti: [
    'id',
    'fecha',
    'encargado',
    'nombre',
    'dni',
    'cargo',
    'operacion',
    'condicion',
    'equipo_tipo',
    'marca',
    'modelo',
    'serie',
    'laptop',
    'mouse',
    'cargador',
    'motivo',
    'observaciones',
    'precio',
    'tipo_movimiento',
    'documento_url',
    'cliente_operacion_id'
  ],

  incidentes_soporte: [
    'id',
    'placa',
    'tipo_solicitud',
    'descripcion',
    'operador',
    'estado',
    'fecha',
    'categoria',
    'prioridad',
    'evidencia',
    'operacion',
    'implemento',
    'evidencias_iniciales',
    'persona_pulsera',
    'dni_persona_pulsera',
    'motivo_renovacion'
  ],

  tickets_unidades: [
  'id',
  'placa',
  'persona_id',
  'tipo_solicitud',
  'descripcion',
  'estado',
  'implemento',
  'evidencias',
  'fecha_creacion',
  'fecha_cierre',
  'creado_por'
],
solicitudes_descarga_videos: [
  'id',
  'operacion',
  'fecha_descarga',
  'hora_inicio',
  'hora_fin',
  'motivo',
  'solicitado_por',
  'estado',
  'fecha_ingreso',
  'cliente_operacion_id'
],

solicitud_descarga_video_placas: [
  'solicitud_id',
  'placa'
],

  inspecciones_flota: [
    'id',
    'placa',
    'fecha_hora',
    'tablet',
    'radio',
    'camaras',
    'img_tablet',
    'img_radio',
    'img_camaras',
    'observaciones',
    'estado'
  ],

  mantenimientos_tecnicos: [
    'id',
    'placa',
    'fecha_ejecutada',
    'frecuencia_dias',
    'dvr',
    'copiloto',
    'radio_base',
    'handy',
    'camara_interna',
    'camara_externa',
    'camara_retroceso',
    'sensores_retroceso',
    'sensores_delanteros',
    'sistema_adas'
  ],

  personal: [
    'id',
    'nombre_completo',
    'dni',
    'area',
    'cargo',
    'estado',
    'created_at',
    'fecha_ingreso',
    'operacion',
    'fecha_cese'
  ],
  pulseras: [
  'id',
  'solicitante_persona_id',
  'receptor_persona_id',
  'operacion',
  'motivo_renovacion',
  'evidencia_url',
  'estado',
  'creado_por',
  'fecha_creacion',
  'fecha_cierre',
  'cliente_operacion_id'
],

  usuarios: [
    'id',
    'username',
    'password_hash',
    'rol',
    'estado',
    'permisos',
    'operacion',
    'created_at',
    'persona_id',
    'ultimo_acceso'
  ],

  vehiculos: [
    'placa',
    'tipo_vehiculo',
    'marca_tracto',
    'modelo_tracto',
    'anio_fabricacion',
    'operacion',
    'cliente',
    'cliente_operacion_id'
  ],

  clientes: [
    'id',
    'nombre',
    'activo',
    'es_interno'
  ],

  cliente_operaciones: [
    'id',
    'cliente_id',
    'nombre',
    'activo'
  ],

  supervisor_asignaciones: [
    'usuario_id',
    'cliente_operacion_id'
  ],
    notificaciones: [
    'id',
    'usuario_id',
    'tipo',
    'titulo',
    'mensaje',
    'url',
    'leida',
    'fecha_creacion',
    'fecha_lectura'
  ],

  // ==========================================
  // TI-PR-01 · PROGRAMA DE MANTENIMIENTO PREVENTIVO
  // ==========================================
  // Contrato del esquema FINAL, el posterior a 20261001_900 y _901. Las columnas que esos
  // cleanup retiran NO se declaran aquí, a propósito: si se declararan, initDb fallaría el
  // día que se ejecuten y el servidor no arrancaría. Las que sí están sobreviven al cleanup
  // y existen también antes de él, así que este contrato vale para los dos esquemas.
  //
  // Lo retirado y deliberadamente ausente:
  //   programas_mantenimiento      version, fecha_documento, periodo_inicio, periodo_fin
  //                                (viven en programas_mantenimiento_versiones)
  //                                frecuencia_m1_dias, m2, m3
  //                                (viven en programa_mantenimiento_frecuencias)
  //   programa_mantenimiento_unidades  fecha_base_m1, m2, m3, quincena_arranque
  //                                (la fase vive en los ciclos y las anclas de la unidad)
  //   programacion_mantenimiento   fecha_programada, fecha_reprogramada
  //                                (la unidad de planificación es la quincena)
  //                                nivel_mantenimiento
  //                                (el nivel vive por equipo en ..._equipos)
  programas_mantenimiento: [
    'id',
    'codigo',
    'nombre',
    'estado',
    'created_at',
    'updated_at'
  ],

  programas_mantenimiento_versiones: [
    'id',
    'programa_id',
    'version',
    'fecha_documento',
    'vigencia_desde',
    'vigencia_hasta',
    'periodo_inicio',
    'periodo_fin',
    'estado',
    'observaciones'
  ],

  programa_mantenimiento_frecuencias: [
    'id',
    'programa_id',
    'version_id',
    'tipo_equipo',
    'nivel_mantenimiento',
    'frecuencia_quincenas'
  ],

  programa_mantenimiento_unidades: [
    'id',
    'programa_id',
    'placa',
    'quincena_incorporacion',
    'observaciones'
  ],

  // La fase de cada equipo: lo que sustituye a fecha_base_m1/m2/m3.
  programa_mantenimiento_unidad_ciclos: [
    'id',
    'programa_unidad_id',
    'programa_id',
    'tipo_equipo',
    'nivel_mantenimiento',
    'ultima_quincena',
    'ultima_fecha_real',
    'fuente',
    'orden_trabajo_detalle_id'
  ],

  programa_mantenimiento_unidad_anclas: [
    'id',
    'programa_unidad_id',
    'programa_id',
    'tipo_equipo',
    'nivel_mantenimiento',
    'quincena_ancla',
    'origen'
  ],

  // quincena_efectiva es GENERATED ALWAYS sobre las otras dos: se exige porque el índice
  // único parcial de las visitas y todo el cálculo de fase dependen de ella.
  programacion_mantenimiento: [
    'id',
    'programa_id',
    'programa_unidad_id',
    'version_programa_id',
    'quincena_programada',
    'quincena_reprogramada',
    'quincena_efectiva',
    'estado',
    'fecha_ejecucion',
    'observaciones'
  ],

  // El alcance previsto de cada visita, y la fuente del nivel por equipo.
  programacion_mantenimiento_equipos: [
    'id',
    'programacion_id',
    'programa_id',
    'tipo_equipo',
    'nivel_mantenimiento'
  ],

  ordenes_trabajo: [
    'id',
    'programacion_id',
    'tecnico_id',
    'abierta_por_id',
    'cerrada_por_id',
    'fecha_apertura',
    'fecha_cierre',
    'estado',
    'motivo_anulacion',
    'minutos',
    'evidencias',
    'observaciones'
  ],

  ordenes_trabajo_detalle: [
    'id',
    'orden_trabajo_id',
    'programacion_id',
    'programacion_equipo_id',
    'estado',
    'nivel_completado',
    'evidencias',
    'observaciones'
  ]

};

const CAMPOS_DATE = [
  'entregas_ti.fecha',
  'mantenimientos_tecnicos.fecha_ejecutada',
  'vehiculos.anio_fabricacion',
  'personal.fecha_ingreso',
  'personal.fecha_cese',
  'solicitudes_descarga_videos.fecha_descarga',
  // TI-PR-01. El dominio de la quincena y del día de trabajo es DATE, nunca timestamp:
  // sobre estas columnas se calcula la fase, y una hora metida de contrabando desplazaría
  // la zona horaria. Se declaran las que entran en comparaciones o aritmética.
  'programacion_mantenimiento.quincena_programada',
  'programacion_mantenimiento.quincena_reprogramada',
  'programacion_mantenimiento.quincena_efectiva',
  'programacion_mantenimiento.fecha_ejecucion',
  'programa_mantenimiento_unidades.quincena_incorporacion',
  'programa_mantenimiento_unidad_ciclos.ultima_quincena',
  'programa_mantenimiento_unidad_ciclos.ultima_fecha_real',
  'programa_mantenimiento_unidad_anclas.quincena_ancla',
  'programas_mantenimiento_versiones.vigencia_desde',
  'programas_mantenimiento_versiones.vigencia_hasta',
];

export const initDb = async () => {
  const tablasEsperadas = Object.keys(
    ESQUEMA_ESPERADO
  );

  const { rows } = await pool.query(
    `SELECT
       table_name,
       column_name,
       data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [tablasEsperadas]
  );

  const tablasEncontradas = new Set(
    rows.map(row => row.table_name)
  );

  const columnasEncontradas = new Map(
    rows.map(row => [
      `${row.table_name}.${row.column_name}`,
      row.data_type
    ])
  );

  const faltantes = [];

  for (
    const [tabla, columnas] of
    Object.entries(ESQUEMA_ESPERADO)
  ) {
    if (!tablasEncontradas.has(tabla)) {
      faltantes.push(`tabla ${tabla}`);
      continue;
    }

    for (const columna of columnas) {
      const referencia = `${tabla}.${columna}`;

      if (!columnasEncontradas.has(referencia)) {
        faltantes.push(referencia);
      }
    }
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan tablas o columnas, o permisos para verlas: ${faltantes.join(', ')}. Revisa la base y las migraciones.`
    );
  }

  for (const campo of CAMPOS_DATE) {
    if (columnasEncontradas.get(campo) !== 'date') {
      throw new Error(
        `${campo} debe ser DATE. No se modificó la base de datos.`
      );
    }
  }

  console.log(
    'Tablas y columnas requeridas verificadas. Sin cambios en la base de datos.'
  );
};

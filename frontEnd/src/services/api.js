import { toast } from 'react-hot-toast';

// Si estamos en desarrollo usa localhost, si es producción usa Render
export const BASE_API_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : 'https://transmdicas-backend.onrender.com';
const BASE_URL = BASE_API_URL;

// Wrapper global para fetch que inyecta el token y maneja el 401
const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('nexus_token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Si no es FormData y no tiene Content-Type, agregamos JSON
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const newOptions = { ...options, headers };

  try {
    const response = await fetch(url, newOptions);

    // Solo forzar logout en 401 (Token inválido/expirado). 
    // 403 significa acceso denegado (ej. no es admin), no debe cerrar sesión.
    if (response.status === 401) {
      localStorage.removeItem('nexus_token');
      localStorage.removeItem('nexus_user');
      window.location.reload();
      return response;
    }

    // Interceptar cualquier error HTTP y mostrarlo como Toast automáticamente
    if (!response.ok) {
      try {
        const errData = await response.clone().json();
        const errorMsg = errData.error || errData.message || `Error HTTP: ${response.status}`;
        toast.error(`Error del Servidor: ${errorMsg}`);
      } catch (e) {
        toast.error(`Error del Servidor (${response.status}): Ocurrió un problema.`);
      }
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Errores de red (ej. servidor caído, sin internet)
    toast.error(`Error de Conexión: ${error.message}`);
    throw error;
  }
};

// ==========================================
// TI-PR-01 · PROGRAMA DE MANTENIMIENTO PREVENTIVO
// ==========================================
// Todo el modulo cuelga de /api/programas-mantenimiento, detras de
// authenticateRequest + authorizeRequest con el modulo de permiso 'mantenimiento'.
//
// El backend devuelve sus errores como { error: '...' } y usa 400 payload, 404 jerarquia,
// 409 regla de negocio. Se propaga ESE mensaje: ya viene redactado para el usuario y nunca
// cita SQL. Un texto propio aqui solo lo empeoraria.
const TI = `${BASE_API_URL}/api/programas-mantenimiento`;

const pedirTi = async (ruta, opciones = {}, generico = 'Error en el programa de mantenimiento') => {
  const response = await fetchWithAuth(`${TI}${ruta}`, opciones);

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || generico);
    error.status = response.status;
    error.code = data.code || null;
    error.incumplimientos = data.incumplimientos || [];
    throw error;
  }

  return data;
};

// Los query params se arman desde el contrato real: estado, placa, quincena_efectiva,
// desde, hasta, limite (<=1000, def 500) y desplazamiento. Lo vacio no viaja.
const query = (parametros = {}) => {
  const qs = new URLSearchParams();

  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === null || valor === undefined || valor === '') continue;
    qs.set(clave, String(valor));
  }

  const texto = qs.toString();

  return texto ? `?${texto}` : '';
};

export const apiTiPr01 = {
  descargarProgramaExcel: async (programaId, parametros = {}) => {
    const respuesta = await fetchWithAuth(`${TI}/${programaId}/programacion/exportar-excel${query(parametros)}`);
    if (!respuesta.ok) {
      const datos = await respuesta.json().catch(() => ({}));
      throw new Error(datos.error || 'No se pudo descargar el programa.');
    }
    if (!respuesta.headers.get('Content-Type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      throw new Error('El servidor no devolvió un archivo Excel válido.');
    }
    return respuesta.blob();
  },
  listarChecklistOrden: (programaId, visitaId, otId, signal) =>
    pedirTi(`/${programaId}/programacion/${visitaId}/ordenes-trabajo/${otId}/checklist`, { signal }, 'No se pudo consultar el checklist'),
  editarActividadChecklist: (programaId, visitaId, otId, actividadId, datos) =>
    pedirTi(`/${programaId}/programacion/${visitaId}/ordenes-trabajo/${otId}/checklist/${actividadId}`, {
      method: 'PATCH', body: JSON.stringify(datos)
    }, 'No se pudo guardar la actividad'),
  listarHistorialSupervisorCompleto: async (parametros = {}, signal) => {
    const visitas = [];
    const ordenes = [];
    let total = 0;
    for (let pagina = 0; pagina < 20; pagina += 1) {
      const datos = await pedirTi(
        `/historial-supervisor${query({ ...parametros, limite: 500, desplazamiento: visitas.length })}`,
        { signal },
        'No se pudo cargar el historial'
      );
      total = datos.total;
      visitas.push(...datos.visitas);
      ordenes.push(...datos.ordenes);
      if (!datos.visitas.length || visitas.length >= total) break;
    }
    return { programa: null, visitas, ordenes, total, fallidas: 0, truncado: visitas.length < total };
  },

  // ---------------------------------------------------------------- programa
  listarProgramas: (parametros = {}) =>
    pedirTi(`/${query(parametros)}`, {}, 'Error al listar los programas'),

  obtenerPrograma: (programaId) =>
    pedirTi(`/${programaId}`, {}, 'Error al obtener el programa'),

  listarFrecuencias: (programaId, parametros = {}) =>
    pedirTi(
      `/${programaId}/frecuencias${query(parametros)}`,
      {},
      'Error al listar las frecuencias'
    ),

  obtenerVisitaProgramacion: (programaId, programacionId) =>
    pedirTi(`/${programaId}/programacion/${programacionId}`, {}, 'Error al consultar la visita'),

  // ---------------------------------------------------------------- programacion
  listarProgramacion: (programaId, parametros = {}) =>
    pedirTi(
      `/${programaId}/programacion${query(parametros)}`,
      {},
      'Error al listar la programación'
    ),

  // El endpoint pagina: limite tiene techo 1000 y la respuesta trae `total`, `devueltas` y
  // los `filtros` aplicados. Una matriz truncada en silencio mentiría sobre el programa,
  // así que se pide página a página hasta juntar `total`.
  //
  // Tres cortes defensivos, porque este bucle habla con la red:
  //   · si una página viene vacía se detiene, aunque total dijera que falta: evita girar
  //     para siempre si el servidor deja de devolver filas;
  //   · tope de páginas, por si `total` creciera mientras se pagina;
  //   · se respeta el `limite` que devuelve el servidor, no el que se pidió.
  // porPagina = 500, no 1000: queda holgadamente bajo el techo del endpoint y hace que el
  // bucle de paginación se ejercite en cuanto el programa pasa de 500 visitas, en vez de
  // ser un camino que solo despierta en el caso extremo.
  listarProgramacionCompleta: async (programaId, parametros = {}, porPagina = 500) => {
    const MAX_PAGINAS = 100;

    const primera = await apiTiPr01.listarProgramacion(programaId, {
      ...parametros,
      limite: porPagina,
      desplazamiento: 0
    });

    const total = primera.total ?? 0;
    const paso = primera.filtros?.limite ?? porPagina;
    const filas = [...(primera.programacion ?? [])];
    let paginas = 1;
    let truncado = false;

    while (filas.length < total && paginas < MAX_PAGINAS) {
      const siguiente = await apiTiPr01.listarProgramacion(programaId, {
        ...parametros,
        limite: paso,
        desplazamiento: filas.length
      });

      const lote = siguiente.programacion ?? [];

      if (lote.length === 0) break;

      filas.push(...lote);
      paginas += 1;
    }

    if (filas.length < total) truncado = true;

    return {
      ...primera,
      programacion: filas,
      devueltas: filas.length,
      total,
      paginas,
      // La pantalla DEBE avisar si esto es true: es la diferencia entre "esto es todo" y
      // "esto es lo que cupo".
      truncado
    };
  },

  obtenerVisita: (programaId, visitaId) =>
    pedirTi(
      `/${programaId}/programacion/${visitaId}`,
      {},
      'Error al obtener la visita'
    ),

  programarVisita: (programaId, visitaId) =>
    pedirTi(
      `/${programaId}/programacion/${visitaId}/programar`,
      { method: 'PATCH' },
      'Error al programar la visita'
    ),

  // El backend admite UNICAMENTE { quincena_reprogramada }: cualquier otro campo se
  // rechaza con 400. No hay campo de motivo en este endpoint.
  // F4.2 · los destinos de reprogramación los decide el BACKEND, no el selector.
  //
  // Devuelve las quincenas del periodo de la versión aplicable con su estado real:
  // `disponible`, y cuando no lo está, `motivo`, `code` y `ocupada_por`. Si `disponibles`
  // es 0 trae `mensaje` ya redactado. El cliente pinta esto tal cual: no recalcula qué
  // quincena está libre, no deriva el cierre de la quincena y no inventa el texto.
  listarDestinosReprogramacion: (programaId, visitaId) =>
    pedirTi(
      `/${programaId}/programacion/${visitaId}/destinos-reprogramacion`,
      {},
      'Error al obtener los destinos de reprogramación'
    ),

  // F4.3 · motivo OBLIGATORIO en las dos. Son las dos operaciones que alteran formalmente
  // la planificación de la visita, y el backend las rechaza con 400 si falta.
  reprogramarVisita: (programaId, visitaId, quincenaReprogramada, motivo) =>
    pedirTi(
      `/${programaId}/programacion/${visitaId}/reprogramar`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quincena_reprogramada: quincenaReprogramada,
          motivo
        })
      },
      'Error al reprogramar la visita'
    ),

  elevarNivelVisita: (programaId, visitaId, nivel) =>
    pedirTi(`/${programaId}/programacion/${visitaId}/nivel`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nivel })
    }, 'No se pudo actualizar el nivel de mantenimiento'),

  cancelarVisita: (programaId, visitaId, motivo) =>
    pedirTi(
      `/${programaId}/programacion/${visitaId}/cancelar`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      },
      'Error al cancelar la visita'
    ),

  // ---------------------------------------------------------------- lote (F4.1)
  // Un unico PATCH TRANSACCIONAL para toda la seleccion, en vez de N peticiones: o se
  // confirman todas las visitas o ninguna. Confirmar no se puede deshacer -no existe
  // PROGRAMADO -> PROYECTADO- asi que media seleccion confirmada seria el peor resultado.
  //
  // Admite UNICAMENTE { ids }. Los duplicados se colapsan en el servidor; un id ajeno al
  // programa o inexistente devuelve 404 sin confirmar nada, y una visita bloqueada
  // devuelve 409 nombrando las que pararon la operacion.
  //
  // La respuesta trae el resumen y la programacion fresca de las visitas del lote, asi que
  // la matriz se actualiza con ella sin volver a barrer el programa.
  programarLote: (programaId, ids) =>
    pedirTi(
      `/${programaId}/programacion/programar-lote`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      },
      'Error al programar el lote de visitas'
    ),

  // ---------------------------------------------------------------- ordenes de trabajo
  // Las OT cuelgan de UNA programacion: la ruta real es
  //   /:programaId/programacion/:programacionId/ordenes-trabajo
  // y los dos ids llegan al router hijo por mergeParams.
  //
  // NO EXISTE un listado global de OT del programa. Para la pantalla de ordenes se parte
  // de la programacion -que ya publica ordenes_trabajo.{total,abiertas,cerradas,anuladas}
  // por visita- y solo se pide el detalle de las visitas que declaran al menos una. Con
  // cero OT no se emite ni una peticion extra.
  //
  // F5.1 · CATALOGO DE TECNICOS TI.
  //
  // Solo lo necesita el modal de cierre cuando quien cierra NO es de TI y la OT no tiene
  // tecnico. Vive bajo /api/programas-mantenimiento y no bajo /api/personal a proposito: asi
  // su audiencia es exactamente la del modulo de permiso `mantenimiento`, la misma que puede
  // cerrar una OT. Devuelve { total, tecnicos: [{ id, nombre }] } donde `id` es personal.id,
  // que es lo que ordenes_trabajo.tecnico_id referencia. Sin DNI ni mas datos personales.
  listarTecnicosTi: () =>
    pedirTi(
      '/tecnicos',
      {},
      'Error al listar los técnicos de TI'
    ),

  // F5.1 · LA APERTURA NO ADMITE NINGUN CAMPO. Antes aceptaba { tecnico_id } opcional; ya
  // no: el tecnico ejecutor se resuelve UNICAMENTE al cerrar. Una OT nace siempre con
  // tecnico_id NULL y eso es valido hasta el cierre. Enviar cualquier campo es un 400.
  //
  // Todo lo demas lo decide el servidor -abierta_por_id sale del token, el estado nace
  // ABIERTA, la fecha la pone la base- y los detalles los materializa la propia transaccion
  // desde los equipos previstos de la visita.
  crearOrdenTrabajo: (programaId, programacionId) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      },
      'Error al abrir la orden de trabajo'
    ),

  // Historico completo de la visita, anuladas incluidas, ya ordenado por el backend
  // (fecha_apertura DESC, id DESC). Devuelve ademas `estados` y `estados_detalle`: los
  // catalogos reales de los dos CHECK, que la UI usa en vez de listas propias.
  listarOrdenesTrabajo: (programaId, programacionId) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo`,
      {},
      'Error al listar las órdenes de trabajo'
    ),

  obtenerOrdenTrabajo: (programaId, programacionId, otId) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}`,
      {},
      'Error al obtener la orden de trabajo'
    ),

  listarAuditoriaOrden: (programaId, programacionId, otId, filtros = {}, signal) =>
    pedirTi(`/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/auditoria${query(filtros)}`, { signal }),

  listarEvidenciasOrden: (programaId, programacionId, otId) =>
    pedirTi(`/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/evidencias`),

  subirEvidenciaOrden: (programaId, programacionId, otId, detalleId, archivo) => {
    const body = new FormData();
    body.append('imagen', archivo);
    return pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/detalles/${detalleId}/evidencias`,
      { method: 'POST', body }
    );
  },

  retirarEvidenciaOrden: (programaId, programacionId, otId, evidenciaId, motivo) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/evidencias/${evidenciaId}/retirar`,
      { method: 'PATCH', body: JSON.stringify({ motivo }) }
    ),

  imagenEvidenciaOrden: async (programaId, programacionId, otId, evidenciaId, ancho, signal) => {
    const response = await fetchWithAuth(
      `${TI}/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/evidencias/${evidenciaId}/imagen?ancho=${ancho}`,
      { signal }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || 'No se pudo cargar la imagen');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return response.blob();
  },

  // ---------------------------------------------------------------- edicion (F2.2)
  // Los dos PATCH son PARCIALES y rechazan por NOMBRE cualquier campo fuera de su lista
  // blanca, asi que `campos` debe contener EXACTAMENTE las claves que se quieren escribir.
  //
  //   cabecera : minutos · observaciones
  //   detalle  : estado · nivel_completado · observaciones
  //
  // Un cuerpo VACIO es un 400: a diferencia de la apertura, estos endpoints no admiten
  // `permitirVacio`. La pantalla calcula el delta y no llama si no hay nada que cambiar,
  // que ademas es lo que hace el backend por su cuenta -si todos los valores coinciden no
  // emite UPDATE, no mueve updated_at y no escribe auditoria-.
  //
  // Los dos devuelven la ORDEN COMPLETA ya presentada, igual que el GET del detalle, asi
  // que la respuesta se puede usar directamente como estado fresco sin una relectura.
  editarOrdenTrabajo: (programaId, programacionId, otId, campos) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos)
      },
      'Error al editar la orden de trabajo'
    ),

  // El resultado se registra POR EQUIPO: no existe un PATCH masivo de detalles, y tampoco
  // POST ni DELETE de detalles -el conjunto es el de los equipos previstos y se materializo
  // al abrir la orden-.
  editarDetalleOrdenTrabajo: (programaId, programacionId, otId, detalleId, campos) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}`
      + `/detalles/${detalleId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos)
      },
      'Error al editar el resultado del equipo'
    ),

  // ---------------------------------------------------------------- cierre (F2.3)
  // POST y no PATCH: cerrar no es editar un campo. Es una transicion con efectos en TRES
  // tablas -la visita, los ciclos y la propia orden- que ejecuta cerrar_orden_trabajo() en
  // la base. NO es idempotente: cerrar dos veces es un conflicto, no una repeticion
  // inocua, y responde 409 OT_YA_CERRADA.
  //
  // Los tres campos son OPCIONALES y el cuerpo vacio es valido: una visita que no se
  // ejecuto se cierra sin cuerpo. Admitidos, exactamente:
  //   fecha_ejecucion  AAAA-MM-DD · el dia FISICO del trabajo, NO la quincena
  //   minutos          entero positivo o nulo
  //   observaciones    texto opcional
  //   tecnico_id       F5.1 · personal(id). Solo tiene efecto en el flujo EXCEPCIONAL:
  //                    cuando la OT no tiene tecnico y quien cierra NO es de TI. Si quien
  //                    cierra es TI el backend lo IGNORA y usa su propia persona; si la OT
  //                    ya tiene tecnico, lo conserva. La decision es del servidor.
  //
  // El resultado de la visita y el avance de los ciclos los DERIVA la funcion de la base;
  // el usuario que cierra sale de la sesion. La respuesta trae la orden completa mas
  // estado_programacion, ciclos_afectados, visita_resultado y tecnico.{id,origen}.
  cerrarOrdenTrabajo: (programaId, programacionId, otId, datos = {}) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/cerrar`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      },
      'Error al cerrar la orden de trabajo'
    ),

  // ---------------------------------------------------------------- anulacion (F2.3)
  // PATCH y no DELETE: anular NO borra. La orden permanece con su motivo y con todos sus
  // detalles, porque su existencia es lo que vuelve historico el alcance de la visita
  // (regla R1 de 20260928_016). Repetirlo SI es idempotente: la respuesta llega con
  // ya_estaba_anulada y la base no se toca.
  //
  // Admite UNICAMENTE motivo_anulacion, y es OBLIGATORIO: texto no vacio. El estado, la
  // fecha y el usuario los fija el servidor.
  anularOrdenTrabajo: (programaId, programacionId, otId, motivo) =>
    pedirTi(
      `/${programaId}/programacion/${programacionId}/ordenes-trabajo/${otId}/anular`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo_anulacion: motivo })
      },
      'Error al anular la orden de trabajo'
    )
};

export const api = {  // ==========================================
  // MAESTRO DE FLOTA
  // ==========================================
  getTractos: async () => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/maestro/tractos`);
    if (!response.ok) throw new Error('Error al cargar tractos');
    return response.json();
  },
  updateVehiculo: async (placa, data) => {
    const response = await fetchWithAuth(
      `${BASE_API_URL}/vehiculos/${encodeURIComponent(placa)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Error al actualizar vehículo'
      );
    }

    return result;
  },

  deleteVehiculo: async (placa) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/vehiculos/${placa}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al eliminar vehiculo');
    }
    return response.json();
  },




  // ==========================================
  // DIRECTORIO DE PERSONAL
  // ==========================================
  getOpcionesPersonal: async () => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal/opciones`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo');
    return data;
  },
  getOpcionesFlota: async () => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/maestro/opciones`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo');
    return data;
  },
  cambiarEstadoPersonal: async (id, estado) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal/${id}/estado`, {
      method: 'PATCH', body: JSON.stringify({ estado })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado');
    return data;
  },
  cambiarEstadoVehiculo: async (placa, activo) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/vehiculos/${encodeURIComponent(placa)}/estado`, {
      method: 'PATCH', body: JSON.stringify({ activo })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado');
    return data;
  },
  getPersonal: async () => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal`);
    if (!response.ok) throw new Error('Error al cargar personal');
    return response.json();
  },

  createPersonal: async (data) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Error al registrar personal'); }
    return response.json();
  },

  updatePersonal: async (id, data) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Error al actualizar personal'); }
    return response.json();
  },

  deletePersonal: async (id) => {
    const response = await fetchWithAuth(`${BASE_API_URL}/api/personal/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar personal');
    return response.json();
  },

  // ==========================================
  // RELACIONALES
  // ==========================================
  getStats: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/stats/`);
    if (!response.ok) throw new Error('Error al cargar stats');
    return response.json();
  },

  getChartStats: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/stats/charts`);
    if (!response.ok) throw new Error('Error al obtener estadísticas de gráficos');
    return response.json();
  },

  getVehiculos: async (page = 1, limit = 50, search = '', operacion = '', estado = '') => {
    let url = `${BASE_URL}/vehiculos/?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (operacion) url += `&operacion=${encodeURIComponent(operacion)}`;
    if (estado) url += `&estado=${encodeURIComponent(estado)}`;
    const response = await fetchWithAuth(url);
    if (!response.ok) throw new Error('Error al cargar vehiculos');
    return response.json();
  },

  updateVehiculo: async (placa, data) => {
    const response = await fetchWithAuth(`${BASE_URL}/vehiculos/${placa}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Error al actualizar vehiculo');
    return response.json();
  },

  createVehiculo: async (data) => {
    const response = await fetchWithAuth(`${BASE_URL}/vehiculos/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al crear vehiculo');
    }
    return response.json();
  },

  deleteVehiculo: async (placa) => {
    const response = await fetchWithAuth(`${BASE_URL}/vehiculos/${placa}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al eliminar');
    }
    return response.json();
  },

  deleteInspeccion: async (id) => {
    const response = await fetchWithAuth(`${BASE_URL}/inspecciones/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar');
    return response.json();
  },

  getInspecciones: async (placa) => {
    const response = await fetchWithAuth(`${BASE_URL}/inspecciones/${placa}`);
    if (!response.ok) throw new Error('Error al cargar inspecciones');
    return response.json();
  },

  createInspeccion: async (formData) => {
    const response = await fetchWithAuth(`${BASE_URL}/inspecciones/`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const detalle = await response.json().catch(() => ({}));
      throw new Error(detalle.error || 'Error al crear inspeccion');
    }
    return response.json();
  },

  updateInspeccion: async (id, formData) => {
    const response = await fetchWithAuth(`${BASE_URL}/inspecciones/${id}`, {
      method: 'PUT',
      body: formData,
    });
    if (!response.ok) throw new Error('Error al actualizar inspeccion');
    return response.json();
  },
  getOpcionesTickets: async () => {
    const response = await fetchWithAuth(
      BASE_API_URL + '/api/incidentes/opciones'
    );
    if (!response.ok) {
      throw new Error('Error al cargar las opciones de tickets');
    }
    return response.json();
  },
  getOpcionesPulseras: async () => {
    const response = await fetchWithAuth(
      `${BASE_API_URL}/api/incidentes/pulseras/opciones`
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || 'Error al cargar las opciones de pulseras'
      );
    }

    return data;
  },
  createPulsera: async (data, evidencia) => {
    const payload = new FormData();

    Object.entries(data).forEach(([campo, valor]) => {
      if (valor !== null && valor !== undefined) {
        payload.append(campo, String(valor));
      }
    });

    if (evidencia) {
      payload.append('evidencia', evidencia);
    }

    const response = await fetchWithAuth(
      `${BASE_API_URL}/api/incidentes/pulseras`,
      {
        method: 'POST',
        body: payload
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Error al registrar el reporte de pulsera'
      );
    }

    return result;
  },
  getReportesPulseras:
    async () => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/pulseras`
        );

      const data =
        await response
          .json()
          .catch(() => []);

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al obtener los reportes de pulseras'
        );
      }

      return data;
    },

  updateEstadoReportePulsera:
    async (id, estado) => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/pulseras/${id}/estado`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              estado
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al actualizar el reporte de pulsera'
        );
      }

      return data;
    },
  getOpcionesSolicitudDescargaVideos:
    async () => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/solicitudes-descarga-videos/opciones`
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al cargar las opciones de descarga de videos'
        );
      }

      return data;
    },

  createSolicitudDescargaVideos:
    async data => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/solicitudes-descarga-videos`,
          {
            method: 'POST',
            body: JSON.stringify(data)
          }
        );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
          'Error al registrar la solicitud de descarga de videos'
        );
      }

      return result;
    },
  // === INCIDENTES ===
  getIncidentes: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/api/incidentes`);
    if (!response.ok) throw new Error('Error al cargar incidentes');
    return response.json();
  },

  getSolicitudesDescargaVideos:
    async () => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/solicitudes-descarga-videos`
        );

      const data =
        await response
          .json()
          .catch(() => []);

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al obtener las solicitudes'
        );
      }

      return data;
    },

  updateEstadoSolicitudDescargaVideos:
    async (id, estado, respuesta = {}) => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/incidentes/solicitudes-descarga-videos/${id}/estado`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...respuesta,
              estado
            })
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al actualizar la solicitud'
        );
      }

      return data;
    },
  createIncidente: async (data, evidencias = []) => {
    const payload = new FormData();

    Object.entries(data).forEach(([campo, valor]) => {
      if (valor !== null && valor !== undefined) {
        payload.append(campo, String(valor));
      }
    });

    evidencias.forEach(archivo => {
      payload.append('evidencias', archivo);
    });

    const response = await fetchWithAuth(
      `${BASE_URL}/api/incidentes_soporte`,
      {
        method: 'POST',
        body: payload
      }
    );

    if (!response.ok) {
      const detalle = await response.json().catch(() => ({}));
      throw new Error(detalle.error || 'Error al crear el ticket');
    }

    return response.json();
  },

  updateIncidente: async (id, data) => {
    const res = await fetchWithAuth(`${BASE_URL}/api/incidentes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al actualizar incidente');
    return res.json();
  },
  updateIncidenteConEvidencia: async (id, formData) => {
    const res = await fetchWithAuth(
      `${BASE_URL}/api/incidentes/${id}`,
      {
        method: 'PUT',
        body: formData
      }
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));

      throw new Error(
        error.error ||
        error.message ||
        'Error al actualizar el ticket con evidencia'
      );
    }

    return res.json();
  },

  deleteIncidente: async (id) => {
    const res = await fetchWithAuth(`${BASE_URL}/api/incidentes/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al eliminar incidente');
    }
    return res.json();
  },

  // === MANTENIMIENTOS ===
  getMantenimientos: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/mantenimientos/`);
    if (!response.ok) throw new Error('Error al cargar mantenimientos');
    return response.json();
  },

  createMantenimiento: async (data) => {
    const response = await fetchWithAuth(`${BASE_URL}/mantenimientos/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Error al registrar mantenimiento');
    return response.json();
  },

  downloadExcel: async () => {
    const response = await fetchWithAuth(
      `${BASE_URL}/api/reportes/mantenimiento-excel`
    );
    if (!response.ok) {
      throw new Error('Error al descargar el reporte de mantenimiento');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reporte_mantenimiento.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  getOperacionesReportes: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/api/reportes/operaciones`);
    if (!response.ok) throw new Error('No se pudieron cargar operaciones');
    return response.json();
  },
  downloadMasterReport: async (
    startDate,
    endDate,
    clienteOperacionId
  ) => {
    const params = new URLSearchParams({
      startDate,
      endDate,
      clienteOperacionId
    });

    const response = await fetchWithAuth(
      `${BASE_URL}/api/reportes/master?${params.toString()}`
    );

    if (!response.ok) {
      const error =
        await response.json().catch(() => ({}));

      throw new Error(
        error.error ||
        'Error al generar el reporte maestro'
      );
    }

    return response.blob();
  },

  getPersonalParaEntrega: async (dni, tipo = 'Entrega') => {
    const params = new URLSearchParams({ tipo });

    const response = await fetchWithAuth(
      `${BASE_URL}/api/entregas/personal/${encodeURIComponent(String(dni).trim())}?${params}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al buscar al trabajador');
    }

    return data.persona;
  },
  // === ENTREGAS ===
  getOpcionesEntregas: async () => {
    const response = await fetchWithAuth(
      `${BASE_URL}/api/entregas/opciones`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Error al cargar clientes y operaciones'
      );
    }

    return data;
  },

  getEntregas: async () => {
    const response = await fetchWithAuth(`${BASE_URL}/api/entregas`);
    if (!response.ok) throw new Error('Error al cargar entregas');
    return response.json();
  },

  createEntrega: async (data) => {
    const response = await fetchWithAuth(`${BASE_URL}/api/entregas`, {
      method: 'POST',
      body: data,
    });
    if (!response.ok) {
      const text = await response.text();
      let err = `Status ${response.status}: `;
      try { const j = JSON.parse(text); err += j.error || text; } catch (e) { err += text; }
      throw new Error('Error backend: ' + err);
    }
    return response.json();
  },

  updateEntrega: async (id, data) => {
    const response = await fetchWithAuth(`${BASE_URL}/api/entregas/${id}`, {
      method: 'PUT',
      body: data,
    });
    if (!response.ok) {
      const text = await response.text();
      let err = `Status ${response.status}: `;
      try { const j = JSON.parse(text); err += j.error || text; } catch (e) { err += text; }
      throw new Error('Error backend: ' + err);
    }
    return response.json();
  },

  deleteEntrega: async (id) => {
    const response = await fetchWithAuth(`${BASE_URL}/api/entregas/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      let errText = 'Error al eliminar entrega';
      try { const resData = await response.json(); if (resData.error) errText += ': ' + resData.error; } catch (e) { }
      throw new Error(errText);
    }
    return response.json();
  },

  uploadEntregasExcel: async (file, vista, confirmar = false, firma = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipo', vista || '');
    formData.append('confirmar', confirmar ? 'si' : 'no');
    formData.append('firma', firma);

    const response = await fetchWithAuth(`${BASE_URL}/api/entregas/upload-excel`, { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Error al importar inventario TI');
    }
    return response.json();
  },

  exportExcelEntregas: async (vista, categoria, fechaInicio, fechaFin) => {
    const params = new URLSearchParams();
    if (vista) params.set('tipo', vista);
    if (categoria) params.set('categoria', categoria);
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);

    const query = params.toString();
    const endpoint = `${BASE_URL}/api/entregas/export-excel${query ? `?${query}` : ''}`;
    const response = await fetchWithAuth(endpoint);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Error al exportar inventario TI');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const periodo = fechaInicio && fechaFin ? `_${fechaInicio}_al_${fechaFin}` : '';
    link.download = vista === 'Devolución'
      ? `devoluciones_ti${periodo}.xlsx`
      : `entregas_ti${periodo}.xlsx`;

    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    }
  },
  downloadFlotasReport: async ({
    formato = 'pdf',
    filtro = 'todos',
    valor = '',
    fecha = 'siempre',
    fechaInicio = '',
    fechaFin = '',
    operacion = 'todas',
    signal
  }) => {
    const params = new URLSearchParams({
      filtro,
      valor,
      fecha,
      operacion
    });
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);

    const response = await fetchWithAuth(
      `${BASE_URL}/reportes/${formato}?${params.toString()}`,
      { signal }
    );

    if (!response.ok) {
      let mensaje = 'Error al generar el reporte';

      try {
        const data = await response.json();
        if (data.error) mensaje = data.error;
      } catch {
        // La respuesta puede ser un archivo o texto.
      }

      throw new Error(mensaje);
    }

    return response.blob();
  },
  getNotificaciones:
    async () => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/notificaciones`
        );

      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al obtener las notificaciones'
        );
      }
      return data;
    },
  leerNotificacion:
    async id => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/notificaciones/${id}/leida`,
          {
            method: 'PATCH'
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al actualizar la notificacion'
        );
      }
      return data;
    },
  leerTodasNotificaciones:
    async () => {
      const response =
        await fetchWithAuth(
          `${BASE_API_URL}/api/notificaciones/leer-todas`,
          {
            method: 'PATCH'
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ||
          'Error al actualizar las notificaciones'
        );
      }
      return data;
    },
};

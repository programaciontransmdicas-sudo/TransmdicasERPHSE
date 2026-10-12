import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { ProgramaTiPr01 } from './tiPr01/ProgramaTiPr01';
import { OrdenesTiPr01 } from './tiPr01/OrdenesTiPr01';
import { HistorialTiPr01 } from './tiPr01/HistorialTiPr01';

// F2.1: QUINCENAS era el arreglo fijo de las 8 quincenas de setiembre a diciembre de
// 2026 que usaba la maqueta. Eliminado junto con getPeriodoIndex(), su unico lector.
// Las quincenas reales se derivan de quincena_efectiva en tiPr01/dominio.js, sin lista
// fija y sin ano cableado.

const EQUIPOS = [
  { key: 'dvr', nombre: 'DVR' },
  { key: 'cop', nombre: 'Copiloto' },
  { key: 'rb', nombre: 'Radio base' },
  { key: 'cam', nombre: 'Cámaras' },
  { key: 'gps', nombre: 'GPS' }
]

const PERIODICIDAD = {
  dvr: { 1: 15, 2: 90, 3: 180 },
  cop: { 1: 15, 2: 90, 3: 180 },
  rb: { 1: 15, 2: 90, 3: 180 },
  cam: { 1: 15, 2: 90, 3: 180 },
  gps: { 3: 180 }
};

const ACTIVIDADES = {
  "rb": {
    "M1": [
      {
        "t": "Encendido del equipo y verificación de display y LED de estado",
        "c": "Enciende sin mensajes de error y el display muestra el canal asignado",
        "m": 2
      },
      {
        "t": "Prueba de comunicación con la central en el canal de la operación",
        "c": "La central confirma recepcion clara en el primer intento",
        "m": 3
      },
      {
        "t": "Verificación de canal programado, volumen y squelch",
        "c": "Canal corresponde a la operación de la unidad; audio audible en cabina en marcha",
        "m": 2
      },
      {
        "t": "Inspección visual de micrófono, espiral, soporte y perilla",
        "c": "Sin cortes en el espiral, micrófono firme en su gancho",
        "m": 2
      },
      {
        "t": "Inspección visual de antena y su base",
        "c": "Antena vertical, firme, sin golpes, sin corrosión visible",
        "m": 2
      },
      {
        "t": "Limpieza externa del equipo y del micrófono",
        "c": "Sin polvo ni grasa en rejillas ni teclado",
        "m": 2
      }
    ],
    "M2": [
      {
        "t": "Medición de voltaje de alimentación en bornes del equipo",
        "c": "Dentro del rango del fabricante según el sistema de la unidad (12 V o 24 V)",
        "m": 5
      },
      {
        "t": "Revisión de fusible, portafusible y punto de alimentación",
        "c": "Fusible del amperaje especificado, portafusible sin recalentamiento ni óxido",
        "m": 5
      },
      {
        "t": "Revisión y ajuste del conector coaxial y aplicación de protector dielectrico",
        "c": "Conector ajustado a mano firme, sin óxido, sin hilos sueltos de malla",
        "m": 5
      },
      {
        "t": "Medición de ROE (SWR) del sistema de antena",
        "c": "ROE menor o igual a 1.5:1. Entre 1.5 y 2.0 se observa; mayor a 2.0 es no conforme",
        "m": 10
      },
      {
        "t": "Prueba de alcance de comunicación en los canales operativos",
        "c": "Comunicación clara en todos los canales cargados",
        "m": 5
      },
      {
        "t": "Reajuste de tornillería de base de equipo y de base de antena",
        "c": "Sin juego al aplicar fuerza manual",
        "m": 5
      },
      {
        "t": "Limpieza de contactos del conector de alimentación y del micrófono",
        "c": "Contactos sin sulfatación",
        "m": 5
      }
    ],
    "M3": [
      {
        "t": "Desmontaje del equipo de su base y retiro de cofre",
        "c": "Equipo retirado sin daño en cableado",
        "m": 10
      },
      {
        "t": "Inspección completa del arnés desde batería hasta equipo",
        "c": "Aislamiento íntegro, empalmes soldados y encintados, ruteo sin roce, abrazaderas cada 30 cm",
        "m": 25
      },
      {
        "t": "Limpieza interna del equipo con aire comprimido seco",
        "c": "Sin polvo en disipador ni en tarjeta",
        "m": 10
      },
      {
        "t": "Revisión integral del cable coaxial en toda su longitud",
        "c": "Sin dobleces cerrados, cortes ni aplastamientos. Se reemplaza si presenta daño",
        "m": 15
      },
      {
        "t": "Revisión del punto de tierra y de la base de antena",
        "c": "Continuidad a chasis menor a 1 ohm, base sin corrosión",
        "m": 10
      },
      {
        "t": "Verificación de programación y potencia de salida contra parámetros del fabricante",
        "c": "Canales y potencia conforme a la hoja de programación vigente",
        "m": 15
      },
      {
        "t": "Reinstalación, prueba funcional completa y actualización del INVENTARIO",
        "c": "Comunicación conforme y número de serie verificado en INVENTARIO",
        "m": 15
      }
    ]
  },
  "cop": {
    "M1": [
      {
        "t": "Encendido, nivel de carga y respuesta táctil de la pantalla",
        "c": "Enciende, carga por encima del 30 por ciento y responde en toda la superficie",
        "m": 3
      },
      {
        "t": "Verificación de sesión iniciada con la unidad y el conductor correctos",
        "c": "Placa mostrada en el aplicativo igual a la placa física",
        "m": 2
      },
      {
        "t": "Verificación de señal GPS y de datos en el aplicativo",
        "c": "Icono de conexión activo y posición actual correcta",
        "m": 3
      },
      {
        "t": "Verificación del último evento de geocerca reportado en plataforma",
        "c": "Existe evento registrado en las últimas 72 horas de operación",
        "m": 3
      },
      {
        "t": "Verificación de soporte, cargador y toma de energía",
        "c": "Tablet firme en el soporte y cargando con el motor encendido",
        "m": 2
      },
      {
        "t": "Limpieza de pantalla y carcasa",
        "c": "Pantalla sin grasa que impida la lectura",
        "m": 2
      }
    ],
    "M2": [
      {
        "t": "Verificación de versión del aplicativo y actualización si corresponde",
        "c": "Versión igual a la vigente definida por TI",
        "m": 10
      },
      {
        "t": "Liberación de almacenamiento y borrado de caché",
        "c": "Espacio libre mayor al 20 por ciento del total",
        "m": 10
      },
      {
        "t": "Revisión del estado de batería (salud, hinchamiento, temperatura)",
        "c": "Sin deformación de carcasa. Salud por debajo del 70 por ciento se programa reemplazo",
        "m": 5
      },
      {
        "t": "Prueba de cargador, cable y toma de 12/24 V con medición de salida",
        "c": "Voltaje y corriente de salida dentro de lo especificado",
        "m": 5
      },
      {
        "t": "Revisión de configuración: geocercas cargadas, hora del sistema, permisos de ubicación en segundo plano",
        "c": "Geocercas de la operación cargadas, hora automática, permiso de ubicación permanente",
        "m": 10
      },
      {
        "t": "Contraste de los últimos 10 eventos del equipo contra la plataforma",
        "c": "Coincidencia total de eventos y horas",
        "m": 10
      },
      {
        "t": "Ajuste de soporte y tornillería",
        "c": "Sin vibración ni juego con el motor encendido",
        "m": 5
      }
    ],
    "M3": [
      {
        "t": "Desmontaje de tablet y de soporte",
        "c": "Retiro sin daño de anclajes",
        "m": 10
      },
      {
        "t": "Revisión completa de cableado de alimentación, fusible y empalmes",
        "c": "Sin empalmes provisionales, fusible correcto, ruteo protegido",
        "m": 20
      },
      {
        "t": "Respaldo de datos y reinstalación o restauración del aplicativo",
        "c": "Aplicativo reinstalado y sesión operativa sin pérdida de configuración",
        "m": 25
      },
      {
        "t": "Prueba de ciclo de carga y descarga de batería",
        "c": "Mantiene carga al menos 4 horas sin alimentación externa",
        "m": 20
      },
      {
        "t": "Prueba de sensores del equipo (GPS, acelerómetro) y calibración de pantalla",
        "c": "Todos los sensores responden en la app de diagnóstico",
        "m": 10
      },
      {
        "t": "Reinstalación y prueba en ruta corta con disparo de geocerca real",
        "c": "Evento de geocerca visible en plataforma dentro de los 2 minutos",
        "m": 20
      },
      {
        "t": "Actualización de marca, serie y estado en INVENTARIO",
        "c": "INVENTARIO refleja el equipo realmente instalado",
        "m": 5
      }
    ]
  },
  "dvr": {
    "M1": [
      {
        "t": "Encendido y verificación de LED de estado y de grabación",
        "c": "LED de grabación activo, sin alarma sonora",
        "m": 2
      },
      {
        "t": "Verificación de fecha y hora del sistema",
        "c": "Desfase menor a 2 minutos respecto a la hora oficial",
        "m": 2
      },
      {
        "t": "Verificación de que todos los canales configurados esten en línea",
        "c": "Ningun canal en negro o con mensaje de pérdida de video",
        "m": 5
      },
      {
        "t": "Confirmacion de grabación continua de las últimas 24 horas",
        "c": "Línea de tiempo sin vacíos en el periodo operativo",
        "m": 5
      },
      {
        "t": "Verificación de cierre y seguridad del gabinete del DVR",
        "c": "Gabinete cerrado con llave o precinto íntegro",
        "m": 2
      }
    ],
    "M2": [
      {
        "t": "Descarga de video de prueba y verificación de integridad del archivo",
        "c": "Archivo se reproduce completo, con audio si aplica",
        "m": 10
      },
      {
        "t": "Revisión de espacio disponible y salud del disco o tarjeta",
        "c": "Medio sin sectores defectuosos reportados",
        "m": 10
      },
      {
        "t": "Verificación de la sobrescritura cíclica y de los días reales de retención",
        "c": "Retención igual o mayor a la exigida por el cliente de la operación",
        "m": 10
      },
      {
        "t": "Revisión y ajuste de conectores de video y de alimentación",
        "c": "Conectores firmes, sin óxido, sin tensión mecánica",
        "m": 10
      },
      {
        "t": "Medición de voltaje de alimentación del DVR",
        "c": "Dentro del rango del fabricante",
        "m": 5
      },
      {
        "t": "Limpieza de ventilación y del gabinete",
        "c": "Rejillas libres de polvo",
        "m": 5
      }
    ],
    "M3": [
      {
        "t": "Desmontaje del DVR de su gabinete",
        "c": "Retiro sin daño de conectores",
        "m": 10
      },
      {
        "t": "Limpieza interna con aire comprimido seco",
        "c": "Sin polvo en tarjeta ni en ventilador interno",
        "m": 10
      },
      {
        "t": "Extracción y prueba del disco o tarjeta de memoria",
        "c": "Prueba sin errores. Con errores se reemplaza el medio",
        "m": 25
      },
      {
        "t": "Revisión completa del arnés de video y alimentación, incluido el paso por cabina y chasis",
        "c": "Sin roce, sin empalmes provisionales, pasamuros con protección",
        "m": 30
      },
      {
        "t": "Actualización de firmware si el proveedor la liberó",
        "c": "Versión igual a la vigente aprobada por TI",
        "m": 20
      },
      {
        "t": "Verificación de configuración: canales, resolución, tasa de bits, retención y contraseña",
        "c": "Configuración igual al estándar definido por TI",
        "m": 15
      },
      {
        "t": "Reinstalación, prueba de grabación en todos los canales y descarga de verificación",
        "c": "Grabación conforme en todos los canales aplicables",
        "m": 20
      }
    ]
  },
  "cam": {
    "M1": [
      {
        "t": "Verificación de imagen en vivo de cada cámara instalada",
        "c": "Imagen nítida, sin líneas, sin pérdida de señal",
        "m": 5
      },
      {
        "t": "Limpieza de lente y domo de cada cámara",
        "c": "Lente sin polvo, grasa ni marcas de agua",
        "m": 5
      },
      {
        "t": "Verificación de encuadre según el estándar de la operación",
        "c": "Interna: rostro y manos del conductor. Externa: vía frontal con horizonte al tercio superior. Retroceso: piso a 1 m del paragolpe",
        "m": 5
      },
      {
        "t": "Inspección de fijación, golpes y humedad en el lente",
        "c": "Cámara firme, sin condensación interna ni carcasa rota",
        "m": 5
      }
    ],
    "M2": [
      {
        "t": "Revisión y ajuste del conector de cada cámara",
        "c": "Conector ajustado, sin óxido, con sellado en cámaras exteriores",
        "m": 10
      },
      {
        "t": "Prueba de vision nocturna e infrarrojo en ambiente oscuro",
        "c": "Imagen utilizable a 3 m con luz apagada",
        "m": 10
      },
      {
        "t": "Verificación de audio de la cámara interna cuando aplica",
        "c": "Audio audible y sin saturación en la reproducción",
        "m": 5
      },
      {
        "t": "Reajuste de soporte y revisión del sellado de cámaras exteriores",
        "c": "Sin juego, silicona sin fisuras",
        "m": 10
      },
      {
        "t": "Revisión del tramo visible del cable de cada cámara",
        "c": "Sin roce, dobleces cerrados ni abrazaderas cortadas",
        "m": 10
      }
    ],
    "M3": [
      {
        "t": "Desmontaje de cada cámara instalada",
        "c": "Retiro sin daño de carcasa ni de conector",
        "m": 15
      },
      {
        "t": "Revisión completa del cableado, paso por chasis y pasamuros",
        "c": "Cable protegido en todo su recorrido, pasamuros íntegros",
        "m": 30
      },
      {
        "t": "Reemplazo de sellos y aplicación de silicona neutra en cámaras exteriores",
        "c": "Sellado continuo, sin ingreso de agua en prueba de chorro",
        "m": 15
      },
      {
        "t": "Limpieza profunda de lente, cuerpo y filtro infrarrojo",
        "c": "Sin residuos en el lente ni en el filtro",
        "m": 15
      },
      {
        "t": "Evaluación de reemplazo por pérdida de nitidez, condensación interna o falla de infrarrojo",
        "c": "Cámara que no cumple se reemplaza o se genera requerimiento de repuesto",
        "m": 10
      },
      {
        "t": "Recalibración del encuadre y registro fotográfico del encuadre final",
        "c": "Encuadre conforme al estándar y foto archivada para comparación futura",
        "m": 15
      },
      {
        "t": "Prueba de grabación completa y comparación con el registro fotográfico anterior",
        "c": "Grabación conforme en todas las cámaras aplicables",
        "m": 15
      }
    ]
  },
  "gps": {
    "M3": [
      {
        "t": "Mantenimiento preventivo por el proveedor",
        "c": "Confirmar que el proveedor realizó el mantenimiento preventivo correspondiente",
        "m": 0
      }
    ]
  }
};

const EVIDENCIA_OBLIGATORIA = new Set(['cop', 'rb', 'cam']);

const dateOnly = (value) => String(value || '').slice(0, 10);

const formatDMY = (value) => {
  const raw = dateOnly(value);
  if (!raw) return '-';

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '-';

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

const parseDMY = (value) => {
  const match = String(value || '').match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00`);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return iso;
};

const formatFechaEscritura = (value) => {
  const digitos = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  }

  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
};

function FechaInput({
  value,
  onChange,
  required = false,
  disabled = false
}) {
  const [texto, setTexto] = useState(
    value ? formatDMY(value) : ''
  );

  useEffect(() => {
    setTexto(value ? formatDMY(value) : '');
  }, [value]);

  const manejarCambio = (event) => {
    const siguiente = formatFechaEscritura(
      event.target.value
    );

    setTexto(siguiente);

    if (!siguiente) {
      onChange('');
      return;
    }

    const iso = parseDMY(siguiente);
    if (iso) onChange(iso);
  };

  const manejarBlur = () => {
    if (!texto && !required) return;

    const iso = parseDMY(texto);
    if (iso) {
      setTexto(formatDMY(iso));
    } else {
      setTexto(value ? formatDMY(value) : '');
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={texto}
      onChange={manejarCambio}
      onBlur={manejarBlur}
      required={required}
      disabled={disabled}
      maxLength={10}
      pattern="\d{2}/\d{2}/\d{4}"
      title="Formato: dd/mm/aaaa"
    />
  );
}

// F2.1: nivelProgramado() y getPeriodoIndex() quedaron sin uso al eliminar el alta demo
// de ordenes, que era su unico consumidor. El primero derivaba el nivel de la ficcion
// (indiceUnidad % 8) + 1; el segundo buscaba la quincena en el arreglo fijo QUINCENAS.
// El nivel real lo publica el backend en los equipos previstos de cada visita.

const estadoClase = (estado) => {
  if (estado === 'VENCIDO' || estado === 'NO CONFORME') {
    return 'm2-chip m2-chip-red'
  }
  if (estado === 'POR VENCER' || estado === 'OBSERVADO') {
    return 'm2-chip m2-chip-amber';
  }
  if (
    estado === 'AL DÍA' ||
    estado === 'CONFORME' ||
    estado == 'CERRADA'
  ) {
    return 'm2-chip m2-chip-green';
  }
  if (estado === 'ABIERTA') {
    return 'm2-chip m2-chip-blue';
  }
  return 'm2-chip m2-chip-grey';
};

export function MantenimientoTecnico(props) {
  const esSupervisor = String(props.usuario?.rol || '').trim().toLowerCase() === 'supervisor';

  if (esSupervisor) {
    return (
      <div className="erp-module-page">
        <header className="reports-page-header">
          <h2>Historial de mantenimientos técnicos</h2>
          <p>Consulta las intervenciones de tus clientes y operaciones asignados.</p>
        </header>
        <HistorialTiPr01 soloLectura />
      </div>
    );
  }

  return <MantenimientoCompleto {...props} />;
}

function MantenimientoCompleto({
  permisos,
  usuario,
  vistaInicial = 'programa',
  navegacionId = 0,
  onVistaChange
}) {
  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [vista, setVista] = useState(vistaInicial);
  const [busqueda, setBusqueda] = useState('');
  const [operacion, setOperacion] = useState('');

  // `ordenes` sigue alimentando Unidades, Historial y la ficha de unidad, que son F3 y no
  // se tocan en F2.1. Arranca VACIO: las OT de demostracion se eliminaron, y esas
  // pantallas muestran lo que haya -hoy nada- en vez de dos ordenes inventadas.
  const [ordenes, setOrdenes] = useState([]);

  // Navegacion Programa -> Ordenes: { programacionId, otId }. Lo consume OrdenesTiPr01 y
  // lo limpia al abrir el detalle o al cerrarlo.
  const [destinoOt, setDestinoOt] = useState(null);

  const [ordenActualId, setOrdenActualId] = useState(null);
  const [ordenDetalleId, setOrdenDetalleId] = useState(null);
  const [unidadFichaPlaca, setUnidadFichaPlaca] = useState(null);
  const [fichaFiltro, setFichaFiltro] = useState('todo');
  const [fichaAbiertos, setFichaAbiertos] = useState({});
  const [ejecucion, setEjecucion] = useState(null);

  const canEdit = !permisos || permisos.editar !== false;

  const tecnicoActual = String(
    usuario?.nombre_completo ||
    usuario?.username ||
    usuario?.nombre ||
    'Usuario actual'
  ).trim();

  // F2.1: aqui vivian nivelProgramadoPara() y actualizarNuevaOTProgramada(), que
  // calculaban el nivel de una OT de demostracion con nivelProgramado(indiceUnidad % 8).
  // Eliminados con el alta demo: el nivel de una OT real sale de los equipos previstos
  // de la visita, nunca del indice de la placa en el inventario.

  useEffect(() => {
    const principales = [
      'programa',
      'unidades',
      'ots',
      'historial'
    ];

    if (principales.includes(vistaInicial)) {
      setVista(vistaInicial);
    }
  }, [vistaInicial, navegacionId]);

  useEffect(() => {
    const principales = [
      'programa',
      'unidades',
      'ots',
      'historial'
    ];

    if (principales.includes(vista)) {
      onVistaChange?.(vista);
    }
  }, [vista, onVistaChange]);

  useEffect(() => {
    const cargarVehiculos = async () => {
      try {
        setLoading(true);

        const response = await api.getVehiculos(1, 10000);
        const lista = response?.data || [];

        setVehiculos(lista);

        // F2.1: aqui se sembraban OT-DEMO-001 y OT-DEMO-002 sobre las dos primeras placas
        // del inventario. Eliminado. Las ordenes de trabajo reales viven en el backend y
        // las muestra OrdenesTiPr01; inventar dos para llenar la pantalla era mentir sobre
        // el estado del programa.
      } catch (error) {
        console.error(error);
        toast.error('No se pudieron cargar los vehículos');
      } finally {
        setLoading(false);
      }
    };
    cargarVehiculos();
  }, []);

  const operaciones = useMemo(() => {
    return [...new Set(vehiculos.map(v => v.operacion).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [vehiculos]);

  const filtrados = useMemo(() => {
    const query = busqueda.trim().toLocaleLowerCase();

    return vehiculos.filter(v => {
      const coincideBusqueda =
        !query ||
        String(v.placa || '').toLowerCase().includes(query) ||
        String(v.cliente || '').toLowerCase().includes(query) ||
        String(v.operacion || '').toLowerCase().includes(query);

      const coincideOperacion =
        !operacion || String(v.operacion || '') === operacion;

      return coincideBusqueda && coincideOperacion;
    });
  }, [vehiculos, busqueda, operacion]);

  const estadoUnidad = (vehiculo, index) => {
    const cerradas = ordenes
      .filter(
        orden =>
          orden.placa === vehiculo.placa &&
          orden.estado === 'CERRADA'
      )
      .sort(
        (a, b) =>
          new Date(`${b.fecha}T12:00:00`) -
          new Date(`${a.fecha}T12:00:00`)
      );

    if (!cerradas.length) {
      return index % 4 === 0 ? 'VENCIDO' : 'SIN FECHA BASE';
    }

    const ultima = new Date(`${cerradas[0].fecha}T12:00:00`);
    const proxima = new Date(ultima);
    proxima.setDate(proxima.getDate() + 15);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (proxima < hoy) return 'VENCIDO';

    const sieteDias = new Date(hoy);
    sieteDias.setDate(sieteDias.getDate() + 7);

    return proxima <= sieteDias ? 'POR VENCER' : 'AL DÍA';
  };

  // F2.1: aqui vivia crearOrdenLocal(), que generaba `OT-DEMO-NNN` en estado React y
  // avisaba "creada en modo prototipo". Eliminado. Una OT se abre con POST
  // .../programacion/:id/ordenes-trabajo desde el drawer del programa, y la base
  // materializa sus detalles en la misma transaccion.

  const inventarioMock = (placa) => {
    const index = Math.max(
      0,
      vehiculos.findIndex(v => v.placa === placa)
    );

    return {
      dvr: true,
      cop: true,
      rb: true,
      cam: index % 6 !== 3,
      gps: index % 4 === 0
    };
  };

  const gruposActividad = (tipoEquipo, nivelOrden) => {
    const catalogo = ACTIVIDADES[tipoEquipo] || {};

    return [1, 2, 3]
      .filter(nivel => nivel <= Number(nivelOrden))
      .map(nivel => ({
        nivel,
        actividades: catalogo[`M${nivel}`] || []
      }))
      .filter(grupo => grupo.actividades.length > 0);
  };


  const ordenesCerradasUnidad = (placa) => {
    return ordenes
      .filter(
        orden =>
          orden.placa === placa &&
          orden.estado === 'CERRADA'
      )
      .sort(
        (a, b) =>
          new Date(`${b.fecha}T12:00:00`) -
          new Date(`${a.fecha}T12:00:00`)
      );
  };

  const ultimoValidoEquipoNivel = (
    placa,
    tipoEquipo,
    nivelMinimo
  ) => {
    const orden = ordenesCerradasUnidad(placa).find(
      item => {
        const detalle = item.detalle?.[tipoEquipo];

        if (!detalle) return false;
        if (Number(item.nivel) < Number(nivelMinimo)) {
          return false;
        }

        return ![
          'NO REVISADO',
          'NO APLICA'
        ].includes(detalle.resultado);
      }
    );

    return orden || null;
  };

  const ultimoRegistroEquipo = (placa, tipoEquipo) => {
    return (
      ordenesCerradasUnidad(placa).find(
        item => item.detalle?.[tipoEquipo]
      ) || null
    );
  };

  const datosCicloEquipo = (placa, tipoEquipo) => {
    const inventario = inventarioMock(placa);

    if (!inventario[tipoEquipo]) {
      return {
        estado: 'NO INSTALADO',
        proxima: null,
        ultimo: null,
        diasRestantes: null
      };
    }

    const reglas = PERIODICIDAD[tipoEquipo] || {};
    const proximas = [];
    let ultimo = null;

    Object.entries(reglas).forEach(([nivel, dias]) => {
      const orden = ultimoValidoEquipoNivel(
        placa,
        tipoEquipo,
        Number(nivel)
      );

      if (!orden) return;

      const fecha = new Date(`${orden.fecha}T12:00:00`);
      const proxima = new Date(fecha);
      proxima.setDate(
        proxima.getDate() + Number(dias)
      );

      proximas.push(proxima);

      if (
        !ultimo ||
        new Date(`${orden.fecha}T12:00:00`) >
        new Date(`${ultimo.fecha}T12:00:00`)
      ) {
        ultimo = orden;
      }
    });

    if (!proximas.length) {
      return {
        estado: 'SIN FECHA BASE',
        proxima: null,
        ultimo,
        diasRestantes: null
      };
    }

    const proxima = new Date(
      Math.min(...proximas.map(item => item.getTime()))
    );

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const diferencia = Math.ceil(
      (proxima.getTime() - hoy.getTime()) /
      (1000 * 60 * 60 * 24)
    );

    let estado = 'AL DÍA';

    if (diferencia < 0) {
      estado = 'VENCIDO';
    } else if (diferencia <= 7) {
      estado = 'POR VENCER';
    }

    return {
      estado,
      proxima,
      ultimo,
      diasRestantes: diferencia
    };
  };

  const estadoUnidadFicha = (placa) => {
    const estados = EQUIPOS
      .map(equipo =>
        datosCicloEquipo(placa, equipo.key).estado
      )
      .filter(estado => estado !== 'NO INSTALADO');

    for (const estado of [
      'VENCIDO',
      'POR VENCER',
      'SIN FECHA BASE'
    ]) {
      if (estados.includes(estado)) return estado;
    }

    return 'AL DÍA';
  };

  const iniciarEjecucion = (orden) => {
    const inventario = inventarioMock(orden.placa);
    const aparatos = {};

    EQUIPOS.forEach(equipo => {
      aparatos[equipo.key] = {
        instalado: Boolean(inventario[equipo.key]),
        resultado: 'NO REVISADO',
        observacion: '',
        checks: {},
        evidencias: []
      };
    });

    setOrdenActualId(orden.id);
    setEjecucion({
      fecha: orden.fecha || new Date().toISOString().slice(0, 10),
      tecnico: orden.tecnico || tecnicoActual,
      minutos: orden.minutos || '',
      aparatos,
      errores: {}
    });
    setVista('ejecucion');
  };

  const actualizarEjecucion = (campo, valor) => {
    setEjecucion(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const actualizarAparato = (tipoEquipo, campo, valor) => {
    setEjecucion(prev => ({
      ...prev,
      errores: {
        ...(prev.errores || {}),
        [tipoEquipo]: ''
      },
      aparatos: {
        ...prev.aparatos,
        [tipoEquipo]: {
          ...prev.aparatos[tipoEquipo],
          [campo]: valor
        }
      }
    }));
  };

  const toggleActividad = (tipoEquipo, actividadId) => {
    const orden = ordenes.find(
      item => item.id === ordenActualId
    );

    setEjecucion(prev => {
      const actual = prev.aparatos[tipoEquipo];

      const nuevosChecks = {
        ...actual.checks,
        [actividadId]: !actual.checks[actividadId]
      };

      const grupos = orden
        ? gruposActividad(tipoEquipo, orden.nivel)
        : [];

      const totalActividades = grupos.reduce(
        (total, grupo) =>
          total + grupo.actividades.length,
        0
      );

      const actividadesMarcadas = Object.values(
        nuevosChecks
      ).filter(Boolean).length;

      let resultadoAutomatico = 'NO REVISADO';

      if (
        totalActividades > 0 &&
        actividadesMarcadas === totalActividades
      ) {
        resultadoAutomatico = 'CONFORME';
      } else if (actividadesMarcadas > 0) {
        resultadoAutomatico = 'OBSERVADO';
      }

      return {
        ...prev,
        errores: {
          ...(prev.errores || {}),
          [tipoEquipo]: ''
        },
        aparatos: {
          ...prev.aparatos,
          [tipoEquipo]: {
            ...actual,
            checks: nuevosChecks,
            resultado: resultadoAutomatico
          }
        }
      };
    });
  };

  const agregarEvidencias = (tipoEquipo, files) => {
    const nuevas = Array.from(files || []).map(file => ({
      nombre: file.name,
      size: file.size,
      tipo: file.type
    }));

    if (!nuevas.length) return;

    setEjecucion(prev => {
      const actual = prev.aparatos[tipoEquipo];

      return {
        ...prev,
        errores: {
          ...(prev.errores || {}),
          [tipoEquipo]: ''
        },
        aparatos: {
          ...prev.aparatos,
          [tipoEquipo]: {
            ...actual,
            evidencias: [
              ...actual.evidencias,
              ...nuevas
            ]
          }
        }
      };
    });
  };

  const quitarEvidencia = (tipoEquipo, indice) => {
    setEjecucion(prev => {
      const actual = prev.aparatos[tipoEquipo];

      return {
        ...prev,
        aparatos: {
          ...prev.aparatos,
          [tipoEquipo]: {
            ...actual,
            evidencias: actual.evidencias.filter(
              (_, i) => i !== indice
            )
          }
        }
      };
    });
  };

  const cerrarOrdenLocal = () => {
    const orden = ordenes.find(
      item => item.id === ordenActualId
    );

    if (!orden || !ejecucion) return;

    const minutos = Number(ejecucion.minutos);

    if (!minutos || minutos <= 0) {
      toast.error('Falta el tiempo de ejecución');
      return;
    }

    const errores = {};
    const detalle = {};
    const resultados = [];

    EQUIPOS.forEach(equipo => {
      const estado = ejecucion.aparatos[equipo.key];
      const grupos = gruposActividad(
        equipo.key,
        orden.nivel
      );

      if (!estado?.instalado || !grupos.length) {
        return;
      }

      if (!estado.resultado) {
        errores[equipo.key] =
          'Falta el resultado de este aparato.';
        return;
      }

      if (
        EVIDENCIA_OBLIGATORIA.has(equipo.key) &&
        estado.resultado !== 'NO APLICA' &&
        estado.evidencias.length === 0
      ) {
        errores[equipo.key] =
          'Este aparato necesita al menos una foto de evidencia.';
        return;
      }

      const totalActividades = grupos.reduce(
        (total, grupo) =>
          total + grupo.actividades.length,
        0
      );

      const actividadesMarcadas = Object.values(
        estado.checks || {}
      ).filter(Boolean).length;

      detalle[equipo.key] = {
        resultado: estado.resultado,
        observacion: estado.observacion,
        evidencias: estado.evidencias.length,
        evidenciaArchivos: estado.evidencias,
        actividadesMarcadas,
        totalActividades
      };

      resultados.push(estado.resultado);
    });

    if (Object.keys(errores).length) {
      setEjecucion(prev => ({
        ...prev,
        errores
      }));
      toast.error('Revisa los aparatos marcados en rojo');
      return;
    }

    let resultadoGeneral = 'CONFORME';

    if (resultados.includes('NO CONFORME')) {
      resultadoGeneral = 'NO CONFORME';
    } else if (resultados.includes('NO REVISADO')) {
      resultadoGeneral = 'NO REVISADO';
    } else if (resultados.includes('OBSERVADO')) {
      resultadoGeneral = 'OBSERVADO';
    }

    setOrdenes(prev =>
      prev.map(item =>
        item.id === orden.id
          ? {
            ...item,
            fecha: ejecucion.fecha,
            tecnico: ejecucion.tecnico,
            minutos,
            estado: 'CERRADA',
            resultado: resultadoGeneral,
            detalle
          }
          : item
      )
    );

    const noRevisados = resultados.filter(
      resultado => resultado === 'NO REVISADO'
    ).length;

    toast.success(
      `Orden ${orden.id} cerrada${noRevisados
        ? ` · ${noRevisados} aparato(s) quedan por reprogramar`
        : ''
      }`
    );

    setOrdenActualId(null);
    setEjecucion(null);
    setVista('ots');
  };

  const headers = {
    programa: [
      'Programa de mantenimiento',
      'Setiembre a diciembre 2026 · ocho quincenas'
    ],
    unidades: [
      'Unidades',
      'Estado del ciclo por unidad y por aparato'
    ],
    ots: [
      'Órdenes de trabajo',
      'Crear, ejecutar y cerrar'
    ],
    historial: [
      'Historial',
      'Qué pasó con cada unidad, en orden cronológico'
    ],
    ejecucion: [
      'Registrar ejecución',
      'Checklist por aparato según el nivel'
    ],
    detalle: [
      'Detalle de la orden',
      'Alcance, resultados, evidencias y efecto sobre el ciclo'
    ],
    ficha: [
      'Ficha de la unidad',
      'Estado actual, qué se le hizo y qué sigue abierto'
    ]
  };

  const header = headers[vista];

  const renderFiltros = () => (
    <div className="m2-bar">
      <input type="text" placeholder="Bucar placa, cliente u operacion" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      <select value={operacion} onChange={e => setOperacion(e.target.value)}>
        <option value="">Todas las operaciones</option>
        {operaciones.map(op => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <span className="m2-muted">
        {filtrados.length} de {vehiculos.length} unidades
      </span>
    </div>
  );
  // renderPrograma() SE ELIMINO en F1. Era la maqueta: el nivel salia de
  // nivelProgramado(indiceUnidad % 8) y las quincenas eran 8 fechas fijas de 2026.
  // La pantalla Programa vive ahora en ./tiPr01/ProgramaTiPr01.jsx, con el diseno del
  // prototipo v2 y datos del backend real.

  const renderUnidades = () => {
    const estados = filtrados.map((vehiculo, index) =>
      estadoUnidad(vehiculo, index)
    );

    return (
      <>
        <div className="m2-kpis">
          <div className="m2-kpi">
            <span>Unidades</span>
            <strong>{filtrados.length}</strong>
          </div>

          <div className="m2-kpi">
            <span>Vencidas</span>
            <strong className="red">
              {estados.filter(x => x === 'VENCIDO').length}
            </strong>
          </div>

          <div className="m2-kpi">
            <span>Por vencer</span>
            <strong className="amber">
              {estados.filter(x => x === 'POR VENCER').length}
            </strong>
          </div>

          <div className="m2-kpi">
            <span>Al día</span>
            <strong className="green">
              {estados.filter(x => x === 'AL DÍA').length}
            </strong>
          </div>
        </div>

        {renderFiltros()}

        <div className="m2-card m2-scroll">
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Operación</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Aparatos</th>
                <th>Última intervención</th>
                <th>Nivel</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filtrados.map((vehiculo, index) => {
                const cerradas = ordenes
                  .filter(
                    orden =>
                      orden.placa === vehiculo.placa &&
                      orden.estado === 'CERRADA'
                  )
                  .sort(
                    (a, b) =>
                      new Date(`${b.fecha}T12:00:00`) -
                      new Date(`${a.fecha}T12:00:00`)
                  );

                const ultima = cerradas[0];
                const estado = estadoUnidad(vehiculo, index);

                return (
                  <tr
                    key={vehiculo.placa}
                    className="m2-unit-row"
                    onClick={() => {
                      setUnidadFichaPlaca(vehiculo.placa);
                      setFichaFiltro('todo');
                      setFichaAbiertos({});
                      setVista('ficha');
                    }}
                  >
                    <td>
                      <strong className="m2-mono">
                        {vehiculo.placa}
                      </strong>

                      <div className="m2-small">
                        {vehiculo.tipo_vehiculo || '—'}
                      </div>
                    </td>

                    <td>
                      {vehiculo.operacion || '—'}
                    </td>

                    <td>
                      {vehiculo.cliente || '—'}
                    </td>

                    <td>
                      <span className={estadoClase(estado)}>
                        {estado}
                      </span>
                    </td>

                    <td>
                      <span className="m2-dots">
                        {EQUIPOS.map((equipo, equipoIndex) => (
                          <i
                            key={equipo.key}
                            className={`m2-dot ${equipoIndex === 4 &&
                              index % 3 !== 0
                              ? 'off'
                              : 'ok'
                              }`}
                            title={equipo.nombre}
                          />
                        ))}
                      </span>
                    </td>

                    <td>
                      {ultima ? (
                        formatDMY(ultima.fecha)
                      ) : (
                        <span className="m2-muted">
                          sin registro
                        </span>
                      )}
                    </td>

                    <td>
                      {ultima ? (
                        <span
                          className={`m2-level l${ultima.nivel}`}
                        >
                          M{ultima.nivel}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="m2-unit-arrow">
                      ›
                    </td>
                  </tr>
                );
              })}

              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="8" className="m2-empty">
                    No hay unidades que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  // F2.1: renderOrdenes() SE ELIMINO. Era la vista de demostracion de las ordenes:
  // leia el arreglo `ordenes` sembrado con OT-DEMO-001/002, pintaba un nivel M1/M2/M3
  // derivado del indice de la placa y ofrecia "Nueva OT" por placa + fecha.
  //
  // La pantalla vive ahora en ./tiPr01/OrdenesTiPr01.jsx, con el diseno del prototipo
  // v2 y datos del backend real: una OT cuelga de una programacion concreta y sus
  // detalles son los equipos previstos de esa visita.

  const renderFichaUnidad = () => {
    const vehiculo = vehiculos.find(
      item => item.placa === unidadFichaPlaca
    );

    if (!vehiculo) {
      return (
        <div className="m2-card">
          <div className="m2-empty">
            Unidad no encontrada.
          </div>
        </div>
      );
    }

    const inventario = inventarioMock(vehiculo.placa);
    const cerradas = ordenesCerradasUnidad(
      vehiculo.placa
    );

    const eventos = cerradas.filter(orden => {
      if (fichaFiltro === 'todo') return true;

      if (fichaFiltro === 'hall') {
        return Object.values(
          orden.detalle || {}
        ).some(
          detalle =>
            detalle?.resultado &&
            detalle.resultado !== 'CONFORME'
        );
      }

      return Boolean(
        orden.detalle?.[fichaFiltro]
      );
    });

    const atenciones = [];

    EQUIPOS.forEach(equipo => {
      if (!inventario[equipo.key]) return;

      const ciclo = datosCicloEquipo(
        vehiculo.placa,
        equipo.key
      );

      if (ciclo.estado === 'VENCIDO') {
        atenciones.push({
          tipo: 'vencido',
          equipo,
          ciclo
        });
      }

      const ultimoRegistro = ultimoRegistroEquipo(
        vehiculo.placa,
        equipo.key
      );

      const detalle =
        ultimoRegistro?.detalle?.[equipo.key];

      if (
        detalle &&
        ['OBSERVADO', 'NO CONFORME', 'NO REVISADO'].includes(
          detalle.resultado
        )
      ) {
        atenciones.push({
          tipo: 'hallazgo',
          equipo,
          orden: ultimoRegistro,
          detalle
        });
      }
    });

    return (
      <>
        <div className="m2-ficha-actions">
          <button
            className="m2-btn"
            onClick={() => {
              setVista('unidades');
              setUnidadFichaPlaca(null);
            }}
          >
            ← Volver
          </button>

        </div>

        <div
          className="m2-card"
          style={{ marginBottom: '14px' }}
        >
          <div className="m2-ficha-head">
            <div>
              <div className="m2-ficha-plate">
                {vehiculo.placa}
              </div>

              <div className="m2-small">
                {vehiculo.tipo_vehiculo || '—'} ·{' '}
                {vehiculo.marca_tracto || '—'}{' '}
                {vehiculo.modelo_tracto || ''} ·{' '}
                {vehiculo.anio_fabricacion || '—'} ·{' '}
                {vehiculo.operacion || 'Sin operación'} ·{' '}
                {vehiculo.cliente || 'Sin cliente'}
              </div>
            </div>

            <div className="m2-ficha-state">
              <span>Estado de la unidad</span>

              <span
                className={estadoClase(
                  estadoUnidadFicha(vehiculo.placa)
                )}
              >
                {estadoUnidadFicha(vehiculo.placa)}
              </span>
            </div>
          </div>

          <div className="m2-ficha-tiles">
            {EQUIPOS.map(equipo => {
              const instalado = inventario[equipo.key];
              const ciclo = datosCicloEquipo(
                vehiculo.placa,
                equipo.key
              );

              const ultimo = ultimoRegistroEquipo(
                vehiculo.placa,
                equipo.key
              );

              const registros = cerradas.filter(
                orden => orden.detalle?.[equipo.key]
              ).length;

              if (!instalado) {
                return (
                  <div
                    className="m2-ficha-tile off"
                    key={equipo.key}
                  >
                    <strong>{equipo.nombre}</strong>
                    <span>No instalado</span>
                    <small>No se exige</small>
                  </div>
                );
              }

              let siguiente = 'Sin fecha base';

              if (ciclo.proxima) {
                siguiente =
                  ciclo.diasRestantes < 0
                    ? `Vencido hace ${Math.abs(
                      ciclo.diasRestantes
                    )} días`
                    : ciclo.diasRestantes === 0
                      ? 'Vence hoy'
                      : `Vence en ${ciclo.diasRestantes} días`;
              }

              return (
                <button
                  type="button"
                  className={`m2-ficha-tile ${fichaFiltro === equipo.key
                    ? 'selected'
                    : ''
                    }`}
                  key={equipo.key}
                  onClick={() =>
                    setFichaFiltro(prev =>
                      prev === equipo.key
                        ? 'todo'
                        : equipo.key
                    )
                  }
                >
                  <strong>{equipo.nombre}</strong>

                  <span
                    className={estadoClase(ciclo.estado)}
                  >
                    {ciclo.estado}
                  </span>

                  <small>
                    Último{' '}
                    {ultimo
                      ? formatDMY(ultimo.fecha)
                      : '—'}
                  </small>

                  <small
                    className={
                      ciclo.estado === 'VENCIDO'
                        ? 'danger'
                        : ''
                    }
                  >
                    {siguiente}
                  </small>

                  <small>
                    {registros
                      ? `${registros} registro${registros > 1 ? 's' : ''
                      }`
                      : 'Sin registros'}
                  </small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="m2-ficha-columns">
          <div>
            <div className="m2-ficha-filterbar">
              <span>Mostrar</span>

              <button
                type="button"
                className={`m2-filter-chip ${fichaFiltro === 'todo'
                  ? 'selected'
                  : ''
                  }`}
                onClick={() =>
                  setFichaFiltro('todo')
                }
              >
                Todo
              </button>

              <button
                type="button"
                className={`m2-filter-chip ${fichaFiltro === 'hall'
                  ? 'selected'
                  : ''
                  }`}
                onClick={() =>
                  setFichaFiltro('hall')
                }
              >
                Solo hallazgos
              </button>

              {!['todo', 'hall'].includes(
                fichaFiltro
              ) && (
                  <button
                    type="button"
                    className="m2-filter-chip selected"
                    onClick={() =>
                      setFichaFiltro('todo')
                    }
                  >
                    {
                      EQUIPOS.find(
                        item =>
                          item.key === fichaFiltro
                      )?.nombre
                    }{' '}
                    ×
                  </button>
                )}
            </div>

            <div className="m2-card">
              <div className="m2-card-title">
                Qué se le hizo a la unidad
              </div>

              <div className="m2-timeline-wrap">
                {eventos.length === 0 ? (
                  <div className="m2-empty">
                    {cerradas.length === 0
                      ? 'Esta unidad todavía no tiene mantenimientos cerrados.'
                      : 'No hay registros para este filtro.'}
                  </div>
                ) : (
                  <div className="m2-timeline">
                    {eventos.map(orden => {
                      const detalles = Object.entries(
                        orden.detalle || {}
                      );

                      const hallazgos =
                        detalles.filter(
                          ([, detalle]) =>
                            detalle.resultado !==
                            'CONFORME'
                        );

                      const conformes =
                        detalles.filter(
                          ([, detalle]) =>
                            detalle.resultado ===
                            'CONFORME'
                        );

                      const abierto = Boolean(
                        fichaAbiertos[orden.id]
                      );

                      return (
                        <div
                          className="m2-timeline-item"
                          key={orden.id}
                        >
                          <i
                            className={`m2-timeline-dot ${hallazgos.length
                              ? 'warn'
                              : 'ok'
                              }`}
                          />

                          <div className="m2-timeline-head">
                            <strong>
                              {formatDMY(orden.fecha)}
                            </strong>

                            <span
                              className={`m2-level l${orden.nivel}`}
                            >
                              M{orden.nivel}
                            </span>

                            <span className="m2-small">
                              {orden.tecnico || '—'} ·{' '}
                              {orden.minutos || 0} min ·{' '}
                              <span className="m2-mono">
                                {orden.id}
                              </span>
                            </span>

                            <button
                              type="button"
                              className="m2-btn m2-btn-small"
                              onClick={() =>
                                setFichaAbiertos(prev => ({
                                  ...prev,
                                  [orden.id]:
                                    !prev[orden.id]
                                }))
                              }
                            >
                              {abierto
                                ? 'Ocultar detalle'
                                : 'Ver detalle'}
                            </button>
                          </div>

                          <div className="m2-timeline-results">
                            {hallazgos.map(
                              ([key, detalle]) => {
                                const equipo =
                                  EQUIPOS.find(
                                    item =>
                                      item.key === key
                                  );

                                return (
                                  <div
                                    className={`m2-finding ${detalle.resultado ===
                                      'NO CONFORME'
                                      ? 'bad'
                                      : 'warn'
                                      }`}
                                    key={key}
                                  >
                                    <span>
                                      {detalle.resultado ===
                                        'NO CONFORME'
                                        ? '!'
                                        : '~'}
                                    </span>

                                    <div>
                                      <strong>
                                        {equipo?.nombre ||
                                          key}
                                      </strong>{' '}
                                      <small>
                                        {detalle.resultado.toLowerCase()}
                                      </small>

                                      {detalle.observacion && (
                                        <div className="m2-small">
                                          {
                                            detalle.observacion
                                          }
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                            )}

                            {conformes.length > 0 && (
                              <div className="m2-finding ok">
                                <span>✓</span>

                                <div>
                                  {conformes.length}{' '}
                                  aparato
                                  {conformes.length > 1
                                    ? 's'
                                    : ''}{' '}
                                  conforme
                                  {conformes.length > 1
                                    ? 's'
                                    : ''}
                                  :{' '}
                                  {conformes
                                    .map(
                                      ([key]) =>
                                        EQUIPOS.find(
                                          item =>
                                            item.key === key
                                        )?.nombre
                                    )
                                    .filter(Boolean)
                                    .join(', ')}
                                </div>
                              </div>
                            )}
                          </div>

                          {abierto && (
                            <div className="m2-ficha-detail">
                              {EQUIPOS.map(equipo => {
                                const detalle =
                                  orden.detalle?.[
                                  equipo.key
                                  ];

                                if (!detalle) {
                                  return (
                                    <div
                                      className="m2-ficha-detail-row muted"
                                      key={equipo.key}
                                    >
                                      <span>
                                        {equipo.nombre}
                                      </span>

                                      <span>
                                        {inventario[
                                          equipo.key
                                        ]
                                          ? 'Sin registro'
                                          : 'No instalado'}
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={equipo.key}
                                  >
                                    <div className="m2-ficha-detail-row">
                                      <span>
                                        {equipo.nombre}
                                      </span>

                                      <span>
                                        <span
                                          className={estadoClase(
                                            detalle.resultado
                                          )}
                                        >
                                          {
                                            detalle.resultado
                                          }
                                        </span>

                                        {detalle.evidencias >
                                          0 && (
                                            <span className="m2-evidence">
                                              {
                                                detalle.evidencias
                                              }{' '}
                                              foto
                                              {detalle.evidencias >
                                                1
                                                ? 's'
                                                : ''}
                                            </span>
                                          )}
                                      </span>
                                    </div>

                                    {detalle.observacion && (
                                      <div className="m2-ficha-observation">
                                        {
                                          detalle.observacion
                                        }
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              <div className="m2-ficha-detail-row muted">
                                <span>
                                  Actividades del nivel
                                </span>

                                <span>
                                  M{orden.nivel}{' '}
                                  acumulativo
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="m2-card m2-ficha-sticky">
              <div className="m2-card-title">
                Requiere atención
              </div>

              <div className="m2-attention-wrap">
                {atenciones.length === 0 ? (
                  <div className="m2-muted">
                    Nada abierto. Con los datos temporales
                    disponibles, la unidad no muestra
                    mantenimientos vencidos ni hallazgos
                    pendientes.
                  </div>
                ) : (
                  atenciones.map(
                    (item, index) => {
                      if (item.tipo === 'vencido') {
                        return (
                          <div
                            className="m2-attention overdue"
                            key={`v-${item.equipo.key}-${index}`}
                          >
                            <strong>
                              {item.equipo.nombre}
                            </strong>

                            <div>
                              Mantenimiento vencido
                            </div>

                            <small>
                              {item.ciclo.proxima
                                ? `Venció el ${formatDMY(
                                  item.ciclo.proxima
                                )}`
                                : 'Sin fecha calculada'}
                            </small>
                          </div>
                        );
                      }

                      return (
                        <div
                          className="m2-attention"
                          key={`h-${item.equipo.key}-${index}`}
                        >
                          <div>
                            <span
                              className={estadoClase(
                                item.detalle.resultado
                              )}
                            >
                              {
                                item.detalle.resultado
                              }
                            </span>
                          </div>

                          <strong>
                            {item.equipo.nombre}
                          </strong>

                          <div>
                            {item.detalle.observacion ||
                              'Hallazgo registrado en mantenimiento'}
                          </div>

                          <small>
                            {item.orden.id} ·{' '}
                            {formatDMY(
                              item.orden.fecha
                            )}
                          </small>
                        </div>
                      );
                    }
                  )
                )}

                <div className="m2-attention-note">
                  Consulta los tickets correctivos en Tickets de Soporte.
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };


  const renderDetalleOrden = () => {
    const orden = ordenes.find(
      item => item.id === ordenDetalleId
    );

    if (!orden) {
      return (
        <div className="m2-card">
          <div className="m2-empty">
            Orden no encontrada.
          </div>
        </div>
      );
    }

    const vehiculo =
      vehiculos.find(v => v.placa === orden.placa) || {};

    const inventario = inventarioMock(orden.placa);

    const incluidos = [];
    const excluidos = [];
    const porNivel = {
      1: { actividades: 0, minutos: 0 },
      2: { actividades: 0, minutos: 0 },
      3: { actividades: 0, minutos: 0 }
    };

    let totalActividades = 0;
    let totalMinutos = 0;

    EQUIPOS.forEach(equipo => {
      if (!inventario[equipo.key]) {
        excluidos.push({
          nombre: equipo.nombre,
          razon: 'No instalado en esta unidad'
        });
        return;
      }

      const grupos = gruposActividad(
        equipo.key,
        orden.nivel
      );

      if (!grupos.length) {
        excluidos.push({
          nombre: equipo.nombre,
          razon:
            equipo.key === 'gps'
              ? `El GPS solo se atiende en M3 semestral por proveedor, no entra en un M${orden.nivel}`
              : 'Sin actividades para este nivel'
        });
        return;
      }

      const actividades = grupos.reduce(
        (total, grupo) =>
          total + grupo.actividades.length,
        0
      );

      const minutos = grupos.reduce(
        (total, grupo) =>
          total +
          grupo.actividades.reduce(
            (suma, actividad) =>
              suma + Number(actividad.m || 0),
            0
          ),
        0
      );

      grupos.forEach(grupo => {
        porNivel[grupo.nivel].actividades +=
          grupo.actividades.length;

        porNivel[grupo.nivel].minutos +=
          grupo.actividades.reduce(
            (suma, actividad) =>
              suma + Number(actividad.m || 0),
            0
          );
      });

      incluidos.push({
        key: equipo.key,
        nombre: equipo.nombre,
        grupos,
        actividades,
        minutos
      });

      totalActividades += actividades;
      totalMinutos += minutos;
    });

    const resultadoAparato = tipoEquipo =>
      orden.detalle?.[tipoEquipo] || null;

    const efectoCiclo = detalle => {
      if (!detalle) {
        return {
          texto: 'Pendiente de ejecución',
          clase: 'm2-cycle-neutral'
        };
      }

      if (detalle.resultado === 'NO REVISADO') {
        return {
          texto: 'No avanza · requiere reprogramación',
          clase: 'm2-cycle-hold'
        };
      }

      if (detalle.resultado === 'NO APLICA') {
        return {
          texto: 'No modifica el ciclo',
          clase: 'm2-cycle-neutral'
        };
      }

      return {
        texto: `Actualiza el ciclo desde ${formatDMY(
          orden.fecha
        )}`,
        clase: 'm2-cycle-ok'
      };
    };

    return (
      <>
        <div className="m2-exec-header">
          <button
            className="m2-btn"
            onClick={() => {
              setVista('ots');
              setOrdenDetalleId(null);
            }}
          >
            ← Volver a órdenes
          </button>

          <div>
            <div className="m2-exec-plate">
              {orden.placa}
            </div>

            <div className="m2-small">
              {vehiculo.operacion || 'Sin operación'} ·{' '}
              {vehiculo.cliente || 'Sin cliente'} ·{' '}
              {orden.id}
            </div>
          </div>

          <div className="m2-exec-level">
            <span
              className={`m2-level l${orden.nivel}`}
              style={{
                fontSize: '13px',
                padding: '5px 11px'
              }}
            >
              M{orden.nivel}
            </span>

            <span className={estadoClase(orden.estado)}>
              {orden.estado}
            </span>
          </div>
        </div>

        <div
          className="m2-card"
          style={{ marginBottom: '14px' }}
        >
          <div className="m2-detail-meta">
            <div>
              <span>Fecha</span>
              <strong>{formatDMY(orden.fecha)}</strong>
            </div>

            <div>
              <span>Técnico</span>
              <strong>{orden.tecnico || '—'}</strong>
            </div>

            <div>
              <span>Resultado general</span>
              <strong>
                {orden.resultado ? (
                  <span
                    className={estadoClase(
                      orden.resultado
                    )}
                  >
                    {orden.resultado}
                  </span>
                ) : (
                  <span className="m2-muted">
                    Pendiente
                  </span>
                )}
              </strong>
            </div>

            <div>
              <span>Tiempo estándar</span>
              <strong className="m2-mono">
                {totalMinutos} min
              </strong>
            </div>

            <div>
              <span>Tiempo ejecutado</span>
              <strong className="m2-mono">
                {orden.minutos
                  ? `${orden.minutos} min`
                  : '—'}
              </strong>
            </div>
          </div>
        </div>

        <div className="m2-scope">
          <div className="m2-scope-title">
            Qué considera esta orden
          </div>

          <p>
            Esta orden es M{orden.nivel}.{' '}
            {orden.nivel === 1
              ? 'Solo contiene actividades M1.'
              : orden.nivel === 2
                ? 'Incluye las actividades M1 y M2 por la regla acumulativa.'
                : 'Incluye las actividades M1, M2 y M3 por la regla acumulativa.'}
          </p>

          <div className="m2-scope-stats">
            {[1, 2, 3]
              .filter(nivel => nivel <= orden.nivel)
              .map(nivel => (
                <div
                  className="m2-scope-stat"
                  key={nivel}
                >
                  <span
                    className={`m2-level l${nivel}`}
                  >
                    M{nivel}
                  </span>

                  <strong>
                    {porNivel[nivel].actividades}
                  </strong>

                  <span>
                    actividades ·{' '}
                    {porNivel[nivel].minutos} min
                  </span>
                </div>
              ))}

            <div className="m2-scope-stat total">
              <span>Total</span>
              <strong>{totalActividades}</strong>
              <span>
                actividades · {totalMinutos} min estándar
              </span>
            </div>
          </div>

          <div className="m2-scope-lists">
            <div>
              <strong>Aparatos que entran</strong>

              <ul>
                {incluidos.map(item => (
                  <li key={item.key}>
                    {item.nombre} · {item.actividades}{' '}
                    actividades · {item.minutos} min ·{' '}
                    niveles{' '}
                    {item.grupos
                      .map(grupo => `M${grupo.nivel}`)
                      .join(', ')}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <strong>Aparatos que no entran</strong>

              <ul>
                {excluidos.length ? (
                  excluidos.map(item => (
                    <li key={item.nombre}>
                      {item.nombre} · {item.razon}
                    </li>
                  ))
                ) : (
                  <li>
                    Ninguno, la unidad tiene los cinco
                    aparatos aplicables.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="m2-detail-grid">
          {incluidos.map(item => {
            const detalle =
              resultadoAparato(item.key);

            const ciclo = efectoCiclo(detalle);

            return (
              <div
                className="m2-apparatus"
                key={item.key}
              >
                <div className="m2-apparatus-head">
                  <div>
                    <strong>{item.nombre}</strong>

                    <div className="m2-small">
                      {item.actividades} actividades ·{' '}
                      {item.minutos} min estándar
                    </div>
                  </div>

                  {detalle ? (
                    <span
                      className={estadoClase(
                        detalle.resultado
                      )}
                    >
                      {detalle.resultado}
                    </span>
                  ) : (
                    <span className="m2-chip m2-chip-grey">
                      PENDIENTE
                    </span>
                  )}
                </div>

                <div className="m2-apparatus-body">
                  <div className="m2-detail-summary">
                    <div>
                      <span>Checklist</span>
                      <strong>
                        {detalle
                          ? `${detalle.actividadesMarcadas}/${detalle.totalActividades}`
                          : `0/${item.actividades}`}
                      </strong>
                    </div>

                    <div>
                      <span>Evidencias</span>
                      <strong>
                        {detalle?.evidencias || 0}
                      </strong>
                    </div>

                    <div>
                      <span>Efecto en ciclo</span>
                      <strong className={ciclo.clase}>
                        {ciclo.texto}
                      </strong>
                    </div>
                  </div>

                  {item.grupos.map(grupo => (
                    <div key={grupo.nivel}>
                      <div className="m2-activity-group">
                        <span
                          className={`m2-level l${grupo.nivel}`}
                        >
                          M{grupo.nivel}
                        </span>

                        <span>
                          {grupo.nivel === orden.nivel
                            ? 'actividades propias del nivel'
                            : 'arrastradas por la regla acumulativa'}
                        </span>

                        <span>
                          · {grupo.actividades.length}{' '}
                          actividades
                        </span>
                      </div>

                      {grupo.actividades.map(
                        (actividad, index) => (
                          <div
                            className="m2-detail-activity"
                            key={`${item.key}-${grupo.nivel}-${index}`}
                          >
                            <span className="m2-detail-check">
                              {detalle
                                ? '✓'
                                : '•'}
                            </span>

                            <span>
                              {actividad.t}{' '}
                              <em>
                                · {actividad.c}
                              </em>
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  ))}

                  <div className="m2-detail-row">
                    <span>Observación</span>
                    <strong>
                      {detalle?.observacion?.trim()
                        ? detalle.observacion
                        : 'Sin observación registrada'}
                    </strong>
                  </div>

                  <div className="m2-detail-row">
                    <span>Evidencias</span>

                    <div className="m2-detail-evidences">
                      {detalle?.evidenciaArchivos?.length ? (
                        detalle.evidenciaArchivos.map(
                          (archivo, index) => (
                            <span
                              className="m2-evidence"
                              key={`${archivo.nombre}-${index}`}
                            >
                              {archivo.nombre}
                            </span>
                          )
                        )
                      ) : (
                        <span className="m2-muted">
                          Sin evidencias registradas
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {excluidos.map(item => (
            <div
              className="m2-apparatus off"
              key={`exc-${item.nombre}`}
            >
              <div className="m2-apparatus-head">
                <strong>{item.nombre}</strong>

                <span className="m2-muted">
                  {item.razon}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="m2-exec-footer">
          {orden.estado === 'ABIERTA' && canEdit && (
            <button
              className="m2-btn m2-btn-primary"
              onClick={() => iniciarEjecucion(orden)}
            >
              Registrar ejecución
            </button>
          )}

          <button
            className="m2-btn"
            onClick={() => {
              setVista('ots');
              setOrdenDetalleId(null);
            }}
          >
            Volver
          </button>

          <span className="m2-muted">
            Vista de consulta. Para registrar el mantenimiento, abre la orden
            desde Órdenes de trabajo.
          </span>
        </div>
      </>
    );
  };


  const renderEjecucion = () => {
    const orden = ordenes.find(
      item => item.id === ordenActualId
    );

    if (!orden || !ejecucion) {
      return (
        <div className="m2-card">
          <div className="m2-empty">
            Orden no encontrada.
          </div>
        </div>
      );
    }

    const vehiculo =
      vehiculos.find(v => v.placa === orden.placa) || {};

    const incluidos = [];
    const excluidos = [];
    const resumenNiveles = {
      1: { actividades: 0, minutos: 0 },
      2: { actividades: 0, minutos: 0 },
      3: { actividades: 0, minutos: 0 }
    };

    let totalActividades = 0;
    let totalMinutos = 0;

    EQUIPOS.forEach(equipo => {
      const estado = ejecucion.aparatos[equipo.key];

      if (!estado?.instalado) {
        excluidos.push({
          nombre: equipo.nombre,
          razon: 'No está instalado en esta unidad'
        });
        return;
      }

      const grupos = gruposActividad(
        equipo.key,
        orden.nivel
      );

      if (!grupos.length) {
        excluidos.push({
          nombre: equipo.nombre,
          razon:
            equipo.key === 'gps'
              ? `El GPS solo se atiende en M3 semestral por proveedor, no entra en un M${orden.nivel}`
              : `Sin actividades configuradas para M${orden.nivel}`
        });
        return;
      }

      let actividadesEquipo = 0;
      let minutosEquipo = 0;

      grupos.forEach(grupo => {
        const minutosGrupo = grupo.actividades.reduce(
          (suma, actividad) =>
            suma + Number(actividad.m || 0),
          0
        );

        resumenNiveles[grupo.nivel].actividades +=
          grupo.actividades.length;
        resumenNiveles[grupo.nivel].minutos +=
          minutosGrupo;

        actividadesEquipo += grupo.actividades.length;
        minutosEquipo += minutosGrupo;
      });

      incluidos.push({
        nombre: equipo.nombre,
        actividades: actividadesEquipo,
        minutos: minutosEquipo,
        niveles: grupos.map(grupo => grupo.nivel)
      });

      totalActividades += actividadesEquipo;
      totalMinutos += minutosEquipo;
    });

    return (
      <>
        <div className="m2-exec-header">
          <button
            className="m2-btn"
            onClick={() => {
              setVista('ots');
              setOrdenActualId(null);
              setEjecucion(null);
            }}
          >
            ← Volver
          </button>

          <div>
            <div className="m2-exec-plate">
              {orden.placa}
            </div>

            <div className="m2-muted">
              {vehiculo.operacion || 'Sin operación'} ·{' '}
              {vehiculo.cliente || 'Sin cliente'} ·{' '}
              {orden.id}
            </div>
          </div>

          <div className="m2-exec-level">
            <span
              className={`m2-level l${orden.nivel}`}
            >
              M{orden.nivel}
            </span>

            <span className="m2-muted">
              {orden.nivel === 1
                ? 'verificación de operatividad'
                : orden.nivel === 2
                  ? 'incluye M1'
                  : 'incluye M1 y M2'}
            </span>
          </div>
        </div>

        <div
          className="m2-card"
          style={{ marginBottom: '14px' }}
        >
          <div className="m2-exec-meta">
            <div className="m2-field">
              <label>Fecha de ejecución</label>

              <FechaInput
                value={ejecucion.fecha}
                onChange={valor =>
                  actualizarEjecucion(
                    'fecha',
                    valor
                  )
                }
                required
              />
            </div>

            <div className="m2-field">
              <label>Técnico</label>

              <input
                type="text"
                value={ejecucion.tecnico || tecnicoActual}
                readOnly
                title="Se asigna automáticamente con el usuario de la cuenta"
              />
            </div>

            <div className="m2-field">
              <label>Tiempo de ejecución (min)</label>

              <input
                type="number"
                min="1"
                value={ejecucion.minutos}
                onChange={e =>
                  actualizarEjecucion(
                    'minutos',
                    e.target.value
                  )
                }
                placeholder="Ej. 60"
              />
            </div>
          </div>
        </div>

        <div className="m2-scope">
          <div className="m2-scope-title">
            Qué considera esta orden
          </div>

          <p>
            Esta orden es M{orden.nivel}.{' '}
            {orden.nivel === 1
              ? 'Solo lleva las actividades del M1.'
              : `Por la regla acumulativa arrastra también ${orden.nivel === 2
                ? 'las del M1'
                : 'las del M1 y del M2'
              }, por eso el checklist muestra todas las actividades con su nivel de origen.`}
          </p>

          <div className="m2-scope-stats">
            {[1, 2, 3]
              .filter(nivel => nivel <= orden.nivel)
              .map(nivel => (
                <div
                  className="m2-scope-stat"
                  key={nivel}
                >
                  <span
                    className={`m2-level l${nivel}`}
                  >
                    M{nivel}
                  </span>

                  <strong>
                    {resumenNiveles[nivel].actividades}
                  </strong>

                  <span>
                    actividades ·{' '}
                    {resumenNiveles[nivel].minutos} min
                  </span>
                </div>
              ))}

            <div className="m2-scope-stat total">
              <span>Total</span>
              <strong>{totalActividades}</strong>
              <span>
                actividades · {totalMinutos} min estándar
              </span>
            </div>
          </div>

          <div className="m2-scope-lists">
            <div>
              <strong>Aparatos que entran</strong>
              <ul>
                {incluidos.map(item => (
                  <li key={item.nombre}>
                    {item.nombre} · {item.actividades}{' '}
                    actividades · {item.minutos} min · niveles{' '}
                    {item.niveles
                      .map(nivel => `M${nivel}`)
                      .join(', ')}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <strong>Aparatos que no entran</strong>
              <ul>
                {excluidos.length ? (
                  excluidos.map(item => (
                    <li key={item.nombre}>
                      {item.nombre} · {item.razon}
                    </li>
                  ))
                ) : (
                  <li>
                    Ninguno, la unidad tiene los cinco aparatos
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {EQUIPOS.map(equipo => {
          const estado =
            ejecucion.aparatos[equipo.key];

          const grupos = gruposActividad(
            equipo.key,
            orden.nivel
          );

          if (!estado?.instalado) {
            return (
              <div
                className="m2-apparatus off"
                key={equipo.key}
              >
                <div className="m2-apparatus-head">
                  <strong>{equipo.nombre}</strong>
                  <span className="m2-muted">
                    No instalado en esta unidad
                  </span>
                </div>
              </div>
            );
          }

          if (!grupos.length) {
            return (
              <div
                className="m2-apparatus off"
                key={equipo.key}
              >
                <div className="m2-apparatus-head">
                  <strong>{equipo.nombre}</strong>
                  <span className="m2-muted">
                    Sin actividades en este nivel. El GPS
                    solo se atiende en M3 semestral por proveedor.
                  </span>
                </div>
              </div>
            );
          }

          const actividades = grupos.flatMap(
            grupo =>
              grupo.actividades.map(
                (actividad, index) => ({
                  ...actividad,
                  nivel: grupo.nivel,
                  actividadId:
                    `${equipo.key}-M${grupo.nivel}-${index}`
                })
              )
          );

          const totalMinutosEquipo =
            actividades.reduce(
              (suma, actividad) =>
                suma + Number(actividad.m || 0),
              0
            );

          const marcadas = actividades.filter(
            actividad =>
              Boolean(
                estado.checks[
                actividad.actividadId
                ]
              )
          ).length;

          const error =
            ejecucion.errores?.[equipo.key];

          return (
            <div
              className={`m2-apparatus ${error ? 'error' : ''
                }`}
              key={equipo.key}
            >
              <div className="m2-apparatus-head">
                <div>
                  <strong>{equipo.nombre}</strong>

                  <div className="m2-small">
                    {actividades.length} actividades ·{' '}
                    {totalMinutosEquipo} min
                    {EVIDENCIA_OBLIGATORIA.has(
                      equipo.key
                    )
                      ? ' · evidencia obligatoria'
                      : ''}
                  </div>
                </div>

                <div className="m2-apparatus-actions">
                  <span className="m2-muted">
                    {marcadas}/{actividades.length}
                  </span>

                  <select
                    value={estado.resultado}
                    onChange={e =>
                      actualizarAparato(
                        equipo.key,
                        'resultado',
                        e.target.value
                      )
                    }
                  >
                    <option value="CONFORME">
                      CONFORME
                    </option>
                    <option value="OBSERVADO">
                      OBSERVADO
                    </option>
                    <option value="NO CONFORME">
                      NO CONFORME
                    </option>
                    <option value="NO REVISADO">
                      NO REVISADO
                    </option>
                    <option value="NO APLICA">
                      NO APLICA
                    </option>
                  </select>
                </div>
              </div>

              <div
                className="m2-small"
                style={{
                  padding: '0 16px 8px',
                  color: 'var(--text-secondary)'
                }}
              >
                El resultado se actualiza con el checklist:
                0 marcadas = NO REVISADO · parcial = OBSERVADO ·
                completo = CONFORME. Puedes cambiarlo manualmente si
                ocurrió una incidencia.
              </div>

              <div className="m2-apparatus-body">
                {grupos.map(grupo => (
                  <div key={grupo.nivel}>
                    <div className="m2-activity-group">
                      <span
                        className={`m2-level l${grupo.nivel}`}
                      >
                        M{grupo.nivel}
                      </span>

                      <span>
                        {grupo.nivel === orden.nivel
                          ? 'actividades propias del nivel'
                          : 'arrastradas por la regla acumulativa'}
                      </span>

                      <span>
                        · {grupo.actividades.length}{' '}
                        actividades ·{' '}
                        {grupo.actividades.reduce(
                          (suma, actividad) =>
                            suma +
                            Number(actividad.m || 0),
                          0
                        )}{' '}
                        min
                      </span>
                    </div>

                    {grupo.actividades.map(
                      (actividad, index) => {
                        const actividadId =
                          `${equipo.key}-M${grupo.nivel}-${index}`;

                        return (
                          <label
                            className="m2-check"
                            key={actividadId}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(
                                estado.checks[
                                actividadId
                                ]
                              )}
                              onChange={() =>
                                toggleActividad(
                                  equipo.key,
                                  actividadId
                                )
                              }
                            />

                            <span>
                              {actividad.t}{' '}
                              <em>
                                · {actividad.c}
                              </em>
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>
                ))}

                <div
                  className="m2-field"
                  style={{ marginTop: '12px' }}
                >
                  <label>Observación</label>

                  <input
                    type="text"
                    placeholder="Qué se encontró o por qué no se hizo"
                    value={estado.observacion}
                    onChange={e =>
                      actualizarAparato(
                        equipo.key,
                        'observacion',
                        e.target.value
                      )
                    }
                  />
                </div>

                {estado.resultado ===
                  'NO REVISADO' && (
                    <div className="m2-warning">
                      El ciclo de{' '}
                      {equipo.nombre.toLowerCase()} no
                      avanza hasta que se registre su mantenimiento.
                    </div>
                  )}

                <div className="m2-evidence-zone">
                  {estado.evidencias.map(
                    (archivo, index) => (
                      <span
                        className="m2-evidence"
                        key={`${archivo.nombre}-${index}`}
                      >
                        {archivo.nombre}

                        <button
                          type="button"
                          onClick={() =>
                            quitarEvidencia(
                              equipo.key,
                              index
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    )
                  )}
                </div>

                <label className="m2-btn m2-btn-small m2-file-btn">
                  Adjuntar evidencia

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => {
                      agregarEvidencias(
                        equipo.key,
                        e.target.files
                      );
                      e.target.value = '';
                    }}
                  />
                </label>

                {error && (
                  <div className="m2-error-text">
                    {error}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="m2-exec-footer">
          <button
            className="m2-btn m2-btn-primary"
            onClick={cerrarOrdenLocal}
          >
            Cerrar orden
          </button>

          <button
            className="m2-btn"
            onClick={() => {
              setVista('ots');
              setOrdenActualId(null);
              setEjecucion(null);
            }}
          >
            Volver sin guardar
          </button>

          <span className="m2-muted">
            Los cambios de esta vista no se guardan. Registra el mantenimiento
            desde Órdenes de trabajo.
          </span>
        </div>
      </>
    );
  };

  // F3: renderHistorial() SE ELIMINO. Era la vista de demostracion: filtraba el arreglo
  // `ordenes` -sembrado con OT-DEMO- por estado CERRADA, cruzaba con `vehiculos` para la
  // operacion y pintaba columnas de sustento y visto bueno que no existen en el backend.
  //
  // La pantalla vive ahora en ./tiPr01/HistorialTiPr01.jsx, con el diseno del prototipo v2
  // y datos reales: el listado de programacion y, por visita con ordenes, su historico de
  // ordenes-trabajo. La unidad de esa pantalla es el HECHO consumado, no la visita.


  if (loading) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center'
        }}
      >
        Cargando módulo de mantenimiento...
      </div>
    );
  }

  return (
    <div className="m2-page">
      <style>{`
        .m2-page{
          --m2-ink:#0B2038;
          --m2-ink2:#123457;
          --m2-ink3:#1D4A78;
          --m2-paper:#EEF1F5;
          --m2-surface:#FFFFFF;
          --m2-line:#D5DCE5;
          --m2-line2:#E8EDF2;
          --m2-text:#12212F;
          --m2-text2:#5A6B7C;
          --m2-text3:#8A98A6;
          --m2-amber:#D4820A;
          --m2-amberbg:#FDF1DC;
          --m2-green:#0F7A52;
          --m2-greenbg:#DCF0E7;
          --m2-red:#B32D1F;
          --m2-redbg:#FBE3E0;
          --m2-blue:#1D4A78;
          --m2-bluebg:#DEE9F4;
          min-height:100%;
          padding:20px 22px 60px;
          background:var(--m2-paper);
          color:var(--m2-text);
          font-size:14px;
        }

        .m2-head{
          display:flex;
          align-items:flex-start;
          gap:16px;
          flex-wrap:wrap;
          margin-bottom:14px;
        }

        .m2-head h2{
          margin:0;
          font-size:20px;
          color:var(--m2-text);
        }

        .m2-head p{
          margin:4px 0 0;
          color:var(--m2-text2);
          font-size:12.5px;
        }

        .m2-badge{
          margin-left:auto;
          background:var(--m2-amberbg);
          color:var(--m2-amber);
          border:1px solid #F0D29B;
          border-radius:20px;
          padding:5px 10px;
          font-size:11.5px;
          font-weight:600;
        }

        .m2-tabs{
          display:flex;
          gap:4px;
          flex-wrap:wrap;
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:8px;
          padding:4px;
          margin-bottom:18px;
          width:max-content;
          max-width:100%;
        }

        .m2-tab{
          border:0;
          background:transparent;
          padding:7px 12px;
          border-radius:5px;
          color:var(--m2-text2);
          cursor:pointer;
        }

        .m2-tab.active{
          background:var(--m2-ink);
          color:#fff;
          font-weight:600;
        }

        .m2-bar{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          margin-bottom:14px;
        }

        .m2-bar input,
        .m2-bar select,
        .m2-modal input,
        .m2-modal select{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:6px;
          padding:7px 10px;
          outline:none;
        }

        .m2-bar input{
          width:260px;
        }

        .m2-card{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:8px;
          overflow:hidden;
        }

        .m2-card-title{
          padding:11px 15px;
          background:#F8FAFC;
          border-bottom:1px solid var(--m2-line2);
          font-weight:600;
          font-size:13.5px;
        }

        .m2-scroll{
          overflow:auto;
        }

        .m2-card table{
          width:100%;
          border-collapse:collapse;
          font-size:13px;
        }

        .m2-card th{
          text-align:left;
          padding:9px 12px;
          background:#F8FAFC;
          color:var(--m2-text2);
          font-weight:500;
          border-bottom:1px solid var(--m2-line);
          white-space:nowrap;
        }

        .m2-card td{
          padding:9px 12px;
          border-bottom:1px solid var(--m2-line2);
          vertical-align:middle;
        }

        .m2-card tr:last-child td{
          border-bottom:0;
        }

        .m2-matrix{
          overflow:auto;
          max-height:62vh;
        }

        .m2-matrix table{
          border-collapse:separate;
          border-spacing:0;
          width:100%;
        }

        .m2-matrix th{
          position:sticky;
          top:0;
          z-index:3;
        }

        .m2-matrix td{
          padding:3px 4px;
        }

        .m2-sticky-col{
          position:sticky!important;
          left:0;
          background:#fff!important;
          z-index:4!important;
          border-right:1px solid var(--m2-line);
        }

        thead .m2-sticky-col{
          background:#F8FAFC!important;
        }

        .m2-cell{
          width:100%;
          min-width:62px;
          border:1px solid transparent;
          border-radius:4px;
          padding:5px 0;
          font:600 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;
          cursor:pointer;
        }

        .m2-cell:disabled{
          cursor:default;
        }

        .m2-cell-pending{
          background:#EDF3F9;
          color:#1D4A78;
          border-color:#DCE6F0;
        }

        .m2-cell-done{
          background:#1A8A5E;
          color:#fff;
        }

        .m2-cell-overdue{
          background:var(--m2-red);
          color:#fff;
        }

        .m2-cell-m3{
          box-shadow:inset 0 0 0 2px rgba(11,32,56,.35);
        }

        .m2-link{
          border:0;
          background:transparent;
          padding:0;
          color:var(--m2-ink3);
          font-weight:700;
          cursor:pointer;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-legend{
          display:flex;
          gap:14px;
          flex-wrap:wrap;
          margin-top:10px;
          color:var(--m2-text2);
          font-size:12px;
          align-items:center;
        }

        .m2-swatch{
          display:inline-block;
          width:24px;
          height:15px;
          border-radius:3px;
          vertical-align:middle;
          margin-right:5px;
        }

        .m2-swatch.done{
          background:#1A8A5E;
        }

        .m2-swatch.overdue{
          background:var(--m2-red);
        }

        .m2-swatch.pending{
          background:#EDF3F9;
          border:1px solid #DCE6F0;
        }

        .m2-kpis{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:10px;
          margin-bottom:18px;
        }

        .m2-kpi{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:8px;
          padding:12px 14px;
        }

        .m2-kpi span{
          display:block;
          font-size:12.5px;
          color:var(--m2-text2);
        }

        .m2-kpi strong{
          display:block;
          margin-top:2px;
          font:600 26px ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-kpi .red{
          color:var(--m2-red);
        }

        .m2-kpi .amber{
          color:var(--m2-amber);
        }

        .m2-kpi .green{
          color:var(--m2-green);
        }

        .m2-chip{
          display:inline-block;
          border-radius:20px;
          padding:2px 8px;
          font-size:11.5px;
          font-weight:600;
          white-space:nowrap;
        }

        .m2-chip-red{
          background:var(--m2-redbg);
          color:var(--m2-red);
        }

        .m2-chip-amber{
          background:var(--m2-amberbg);
          color:var(--m2-amber);
        }

        .m2-chip-green{
          background:var(--m2-greenbg);
          color:var(--m2-green);
        }

        .m2-chip-blue{
          background:var(--m2-bluebg);
          color:var(--m2-blue);
        }

        .m2-chip-grey{
          background:#E4E9EF;
          color:var(--m2-text2);
        }

        .m2-level{
          display:inline-block;
          min-width:28px;
          text-align:center;
          padding:2px 6px;
          border-radius:4px;
          font:600 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-level.l1{
          background:#E3EDF7;
          color:#1D4A78;
        }

        .m2-level.l2{
          background:#9FC2E0;
          color:#0B2038;
        }

        .m2-level.l3{
          background:#123457;
          color:#fff;
        }

        .m2-dots{
          display:inline-flex;
          gap:4px;
        }

        .m2-dot{
          width:9px;
          height:9px;
          border-radius:50%;
          display:inline-block;
        }

        .m2-dot.ok{
          background:#2E9E70;
        }

        .m2-dot.off{
          background:#C2CCD6;
        }

        .m2-muted{
          color:var(--m2-text2);
          font-size:12.5px;
        }

        .m2-small{
          color:var(--m2-text3);
          font-size:11.5px;
          margin-top:2px;
        }

        .m2-mono{
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-empty{
          padding:34px 20px!important;
          text-align:center;
          color:var(--m2-text2);
        }

        .m2-btn{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:6px;
          padding:7px 13px;
          cursor:pointer;
        }

        .m2-btn:hover{
          background:#F4F7FA;
        }

        .m2-btn-primary{
          background:var(--m2-ink);
          border-color:var(--m2-ink);
          color:#fff;
          font-weight:600;
        }

        .m2-btn-primary:hover{
          background:var(--m2-ink2);
        }

        .m2-btn-small{
          padding:4px 8px;
          font-size:12px;
        }

        .m2-grid-2{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .m2-progress-row{
          display:grid;
          grid-template-columns:90px 1fr 42px;
          gap:10px;
          align-items:center;
          margin:10px 0;
          font-size:12.5px;
        }

        .m2-progress{
          height:7px;
          background:#E8EDF2;
          border-radius:10px;
          overflow:hidden;
        }

        .m2-progress i{
          display:block;
          height:100%;
          background:var(--m2-green);
          border-radius:10px;
        }

        .m2-overlay{
          position:fixed;
          inset:0;
          background:rgba(11,32,56,.42);
          z-index:100;
          display:flex;
          align-items:flex-start;
          justify-content:center;
          padding-top:12vh;
        }

        .m2-modal{
          width:min(470px,94vw);
          background:#fff;
          border-radius:10px;
          overflow:hidden;
          box-shadow:0 20px 60px rgba(11,32,56,.25);
        }

        .m2-modal-head{
          padding:15px 20px;
          border-bottom:1px solid var(--m2-line);
          font-weight:700;
        }

        .m2-modal-body{
          padding:18px 20px;
        }

        .m2-field{
          margin-bottom:13px;
        }

        .m2-field label{
          display:block;
          margin-bottom:4px;
          font-size:12.5px;
          color:var(--m2-text2);
        }

        .m2-field input,
        .m2-field select{
          width:100%;
        }

        .m2-modal-foot{
          padding:14px 20px;
          border-top:1px solid var(--m2-line);
          display:flex;
          justify-content:flex-end;
          gap:8px;
          background:#F8FAFC;
        }


        .m2-unit-row{
          cursor:pointer;
        }

        .m2-unit-row:hover td{
          background:#F5F9FD;
        }

        .m2-unit-arrow{
          color:var(--m2-text3);
          font-size:20px;
          text-align:right;
        }

        .m2-ficha-actions{
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          margin-bottom:12px;
        }

        .m2-ficha-head{
          padding:15px 18px;
          display:flex;
          gap:14px;
          align-items:center;
          justify-content:space-between;
          flex-wrap:wrap;
        }

        .m2-ficha-plate{
          font:600 22px ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-ficha-state{
          display:flex;
          flex-direction:column;
          align-items:flex-end;
          gap:4px;
        }

        .m2-ficha-state > span:first-child{
          font-size:12px;
          color:var(--m2-text2);
        }

        .m2-ficha-tiles{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          border-top:1px solid var(--m2-line2);
        }

        .m2-ficha-tile{
          text-align:left;
          border:0;
          border-right:1px solid var(--m2-line2);
          background:#fff;
          padding:12px 14px;
          cursor:pointer;
          min-height:112px;
        }

        .m2-ficha-tile:last-child{
          border-right:0;
        }

        .m2-ficha-tile:hover{
          background:#F5F9FD;
        }

        .m2-ficha-tile.selected{
          background:#EDF4FB;
          box-shadow:inset 0 -3px 0 var(--m2-ink3);
        }

        .m2-ficha-tile.off{
          opacity:.55;
          cursor:default;
        }

        .m2-ficha-tile strong{
          display:block;
          margin-bottom:6px;
        }

        .m2-ficha-tile > span{
          margin-bottom:5px;
        }

        .m2-ficha-tile small{
          display:block;
          color:var(--m2-text3);
          line-height:1.45;
        }

        .m2-ficha-tile small.danger{
          color:var(--m2-red);
          font-weight:600;
        }

        .m2-ficha-columns{
          display:grid;
          grid-template-columns:minmax(0,1fr) 320px;
          gap:14px;
          align-items:start;
        }

        .m2-ficha-filterbar{
          display:flex;
          align-items:center;
          gap:7px;
          flex-wrap:wrap;
          margin-bottom:10px;
          font-size:12.5px;
          color:var(--m2-text2);
        }

        .m2-filter-chip{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:20px;
          padding:4px 11px;
          cursor:pointer;
          font-size:12px;
        }

        .m2-filter-chip.selected{
          background:var(--m2-ink);
          border-color:var(--m2-ink);
          color:#fff;
          font-weight:600;
        }

        .m2-timeline-wrap{
          padding:16px 18px;
        }

        .m2-timeline{
          position:relative;
          padding-left:20px;
        }

        .m2-timeline:before{
          content:"";
          position:absolute;
          left:4px;
          top:7px;
          bottom:7px;
          width:2px;
          background:var(--m2-line);
        }

        .m2-timeline-item{
          position:relative;
          padding-bottom:22px;
        }

        .m2-timeline-item:last-child{
          padding-bottom:0;
        }

        .m2-timeline-dot{
          position:absolute;
          left:-20px;
          top:5px;
          width:10px;
          height:10px;
          border-radius:50%;
          border:2px solid #fff;
          box-shadow:0 0 0 1px var(--m2-line);
        }

        .m2-timeline-dot.ok{
          background:#2E9E70;
        }

        .m2-timeline-dot.warn{
          background:#E2A22B;
        }

        .m2-timeline-head{
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          margin-bottom:8px;
        }

        .m2-timeline-head .m2-btn{
          margin-left:auto;
        }

        .m2-timeline-results{
          border-left:2px solid var(--m2-line2);
          padding-left:11px;
        }

        .m2-finding{
          display:flex;
          gap:8px;
          align-items:flex-start;
          padding:4px 0;
          font-size:12.5px;
        }

        .m2-finding > span{
          width:17px;
          height:17px;
          border-radius:4px;
          flex:none;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          font-size:11px;
          font-weight:700;
          margin-top:1px;
        }

        .m2-finding.bad > span{
          background:var(--m2-redbg);
          color:var(--m2-red);
        }

        .m2-finding.warn > span{
          background:var(--m2-amberbg);
          color:var(--m2-amber);
        }

        .m2-finding.ok{
          color:var(--m2-text2);
        }

        .m2-finding.ok > span{
          background:var(--m2-greenbg);
          color:var(--m2-green);
        }

        .m2-finding small{
          color:var(--m2-text3);
        }

        .m2-ficha-detail{
          margin-top:10px;
          border:1px solid var(--m2-line2);
          border-radius:6px;
          overflow:hidden;
        }

        .m2-ficha-detail-row{
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:center;
          padding:7px 10px;
          background:#FAFCFE;
          border-bottom:1px solid var(--m2-line2);
          font-size:12.5px;
        }

        .m2-ficha-detail-row:last-child{
          border-bottom:0;
        }

        .m2-ficha-detail-row.muted{
          color:var(--m2-text3);
        }

        .m2-ficha-detail-row > span:last-child{
          display:flex;
          gap:6px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        .m2-ficha-observation{
          padding:0 10px 7px;
          background:#FAFCFE;
          color:var(--m2-text2);
          font-size:12px;
          border-bottom:1px solid var(--m2-line2);
        }

        .m2-ficha-sticky{
          position:sticky;
          top:76px;
        }

        .m2-attention-wrap{
          padding:14px 16px;
        }

        .m2-attention{
          border:1px solid var(--m2-line);
          border-left:3px solid var(--m2-red);
          border-radius:6px;
          padding:10px 11px;
          margin-bottom:9px;
          font-size:12.5px;
          background:#FDFBFB;
        }

        .m2-attention.overdue{
          border-left-color:var(--m2-amber);
          background:#FFFDF8;
        }

        .m2-attention > strong{
          display:block;
          margin:5px 0 2px;
        }

        .m2-attention small{
          display:block;
          margin-top:4px;
          color:var(--m2-text3);
        }

        .m2-attention-note{
          margin-top:12px;
          padding-top:10px;
          border-top:1px solid var(--m2-line2);
          color:var(--m2-text3);
          font-size:11.5px;
          line-height:1.45;
        }

        .m2-detail-meta{
          padding:15px 18px;
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:12px;
        }

        .m2-detail-meta > div{
          display:flex;
          flex-direction:column;
          gap:4px;
        }

        .m2-detail-meta > div > span{
          color:var(--m2-text2);
          font-size:12px;
        }

        .m2-detail-meta > div > strong{
          font-size:13.5px;
        }

        .m2-detail-grid{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(360px,1fr));
          gap:12px;
        }

        .m2-detail-grid .m2-apparatus{
          margin-bottom:0;
        }

        .m2-detail-summary{
          display:grid;
          grid-template-columns:120px 100px minmax(180px,1fr);
          gap:10px;
          padding-bottom:10px;
          margin-bottom:9px;
          border-bottom:1px solid var(--m2-line2);
        }

        .m2-detail-summary > div{
          display:flex;
          flex-direction:column;
          gap:3px;
        }

        .m2-detail-summary span{
          color:var(--m2-text2);
          font-size:11.5px;
        }

        .m2-detail-summary strong{
          font-size:12.5px;
        }

        .m2-detail-activity{
          display:flex;
          align-items:flex-start;
          gap:8px;
          padding:4px 0;
          font-size:12.5px;
          color:var(--m2-text);
        }

        .m2-detail-activity em{
          font-style:normal;
          color:var(--m2-text3);
        }

        .m2-detail-check{
          width:17px;
          height:17px;
          border-radius:4px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          flex:none;
          margin-top:1px;
          background:var(--m2-greenbg);
          color:var(--m2-green);
          font-size:11px;
          font-weight:700;
        }

        .m2-detail-row{
          display:grid;
          grid-template-columns:105px 1fr;
          gap:10px;
          align-items:flex-start;
          padding:9px 0 0;
          margin-top:9px;
          border-top:1px solid var(--m2-line2);
          font-size:12.5px;
        }

        .m2-detail-row > span{
          color:var(--m2-text2);
        }

        .m2-detail-evidences{
          display:flex;
          gap:5px;
          flex-wrap:wrap;
        }

        .m2-cycle-ok{
          color:var(--m2-green);
        }

        .m2-cycle-hold{
          color:var(--m2-amber);
        }

        .m2-cycle-neutral{
          color:var(--m2-text2);
        }

        .m2-exec-header{
          display:flex;
          align-items:center;
          gap:14px;
          flex-wrap:wrap;
          margin-bottom:14px;
        }

        .m2-exec-plate{
          font:600 20px ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-exec-level{
          margin-left:auto;
          display:flex;
          align-items:center;
          gap:8px;
        }

        .m2-exec-meta{
          padding:15px 18px 2px;
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
          gap:10px;
        }

        .m2-scope{
          background:#fff;
          border:1px solid var(--m2-line);
          border-left:3px solid var(--m2-ink3);
          border-radius:8px;
          padding:15px 18px;
          margin-bottom:14px;
        }

        .m2-scope-title{
          font-size:13.5px;
          font-weight:700;
          margin-bottom:6px;
        }

        .m2-scope p{
          margin:0 0 12px;
          color:var(--m2-text2);
          font-size:13px;
          max-width:80ch;
        }

        .m2-scope-stats{
          display:flex;
          gap:9px;
          flex-wrap:wrap;
          margin-bottom:14px;
        }

        .m2-scope-stat{
          border:1px solid var(--m2-line2);
          border-radius:6px;
          padding:8px 12px;
          background:#FAFCFE;
          display:flex;
          align-items:center;
          gap:7px;
          color:var(--m2-text2);
          font-size:12.5px;
        }

        .m2-scope-stat strong{
          color:var(--m2-text);
          font:600 16px ui-monospace,SFMono-Regular,Menlo,monospace;
        }

        .m2-scope-stat.total{
          background:var(--m2-ink);
          border-color:var(--m2-ink);
          color:#C3D4E4;
        }

        .m2-scope-stat.total strong{
          color:#fff;
        }

        .m2-scope-lists{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
          gap:16px;
          font-size:12.5px;
        }

        .m2-scope-lists ul{
          margin:5px 0 0;
          padding-left:17px;
          color:var(--m2-text2);
        }

        .m2-apparatus{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:8px;
          overflow:hidden;
          margin-bottom:11px;
        }

        .m2-apparatus.off{
          opacity:.62;
        }

        .m2-apparatus.error{
          border-color:var(--m2-red);
        }

        .m2-apparatus-head{
          display:flex;
          align-items:center;
          gap:10px;
          justify-content:space-between;
          flex-wrap:wrap;
          padding:11px 14px;
          background:#F8FAFC;
          border-bottom:1px solid var(--m2-line2);
        }

        .m2-apparatus-actions{
          display:flex;
          gap:8px;
          align-items:center;
        }

        .m2-apparatus-actions select{
          background:#fff;
          border:1px solid var(--m2-line);
          border-radius:6px;
          padding:6px 8px;
        }

        .m2-apparatus-body{
          padding:11px 14px;
        }

        .m2-activity-group{
          display:flex;
          gap:7px;
          align-items:center;
          flex-wrap:wrap;
          background:#F4F7FA;
          border-radius:5px;
          padding:5px 9px;
          margin:9px 0 5px;
          color:var(--m2-text2);
          font-size:12px;
        }

        .m2-check{
          display:flex;
          gap:9px;
          align-items:flex-start;
          padding:4px 0;
          font-size:13px;
          cursor:pointer;
        }

        .m2-check input{
          margin-top:3px;
        }

        .m2-check em{
          font-style:normal;
          color:var(--m2-text3);
        }

        .m2-warning{
          margin:8px 0;
          color:var(--m2-amber);
          font-size:12.5px;
        }

        .m2-evidence-zone{
          display:flex;
          flex-wrap:wrap;
          gap:5px;
          margin:8px 0;
        }

        .m2-evidence{
          display:inline-flex;
          align-items:center;
          gap:5px;
          background:var(--m2-bluebg);
          color:var(--m2-blue);
          padding:3px 8px;
          border-radius:20px;
          font-size:11.5px;
        }

        .m2-evidence button{
          border:0;
          background:transparent;
          color:inherit;
          cursor:pointer;
          font-weight:700;
          padding:0;
        }

        .m2-evidence-count{
          margin-top:2px;
          color:var(--m2-blue);
          font-size:11px;
        }

        .m2-file-btn{
          display:inline-block;
        }

        .m2-file-btn input{
          display:none;
        }

        .m2-error-text{
          color:var(--m2-red);
          font-size:12.5px;
          margin-top:7px;
        }

        .m2-exec-footer{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          margin-top:16px;
        }


        .m2-history-row{
          cursor:pointer;
        }

        .m2-history-row:hover td{
          background:#F5F9FD;
        }

        .m2-dashboard-grid{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .m2-dashboard-wide{
          grid-column:1 / -1;
        }

        .m2-dashboard-note{
          margin-top:12px;
          padding:10px 12px;
          border:1px dashed var(--m2-line);
          border-radius:6px;
          background:#F8FAFC;
          color:var(--m2-text2);
          font-size:12px;
        }
        .dark .m2-page{
  --m2-ink:#2563EB;
  --m2-ink2:#1D4ED8;
  --m2-ink3:#60A5FA;
  --m2-paper:#0B1220;
  --m2-surface:#111C2F;
  --m2-line:#2B3A52;
  --m2-line2:#1E2C42;
  --m2-text:#E7EEF8;
  --m2-text2:#A9B7CA;
  --m2-text3:#7F91AA;
  --m2-amber:#FBBF24;
  --m2-amberbg:#3A2C12;
  --m2-green:#34D399;
  --m2-greenbg:#12372E;
  --m2-red:#F87171;
  --m2-redbg:#3C2027;
  --m2-blue:#93C5FD;
  --m2-bluebg:#183451;
  color-scheme:dark;
}

.dark .m2-page .m2-card,
.dark .m2-page .m2-tabs,
.dark .m2-page .m2-bar input,
.dark .m2-page .m2-bar select,
.dark .m2-page .m2-modal input,
.dark .m2-page .m2-modal select,
.dark .m2-page .m2-kpi,
.dark .m2-page .m2-btn,
.dark .m2-page .m2-modal,
.dark .m2-page .m2-ficha-tile,
.dark .m2-page .m2-filter-chip,
.dark .m2-page .m2-scope,
.dark .m2-page .m2-apparatus,
.dark .m2-page .m2-apparatus-actions select{
  background:var(--m2-surface);
  color:var(--m2-text);
  border-color:var(--m2-line);
}

.dark .m2-page .m2-card-title,
.dark .m2-page .m2-card th,
.dark .m2-page .m2-modal-foot,
.dark .m2-page .m2-apparatus-head,
.dark .m2-page .m2-activity-group,
.dark .m2-page .m2-ficha-detail-row,
.dark .m2-page .m2-ficha-observation,
.dark .m2-page .m2-scope-stat,
.dark .m2-page .m2-dashboard-note{
  background:#162237;
  color:var(--m2-text2);
}

.dark .m2-page .m2-sticky-col{
  background:var(--m2-surface)!important;
}

.dark .m2-page thead .m2-sticky-col{
  background:#162237!important;
}

.dark .m2-page .m2-btn:hover,
.dark .m2-page .m2-unit-row:hover td,
.dark .m2-page .m2-history-row:hover td,
.dark .m2-page .m2-ficha-tile:hover{
  background:#1B2A42;
}

.dark .m2-page .m2-cell-pending,
.dark .m2-page .m2-swatch.pending,
.dark .m2-page .m2-ficha-tile.selected{
  background:var(--m2-bluebg);
  color:var(--m2-blue);
  border-color:var(--m2-line);
}

.dark .m2-page .m2-chip-grey{
  background:#26364B;
  color:var(--m2-text2);
}

.dark .m2-page .m2-level.l1{
  background:#19314A;
  color:#93C5FD;
}

.dark .m2-page .m2-level.l2{
  background:#254C68;
  color:#DBEAFE;
}

.dark .m2-page .m2-progress{
  background:var(--m2-line2);
}

.dark .m2-page .m2-attention{
  background:var(--m2-redbg);
}

.dark .m2-page .m2-attention.overdue{
  background:var(--m2-amberbg);
}

.dark .m2-page .m2-timeline-dot{
  border-color:var(--m2-surface);
}

.dark .m2-page .m2-btn-primary,
.dark .m2-page .m2-filter-chip.selected,
.dark .m2-page .m2-tab.active,
.dark .m2-page .m2-scope-stat.total{
  background:var(--m2-ink);
  border-color:var(--m2-ink);
  color:#FFFFFF;
}

.dark .m2-page input::placeholder{
  color:var(--m2-text3);
}
        @media(max-width:1100px){
          .m2-dashboard-grid{
            grid-template-columns:1fr;
          }

          .m2-dashboard-wide{
            grid-column:auto;
          }
        }

        @media(max-width:900px){
          .m2-page{
            padding:12px;
          }

          .m2-head{
            align-items:flex-start;
          }

          .m2-badge{
            margin-left:0;
          }

          .m2-bar{
            align-items:stretch;
          }

          .m2-bar input,
          .m2-bar select{
            width:100%;
          }

          .m2-card{
            border-radius:7px;
          }

          .m2-ficha-head{
            align-items:flex-start;
          }

          .m2-ficha-state{
            align-items:flex-start;
          }

          .m2-ficha-tiles{
            grid-template-columns:repeat(2,minmax(0,1fr));
          }

          .m2-exec-header{
            align-items:flex-start;
          }

          .m2-exec-level{
            margin-left:0;
          }

          .m2-grid-2{
            grid-template-columns:1fr;
          }

          .m2-tabs{
            width:100%;
            overflow:auto;
            flex-wrap:nowrap;
          }

          .m2-tab{
            white-space:nowrap;
          }

          .m2-ficha-columns{
            grid-template-columns:1fr;
          }

          .m2-ficha-sticky{
            position:static;
          }

          .m2-detail-grid{
            grid-template-columns:1fr;
          }

          .m2-detail-summary{
            grid-template-columns:1fr;
          }

          .m2-detail-row{
            grid-template-columns:1fr;
          }
        }

        @media(max-width:560px){
          .m2-ficha-tiles{
            grid-template-columns:1fr;
          }

          .m2-kpis{
            grid-template-columns:repeat(2,minmax(0,1fr));
          }

          .m2-kpi strong{
            font-size:22px;
          }

          .m2-modal{
            width:96vw;
          }

          .m2-detail-meta{
            grid-template-columns:1fr 1fr;
          }

          .m2-ficha-detail-row{
            align-items:flex-start;
            flex-direction:column;
          }

          .m2-ficha-detail-row > span:last-child{
            justify-content:flex-start;
          }
        }
      `}</style>

      <div className="m2-head">
        <div>
          <h2>{header[0]}</h2>
          <p>{header[1]}</p>
        </div>

      </div>

      {/* F1 · Programa sale ya del backend real, con el diseño del prototipo v2.
          renderPrograma() queda abajo, sin montar: era la maqueta con nivel ficticio
          (indiceUnidad % 8) y las 8 quincenas fijas. */}
      {vista === 'programa' && (
        <ProgramaTiPr01
          permisos={permisos}
          onIrAOrden={destino => {
            setDestinoOt(destino);
            setVista('ots');
          }}
        />
      )}
      {vista === 'unidades' && renderUnidades()}
      {/* F2.1 · Órdenes de trabajo sale ya del backend real. renderOrdenes() SE ELIMINO:
          era la maqueta con OT-DEMO-001/002 y un alta por placa + fecha, que no existe en
          el modelo: una OT nace de una programación concreta. */}
      {vista === 'ots' && (
        <OrdenesTiPr01
          destino={destinoOt}
          onDestinoConsumido={() => setDestinoOt(null)}
          onVolverAPrograma={() => setVista('programa')}
        />
      )}
      {/* F3 · Historial sale ya del backend real. renderHistorial() SE ELIMINO: era la
          maqueta que filtraba OT-DEMO por estado CERRADA y pintaba sustento y visto bueno
          inexistentes. El detalle no se duplica: se navega a Ordenes con el mismo
          contrato `destino` que usa Programa. */}
      {vista === 'historial' && (
        <HistorialTiPr01
          onIrAOrden={destino => {
            setDestinoOt(destino);
            setVista('ots');
          }}
        />
      )}
      {vista === 'ficha' && renderFichaUnidad()}
      {vista === 'detalle' && renderDetalleOrden()}
      {vista === 'ejecucion' && renderEjecucion()}

      {/* F2.1: aqui estaba el modal "Crear orden de trabajo" de la maqueta -placa,
          fecha, nivel de solo lectura y el aviso "Esta orden se guarda solo en React.
          No escribe nada en la BD"-. Eliminado: una OT se abre desde el drawer de su
          programacion en la pantalla Programa, con POST real. */}
    </div>
  );
}


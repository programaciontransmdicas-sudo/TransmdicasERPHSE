import { TablaHistorialDesplazable } from './TablaHistorialDesplazable';
import { FiltrosFechasOt } from './FiltrosFechasOt';
import { fechaEjecucionOt, fechaVisibleOt, filtrarYOrdenarFechasOt, CAMPOS_FECHA_OT } from './fechasOt';
import { formatearPlaca } from '../../utils/formatos';
// TI-PR-01 · F3 · HISTORIAL
// ============================================================================
// Dos fuentes de verdad, separadas a propósito:
//   VISUAL  docs/prototipos/prototipo_ti_pr01_v2.html, vHistorial()
//   DATOS   el backend real: el listado de programación y, por visita con órdenes, su
//           histórico de ordenes-trabajo
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTO NO ES OTRA COPIA DE PROGRAMA
// ─────────────────────────────────────────────────────────────────────────────
// Programa responde "qué toca y cuándo": una matriz placa × quincena de obligaciones, con
// el futuro incluido. Historial responde "qué pasó": una lista CRONOLÓGICA de hechos
// consumados, lo más reciente primero.
//
// Por eso la unidad de esta pantalla NO es la visita, es el HECHO. Una visita puede aportar
// más de una fila -una orden anulada y después la que la sustituyó- y una visita futura no
// aporta ninguna.
//
// Lo que entra, y por qué:
//   Cerrada          la orden está CERRADA. Los cuatro RESULTADOS de la visita los escribe
//                    ÚNICAMENTE cerrar_orden_trabajo(), así que son la prueba del hecho.
//   En ejecución     la orden está ABIERTA: el trabajo empezó y no ha terminado.
//   Orden anulada    se desistió, con su motivo. La orden permanece: es historial.
//   Visita cancelada decisión tomada sobre una visita sin orden. CANCELADO es terminal.
//
// Lo que NO entra: PROYECTADO, PROGRAMADO y REPROGRAMADO sin orden. Son obligaciones
// futuras o pendientes, y presentarlas aquí las convertiría en mantenimiento realizado.
// Se cuentan aparte y se dice cuántas son, para que la omisión no sea silenciosa.
import { useEffect, useMemo, useState } from 'react';
import { cargarProgramaConOrdenes } from './cargarOrdenes';
import { apiTiPr01 } from '../../services/api';
import {
  ETIQUETA_EQUIPO,
  ETIQUETA_HISTORIAL,
  CLASE_CHIP,
  NIVELES,
  REGULARES,
  ANUALES,
  TIPOS_HISTORIAL,
  alcanceDeOrden,
  alcanceDe,
  etiquetaEstado,
  hechosDeVisita,
  quincenaDe,
  resultadoPorFamilia
} from './dominio';
import './tiPr01.css';

const FAMILIAS = [...REGULARES, ...ANUALES];

// Clase del chip de cada tipo de hecho. Son los mismos colores que el prototipo da a los
// estados equivalentes.
const CLASE_TIPO = {
  EJECUTADA: 'green',
  EN_CURSO: 'blue',
  ANULADA: 'grey',
  CANCELADA: 'grey'
};

const Chip = ({ estado, clase }) => (
  <span className={`ti-chip ${clase ?? CLASE_CHIP[estado] ?? 'grey'}`}>
    {etiquetaEstado(estado)}
  </span>
);

const Nivel = ({ nivel, anual }) => {
  if (!nivel) return <span className="ti-smalltxt">—</span>;

  return (
    <span className={`ti-level ${anual ? 'annual' : nivel.toLowerCase()}`}>
      {nivel}
    </span>
  );
};

const Kpi = ({ etiqueta, valor, apoyo, clase }) => (
  <div className={`ti-card ti-kpi ${clase || ''}`}>
    <div className="ti-k">{etiqueta}</div>
    <div className="ti-v">{valor}</div>
    {apoyo && <div className="ti-s">{apoyo}</div>}
  </div>
);

// El alcance de un hecho: si hay orden, el que la base congeló al abrirla; si no, el de la
// visita. Nunca se recalcula nada.
const alcanceDeHecho = hecho =>
  hecho.orden ? alcanceDeOrden(hecho.orden) : alcanceDe(hecho.visita);

// ---------------------------------------------------------------------------
// PANTALLA
// ---------------------------------------------------------------------------
export function HistorialTiPr01({ onIrAOrden, soloLectura = false }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [programa, setPrograma] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [fallidas, setFallidas] = useState(0);
  const [truncado, setTruncado] = useState(false);

  const [fechas, setFechas] = useState({
    filtrarPor: 'ejecucion', desde: '', hasta: '', ordenarPor: 'ejecucion', sentido: 'desc'
  });
  const [recarga, setRecarga] = useState(0);

  // Filtros de cliente: se aplican sobre los hechos ya construidos, porque el backend
  // filtra visitas y aquí la unidad es el hecho.
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [nivel, setNivel] = useState('');

  const recargar = () => {
    setCargando(true);
    setRecarga(n => n + 1);
  };

  // El primer setState ocurre DESPUÉS del await, con `vivo` para descartar respuestas
  // obsoletas. Mismo patrón que F1 y F2: si no, react-hooks/set-state-in-effect falla.
  useEffect(() => {
    let vivo = true;
    const abortador = new AbortController();

    (async () => {
      try {
        // Se cargan todas las páginas: filtrar ejecución/cierre por quincena omitiría OT válidas.
        const datos = soloLectura
          ? await apiTiPr01.listarHistorialSupervisorCompleto({}, abortador.signal)
          : await cargarProgramaConOrdenes();

        if (!vivo) return;

        setError(null);
        setPrograma(datos.programa);
        setVisitas(datos.visitas);
        setOrdenes(datos.ordenes);
        setFallidas(datos.fallidas);
        setTruncado(datos.truncado);
      } catch (e) {
        if (!vivo) return;
        setError(e.message || 'No se pudo cargar el historial');
        setVisitas([]);
        setOrdenes([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; abortador.abort(); };
  }, [recarga, soloLectura]);

  // ------------------------------------------------------------------ hechos
  const hechos = useMemo(() => {
    const todos = [];

    for (const visita of visitas) {
      todos.push(...hechosDeVisita(visita, ordenes));
    }

    return todos;
  }, [visitas, ordenes]);

  // Cuántas visitas quedaron FUERA por no ser historia. Se dice, no se esconde.
  const futuras = useMemo(
    () => visitas.filter(
      v => !['CANCELADO'].includes(v.estado)
        && (v.ordenes_trabajo?.total ?? 0) === 0
    ).length,
    [visitas]
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toUpperCase();
    const soloDigitos = texto.replace(/[^0-9]/g, '');

    const coincidentes = hechos.filter(h => {
      if (tipo && h.tipo !== tipo) return false;

      if (nivel) {
        const alcance = alcanceDeHecho(h);

        if (alcance.nivelRegular !== nivel) return false;
      }

      if (!texto) return true;

      const placa = String(h.visita.unidad?.placa ?? '').toUpperCase();

      const relacion = `${h.visita.unidad?.cliente || ''} ${h.visita.unidad?.operacion || ''}`.toUpperCase();
      return placa.replace(/-/g, '').includes(texto.replace(/-/g, ''))
        || (soloLectura && relacion.includes(texto))
        || (soloDigitos !== '' && h.orden && String(h.orden.id).includes(soloDigitos));
    });
    return filtrarYOrdenarFechasOt(coincidentes, fechas);
  }, [hechos, busqueda, tipo, nivel, soloLectura, fechas]);

  const totales = useMemo(() => ({
    ejecutadas: hechos.filter(h => h.tipo === TIPOS_HISTORIAL.EJECUTADA).length,
    enCurso: hechos.filter(h => h.tipo === TIPOS_HISTORIAL.EN_CURSO).length,
    anuladas: hechos.filter(h => h.tipo === TIPOS_HISTORIAL.ANULADA).length,
    canceladas: hechos.filter(h => h.tipo === TIPOS_HISTORIAL.CANCELADA).length
  }), [hechos]);

  // ------------------------------------------------------------------ estados de carga
  if (cargando) {
    return (
      <div className="ti">
        <div className="ti-card">
          <div className="ti-empty">
            <div className="ti-spinner" />
            Cargando el historial…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ti">
        <div className="ti-card">
          <div className="ti-empty">
            <div className="ti-badbox" style={{ textAlign: 'left' }}>{error}</div>
            <button type="button" className="ti-btn" onClick={recargar}>Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  if (!programa && !soloLectura) {
    return (
      <div className="ti">
        <div className="ti-card">
          <div className="ti-empty">
            No hay ningún programa de mantenimiento ACTIVO.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ti">
      {/* KPIs · los cuatro tipos de hecho, todos derivados de estados reales */}
      <div className="ti-grid g4">
        <Kpi
          etiqueta="Cerradas"
          valor={totales.ejecutadas}
          apoyo="con resultado escrito por el cierre"
          clase="ok"
        />
        <Kpi etiqueta="En ejecución" valor={totales.enCurso} apoyo="orden abierta" />
        <Kpi etiqueta="Órdenes anuladas" valor={totales.anuladas} apoyo="se desistió" />
        <Kpi
          etiqueta="Visitas canceladas"
          valor={totales.canceladas}
          apoyo="sin orden de trabajo"
        />
      </div>

      {/* FILTROS */}
      <div className="ti-bar" style={{ marginTop: 12 }}>
        <input
          value={busqueda}
          onChange={event => setBusqueda(event.target.value)}
          placeholder={soloLectura ? "Buscar placa, cliente, operación u OT" : "Buscar placa o N.º de OT"}
          aria-label="Buscar placa o número de orden"
        />

        <select
          value={tipo}
          onChange={event => setTipo(event.target.value)}
          aria-label="Filtrar por tipo de hecho"
        >
          <option value="">Todo el historial</option>
          {Object.keys(TIPOS_HISTORIAL).map(t => (
            <option key={t} value={t}>{ETIQUETA_HISTORIAL[t]}</option>
          ))}
        </select>

        <select
          value={nivel}
          onChange={event => setNivel(event.target.value)}
          aria-label="Filtrar por nivel regular"
        >
          <option value="">Todos los niveles</option>
          {NIVELES.map(n => (
            <option key={n} value={n}>Regular {n}</option>
          ))}
        </select>

        <span className="ti-smalltxt">
          {filtrados.length} de {hechos.length} hecho(s)
        </span>

        <button type="button" className="ti-btn small" onClick={recargar}>
          Refrescar
        </button>
      </div>

      <FiltrosFechasOt valor={fechas} onChange={setFechas} />
      <p className="ti-smalltxt">Sin fecha de ejecución registrada: —. Las OT abiertas y anuladas siguen visibles sin un rango de fechas.</p>

      {truncado && (
        <div className="ti-badbox">
          La programación llegó <b>incompleta</b>, así que puede faltar historial. Acota el
          rango o vuelve a cargar antes de interpretar esta pantalla.
        </div>
      )}

      {fallidas > 0 && (
        <div className="ti-badbox">
          No se pudo leer el histórico de <b>{fallidas}</b> visita(s) con órdenes. La lista
          está incompleta.
        </div>
      )}

      {/* TABLA CRONOLÓGICA · una columna por familia, como el prototipo */}
      <div className="ti-card">
        <h3>
          Historial de intervenciones
          <span className="ti-right ti-smalltxt">
            {filtrados.length} hecho(s) · {CAMPOS_FECHA_OT[fechas.ordenarPor].toLowerCase()} · {fechas.sentido === 'desc' ? 'más recientes primero' : 'más antiguas primero'}
          </span>
        </h3>

        {hechos.length === 0 ? (
          <div className="ti-empty">
            Todavía no hay historial: ninguna visita tiene orden de trabajo ni resultado.
            {futuras > 0 && (
              <>
                {' '}Hay <b>{futuras}</b> visita(s) programada(s) o proyectada(s), que son
                obligaciones futuras y no historial.
              </>
            )}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="ti-empty">Ningún hecho coincide con el filtro.</div>
        ) : (
          <TablaHistorialDesplazable>
            <table className="ti-table">
              <thead>
                <tr>
                  <th>Fecha de ejecución</th>
                  <th>Fecha de cierre</th>
                  <th>Fecha de apertura</th>
                  <th>Situación</th>
                  <th>OT</th>
                  <th>Unidad</th>
                  {soloLectura && <><th>Cliente</th><th>Operación</th></>}
                  <th>Quincena efectiva</th>
                  <th>Alcance</th>
                  {FAMILIAS.map(f => (
                    <th key={f} style={{ textAlign: 'center' }}>
                      {ETIQUETA_EQUIPO[f] ?? f}
                    </th>
                  ))}
                  <th>Resultado de la visita</th>
                  <th>Min.</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(h => {
                  const alcance = alcanceDeHecho(h);
                  const porFamilia = resultadoPorFamilia(h);
                  const q = quincenaDe(
                    h.visita.quincena_efectiva ?? h.visita.quincena_programada);
                  const clave = `${h.tipo}-${h.visita.id}-${h.orden?.id ?? 'sin'}`;

                  return (
                    <tr key={clave}>
                      <td className="ti-mono" title="Día en que se realizó el mantenimiento">
                        {fechaVisibleOt(fechaEjecucionOt(h.orden, h.visita))}
                      </td>
                      <td className="ti-mono" title={h.orden?.estado === 'ANULADA' ? 'Registro de anulación en el ERP (hora de Perú)' : 'Registro del cierre en el ERP (hora de Perú)'}>
                        {fechaVisibleOt(h.orden?.fecha_cierre)}
                      </td>
                      <td className="ti-mono" title="Apertura de la OT (hora de Perú)">
                        {fechaVisibleOt(h.orden?.fecha_apertura)}
                      </td>

                      <td>
                        <Chip
                          estado={ETIQUETA_HISTORIAL[h.tipo]}
                          clase={CLASE_TIPO[h.tipo]}
                        />
                      </td>

                      <td className="ti-mono">
                        {h.orden ? `#${h.orden.id}` : <span className="ti-smalltxt">—</span>}
                      </td>

                      <td className="ti-mono">{formatearPlaca(h.visita.unidad?.placa ?? '—')}</td>
                      {soloLectura && <>
                        <td>{h.visita.unidad?.cliente ?? '—'}</td>
                        <td>{h.visita.unidad?.operacion ?? '—'}</td>
                      </>}

                      <td>
                        {q?.label ?? '—'}
                        {h.visita.quincena_reprogramada && (
                          <>
                            {' '}
                            <span
                              className="ti-chip amber"
                              title={
                                'Reprogramada desde '
                                + (quincenaDe(h.visita.quincena_programada)?.labelLargo
                                  ?? h.visita.quincena_programada)
                              }
                            >
                              RP
                            </span>
                          </>
                        )}
                      </td>

                      <td>
                        {alcance.mezcla ? (
                          <span className="ti-chip red" title="Más de un nivel regular">
                            {alcance.mezcla.join('/')}
                          </span>
                        ) : (
                          <Nivel nivel={alcance.nivelRegular} />
                        )}
                        {alcance.anuales.map(d => (
                          <span
                            key={d.id}
                            className="ti-chip purple"
                            style={{ marginLeft: 4 }}
                          >
                            {d.tipo_equipo}
                          </span>
                        ))}
                      </td>

                      {FAMILIAS.map(f => {
                        const r = porFamilia[f];

                        return (
                          <td key={f} style={{ textAlign: 'center' }}>
                            {!r ? (
                              <span
                                className="ti-smalltxt"
                                title="No estaba en el alcance de esta visita"
                              >
                                —
                              </span>
                            ) : r.estado ? (
                              <>
                                <Chip estado={r.estado} />
                                {r.nivel_completado
                                  && r.nivel_completado !== r.nivel_programado && (
                                  <div className="ti-smalltxt ti-mono">
                                    hasta {r.nivel_completado}
                                  </div>
                                )}
                                {r.evidencias > 0 && (
                                  <div className="ti-smalltxt ti-mono">
                                    {r.evidencias} ev
                                  </div>
                                )}
                              </>
                            ) : (
                              <span
                                className="ti-smalltxt"
                                title={`Previsto ${r.nivel_programado}, sin orden que lo resuelva`}
                              >
                                prev. {r.nivel_programado}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td>
                        <Chip estado={h.visita.estado} />
                      </td>

                      <td className="ti-mono ti-smalltxt">
                        {h.orden?.minutos ?? '—'}
                      </td>

                      <td className="ti-acciones">
                        {h.orden && onIrAOrden ? (
                          <button
                            type="button"
                            className="ti-btn small"
                            onClick={() => onIrAOrden({
                              visita: h.visita,
                              programaId: h.visita.programa_id ?? programa?.id,
                              programacionId: h.visita.id,
                              otId: h.orden.id
                            })}
                          >
                            Ver OT
                          </button>
                        ) : (
                          <span className="ti-smalltxt">sin orden</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TablaHistorialDesplazable>
        )}
      </div>

      {/* MOTIVOS Y OBSERVACIONES · lo que no cabe en la tabla pero es el historial de verdad */}
      {filtrados.some(h => h.orden?.motivo_anulacion || h.orden?.observaciones) && (
        <div className="ti-card" style={{ marginTop: 12 }}>
          <h3>Motivos y observaciones</h3>
          <div className="ti-pad">
            {filtrados
              .filter(h => h.orden?.motivo_anulacion || h.orden?.observaciones)
              .map(h => (
                <div className="ti-section" key={`obs-${h.visita.id}-${h.orden.id}`}>
                  <div className="ti-section-h">
                    <b className="ti-mono">
                      #{h.orden.id} · {formatearPlaca(h.visita.unidad?.placa)}
                    </b>
                    <Chip
                      estado={ETIQUETA_HISTORIAL[h.tipo]}
                      clase={CLASE_TIPO[h.tipo]}
                    />
                    <span className="ti-right ti-smalltxt">
                      {quincenaDe(h.visita.quincena_efectiva)?.label ?? ''}
                    </span>
                  </div>
                  <div className="ti-section-b">
                    {h.orden.motivo_anulacion && (
                      <p style={{ margin: '0 0 6px' }}>
                        <b>Motivo de la anulación: </b>{h.orden.motivo_anulacion}
                      </p>
                    )}
                    {h.orden.observaciones && (
                      <p style={{ margin: 0 }}>
                        <b>Observaciones: </b>{h.orden.observaciones}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="ti-legend">
        <span>
          Ordenado por {CAMPOS_FECHA_OT[fechas.ordenarPor].toLowerCase()}; los registros sin esa fecha aparecen al final. Una visita puede aportar <b>varias filas</b>:
          una orden anulada y la que la sustituyó.
        </span>
        <span>
          <b>—</b> en la columna de una familia significa que <b>no estaba en el alcance</b>
          {' '}de esa visita, no que no esté instalada: el inventario físico no se publica
          aquí.
        </span>
        <span>
          La fecha de cierre de una OT anulada corresponde al registro de su anulación. Las visitas canceladas sin OT no tienen fechas de apertura ni cierre.
        </span>
        <span>
          Las anualidades <b>GPS</b> y <b>ADAS</b> van siempre separadas del nivel regular.
        </span>
        {futuras > 0 && (
          <span className="ti-chip amber">
            {futuras} visita(s) futura(s) fuera del historial
          </span>
        )}
      </div>
    </div>
  );
}

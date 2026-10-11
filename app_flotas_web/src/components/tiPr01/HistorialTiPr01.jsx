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

// Un timestamptz llega con hora; en una tabla cronológica estorba. La hora queda en el
// title, que es donde se consulta si hace falta.
const dia = valor => {
  if (!valor) return null;

  const texto = String(valor);

  return texto.length >= 10 ? texto.slice(0, 10) : texto;
};

// El alcance de un hecho: si hay orden, el que la base congeló al abrirla; si no, el de la
// visita. Nunca se recalcula nada.
const alcanceDeHecho = hecho =>
  hecho.orden ? alcanceDeOrden(hecho.orden) : alcanceDe(hecho.visita);

// ---------------------------------------------------------------------------
// PANTALLA
// ---------------------------------------------------------------------------
export function HistorialTiPr01({ onIrAOrden }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [programa, setPrograma] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [fallidas, setFallidas] = useState(0);
  const [truncado, setTruncado] = useState(false);

  // Filtros de SERVIDOR: el listado de programación admite desde/hasta por quincena, y son
  // un rango de verdad, no un recorte del lado del cliente.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
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

    (async () => {
      try {
        const datos = await cargarProgramaConOrdenes({
          desde: desde || undefined,
          hasta: hasta || undefined
        });

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

    return () => { vivo = false; };
  }, [desde, hasta, recarga]);

  // ------------------------------------------------------------------ hechos
  const hechos = useMemo(() => {
    const todos = [];

    for (const visita of visitas) {
      todos.push(...hechosDeVisita(visita, ordenes));
    }

    // Cronológico inverso: lo más reciente primero. El sello es comparable como texto
    // porque todas las fechas vienen en ISO.
    return todos.sort((a, b) => {
      const sa = String(a.sello ?? '');
      const sb = String(b.sello ?? '');

      if (sa !== sb) return sb.localeCompare(sa);

      return (b.orden?.id ?? 0) - (a.orden?.id ?? 0);
    });
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

    return hechos.filter(h => {
      if (tipo && h.tipo !== tipo) return false;

      if (nivel) {
        const alcance = alcanceDeHecho(h);

        if (alcance.nivelRegular !== nivel) return false;
      }

      if (!texto) return true;

      const placa = String(h.visita.unidad?.placa ?? '').toUpperCase();

      return placa.includes(texto)
        || (soloDigitos !== '' && h.orden && String(h.orden.id).includes(soloDigitos));
    });
  }, [hechos, busqueda, tipo, nivel]);

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

  if (!programa) {
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
          placeholder="Buscar placa o N.º de OT"
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

        <input
          type="date"
          value={desde}
          onChange={event => { setCargando(true); setDesde(event.target.value); }}
          aria-label="Quincena desde"
          title="Desde esta quincena"
        />
        <input
          type="date"
          value={hasta}
          onChange={event => { setCargando(true); setHasta(event.target.value); }}
          aria-label="Quincena hasta"
          title="Hasta esta quincena"
        />

        <span className="ti-smalltxt">
          {filtrados.length} de {hechos.length} hecho(s)
        </span>

        <button type="button" className="ti-btn small" onClick={recargar}>
          Refrescar
        </button>
      </div>

      {(desde || hasta) && (
        <div className="ti-smalltxt" style={{ marginBottom: 8 }}>
          El rango corresponde a las quincenas de las visitas. Selecciona el día 1 o 16
          para indicar el inicio de cada quincena.
        </div>
      )}

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
            {filtrados.length} hecho(s) · lo más reciente primero
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
          <div className="ti-scroll">
            <table className="ti-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Situación</th>
                  <th>OT</th>
                  <th>Unidad</th>
                  <th>Quincena</th>
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
                      <td className="ti-mono">
                        {h.fecha ? (
                          h.fecha
                        ) : (
                          <span
                            className="ti-smalltxt"
                            title={
                              h.tipo === TIPOS_HISTORIAL.ANULADA
                                ? 'ordenes_trabajo no tiene columna de fecha de anulación: '
                                  + 'se muestra la última modificación de la orden'
                                : 'sin día físico registrado'
                            }
                          >
                            {dia(h.sello) ?? '—'}
                            {h.fechaAproximada && ' ~'}
                          </span>
                        )}
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

                      <td className="ti-mono">{h.visita.unidad?.placa ?? '—'}</td>

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
          </div>
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
                      #{h.orden.id} · {h.visita.unidad?.placa}
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
          Cronológico, lo más reciente primero. Una visita puede aportar <b>varias filas</b>:
          una orden anulada y la que la sustituyó.
        </span>
        <span>
          <b>—</b> en la columna de una familia significa que <b>no estaba en el alcance</b>
          {' '}de esa visita, no que no esté instalada: el inventario físico no se publica
          aquí.
        </span>
        <span>
          <b>~</b> indica una fecha aproximada cuando no se dispone de la fecha exacta de anulación.
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

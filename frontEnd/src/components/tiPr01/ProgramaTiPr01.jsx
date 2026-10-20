import { formatearPlaca } from '../../utils/formatos';
// TI-PR-01 · F1 · PANTALLA PROGRAMA
// ============================================================================
// Dos fuentes de verdad, separadas a propósito:
//   VISUAL  docs/prototipos/prototipo_ti_pr01_v2.html, vPrograma() y openSchedule()
//   DATOS   el backend real en /api/programas-mantenimiento
//
// Nada de datos de demostración. La matriz, los estados y las acciones salen del backend;
// lo que el backend no publica, no se muestra.
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiTiPr01 } from '../../services/api';
import {
  ETIQUETA_EQUIPO,
  CLASE_CELDA,
  CLASE_CHIP,
  alcanceDe,
  aperturaDeOt,
  claseFamilia,
  esAnual,
  estadoVisual,
  etiquetaEstado,
  quincenaDe,
  quincenasDe,
  textoCelda
} from './dominio';
import './tiPr01.css';

const Chip = ({ estado }) => (
  <span className={`ti-chip ${CLASE_CHIP[estado] || 'grey'}`}>
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

// ---------------------------------------------------------------------------
// ORIENTACIÓN CUANDO NO HAY NINGÚN DESTINO · F4.3
// ---------------------------------------------------------------------------
// Se pinta TAL CUAL lo que publica el backend en `orientacion`: el resumen, el por qué y
// las vías con su disponibilidad y su requisito. Aquí no se decide cuál es la vía correcta,
// no se redacta ningún texto de negocio y no se recalcula nada.
//
// NO hay ningún botón para cancelar la visita ocupante, y no lo habrá: cancelar es una
// acción independiente y explícita sobre la visita que se vaya a cancelar, desde su propio
// detalle. Las vías de ejecución tampoco duplican botones: el drawer que está detrás ya
// tiene Crear OT y Abrir OT, y la orientación dice a cuál ir.
const Orientacion = ({ orientacion }) => {
  if (!orientacion) return null;

  return (
    <div className="ti-orient">
      <div className="ti-orient-h">{orientacion.resumen}</div>
      <div className="ti-smalltxt">{orientacion.por_que}</div>

      <ul className="ti-orient-vias">
        {orientacion.vias.map(via => (
          <li key={via.clave} className={via.disponible ? '' : 'no'}>
            <div className="ti-orient-t">
              {via.titulo}
              {via.disponible
                ? via.accion === 'ABRIR_OT'
                  ? <span className="ti-orient-tag">Crear OT en el detalle</span>
                  : via.accion === 'CERRAR_OT_ABIERTA'
                    ? <span className="ti-orient-tag">Abrir OT en el detalle</span>
                    : null
                : <span className="ti-orient-tag no">No disponible</span>}
            </div>
            <div className="ti-smalltxt">{via.detalle}</div>
            {!via.disponible && via.requisito && (
              <div className="ti-smalltxt ti-error">{via.requisito}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MODAL DE REPROGRAMACIÓN
// ---------------------------------------------------------------------------
// El prototipo pide además un motivo obligatorio. Hasta F4.2 no se pedía, porque
// PATCH .../reprogramar solo admitía { quincena_reprogramada }. En F4.3 el contrato cambió
// y el motivo es OBLIGATORIO: el backend contesta 400 sin él. Así que ahora sí se pide, y
// el prototipo y el backend vuelven a coincidir.
//
// F4.2 · LOS DESTINOS LOS DECIDE EL BACKEND.
//
// Antes este modal ofrecía las 6 quincenas de la matriz. Medido en db-refactor: 870 de las
// 886 visitas no tienen ninguna quincena libre, porque la cadencia del M1 regular es de UNA
// quincena y una unidad con CAMARAS/COPILOTO/RADIO_BASE ocupa todas. Es decir, el selector
// ofrecía 5 destinos imposibles de 6 y el operador descubría el problema con un 409.
//
// Ahora se pide GET .../destinos-reprogramacion y se pinta lo que publica:
//   · el selector trae SOLO las quincenas con `disponible: true`
//   · las no disponibles se listan aparte con el `motivo` del backend, para que se vea POR
//     QUÉ no sirven y, si una está ocupada, qué visita la ocupa
//   · si `disponibles` es 0 se muestra su `mensaje` y su `orientacion`, y Guardar queda
//     inhabilitado
//
// No se recalcula nada en el cliente: ni qué quincena está libre, ni cuándo cierra una
// quincena, ni el texto del aviso, ni cuál es la vía alternativa. El PATCH valida otra vez
// contra el MISMO catálogo, así que lo que este modal ofrece es lo que el backend acepta.
export const ModalReprogramar = ({ programaId, visita, onCerrar, onConfirmar, trabajando }) => {
  const [catalogo, setCatalogo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(null);
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');

  // El primer setState va DESPUÉS del await y detrás del flag `vivo`: es la regla que exige
  // react-hooks/set-state-in-effect y la que ya se aplicó en el resto de la pantalla.
  useEffect(() => {
    let vivo = true;

    const pedir = async () => {
      try {
        const respuesta = await apiTiPr01.listarDestinosReprogramacion(
          programaId,
          visita.id
        );

        if (!vivo) return;

        const libres = (respuesta.destinos ?? []).filter(d => d.disponible);

        setCatalogo(respuesta);
        setDestino(libres.length > 0 ? libres[0].quincena : '');
        setFallo(null);
      } catch (e) {
        if (!vivo) return;

        setFallo(e.message);
      } finally {
        if (vivo) setCargando(false);
      }
    };

    pedir();

    return () => {
      vivo = false;
    };
  }, [programaId, visita.id]);

  const disponibles = (catalogo?.destinos ?? []).filter(d => d.disponible);
  const descartadas = (catalogo?.destinos ?? []).filter(d => !d.disponible);

  return (
    <>
      <div className="ti-modal-overlay" onClick={onCerrar} />
      <div className="ti-modal" role="dialog" aria-modal="true" aria-label="Reprogramar visita">
        <div className="ti-modal-h">Reprogramar visita</div>
        <div className="ti-modal-b">
          {cargando && (
            <div className="ti-empty">
              <div className="ti-spinner" />
              Consultando las quincenas disponibles…
            </div>
          )}

          {!cargando && fallo && (
            <div className="ti-badbox">{fallo}</div>
          )}

          {!cargando && !fallo && catalogo && (
            <>
              {disponibles.length > 0 ? (
                <>
                  <div className="ti-field">
                    <label htmlFor="ti-rq">Nueva quincena efectiva</label>
                    <select
                      id="ti-rq"
                      value={destino}
                      onChange={event => setDestino(event.target.value)}
                    >
                      {disponibles.map(d => (
                        <option key={d.quincena} value={d.quincena}>
                          {quincenaDe(d.quincena)?.labelLargo ?? d.quincena}{d.desplazadas ? ` · desplaza ${d.desplazadas} visita(s)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ti-field">
                    <label htmlFor="ti-rm">
                      Motivo de la reprogramación <b>(obligatorio)</b>
                    </label>
                    <select id="ti-rm" value={motivo} required disabled={trabajando}
                      onChange={event => setMotivo(event.target.value)}>
                      <option value="">Seleccione un motivo</option>
                      {(catalogo.motivos ?? []).map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="ti-badbox">
                    {catalogo.mensaje}
                    {catalogo.detalle && (
                      <div className="ti-smalltxt" style={{ marginTop: 6 }}>
                        {catalogo.detalle}
                      </div>
                    )}
                  </div>

                  <Orientacion orientacion={catalogo.orientacion} />
                </>
              )}

              {catalogo.version && (
                <div className="ti-smalltxt">
                  Versión {catalogo.version.version} ({catalogo.version.estado}) · periodo{' '}
                  {catalogo.version.periodo_inicio} a {catalogo.version.periodo_fin} ·{' '}
                  {catalogo.disponibles} de {catalogo.total} quincena(s) disponible(s).
                  Fecha de negocio {catalogo.fecha_negocio}.
                </div>
              )}

              {descartadas.length > 0 && (
                <details className="ti-smalltxt" style={{ marginTop: 8 }}>
                  <summary>
                    Por qué las otras {descartadas.length} quincena(s) no se ofrecen
                  </summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {descartadas.map(d => (
                      <li key={d.quincena}>
                        <b>{quincenaDe(d.quincena)?.label ?? d.quincena}</b> · {d.motivo}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {disponibles.length > 0 && (
                <div className="ti-warnbox">
                  Las visitas pendientes que ocupen el destino pasarán a la siguiente quincena.
                  Los próximos niveles de esta unidad se recalcularán y el motivo quedará registrado.
                </div>
              )}

              <div className="ti-smalltxt">
                La quincena de origen ({quincenaDe(visita.quincena_programada)?.labelLargo})
                se conserva como referencia.
              </div>
            </>
          )}
        </div>
        <div className="ti-modal-f">
          <button type="button" className="ti-btn" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button
            type="button"
            className="ti-btn primary"
            disabled={trabajando || cargando || !destino || motivo.trim() === ''}
            onClick={() => onConfirmar(destino, motivo.trim())}
          >
            {trabajando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// MODAL DE CANCELACIÓN · F4.3
// ---------------------------------------------------------------------------
// Cancelar deja de ser una acción inmediata del drawer: PATCH .../cancelar exige motivo y
// contesta 400 sin él, así que hay que pedirlo. Sigue siendo una acción independiente y
// explícita sobre ESTA visita, nunca un paso dentro de la reprogramación de otra.
//
// La elegibilidad no se decide aquí: llega en `visita.acciones.puede_cancelar`, y el botón
// que abre este modal ya la respeta.
const ModalCancelar = ({ visita, onCerrar, onConfirmar, trabajando }) => {
  const [motivo, setMotivo] = useState('');
  const qEfectiva = quincenaDe(visita.quincena_efectiva ?? visita.quincena_programada);

  return (
    <>
      <div className="ti-modal-overlay" onClick={onCerrar} />
      <div className="ti-modal" role="dialog" aria-modal="true" aria-label="Cancelar visita">
        <div className="ti-modal-h">Cancelar visita</div>
        <div className="ti-modal-b">
          <div className="ti-smalltxt">
            {formatearPlaca(visita.unidad?.placa)} · {qEfectiva?.labelLargo ?? visita.quincena_efectiva}
          </div>

          <div className="ti-badbox">
            CANCELADO es terminal: la visita no vuelve a un estado activo. La fila y sus
            equipos previstos se conservan como historial.
          </div>

          <div className="ti-field">
            <label htmlFor="ti-cm">
              Motivo de la cancelación <b>(obligatorio)</b>
            </label>
            <textarea
              id="ti-cm"
              rows={3}
              value={motivo}
              placeholder="Por qué se desiste de esta visita"
              onChange={event => setMotivo(event.target.value)}
            />
          </div>

          <div className="ti-smalltxt">
            El motivo queda anotado en la visita y en la historial de movimientos.
          </div>
        </div>
        <div className="ti-modal-f">
          <button type="button" className="ti-btn" onClick={onCerrar} disabled={trabajando}>
            Volver
          </button>
          <button
            type="button"
            className="ti-btn danger"
            disabled={trabajando || motivo.trim() === ''}
            onClick={() => onConfirmar(motivo.trim())}
          >
            {trabajando ? 'Cancelando…' : 'Cancelar la visita'}
          </button>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DRAWER DE UNA VISITA
// ---------------------------------------------------------------------------
export const DrawerVisita = ({
  visita, fechaNegocio, onCerrar, onAccion, trabajando, onReprogramar,
  onCrearOrden, onAbrirOrden, onElevarNivel, puedeEditar
}) => {
  const [nivelElegido, setNivelElegido] = useState('');
  const st = estadoVisual(visita, fechaNegocio);
  const alcance = alcanceDe(visita);
  const qEfectiva = quincenaDe(visita.quincena_efectiva ?? visita.quincena_programada);
  const acciones = visita.acciones ?? {};
  const apertura = aperturaDeOt(visita);
  const ot = visita.ordenes_trabajo ?? {};

  return (
    <>
      <div className="ti-drawer-overlay" onClick={onCerrar} />
      <aside className="ti-drawer on" role="dialog" aria-modal="true" aria-label="Alcance de la visita">
        <div className="ti-drawer-head">
          <div>
            <b className="ti-mono">{formatearPlaca(visita.unidad?.placa ?? '—')}</b>
            {' · '}{qEfectiva?.label ?? '—'}
            <div className="ti-smalltxt">
              Visita #{visita.id} · <Chip estado={st} />
            </div>
          </div>
          <button type="button" className="ti-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div className="ti-drawer-body">
          {st === 'VENCIDA' && (
            <div className="ti-badbox">
              La quincena cerró el {qEfectiva?.fin} sin ejecución. Reprograma a una quincena
              vigente o deja constancia del motivo.
            </div>
          )}

          {visita.quincena_reprogramada && (
            <div className="ti-infobox">
              <b>Reprogramada</b> desde{' '}
              {quincenaDe(visita.quincena_programada)?.labelLargo} hacia{' '}
              {quincenaDe(visita.quincena_reprogramada)?.labelLargo}.
              La quincena de origen conserva la marca «Reprogramado».
              <p style={{ marginBottom: 0 }}><b>Motivo de reprogramación:</b> {motivoDeVisita(visita) || 'Sin motivo registrado'}</p>
            </div>
          )}

          {alcance.mezcla && (
            <div className="ti-badbox">
              Esta visita tiene <b>más de un nivel regular</b> ({alcance.mezcla.join(' y ')}).
              El programa exige un único nivel común para CÁMARAS, COPILOTO y RADIO_BASE.
              Revísalo antes de ejecutarla.
            </div>
          )}

          {/* ALCANCE: lo regular y lo anual, nunca sumados */}
          <div className="ti-section">
            <div className="ti-section-h"><b>Alcance de la visita</b></div>
            <div className="ti-section-b">
              <p style={{ margin: '0 0 7px' }}>
                <b>Regular: </b>
                {alcance.nivelRegular ? (
                  <>
                    <Nivel nivel={alcance.nivelRegular} />{' '}
                    <span className="ti-smalltxt">
                      para los {alcance.regulares.length} equipos regulares instalados
                    </span>
                  </>
                ) : (
                  <span className="ti-smalltxt">No corresponde en esta quincena</span>
                )}
              </p>
              <p style={{ margin: 0 }}>
                <b>Anualidades: </b>
                {alcance.anuales.length ? (
                  alcance.anuales.map(e => (
                    <span key={e.id} className="ti-chip purple" style={{ marginRight: 5 }}>
                      {e.tipo_equipo} {e.nivel_mantenimiento}
                    </span>
                  ))
                ) : (
                  <span className="ti-smalltxt">—</span>
                )}
              </p>
            </div>
          </div>

          {puedeEditar && alcance.nivelRegular && (
            <div className="ti-section">
              <div className="ti-section-h"><b>Nivel de mantenimiento</b></div>
              <div className="ti-section-b">
                {acciones.puede_elevar_nivel ? (
                  <>
                    <div className="ti-field">
                      <label htmlFor="ti-nivel-visita">Nivel a realizar</label>
                      <select id="ti-nivel-visita" value={nivelElegido || alcance.nivelRegular}
                        disabled={trabajando} onChange={e => setNivelElegido(e.target.value)}>
                        {['M1','M2','M3'].filter(n => Number(n.slice(1)) >= Number(alcance.nivelRegular.slice(1)))
                          .map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <p className="ti-smalltxt">Puede subir el nivel antes de abrir la orden. Las siguientes intervenciones se ajustarán a las frecuencias del programa.</p>
                    <button type="button" className="ti-btn primary"
                      disabled={trabajando || !nivelElegido || nivelElegido === alcance.nivelRegular}
                      onClick={() => onElevarNivel(nivelElegido)}>
                      {trabajando ? 'Actualizando…' : 'Actualizar nivel y programa'}
                    </button>
                  </>
                ) : <p className="ti-smalltxt">El nivel se conserva porque la visita tiene una orden o un resultado registrado.</p>}
              </div>
            </div>
          )}

          {/* EQUIPOS: la evidencia de lo materializado */}
          <div className="ti-section">
            <div className="ti-section-h">
              <b>Equipos incluidos</b>
              <span className="ti-right ti-smalltxt">
                {alcance.total} equipo(s)
              </span>
            </div>
            <div className="ti-section-b">
              {alcance.total ? (
                <table>
                  <thead>
                    <tr><th>Equipo</th><th>Tipo</th><th>Nivel</th></tr>
                  </thead>
                  <tbody>
                    {[...(visita.equipos?.items ?? [])]
                      .sort((a, b) => a.tipo_equipo.localeCompare(b.tipo_equipo))
                      .map(e => (
                        <tr key={e.id}>
                          <td>{ETIQUETA_EQUIPO[e.tipo_equipo] ?? e.tipo_equipo}</td>
                          <td className="ti-smalltxt">
                            {claseFamilia(e.tipo_equipo) === 'HISTORICA'
                              ? 'HISTÓRICA'
                              : claseFamilia(e.tipo_equipo)}
                          </td>
                          <td>
                            <Nivel
                              nivel={e.nivel_mantenimiento}
                              anual={esAnual(e.tipo_equipo)}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="ti-empty">Esta quincena no tiene alcance programado.</div>
              )}
            </div>
          </div>

          {/* ÓRDENES DE TRABAJO · F2.1
              La visita publica el recuento, no el contenido: el contenido vive en la
              pantalla de órdenes. Desde aquí solo se abre una OT nueva o se salta a la que
              ya existe. */}
          <div className="ti-section">
            <div className="ti-section-h">
              <b>Órdenes de trabajo</b>
              <span className="ti-right ti-smalltxt">{ot.total ?? 0}</span>
            </div>
            <div className="ti-section-b">
              <div className="ti-smalltxt">
                {ot.total
                  ? `${ot.total} en total · ${ot.abiertas} abierta(s) · `
                    + `${ot.cerradas} cerrada(s) · ${ot.anuladas} anulada(s)`
                  : 'Ninguna orden de trabajo todavía.'}
              </div>

              <div className="ti-bar" style={{ marginTop: 11, marginBottom: 0 }}>
                {apertura.tiene_activa ? (
                  <button
                    type="button"
                    className="ti-btn primary"
                    disabled={trabajando || !onAbrirOrden}
                    onClick={onAbrirOrden}
                  >
                    Abrir OT
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ti-btn primary"
                    disabled={trabajando || !apertura.puede_abrir}
                    title={
                      apertura.motivo_abrir
                      ?? 'Abre la orden de trabajo de esta visita'
                    }
                    onClick={onCrearOrden}
                  >
                    {trabajando ? 'Abriendo…' : 'Crear OT'}
                  </button>
                )}

                {ot.total > 0 && !apertura.tiene_activa && onAbrirOrden && (
                  <button type="button" className="ti-btn" onClick={onAbrirOrden}>
                    Ver sus órdenes
                  </button>
                )}
              </div>

              {!apertura.puede_abrir && !apertura.tiene_activa && (
                <div className="ti-smalltxt" style={{ marginTop: 9 }}>
                  <b>Crear OT:</b> {apertura.motivo_abrir}
                </div>
              )}

              {apertura.tiene_activa && (
                <div className="ti-smalltxt" style={{ marginTop: 9 }}>
                  Esta visita ya tiene una orden no anulada. Solo puede haber una: para
                  abrir otra hay que anular la actual.
                </div>
              )}

              <div className="ti-smalltxt" style={{ marginTop: 7 }}>
                La orden incluirá los equipos previstos para esta visita. Una vez abierta,
                no se podrán agregar ni quitar equipos de su alcance.
              </div>
            </div>
          </div>

          {/* ACCIONES: las tres que el backend publica, con su motivo cuando están vetadas */}
          <div className="ti-bar" style={{ marginTop: 14, marginBottom: 0 }}>
            <button
              type="button"
              className="ti-btn primary"
              disabled={trabajando || !acciones.puede_programar}
              title={acciones.motivo_programar ?? 'Promueve la visita a PROGRAMADO'}
              onClick={() => onAccion('programar')}
            >
              Programar
            </button>
            <button
              type="button"
              className="ti-btn"
              disabled={trabajando || !acciones.puede_reprogramar}
              title={acciones.motivo_reprogramar ?? 'Mueve la quincena efectiva'}
              onClick={onReprogramar}
            >
              Reprogramar
            </button>
            <button
              type="button"
              className="ti-btn danger"
              disabled={trabajando || !acciones.puede_cancelar}
              title={acciones.motivo_cancelar ?? 'Cancela la visita'}
              onClick={() => onAccion('cancelar')}
            >
              Cancelar visita
            </button>
          </div>

          {/* El backend explica POR QUÉ veta cada acción: se muestra, no se oculta. */}
          {[
            ['Programar', acciones.puede_programar, acciones.motivo_programar],
            ['Reprogramar', acciones.puede_reprogramar, acciones.motivo_reprogramar],
            ['Cancelar', acciones.puede_cancelar, acciones.motivo_cancelar]
          ].some(([, puede, motivo]) => !puede && motivo) && (
            <div className="ti-smalltxt" style={{ marginTop: 10 }}>
              {[
                ['Programar', acciones.puede_programar, acciones.motivo_programar],
                ['Reprogramar', acciones.puede_reprogramar, acciones.motivo_reprogramar],
                ['Cancelar', acciones.puede_cancelar, acciones.motivo_cancelar]
              ]
                .filter(([, puede, motivo]) => !puede && motivo)
                .map(([nombre, , motivo]) => (
                  <div key={nombre} style={{ marginTop: 3 }}>
                    <b>{nombre}:</b> {motivo}
                  </div>
                ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

// ---------------------------------------------------------------------------
// PANTALLA
// ---------------------------------------------------------------------------
// onIrAOrden: la pantalla de órdenes es la que muestra una OT. Programa no la pinta, solo
// la abre y pasa el mando. Si el contenedor no lo provee, crear sigue funcionando: lo que
// no hay es navegación.
export function ProgramaTiPr01({ permisos, onIrAOrden }) {
  const puedeEditar = Boolean(permisos?.editar);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [programa, setPrograma] = useState(null);
  const [fechaNegocio, setFechaNegocio] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [totalBackend, setTotalBackend] = useState(0);
  // true si tras paginar seguimos por debajo de `total`: la matriz estaría incompleta y
  // hay que decirlo, no disimularlo.
  const [truncado, setTruncado] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [operacionFiltro, setOperacionFiltro] = useState('');
  const [exportando, setExportando] = useState(false);
  // Contador de recargas: cambiarlo vuelve a disparar el efecto. Permite que el botón
  // "Reintentar" y el refresco tras una acción reutilicen el mismo camino de carga.
  const [recarga, setRecarga] = useState(0);

  const [visitaAbierta, setVisitaAbierta] = useState(null);
  const [reprogramando, setReprogramando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  // F4.1 · seleccion multiple para confirmar en lote. Solo entran visitas que el BACKEND
  // declara programables en `acciones.puede_programar`: la UI no decide quien es elegible.
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);

  // Pide otra carga mostrando el spinner. Se llama desde manejadores de evento, nunca
  // desde el cuerpo de un efecto.
  const recargar = () => {
    setCargando(true);
    setRecarga(n => n + 1);
  };

  // ------------------------------------------------------------------ carga
  // El primer setState ocurre DESPUÉS del await: el cuerpo del efecto no hace setState
  // sincrónico, que es lo que provoca renders en cascada.
  // `vivo` descarta la respuesta de una carga que ya quedó obsoleta al cambiar el filtro.
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        // fecha_negocio es America/Lima calculada en la base: es la referencia para
        // decidir si una quincena ya cerró. El reloj del navegador no sirve.
        const lista = await apiTiPr01.listarProgramas({ estado: 'ACTIVO' });
        const activo = (lista.programas ?? [])[0] ?? null;

        if (!vivo) return;

        setError(null);
        setFechaNegocio(lista.fecha_negocio ?? null);
        setPrograma(activo);

        if (!activo) {
          setVisitas([]);
          setTotalBackend(0);
          return;
        }

        // Paginado completo: el endpoint tiene techo de 1000 filas por página.
        const data = await apiTiPr01.listarProgramacionCompleta(activo.id, {
          estado: estadoFiltro || undefined
        });

        if (!vivo) return;

        setVisitas(data.programacion ?? []);
        setTotalBackend(data.total ?? 0);
        setTruncado(Boolean(data.truncado));
      } catch (e) {
        if (!vivo) return;
        setError(e.message || 'No se pudo cargar el programa');
        setVisitas([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [estadoFiltro, recarga]);

  // ------------------------------------------------------------------ derivados
  // Las quincenas son columnas derivadas de los datos: sin lista fija.
  const quincenas = useMemo(() => {
  const visibles = estadoFiltro === 'CANCELADO'
    ? visitas
    : visitas.filter(v => v.estado !== 'CANCELADO');

  return quincenasDe(visibles);
}, [visitas, estadoFiltro]);

  // Una fila por unidad, con sus visitas agrupadas por quincena efectiva.
  //
  // OJO: una celda puede contener MAS DE UNA visita. El indice unico del modelo es
  // PARCIAL -uq_programacion_unidad_quincena_efectiva ... WHERE estado <> 'CANCELADO'-,
  // asi que una unidad puede acumular varias CANCELADAS en la misma quincena y, encima,
  // una activa. Quedarse con la ultima del arreglo escondia la activa detras de una
  // cancelada. Se agrupa y se elige: manda la que NO esta cancelada.
 const filas = useMemo(() => {
  const porUnidad = new Map();

  for (const v of visitas) {
    if (v.estado === 'CANCELADO' && estadoFiltro !== 'CANCELADO') {
      continue;
    }

    const clave = v.unidad?.id ?? v.programa_unidad_id;

    if (!porUnidad.has(clave)) {
      porUnidad.set(clave, {
        id: clave,
        placa: v.unidad?.placa ?? '—',
        operacion: String(v.unidad?.operacion || '')
          .trim()
          .toUpperCase(),
        porQuincena: new Map(),
        movidas: new Map()
      });
    }

    const fila = porUnidad.get(clave);
    const efectiva = v.quincena_efectiva ?? v.quincena_programada;

    if (!fila.porQuincena.has(efectiva)) {
      fila.porQuincena.set(efectiva, []);
    }

    fila.porQuincena.get(efectiva).push(v);

    // Conserva la marca de origen de las visitas reprogramadas.
    if (
      v.quincena_programada &&
      efectiva !== v.quincena_programada
    ) {
      fila.movidas.set(v.quincena_programada, v);
    }

    for (const ajuste of v.ajustes ?? []) {
      if (
        ajuste.tipo === 'REPROGRAMACION' &&
        ajuste.origen !== efectiva
      ) {
        fila.movidas.set(ajuste.origen, {
          ...v,
          motivo_movimiento: ajuste.motivo
        });
      }
    }
  }

  for (const fila of porUnidad.values()) {
    for (const [quincena, grupo] of fila.porQuincena) {
      const activa = grupo.find(v => v.estado !== 'CANCELADO');

      fila.porQuincena.set(quincena, {
        visita: activa ?? grupo[grupo.length - 1],
        historicas: grupo.length - 1
      });
    }
  }

  const texto = busqueda.trim().toUpperCase().replace(/-/g, '');

  return [...porUnidad.values()]
    .filter(f =>
      !texto ||
      f.placa.toUpperCase().replace(/-/g, '').includes(texto)
    )
    .filter(f =>
      !operacionFiltro ||
      (
        operacionFiltro === '__SIN_OPERACION__'
          ? !f.operacion
          : f.operacion === operacionFiltro
      )
    )
    .sort((a, b) => a.placa.localeCompare(b.placa));
}, [visitas, busqueda, operacionFiltro, estadoFiltro]);

  // Elegibles: lo dice el BACKEND en acciones.puede_programar. Se indexan por quincena para
  // que "Seleccionar quincena" no tenga que recorrer la matriz otra vez.
  const elegibles = useMemo(() => {
    const porQuincena = new Map();
    const todas = new Map();

    for (const fila of filas) {
      for (const [q, celda] of fila.porQuincena) {
        const v = celda.visita;

        if (!v?.acciones?.puede_programar) continue;

        if (!porQuincena.has(q)) porQuincena.set(q, []);
        porQuincena.get(q).push(v.id);
        todas.set(v.id, v);
      }
    }

    return { porQuincena, todas };
  }, [filas]);

  // La selección se depura contra las elegibles actuales: si una visita deja de serlo tras
  // un refresco, su marca desaparece en vez de quedar colgada.
  const seleccionados = useMemo(
    () => [...seleccion].filter(id => elegibles.todas.has(id)),
    [seleccion, elegibles]
  );

  const quincenasSeleccionadas = useMemo(
    () => [...new Set(
      seleccionados.map(id => {
        const v = elegibles.todas.get(id);

        return v.quincena_efectiva ?? v.quincena_programada;
      })
    )].sort(),
    [seleccionados, elegibles]
  );

  const alternar = id => setSeleccion(prev => {
    const siguiente = new Set(prev);

    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);

    return siguiente;
  });

  // Alterna TODA la columna: si ya están todas las elegibles de esa quincena, las quita.
  const alternarQuincena = q => setSeleccion(prev => {
    const deLaQuincena = elegibles.porQuincena.get(q) ?? [];
    const todasPuestas = deLaQuincena.length > 0
      && deLaQuincena.every(id => prev.has(id));
    const siguiente = new Set(prev);

    for (const id of deLaQuincena) {
      if (todasPuestas) siguiente.delete(id);
      else siguiente.add(id);
    }

    return siguiente;
  });

  const operacionesDisponibles = useMemo(() => {
    const valores = new Set(visitas.map(v => String(v.unidad?.operacion || '').trim().toUpperCase()));
    if (operacionFiltro) valores.add(operacionFiltro === '__SIN_OPERACION__' ? '' : operacionFiltro);
    return [...valores].sort((a, b) => a.localeCompare(b, 'es'));
  }, [visitas, operacionFiltro]);

  // ------------------------------------------------------------------ acciones
  const refrescarVisita = async id => {
    if (!programa) return;

    try {
      const fresca = await apiTiPr01.obtenerVisita(programa.id, id);
      setVisitaAbierta(fresca);
      setVisitas(prev => prev.map(v => (v.id === id ? fresca : v)));
    } catch {
      // Si la relectura falla, se recarga todo: es preferible a mostrar algo obsoleto.
      recargar();
    }
  };

  // F4.3 · cancelar ya NO se ejecuta desde aquí: PATCH .../cancelar exige motivo, así que
  // abre su modal. Programar sigue siendo inmediato -no admite cuerpo y no altera la
  // planificación: solo confirma lo que el generador ya proyectó-.
  const ejecutarAccion = async accion => {
    if (!programa || !visitaAbierta) return;

    if (accion === 'cancelar') {
      setCancelando(true);

      return;
    }

    setTrabajando(true);

    try {
      await apiTiPr01.programarVisita(programa.id, visitaAbierta.id);
      toast.success('Visita promovida a PROGRAMADO');
      await refrescarVisita(visitaAbierta.id);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarCancelacion = async motivo => {
    if (!programa || !visitaAbierta) return;

    setTrabajando(true);

    try {
      await apiTiPr01.cancelarVisita(programa.id, visitaAbierta.id, motivo);
      toast.success('Visita cancelada');
      setCancelando(false);
      await refrescarVisita(visitaAbierta.id);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  // ------------------------------------------------------------------ abrir una OT
  // POST .../ordenes-trabajo sin cuerpo: tecnico_id es el único campo admitido y es
  // opcional, así que no se inventa un técnico. Quién abre sale del token.
  //
  // Tras el 201 se refresca la visita -el recuento de OT y las acciones cambian: con una
  // OT no anulada la visita ya no se programa, ni se reprograma, ni se cancela- y se salta
  // al detalle de la orden recién creada. Nada de recargar la aplicación.
  const crearOrden = async () => {
    if (!programa || !visitaAbierta) return;

    const visitaId = visitaAbierta.id;

    setTrabajando(true);

    try {
      const orden = await apiTiPr01.crearOrdenTrabajo(programa.id, visitaId);

      toast.success(
        `Orden de trabajo #${orden.id} abierta con `
        + `${orden.detalles?.total ?? 0} equipo(s)`
      );

      await refrescarVisita(visitaId);

      if (onIrAOrden) {
        setVisitaAbierta(null);
        setReprogramando(false);
        onIrAOrden({ programacionId: visitaId, otId: orden.id });
      }
    } catch (e) {
      // 409 de regla de negocio incluido: el backend ya redacta el motivo para el
      // usuario y es la autoridad final. Se muestra tal cual.
      toast.error(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const irAOrdenesDeVisita = () => {
    if (!onIrAOrden || !visitaAbierta) return;

    const visitaId = visitaAbierta.id;

    setVisitaAbierta(null);
    setReprogramando(false);
    onIrAOrden({ programacionId: visitaId, otId: null });
  };

  // ------------------------------------------------------------------ lote (F4.1)
  // UN solo PATCH transaccional. La respuesta trae la programación fresca de las visitas
  // del lote, así que la matriz se actualiza con ella sin volver a barrer el programa.
  const confirmarLote = async () => {
    if (!programa || seleccionados.length === 0) return;

    setTrabajando(true);

    try {
      const r = await apiTiPr01.programarLote(programa.id, seleccionados);

      const frescas = new Map(
        (r.programacion ?? []).map(v => [v.id, v])
      );

      setVisitas(prev => prev.map(v => frescas.get(v.id) ?? v));
      setSeleccion(new Set());
      setConfirmandoLote(false);

      toast.success(
        r.ya_estaban_programadas > 0
          ? `${r.confirmadas} visita(s) confirmada(s) · `
            + `${r.ya_estaban_programadas} ya lo estaban`
          : `${r.confirmadas} visita(s) confirmada(s)`
      );
    } catch (e) {
      // El 409 nombra las visitas que pararon el lote y el 404 las que no existen. Se
      // muestra el texto del backend tal cual: es el que sabe por qué.
      toast.error(e.message, { duration: 9000 });
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarReprogramacion = async (destino, motivo) => {
    if (!programa || !visitaAbierta) return;

    setTrabajando(true);

    try {
      await apiTiPr01.reprogramarVisita(
        programa.id,
        visitaAbierta.id,
        destino,
        motivo
      );
      toast.success(`Visita reprogramada a ${quincenaDe(destino)?.label ?? destino}`);
      setReprogramando(false);
      setVisitaAbierta(null);
      recargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarNivel = async nivel => {
    if (!programa || !visitaAbierta || trabajando || !puedeEditar) return;
    setTrabajando(true);
    try {
      await apiTiPr01.elevarNivelVisita(programa.id, visitaAbierta.id, nivel);
      toast.success(`Nivel actualizado a ${nivel}. Programación recalculada.`);
      setVisitaAbierta(null);
      recargar();
    } catch (e) { toast.error(e.message, { duration: 9000 }); }
    finally { setTrabajando(false); }
  };

  const descargarExcel = async () => {
    if (!programa || exportando) return;
    setExportando(true);
    try {
      const blob = await apiTiPr01.descargarProgramaExcel(programa.id, {
        busqueda: busqueda.trim(), estado: estadoFiltro, operacion: operacionFiltro
      });
      const url = window.URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `TI-PR-01_${fechaNegocio || 'Programa'}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast.success('Programa descargado.');
    } catch (e) {
      toast.error(e.message || 'No se pudo descargar el programa.');
    } finally {
      setExportando(false);
    }
  };

  // ------------------------------------------------------------------ estados de carga
  if (cargando) {
    return (
      <div className="ti">
        <div className="ti-card">
          <div className="ti-empty">
            <div className="ti-spinner" />
            Cargando el programa…
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
      {/* FILTROS */}
      <div className="ti-bar">
        <input
          value={busqueda}
          onChange={event => setBusqueda(event.target.value)}
          placeholder="Buscar placa"
          aria-label="Buscar placa"
        />
        <select
          value={estadoFiltro}
          onChange={event => {
            setCargando(true);
            setEstadoFiltro(event.target.value);
          }}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {['PROYECTADO', 'PROGRAMADO', 'REPROGRAMADO', 'EJECUTADO',
            'EJECUTADO_PARCIAL', 'NO_EJECUTADO', 'NO_APLICA', 'CANCELADO'].map(e => (
            <option key={e} value={e}>{etiquetaEstado(e)}</option>
          ))}
        </select>
        <select value={operacionFiltro} onChange={event => {
          setOperacionFiltro(event.target.value);
          setSeleccion(new Set());
        }} aria-label="Filtrar por operación">
          <option value="">Todas las operaciones</option>
          {operacionesDisponibles.map(operacion => (
            <option key={operacion || '__SIN_OPERACION__'} value={operacion || '__SIN_OPERACION__'}>
              {operacion || 'Sin operación'}
            </option>
          ))}
        </select>
        <button type="button" className="ti-btn primary" onClick={descargarExcel}
          disabled={exportando || trabajando} aria-busy={exportando}>
          {exportando ? 'Generando Excel…' : 'Descargar Excel TI-PR-01'}
        </button>
      </div>

      {truncado && (
        <div className="ti-badbox">
          La matriz está <b>incompleta</b>: se recuperaron {visitas.length} de{' '}
          {totalBackend} visitas. Acota el rango o el estado antes de interpretarla.
        </div>
      )}

      {/* BARRA DE SELECCIÓN · solo aparece con algo marcado. No hay "seleccionar todo":
          confirmar no se deshace, así que el operador elige explícitamente. */}
      {puedeEditar && seleccionados.length > 0 && (
        <div className="ti-bar ti-selbar">
          <b>{seleccionados.length}</b>
          <span className="ti-smalltxt">
            visita(s) seleccionada(s) en{' '}
            {quincenasSeleccionadas.length === 1
              ? quincenaDe(quincenasSeleccionadas[0])?.labelLargo
              : `${quincenasSeleccionadas.length} quincenas`}
          </span>
          <button
            type="button"
            className="ti-btn primary"
            disabled={trabajando}
            onClick={() => setConfirmandoLote(true)}
          >
            Programar seleccionadas
          </button>
          <button
            type="button"
            className="ti-btn"
            disabled={trabajando}
            onClick={() => setSeleccion(new Set())}
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* MATRIZ */}
      <div className="ti-card">
        <h3>
          Programación por quincena
        </h3>

        {quincenas.length === 0 || filas.length === 0 ? (
          <div className="ti-empty">
            {visitas.length === 0
              ? 'El programa todavía no tiene visitas materializadas. Las crea el generador.'
              : 'Ninguna unidad coincide con el filtro.'}
          </div>
        ) : (
          <div className="ti-matrix">
            <table>
              <thead>
                <tr>
                  <th className="ti-plate">Placa</th>
                  {quincenas.map(q => {
                    const deLaQuincena = elegibles.porQuincena.get(q.id) ?? [];
                    const puestas = deLaQuincena.filter(id => seleccion.has(id)).length;

                    return (
                      <th key={q.id} style={{ textAlign: 'center' }}>
                        {q.label}
                        {puedeEditar && deLaQuincena.length > 0 && (
                          <div>
                            <button
                              type="button"
                              className="ti-selq"
                              disabled={trabajando}
                              title={
                                `${deLaQuincena.length} visita(s) disponibles para programar en ${q.labelLargo}`
                              }
                              onClick={() => alternarQuincena(q.id)}
                            >
                              {puestas === deLaQuincena.length
                                ? `quitar ${deLaQuincena.length}`
                                : `sel. ${deLaQuincena.length}`}
                            </button>
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th style={{ textAlign: 'center' }}>Avance</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(fila => {
                  const propias = [...fila.porQuincena.values()].map(c => c.visita);
                  const hechas = propias.filter(
                    v => ['EJECUTADO', 'EJECUTADO_PARCIAL'].includes(v.estado)
                  ).length;
                  const atrasadas = propias.filter(
                    v => estadoVisual(v, fechaNegocio) === 'VENCIDA'
                  ).length;

                  return (
                    <tr key={fila.id}>
                      <td className="ti-plate ti-mono">{formatearPlaca(fila.placa)}</td>

                      {quincenas.map(q => {
                        const celda = fila.porQuincena.get(q.id);
                        const visita = celda?.visita;
                        const historicas = celda?.historicas ?? 0;

                        if (!visita) {
                          // Rastro de una visita que nacio aqui y se movio. Se puede pulsar:
                          // abre el drawer de la visita real, que vive en su destino.
                          const movida = fila.movidas.get(q.id);

                          if (movida) {
                            const destino = quincenaDe(movida.quincena_efectiva);

                            return (
                              <td key={q.id}>
                                <button
                                  type="button"
                                  className="ti-cell movida"
                                  title={
                                    `${formatearPlaca(fila.placa)} · reprogramada desde ${q.labelLargo} `
                                    + `hacia ${destino?.labelLargo ?? movida.quincena_efectiva}`
                                    + ` · Motivo: ${movida.motivo_movimiento || motivoDeVisita(movida) || 'Sin motivo registrado'}`
                                  }
                                  onClick={() => setVisitaAbierta(movida)}
                                >
                                  <span className="ti-movida-texto">Reprogramado</span><span className="ti-rp">→ {destino?.label ?? '?'}</span>
                                </button>
                              </td>
                            );
                          }

                          return (
                            <td key={q.id}>
                              <span className="ti-cell vacio">·</span>
                            </td>
                          );
                        }

                        const st = estadoVisual(visita, fechaNegocio);
                        const alcance = alcanceDe(visita);
                        const clases = [
                          'ti-cell',
                          CLASE_CELDA[st] || '',
                          alcance.mezcla ? 'mezcla' : ''
                        ].filter(Boolean).join(' ');

                        const titulo = [
                          fila.placa,
                          q.label,
                          alcance.nivelRegular
                            ? `Regular ${alcance.nivelRegular}`
                            : 'Sin regular',
                          alcance.anuales.length
                            ? `+ ${alcance.anuales.map(a => a.tipo_equipo).join(' y ')} M3 anual`
                            : null,
                          etiquetaEstado(st),
                          historicas > 0
                            ? `(+${historicas} visita(s) cancelada(s) en esta quincena)`
                            : null
                        ].filter(Boolean).join(' · ');

                        // Solo las que el BACKEND declara programables admiten marca. El
                        // checkbox va FUERA del botón: un control dentro de otro no es HTML
                        // válido y rompería el clic de la celda.
                        const elegible = Boolean(visita.acciones?.puede_programar);
                        const marcada = seleccion.has(visita.id);

                        return (
                          <td key={q.id} className="ti-celda">
                            {puedeEditar && elegible && (
                              <input
                                type="checkbox"
                                className="ti-marca"
                                checked={marcada}
                                disabled={trabajando}
                                aria-label={`Seleccionar ${formatearPlaca(fila.placa)} ${q.label}`}
                                title="Seleccionar para confirmar en lote"
                                onChange={() => alternar(visita.id)}
                              />
                            )}
                            <button
                              type="button"
                              className={`${clases}${marcada ? ' marcada' : ''}`}
                              title={titulo}
                              onClick={() => setVisitaAbierta(visita)}
                            >
                              {textoCelda(alcance)}
                              {fila.movidas.has(q.id) && <span className="ti-rastro-reprogramado">Reprogramado</span>}
                              {alcance.anuales.length > 0 && <i className="ti-an" />}
                            </button>
                          </td>
                        );
                      })}

                      <td style={{ textAlign: 'center' }}>
                        <span className="ti-mono ti-smalltxt">
                          {hechas}/{propias.length}
                        </span>
                        {atrasadas > 0 && (
                          <>
                            {' '}
                            <span className="ti-chip red">{atrasadas} venc.</span>
                          </>
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

      {/* LEYENDA */}
      <div className="ti-legend">
        <span>
          <i className="ti-sq" style={{ background: '#f1f6fb', border: '1px solid #dce5ee' }} />
          Pendiente
        </span>
        <span><i className="ti-sq" style={{ background: '#0f7a52' }} />Ejecutado</span>
        <span><i className="ti-sq" style={{ background: '#f5c87a' }} />Parcial</span>
        <span>
          <i className="ti-sq" style={{ background: '#fde6e2', border: '1px solid #edc3bd' }} />
          Vencida
        </span>
        <span>
          <i
            className="ti-sq"
            style={{ background: '#5b4792', borderRadius: '50%', width: 8, height: 8 }}
          />
          Lleva anualidad GPS o ADAS
        </span>
        <span>
          <i
            className="ti-sq"
            style={{
              background: 'repeating-linear-gradient('
                + '-45deg,#f7f9fb,#f7f9fb 2px,#eef3f8 2px,#eef3f8 4px)',
              border: '1px dashed #d8e0e8'
            }}
          />
          <b>RP</b> · la visita nació en esa quincena y se reprogramó a otra
        </span>
      </div>

      {/* DRAWER */}
      {visitaAbierta && (
        <DrawerVisita
          key={visitaAbierta.id}
          visita={visitaAbierta}
          puedeEditar={puedeEditar}
          onElevarNivel={confirmarNivel}
          fechaNegocio={fechaNegocio}
          trabajando={trabajando}
          onCerrar={() => { setVisitaAbierta(null); setReprogramando(false); }}
          onAccion={puedeEditar ? ejecutarAccion : () => toast.error('Sin permiso de edición')}
          onReprogramar={
            puedeEditar
              ? () => setReprogramando(true)
              : () => toast.error('Sin permiso de edición')
          }
          onCrearOrden={
            puedeEditar
              ? crearOrden
              : () => toast.error('Sin permiso de edición')
          }
          onAbrirOrden={onIrAOrden ? irAOrdenesDeVisita : null}
        />
      )}

      {/* MODAL DEL LOTE · F4.1 */}
      {confirmandoLote && seleccionados.length > 0 && (
        <>
          <div
            className="ti-modal-overlay"
            onClick={trabajando ? undefined : () => setConfirmandoLote(false)}
          />
          <div
            className="ti-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar la programación del lote"
          >
            <div className="ti-modal-h">
              Programar {seleccionados.length} visita(s)
            </div>

            <div className="ti-modal-b">
              <div className="ti-warnbox">
                Confirmar una visita la pasa de <b>PROYECTADO</b> -la obligación que calculó
                el programa- a <b>PROGRAMADO</b>: una obligación asumida para esa misma
                quincena. <b>No se puede deshacer</b>: no existe la vuelta a PROYECTADO, y
                el único camino de regreso es cancelar la visita, que es terminal.
              </div>

              <table className="ti-table" style={{ marginBottom: 11 }}>
                <tbody>
                  <tr>
                    <th style={{ width: 160 }}>Visitas</th>
                    <td className="ti-mono">{seleccionados.length}</td>
                  </tr>
                  <tr>
                    <th>Quincena(s)</th>
                    <td>
                      {quincenasSeleccionadas.map(q => (
                        <span key={q} className="ti-chip blue" style={{ marginRight: 4 }}>
                          {quincenaDe(q)?.label ?? q}
                        </span>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>

              {quincenasSeleccionadas.length > 1 && (
                <div className="ti-badbox">
                  La selección abarca <b>{quincenasSeleccionadas.length} quincenas</b>
                  {' '}distintas:{' '}
                  {quincenasSeleccionadas.map(q => quincenaDe(q)?.labelLargo ?? q).join(' · ')}.
                  Confirmar una quincena que la operación todavía no va a atender habilita
                  abrir órdenes de trabajo sobre ella. Revísalo antes de continuar.
                </div>
              )}

              <div className="ti-smalltxt">
                Las visitas se confirman juntas. Si alguna no puede confirmarse, se indicará
                el motivo y ninguna quedará confirmada. Programar solo cambia el
                estado: no mueve la quincena, ni los equipos, ni los ciclos, y no crea
                órdenes de trabajo.
              </div>
            </div>

            <div className="ti-modal-f">
              <button
                type="button"
                className="ti-btn"
                disabled={trabajando}
                onClick={() => setConfirmandoLote(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ti-btn primary"
                disabled={trabajando}
                onClick={confirmarLote}
              >
                {trabajando
                  ? 'Confirmando…'
                  : `Confirmar ${seleccionados.length} visita(s)`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* MODAL */}
      {visitaAbierta && reprogramando && (
        <ModalReprogramar
          programaId={programa.id}
          visita={visitaAbierta}
          trabajando={trabajando}
          onCerrar={() => setReprogramando(false)}
          onConfirmar={confirmarReprogramacion}
        />
      )}

      {visitaAbierta && cancelando && (
        <ModalCancelar
          visita={visitaAbierta}
          trabajando={trabajando}
          onCerrar={() => setCancelando(false)}
          onConfirmar={confirmarCancelacion}
        />
      )}
    </div>
  );
}

// Las notas administrativas se apilan en observaciones; mostramos el último motivo.
export function motivoReprogramacion(observaciones) {
  const texto = String(observaciones || '');
  const patron = /\[[^\]\n]*·\s*REPROGRAMACION\s*·[^\]\n]*\]\s*([\s\S]*?)(?=\n\s*\n\[|$)/g;
  const coincidencias = [...texto.matchAll(patron)];
  return coincidencias.at(-1)?.[1]?.trim() || '';
}


function motivoDeVisita(visita) {
  const movimiento = (visita.ajustes ?? []).filter(a => a.tipo === 'REPROGRAMACION').at(-1);
  return movimiento?.motivo || motivoReprogramacion(visita.observaciones);
}

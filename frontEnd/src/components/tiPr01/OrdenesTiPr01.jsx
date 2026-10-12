// TI-PR-01 · F2.1 + F2.2 + F2.3 · PANTALLA ÓRDENES DE TRABAJO
// ============================================================================
// Dos fuentes de verdad, separadas a propósito:
//   VISUAL  docs/prototipos/prototipo_ti_pr01_v2.html, vOts() y la cabecera de vEjecucion()
//   DATOS   el backend real en
//           /api/programas-mantenimiento/:programaId/programacion/:programacionId/
//           ordenes-trabajo
//
// Nada de datos de demostración. Si el backend no tiene órdenes, la pantalla lo dice.
//
// ALCANCE
//   F2.1  listar, abrir una OT desde su programación y leer su detalle.
//   F2.2  EDITAR la cabecera y registrar el RESULTADO POR EQUIPO, contra los dos PATCH
//         reales. La condición es `acciones.puede_editar`, que publica el backend.
//   F2.3  CERRAR y ANULAR, contra POST /:otId/cerrar y PATCH /:otId/anular. Cada botón
//         se gobierna por su propio flag -puede_cerrar, puede_anular- y el motivo del veto
//         se muestra tal como lo publica el backend.
//
// Fuera de todas ellas, por no existir backend: reapertura, borrado, checklist de
// actividades, PDF, visto bueno y tickets.
//
// Las reglas del resultado -qué nivel exige cada estado, qué prohíbe PARCIAL- las gobierna
// resolverResultado() en el backend y se responden con 409. Aquí NO se reimplementan: se
// anticipan en una línea de ayuda y su mensaje se muestra tal cual.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTA PANTALLA EMPIEZA POR LA PROGRAMACIÓN
// ─────────────────────────────────────────────────────────────────────────────
// No existe un listado global de OT: la ruta cuelga de una programación concreta. Para
// montar la vista del prototipo -que sí es global- se usa lo que la programación YA
// publica: ordenes_trabajo.{total,abiertas,cerradas,anuladas,no_anuladas} por visita. Se
// pide el histórico solo a las visitas que declaran al menos una, en lotes, así que el
// número de peticiones lo marca la cantidad real de órdenes, no la de visitas: con cero
// órdenes no se emite ninguna petición extra.
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiTiPr01 } from '../../services/api';
// F3 · el barrido de programacion + ordenes vive en un helper compartido, para que
// Historial y esta pantalla no puedan divergir en como hablan con el backend.
import { cargarProgramaConOrdenes } from './cargarOrdenes';
import {
  ETIQUETA_EQUIPO,
  CLASE_CHIP,
  ESTADOS_ORDEN,
  ESTADOS_DETALLE_ORDEN,
  NIVELES,
  alcanceDeOrden,
  claseFamilia,
  etiquetaEstado,
  exigenciaDeResultado,
  quincenaDe
} from './dominio';
import './tiPr01.css';
import { EvidenciasOrden } from './EvidenciasOrden';
import { ConstanciaOrden } from './ConstanciaOrden';
import { AuditoriaOrden } from './AuditoriaOrden';
import { ChecklistOrden, ChecklistEquipo } from './ChecklistOrden';
import { codigoOrden } from './constanciaOt';

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

const Kpi = ({ etiqueta, valor, apoyo, clase }) => (
  <div className={`ti-card ti-kpi ${clase || ''}`}>
    <div className="ti-k">{etiqueta}</div>
    <div className="ti-v">{valor}</div>
    {apoyo && <div className="ti-s">{apoyo}</div>}
  </div>
);

// El alcance de una orden, en una celda: el nivel regular común y las anualidades aparte.
// Nunca sumados, que es la regla del programa.
const Alcance = ({ alcance }) => (
  <>
    {alcance.mezcla ? (
      <span className="ti-chip red" title="Más de un nivel regular en la misma visita">
        {alcance.mezcla.join('/')}
      </span>
    ) : (
      <Nivel nivel={alcance.nivelRegular} />
    )}
    {alcance.anuales.map(d => (
      <span key={d.id} className="ti-chip purple" style={{ marginLeft: 5 }}>
        {d.tipo_equipo} {d.nivel_programado}
      </span>
    ))}
  </>
);

// fecha_apertura y fecha_cierre son timestamptz: llegan con hora. En una tabla estorba,
// así que se corta el día y la hora se deja en el title.
const fechaCorta = valor => {
  if (!valor) return '—';

  const texto = String(valor);

  return texto.length >= 10 ? texto.slice(0, 10) : texto;
};

// ---------------------------------------------------------------------------
// EDICIÓN · F2.2
// ---------------------------------------------------------------------------
// Los dos PATCH son PARCIALES y rechazan por nombre lo que no está en su lista blanca, así
// que cada formulario envía EXACTAMENTE las claves que cambiaron. Nada más.

const comoTexto = valor =>
  valor === null || valor === undefined ? '' : String(valor);

// Caja de error que NO se desvanece. Un 409 de regla de negocio es información que el
// técnico necesita leer dos veces; un toast se la quita de delante.
const Aviso = ({ error, onCerrar }) => {
  if (!error) return null;

  const etiqueta = {
    400: 'Revisa los datos ingresados',
    404: 'No se encontró el registro',
    409: 'No se puede completar la acción',
    401: 'Inicia sesión nuevamente',
    403: 'No tienes permiso para esta acción'
  }[error.status] ?? 'No se pudo completar la acción';

  return (
    <div className="ti-badbox" style={{ textAlign: 'left' }}>
      <b>{etiqueta}</b>
      <div style={{ marginTop: 4 }}>{error.message}</div>
      {error.incumplimientos?.length > 0 && (
        <ul>{error.incumplimientos.map((item, index) => (
          <li key={`${item.detalle_id}-${item.falta}-${index}`}>
            {ETIQUETA_EQUIPO[item.tipo_equipo] || item.tipo_equipo}:
            {' '}{item.falta === 'CHECKLIST'
              ? `${item.descripcion}: falta un motivo`
              : item.falta === 'EVIDENCIA' ? 'falta una fotografía' : 'faltan observaciones'}
          </li>
        ))}</ul>
      )}
      {onCerrar && (
        <button
          type="button"
          className="ti-btn small"
          style={{ marginTop: 8 }}
          onClick={onCerrar}
        >
          Entendido
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CABECERA EDITABLE
// ---------------------------------------------------------------------------
// Campos admitidos por PATCH /:otId, exactamente: minutos y observaciones.
// El estado, las fechas y el usuario los fija el servidor.
//
// F5.1 · tecnico_id SALIO de la cabecera editable. El técnico ejecutor ya no se escribe a
// mano en ningún momento: lo resuelve el backend al cerrar, a partir del usuario que cierra
// o de una selección explícita si ese usuario no es de TI. El endpoint lo rechaza con 400.
const FormularioCabecera = ({ orden, guardando, onGuardar }) => {
  const [minutos, setMinutos] = useState(comoTexto(orden.minutos));
  const [observaciones, setObservaciones] = useState(comoTexto(orden.observaciones));
  const [local, setLocal] = useState(null);


  // Solo las claves que CAMBIARON. Un cuerpo vacío es un 400 en este endpoint, así que si
  // no hay delta no se llama: es también lo que hace el backend por su cuenta.
  const delta = () => {
    const d = {};

    const minutosNuevo = minutos.trim() === '' ? null : minutos.trim();
    const minutosViejo = orden.minutos === null ? null : String(orden.minutos);

    if (minutosNuevo !== minutosViejo) d.minutos = minutosNuevo;

    const obsNueva = observaciones.trim() === '' ? null : observaciones.trim();

    if (obsNueva !== (orden.observaciones ?? null)) d.observaciones = obsNueva;


    return d;
  };

  const cambios = Object.keys(delta());

  return (
    <div className="ti-section">
      <div className="ti-section-h">
        <b>Editar la cabecera</b>
        <span className="ti-right ti-smalltxt">
          {cambios.length
            ? `${cambios.length} cambio(s) sin guardar`
            : 'sin cambios'}
        </span>
      </div>

      <div className="ti-section-b">
        <div className="ti-grid g2">
          <div className="ti-field">
            <label>Técnico ejecutor</label>
            <div className="ti-readonly">
              {orden.tecnico
                ? (orden.tecnico.nombre ?? `personal #${orden.tecnico.id}`)
                : 'se asigna al cerrar la orden'}
            </div>
            <div className="ti-smalltxt">
              Selecciona al técnico responsable al cerrar la orden.
            </div>
          </div>

          <div className="ti-field">
            <label htmlFor="ti-ot-minutos">Minutos</label>
            <input
              id="ti-ot-minutos"
              value={minutos}
              inputMode="numeric"
              placeholder="vacío = sin registrar"
              onChange={e => setMinutos(e.target.value)}
              disabled={guardando}
            />
            <div className="ti-smalltxt">
              Ingresa la duración del trabajo en minutos. Este campo es opcional.
            </div>
          </div>
        </div>

        <div className="ti-field">
          <label htmlFor="ti-ot-obs">Observaciones de la orden</label>
          <textarea
            id="ti-ot-obs"
            rows={3}
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            disabled={guardando}
          />
        </div>

<Aviso error={local} onCerrar={() => setLocal(null)} />

        <div className="ti-bar" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className="ti-btn primary"
            disabled={guardando || cambios.length === 0}
            onClick={async () => {
              setLocal(null);
              const e = await onGuardar(delta());
              if (e) setLocal(e);
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar cabecera'}
          </button>
          <button
            type="button"
            className="ti-btn"
            disabled={guardando || cambios.length === 0}
            onClick={() => {
              setMinutos(comoTexto(orden.minutos));
              setObservaciones(comoTexto(orden.observaciones));
              setLocal(null);
            }}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// RESULTADO DE UN EQUIPO
// ---------------------------------------------------------------------------
// Campos admitidos por PATCH /:otId/detalles/:detalleId, exactamente: estado,
// nivel_completado y observaciones. tipo_equipo y nivel_programado pertenecen al
// equipo previsto de la visita y son inmutables.
//
// El backend valida la combinación FUSIONADA con lo almacenado, en resolverResultado, y
// responde 409 con el motivo. Aquí NO se reimplementa esa validación: se anticipa en una
// línea y se deja que su mensaje sea el que manda.
//
// Lo único que sí se cumple es el CONTRATO DE PAYLOAD: PENDIENTE y NO_APLICA exigen
// "nivel_completado": null de forma EXPLÍCITA, porque el backend no infiere un campo
// ausente. Por eso, al elegir esos dos estados, la clave viaja igualmente.
const FormularioDetalle = ({ detalle, estados, guardando, onGuardar }) => {
  const [estado, setEstado] = useState(detalle.estado);
  const [nivel, setNivel] = useState(comoTexto(detalle.nivel_completado));
  const [observaciones, setObservaciones] = useState(comoTexto(detalle.observaciones));
  const [local, setLocal] = useState(null);
  const [enlaceVideo, setEnlaceVideo] = useState(comoTexto(detalle.enlace_video));

  const exigencia = exigenciaDeResultado(detalle, estado);
  const nivelBloqueado = exigencia.nivelFijo;

  // Con el estado fijado por el contrato, el nivel no es libre: PENDIENTE/NO_APLICA van sin
  // nivel y COMPLETADO va con el previsto. Se refleja en el control, y el motivo se lee.
  const nivelEfectivo = nivelBloqueado
    ? comoTexto(exigencia.nivelEsperado)
    : nivel;

  const delta = () => {
    const d = {};

    if (estado !== detalle.estado) d.estado = estado;

    const nivelNuevo = nivelEfectivo.trim() === '' ? null : nivelEfectivo.trim();

    // Si el estado cambia, nivel_completado viaja SIEMPRE: el backend exige el null
    // explícito y no deduce nada de su ausencia.
    if (nivelNuevo !== detalle.nivel_completado || d.estado !== undefined) {
      d.nivel_completado = nivelNuevo;
    }

    const obsNueva = observaciones.trim() === '' ? null : observaciones.trim();

    if (obsNueva !== (detalle.observaciones ?? null)) d.observaciones = obsNueva;


    if (detalle.tipo_equipo === 'CAMARAS') {
      const enlace = enlaceVideo.trim() || null;
      if (enlace !== (detalle.enlace_video ?? null)) d.enlace_video = enlace;
    }
    return d;
  };

  const cambios = Object.keys(delta());

  return (
    <>
      <div className="ti-grid g2" style={{ marginTop: 10 }}>
        <div className="ti-field">
          <label htmlFor={`ti-d-estado-${detalle.id}`}>Resultado</label>
          <select
            id={`ti-d-estado-${detalle.id}`}
            value={estado}
            onChange={e => { setEstado(e.target.value); setLocal(null); }}
            disabled={guardando}
          >
            {estados.map(x => (
              <option key={x} value={x}>{etiquetaEstado(x)}</option>
            ))}
          </select>
        </div>

        <div className="ti-field">
          <label htmlFor={`ti-d-nivel-${detalle.id}`}>Nivel completado</label>
          <select
            id={`ti-d-nivel-${detalle.id}`}
            value={nivelEfectivo}
            onChange={e => setNivel(e.target.value)}
            disabled={guardando || nivelBloqueado}
          >
            <option value="">— ninguno —</option>
            {NIVELES.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {exigencia.texto && (
        <div className="ti-smalltxt" style={{ marginTop: -4 }}>
          {exigencia.texto}
        </div>
      )}

      <ChecklistEquipo detalle={detalle} />

      {detalle.tipo_equipo === 'CAMARAS' && <div className="ti-field" style={{ marginTop: 10 }}>
        <label htmlFor={`ti-d-video-${detalle.id}`}>Enlace del video</label>
        <input id={`ti-d-video-${detalle.id}`} type="url" maxLength={2048} value={enlaceVideo}
          placeholder="https://..." disabled={guardando}
          onChange={e => { setEnlaceVideo(e.target.value); setLocal(null); }} />
        <div className="ti-smalltxt">Opcional. Comprueba que las personas autorizadas puedan abrir el enlace.</div>
      </div>}

      <div className="ti-field" style={{ marginTop: 10 }}>
        <label htmlFor={`ti-d-obs-${detalle.id}`}>Observaciones del equipo</label>
        <textarea
          id={`ti-d-obs-${detalle.id}`}
          rows={2}
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          disabled={guardando}
        />
      </div>

<Aviso error={local} onCerrar={() => setLocal(null)} />

      <div className="ti-bar" style={{ marginBottom: 0 }}>
        <button
          type="button"
          className="ti-btn primary"
          disabled={guardando || cambios.length === 0}
          onClick={async () => {
            setLocal(null);
            if (detalle.tipo_equipo === 'CAMARAS' && enlaceVideo.trim()) {
              try {
                const url = new URL(enlaceVideo.trim());
                if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
              } catch {
                setLocal({ status: 400, message: 'Ingresa un enlace válido que comience con https:// o http://.' });
                return;
              }
            }
            const e = await onGuardar(detalle.id, delta());
            if (e) setLocal(e);
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar resultado'}
        </button>
        <button
          type="button"
          className="ti-btn"
          disabled={guardando || cambios.length === 0}
          onClick={() => {
            setEstado(detalle.estado);
            setNivel(comoTexto(detalle.nivel_completado));
            setObservaciones(comoTexto(detalle.observaciones));
            setEnlaceVideo(comoTexto(detalle.enlace_video));
            setLocal(null);
          }}
        >
          Descartar
        </button>
        <span className="ti-smalltxt">
          {cambios.length ? 'Hay cambios sin guardar' : 'sin cambios'}
        </span>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// EL TECNICO DEL CIERRE · F5.1
// ---------------------------------------------------------------------------
// TRES PRESENTACIONES, y cual aplica NO se decide aqui:
//
//   la OT ya tiene tecnico           -> solo lectura, con el nombre que publica la orden.
//                                       Ni se pide el catalogo: no hay nada que elegir.
//   el backend dice que puede        -> se muestra su nombre y "Asignacion automatica".
//   autoasignarse                       Sin selector.
//   el backend dice que no           -> selector OBLIGATORIO con los tecnicos elegibles.
//
// La decision llega en `solicitante.puede_autoasignarse` de GET /tecnicos. Aqui no se
// compara ningun rol, no se lee el token y no se deduce nada: se pinta lo que diga.
//
// El motivo de por que no puede autoasignarse tambien lo redacta el backend.
const TecnicoDelCierre = ({
  orden,
  valor,
  onCambiar,
  onExigir,
  deshabilitado
}) => {
  const yaTiene = Boolean(orden.tecnico);

  const [catalogo, setCatalogo] = useState(null);
  const [cargando, setCargando] = useState(!yaTiene);
  const [fallo, setFallo] = useState(null);

  useEffect(() => {
    if (yaTiene) return undefined;

    let vivo = true;

    const pedir = async () => {
      try {
        const respuesta = await apiTiPr01.listarTecnicosTi();

        if (!vivo) return;

        setCatalogo(respuesta);
        setFallo(null);

        const libres = respuesta.tecnicos ?? [];
        const exige = respuesta.solicitante?.puede_autoasignarse !== true;

        // Es el BACKEND el que dice si hay que seleccionar: el modal solo lo propaga para
        // poder inhabilitar su botón mientras falte.
        onExigir(exige);

        // Un solo elegible y hay que elegir: se preselecciona, porque ese clic no decide
        // nada. Con varios no se preselecciona ninguno a propósito.
        if (exige && libres.length === 1) {
          onCambiar(String(libres[0].id));
        }
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
  }, [yaTiene, onCambiar, onExigir]);

  // ------------------------------------------------------------------ CASO 3
  if (yaTiene) {
    return (
      <div className="ti-field">
        <label>Técnico</label>
        <div className="ti-readonly">
          {orden.tecnico.nombre ?? `personal #${orden.tecnico.id}`}
        </div>
        <div className="ti-smalltxt">
          El técnico asignado se conservará al cerrar la orden.
        </div>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="ti-field">
        <label>Técnico</label>
        <div className="ti-smalltxt">
          <span className="ti-spinner" /> Resolviendo el técnico…
        </div>
      </div>
    );
  }

  if (fallo) {
    return (
      <div className="ti-field">
        <label>Técnico</label>
        <div className="ti-badbox">{fallo}</div>
      </div>
    );
  }

  const solicitante = catalogo?.solicitante ?? {};
  const elegibles = catalogo?.tecnicos ?? [];

  // ------------------------------------------------------------------ CASO 1
  if (solicitante.puede_autoasignarse) {
    return (
      <div className="ti-field">
        <label>Técnico</label>
        <div className="ti-readonly">{solicitante.nombre}</div>
        <div className="ti-smalltxt">
          Figurarás como técnico responsable del mantenimiento.
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ CASO 2
  return (
    <div className="ti-field">
      <label htmlFor="ti-ot-tecnico-cierre">
        Técnico que realizó el mantenimiento <b>*</b>
      </label>

      {elegibles.length === 0 ? (
        <div className="ti-badbox">
          No hay técnicos disponibles. Solicita al administrador que habilite un técnico para cerrar la orden.
        </div>
      ) : (
        <select
          id="ti-ot-tecnico-cierre"
          value={valor}
          disabled={deshabilitado}
          onChange={event => onCambiar(event.target.value)}
        >
          <option value="">Seleccionar técnico TI…</option>
          {elegibles.map(t => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
      )}

      <div className="ti-smalltxt">
        Selecciona al técnico que realizó el mantenimiento.
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CERRAR · F2.3
// ---------------------------------------------------------------------------
// POST /:otId/cerrar admite exactamente fecha_ejecucion, minutos y observaciones, y los
// TRES son opcionales: una visita que no se ejecutó se cierra sin cuerpo. Lo que NO es
// opcional es entender qué hace: la función de la base deriva el resultado de la visita y
// mueve los ciclos, en la misma transacción, y no se puede repetir.
//
// Aquí no se decide nada de eso. El formulario recoge los tres campos, valida lo justo
// para no mandar basura -el formato de la fecha y que los minutos sean un entero- y deja
// que las siete excepciones de cerrar_orden_trabajo() hablen por sí mismas.
const ModalCerrar = ({ orden, alcance, trabajando, onCerrarModal, onConfirmar }) => {
  const [fecha, setFecha] = useState('');
  const [minutos, setMinutos] = useState(comoTexto(orden.minutos));
  const [observaciones, setObservaciones] = useState(comoTexto(orden.observaciones));
  const [error, setError] = useState(null);

  // F5.1 · el técnico SOLICITADO. Solo se usa en el flujo excepcional; TecnicoDelCierre
  // decide si hay que pedirlo y marca `exigeSeleccion` cuando es obligatorio.
  const [tecnico, setTecnico] = useState('');
  const [exigeSeleccion, setExigeSeleccion] = useState(false);

  const detalles = orden.detalles?.items ?? [];
  const pendientes = detalles.filter(d => d.estado === 'PENDIENTE');

  // Validación de FORMULARIO, no de negocio: el backend exige AAAA-MM-DD y un entero
  // positivo, y mandarle otra cosa solo gasta un viaje.
  const fechaMal = fecha !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fecha);
  const minutosMal = minutos.trim() !== '' && !/^[1-9]\d*$/.test(minutos.trim());

  const cuerpo = () => {
    const d = {};

    if (fecha !== '') d.fecha_ejecucion = fecha;
    if (minutos.trim() !== '') d.minutos = minutos.trim();

    const obs = observaciones.trim();

    if (obs !== (orden.observaciones ?? '')) d.observaciones = obs === '' ? null : obs;

    // F5.1 · solo viaja cuando de verdad hay una selección. Si quien cierra es de TI el
    // backend lo ignora, y si la orden ya tiene técnico lo conserva: mandarlo igualmente
    // sería ruido.
    if (tecnico !== '') d.tecnico_id = tecnico;

    return d;
  };

  // F5.1 · falta la selección obligatoria del flujo excepcional.
  const faltaTecnico = exigeSeleccion && tecnico === '';

  return (
    <>
      <div className="ti-modal-overlay" onClick={trabajando ? undefined : onCerrarModal} />
      <div
        className="ti-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Cerrar la orden de trabajo"
      >
        <div className="ti-modal-h">Cerrar la orden de trabajo #{orden.id}</div>

        <div className="ti-modal-b">
          <div className="ti-warnbox">
            Al cerrar se registra el <b>resultado de la visita</b> y se actualizan los{' '}
            <b>ciclos de mantenimiento</b> de los equipos completados.{' '}
            <b>No se puede repetir ni deshacer</b>: una visita ya ejecutada no se reabre.
          </div>

          <table className="ti-table" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 150 }}>Unidad</th>
                <td className="ti-mono">{orden.unidad?.placa ?? '—'}</td>
              </tr>
              <tr>
                <th>Quincena efectiva</th>
                <td>
                  {quincenaDe(orden.visita?.quincena_efectiva)?.labelLargo
                    ?? orden.visita?.quincena_efectiva ?? '—'}
                </td>
              </tr>
              <tr>
                <th>Alcance</th>
                <td><Alcance alcance={alcance} /></td>
              </tr>
              <tr>
                <th>Equipos</th>
                <td>
                  {detalles.length} previsto(s)
                  {pendientes.length > 0 && (
                    <>
                      {' · '}
                      <span className="ti-chip amber">
                        {pendientes.length} sin resultado
                      </span>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {pendientes.length > 0 && (
            <div className="ti-badbox">
              Hay <b>{pendientes.length}</b> equipo(s) en PENDIENTE:{' '}
              {pendientes.map(d => ETIQUETA_EQUIPO[d.tipo_equipo] ?? d.tipo_equipo)
                .join(', ')}. Registra el resultado de cada equipo antes de cerrar la orden.
            </div>
          )}

          <div className="ti-grid g2">
            <div className="ti-field">
              <label htmlFor="ti-c-fecha">Fecha de ejecución</label>
              <input
                id="ti-c-fecha"
                type="date"
                value={fecha}
                onChange={e => { setFecha(e.target.value); setError(null); }}
                disabled={trabajando}
              />
              <div className={fechaMal ? 'ti-smalltxt ti-error' : 'ti-smalltxt'}>
                {fechaMal
                  ? 'Formato AAAA-MM-DD'
                  : 'Indica la fecha en que se realizó el mantenimiento. Es obligatoria si hubo trabajo ejecutado.'}
              </div>
            </div>

            <div className="ti-field">
              <label htmlFor="ti-c-min">Minutos</label>
              <input
                id="ti-c-min"
                value={minutos}
                inputMode="numeric"
                placeholder="opcional"
                onChange={e => { setMinutos(e.target.value); setError(null); }}
                disabled={trabajando}
              />
              {minutosMal && (
                <div className="ti-smalltxt ti-error">Ingresa minutos mayores que cero o deja el campo vacío.</div>
              )}
            </div>
          </div>

          <TecnicoDelCierre
            orden={orden}
            valor={tecnico}
            deshabilitado={trabajando}
            onCambiar={valorNuevo => { setTecnico(valorNuevo); setError(null); }}
            onExigir={setExigeSeleccion}
          />

          <div className="ti-field">
            <label htmlFor="ti-c-obs">Observaciones del cierre</label>
            <textarea
              id="ti-c-obs"
              rows={3}
              value={observaciones}
              onChange={e => { setObservaciones(e.target.value); setError(null); }}
              disabled={trabajando}
            />
          </div>

          <div className="ti-smalltxt">
            Revisa los resultados de todos los equipos antes de cerrar la orden.
          </div>

          <Aviso error={error} onCerrar={() => setError(null)} />
        </div>

        <div className="ti-modal-f">
          <button
            type="button"
            className="ti-btn"
            onClick={onCerrarModal}
            disabled={trabajando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ti-btn good"
            disabled={trabajando || fechaMal || minutosMal || faltaTecnico}
            onClick={async () => {
              setError(null);
              const e = await onConfirmar(cuerpo());
              if (e) setError(e);
            }}
          >
            {trabajando ? 'Cerrando…' : 'Cerrar la orden'}
          </button>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// ANULAR · F2.3
// ---------------------------------------------------------------------------
// PATCH /:otId/anular admite UNICAMENTE motivo_anulacion, y es obligatorio: texto no
// vacío tras recortar. No es un borrado: la orden permanece con todos sus detalles,
// porque su existencia es lo que vuelve histórico el alcance de la visita.
const ModalAnular = ({ orden, trabajando, onCerrarModal, onConfirmar }) => {
  const [motivo, setMotivo] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState(null);

  const vacio = motivo.trim() === '';

  return (
    <>
      <div className="ti-modal-overlay" onClick={trabajando ? undefined : onCerrarModal} />
      <div
        className="ti-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Anular la orden de trabajo"
      >
        <div className="ti-modal-h">Anular la orden de trabajo #{orden.id}</div>

        <div className="ti-modal-b">
          <div className="ti-badbox">
            Anular <b>no borra</b> la orden. Permanece con su motivo y con sus{' '}
            {orden.detalles?.total ?? 0} detalle(s) como historial, y queda{' '}
            <b>ANULADA</b> para siempre: no se reabre. Lo que sí libera es la visita, que
            vuelve a admitir programar, reprogramar, cancelar o una orden nueva.
          </div>

          <div className="ti-field">
            <label htmlFor="ti-a-motivo">Motivo de la anulación</label>
            <textarea
              id="ti-a-motivo"
              rows={3}
              value={motivo}
              placeholder="Por qué se desiste de esta orden"
              onChange={e => { setMotivo(e.target.value); setError(null); }}
              disabled={trabajando}
            />
            <div className={vacio ? 'ti-smalltxt ti-error' : 'ti-smalltxt'}>
              {vacio
                ? 'Escribe el motivo de la anulación.'
                : 'Queda registrado en la orden y en su historial de movimientos.'}
            </div>
          </div>

          <label className="ti-chk">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={e => setConfirmado(e.target.checked)}
              disabled={trabajando}
            />
            <span>
              Entiendo que la orden queda ANULADA de forma permanente y que no se reabre.
            </span>
          </label>

          <Aviso error={error} onCerrar={() => setError(null)} />
        </div>

        <div className="ti-modal-f">
          <button
            type="button"
            className="ti-btn"
            onClick={onCerrarModal}
            disabled={trabajando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ti-btn danger"
            disabled={trabajando || vacio || !confirmado}
            onClick={async () => {
              setError(null);
              const e = await onConfirmar(motivo.trim());
              if (e) setError(e);
            }}
          >
            {trabajando ? 'Anulando…' : 'Anular la orden'}
          </button>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DETALLE DE UNA ORDEN
// ---------------------------------------------------------------------------
// Solo lectura. Todo lo que se pinta sale de la respuesta del backend; lo que el backend
// no publica se dice que no lo publica, no se rellena.
const DetalleOrden = ({
  programa, programaId, orden, visita, onVolver, onVerEnPrograma,
  estadosDetalle, guardando, onGuardarCabecera, onGuardarDetalle,
  trabajando, resultadoCierre, onPedirCierre, onPedirAnulacion
}) => {
  const alcance = alcanceDeOrden(orden);
  const qEfectiva = quincenaDe(orden.visita?.quincena_efectiva);
  const acciones = orden.acciones ?? {};
  const detalles = orden.detalles?.items ?? [];
  // La autoridad sobre si se puede editar es el backend, no el estado leído aquí.
  const editable = Boolean(acciones.puede_editar);
  const permitidas = [
    ['Editar la cabecera', acciones.puede_editar],
    ['Cerrar', acciones.puede_cerrar],
    ['Anular', acciones.puede_anular]
  ].filter(([, puede]) => puede).map(([nombre]) => nombre);

  return (
    <>
      <div className="ti-bar">
        <button type="button" className="ti-btn" onClick={onVolver}>
          ← Volver a órdenes
        </button>
        <Chip estado={orden.estado} />
        <span className="ti-mono ti-smalltxt">
          {codigoOrden(orden)}
        </span>
        <ConstanciaOrden programa={programa} orden={orden} bloqueado={guardando} />
        {onVerEnPrograma && (
          <button type="button" className="ti-btn small" onClick={onVerEnPrograma}>
            Ver en el programa
          </button>
        )}
      </div>

      {orden.estado === 'ANULADA' && (
        <div className="ti-badbox">
          <b>Orden anulada.</b> Se conserva con todos sus detalles: su existencia es lo que
          vuelve histórico el alcance de la visita.
          {orden.motivo_anulacion && <> Motivo: {orden.motivo_anulacion}</>}
        </div>
      )}

      {alcance.mezcla && (
        <div className="ti-badbox">
          Esta orden tiene <b>más de un nivel regular</b> ({alcance.mezcla.join(' y ')}).
          El programa exige un único nivel común para CÁMARAS, COPILOTO y RADIO_BASE.
        </div>
      )}

      <div className="ti-grid g2">
        {/* CABECERA */}
        <div className="ti-card">
          <h3>Orden de trabajo</h3>
          <div className="ti-pad">
            <table className="ti-table">
              <tbody>
                <tr>
                  <th style={{ width: 150 }}>Unidad</th>
                  <td className="ti-mono">{orden.unidad?.placa ?? '—'}</td>
                </tr>
                <tr>
                  <th>Estado</th>
                  <td><Chip estado={orden.estado} /></td>
                </tr>
                <tr>
                  <th>Apertura</th>
                  <td className="ti-mono" title={orden.fecha_apertura ?? ''}>
                    {fechaCorta(orden.fecha_apertura)}
                  </td>
                </tr>
                <tr>
                  <th>Cierre</th>
                  <td className="ti-mono" title={orden.fecha_cierre ?? ''}>
                    {fechaCorta(orden.fecha_cierre)}
                  </td>
                </tr>
                <tr>
                  <th>Técnico</th>
                  <td>
                    {orden.tecnico
                      ? (orden.tecnico.nombre
                        ?? <span className="ti-mono">personal #{orden.tecnico.id}</span>)
                      : <span className="ti-smalltxt">Sin técnico asignado</span>}
                  </td>
                </tr>
                <tr>
                  <th>Minutos</th>
                  <td className="ti-mono">
                    {orden.minutos ?? <span className="ti-smalltxt">—</span>}
                  </td>
                </tr>
                <tr>
                  <th>Abierta por</th>
                  <td className="ti-mono">usuarios #{orden.abierta_por_id ?? '—'}</td>
                </tr>
                {orden.cerrada_por_id && (
                  <tr>
                    <th>Cerrada por</th>
                    <td>
                      {orden.cerrada_por?.nombre
                        ?? orden.cerrada_por?.username
                        ?? `usuarios #${orden.cerrada_por_id}`}
                    </td>
                  </tr>
                )}
                <tr>
                  <th>Observaciones</th>
                  <td>
                    {orden.observaciones
                      || <span className="ti-smalltxt">Sin observaciones</span>}
                  </td>
                </tr>
              </tbody>
            </table>

            {editable ? (
              <FormularioCabecera
                orden={orden}
                guardando={guardando}
                onGuardar={onGuardarCabecera}
              />
            ) : (
              <div className="ti-warnbox" style={{ marginTop: 11 }}>
                Solo lectura. {acciones.motivo ?? 'Esta orden no permite modificaciones.'}
              </div>
            )}
          </div>
        </div>

        {/* PROGRAMACIÓN */}
        <div className="ti-card">
          <h3>Programación</h3>
          <div className="ti-pad">
            <table className="ti-table">
              <tbody>
                <tr>
                  <th style={{ width: 150 }}>Visita</th>
                  <td className="ti-mono">
                    Visita #{orden.visita?.id ?? orden.programacion_id}
                  </td>
                </tr>
                <tr>
                  <th>Quincena efectiva</th>
                  <td>
                    {qEfectiva?.labelLargo ?? '—'}
                    {visita?.quincena_reprogramada && (
                      <>
                        {' '}
                        <span className="ti-chip amber">
                          reprogramada desde{' '}
                          {quincenaDe(visita.quincena_programada)?.label}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
                {visita && (
                  <tr>
                    <th>Estado de la visita</th>
                    <td><Chip estado={visita.estado} /></td>
                  </tr>
                )}
                <tr>
                  <th>Regular</th>
                  <td>
                    {alcance.nivelRegular ? (
                      <>
                        <Nivel nivel={alcance.nivelRegular} />{' '}
                        <span className="ti-smalltxt">
                          para los {alcance.regulares.length} equipos regulares
                        </span>
                      </>
                    ) : (
                      <span className="ti-smalltxt">No corresponde en esta quincena</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Anualidades</th>
                  <td>
                    {alcance.anuales.length
                      ? alcance.anuales.map(d => (
                        <span
                          key={d.id}
                          className="ti-chip purple"
                          style={{ marginRight: 5 }}
                        >
                          {d.tipo_equipo} {d.nivel_programado}
                        </span>
                      ))
                      : <span className="ti-smalltxt">—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="ti-smalltxt" style={{ marginTop: 9 }}>
              GPS y ADAS son <b>adicionales</b>: no elevan el nivel regular de la visita.
            </div>
          </div>
        </div>
      </div>

      {/* EQUIPOS · un detalle por equipo previsto */}
      <ChecklistOrden key={`checklist-${orden.id}-${orden.estado}`} programaId={programaId} orden={orden} bloqueado={guardando || trabajando}>
      <div className="ti-card" style={{ marginTop: 12 }}>
        <h3>
          Equipos de la orden
          <span className="ti-right ti-smalltxt">
            {orden.detalles?.total ?? detalles.length} equipo(s)
          </span>
        </h3>

        <div className="ti-pad">
          {detalles.length === 0 ? (
            <div className="ti-empty">
              No se encontraron equipos en esta orden. Vuelve a cargarla o contacta al área de TI.
            </div>
          ) : (
            [...detalles]
              .sort((a, b) => a.tipo_equipo.localeCompare(b.tipo_equipo))
              .map(d => {
                const clase = claseFamilia(d.tipo_equipo);
                const anual = clase === 'ANUAL';

                return (
                  <div className="ti-section" key={d.id}>
                    <div className="ti-section-h">
                      <b>{ETIQUETA_EQUIPO[d.tipo_equipo] ?? d.tipo_equipo}</b>
                      <Nivel nivel={d.nivel_programado} anual={anual} />
                      <Chip estado={d.estado} />
                      {d.nivel_completado && d.nivel_completado !== d.nivel_programado && (
                        <span className="ti-chip amber">
                          completó hasta {d.nivel_completado}
                        </span>
                      )}
                      <span className="ti-right ti-smalltxt">
                        {clase === 'HISTORICA' ? 'HISTÓRICA' : clase} · detalle #{d.id}
                      </span>
                    </div>

                    <div className="ti-section-b">
                      {editable ? (
                        // La clave fuerza un remontaje cuando el backend devuelve el
                        // detalle actualizado: el borrador local parte siempre del valor
                        // persistido, nunca de lo que el usuario tecleó antes de guardar.
                        <FormularioDetalle
                          key={`${d.id}-${d.updated_at ?? ''}`}
                          detalle={d}
                          estados={estadosDetalle}
                          guardando={guardando}
                          onGuardar={onGuardarDetalle}
                        />
                      ) : (
                        <>
                          <ChecklistEquipo detalle={d} />
                          {d.tipo_equipo === 'CAMARAS' && <div style={{ margin: '10px 0' }}>
                            <b>Enlace del video: </b>
                            {d.enlace_video && /^https?:\/\//i.test(d.enlace_video)
                              ? <a href={d.enlace_video} target="_blank" rel="noopener noreferrer">Abrir video</a>
                              : <span className="ti-smalltxt">Sin enlace registrado</span>}
                          </div>}
                          {d.observaciones
                            ? <p style={{ margin: 0 }}>{d.observaciones}</p>
                            : (
                              <p className="ti-smalltxt" style={{ margin: 0 }}>
                                Sin observaciones del técnico.
                              </p>
                            )}

                        </>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      </ChecklistOrden>
      <EvidenciasOrden programaId={programaId} orden={orden} bloqueado={guardando} />

      <AuditoriaOrden key={orden.id} programaId={programaId} orden={orden} />

      {/* ACCIONES · las tres capacidades que publica el backend, ya conectadas.
          La condición de cada botón es su propio flag: nunca un estado deducido aquí. */}
      <div className="ti-card" style={{ marginTop: 12 }}>
        <h3>
          Acciones
          <span className="ti-right ti-smalltxt">
            {permitidas.length
              ? `Disponibles: ${permitidas.join(' · ')}`
              : 'No hay acciones disponibles'}
          </span>
        </h3>

        <div className="ti-pad">
          {resultadoCierre && (
            <div className="ti-okbox" style={{ textAlign: 'left' }}>
              <b>Orden cerrada.</b> La visita queda{' '}
              <b>{etiquetaEstado(resultadoCierre.estado_programacion)}</b>
              {resultadoCierre.visita_resultado?.fecha_ejecucion && (
                <> · Fecha de ejecución {resultadoCierre.visita_resultado.fecha_ejecucion}</>
              )}
              {' · '}
              <b>{resultadoCierre.ciclos_afectados}</b> ciclo(s) actualizado(s).
            </div>
          )}

          {orden.ya_estaba_anulada && (
            <div className="ti-warnbox">
              Esta orden <b>ya estaba anulada</b>. No se realizaron nuevos cambios.
            </div>
          )}

          <div className="ti-bar" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className="ti-btn good"
              disabled={trabajando || !acciones.puede_cerrar}
              title={
                acciones.puede_cerrar
                  ? 'Registrar el cierre de la orden'
                  : acciones.motivo ?? 'Esta orden no se puede cerrar'
              }
              onClick={onPedirCierre}
            >
              Cerrar OT
            </button>

            <button
              type="button"
              className="ti-btn danger"
              disabled={trabajando || !acciones.puede_anular}
              title={
                acciones.puede_anular
                  ? 'Conserva la orden con su motivo; no la borra'
                  : acciones.motivo ?? 'Esta orden no se puede anular'
              }
              onClick={onPedirAnulacion}
            >
              Anular OT
            </button>

            <span className="ti-smalltxt">
              Editar la cabecera y el resultado por equipo están arriba, en su sección.
            </span>
          </div>

          {/* El backend explica POR QUÉ veta cada acción: se muestra, no se oculta. */}
          {!acciones.puede_cerrar && !acciones.puede_anular && acciones.motivo && (
            <div className="ti-smalltxt" style={{ marginTop: 10 }}>
              <b>Motivo:</b> {acciones.motivo}
            </div>
          )}

          <div className="ti-smalltxt" style={{ marginTop: 10 }}>
            Si abriste esta orden por error, puedes anularla indicando el motivo.
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// PANTALLA
// ---------------------------------------------------------------------------
export function OrdenesTiPr01({
  destino = null,
  onDestinoConsumido,
  onVolverAPrograma
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [programa, setPrograma] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [estadosOt, setEstadosOt] = useState(ESTADOS_ORDEN);
  // Los catálogos los publica el LISTADO (`estados` y `estados_detalle`); el GET del
  // detalle no los trae. Se capturan de la respuesta y las constantes de dominio.js quedan
  // solo como respaldo hasta que llegue la primera.
  const [estadosDetalle, setEstadosDetalle] = useState(ESTADOS_DETALLE_ORDEN);
  // Visitas cuyo histórico de OT no se pudo leer: la lista estaría incompleta y hay que
  // decirlo, no disimularlo.
  const [fallidas, setFallidas] = useState(0);
  const [truncado, setTruncado] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [recarga, setRecarga] = useState(0);

  const [abiertaId, setAbiertaId] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // F2.3 · qué modal está abierto, y el resultado derivado del último cierre, que el
  // backend devuelve junto a la orden y merece quedarse en pantalla.
  const [modal, setModal] = useState(null);
  const [resultadoCierre, setResultadoCierre] = useState(null);

  const recargar = () => {
    setCargando(true);
    setRecarga(n => n + 1);
  };

  // ------------------------------------------------------------------ carga
  // El primer setState ocurre DESPUÉS del await, con `vivo` para descartar respuestas
  // obsoletas. Mismo patrón que F1: si no, react-hooks/set-state-in-effect falla el lint.
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const datos = await cargarProgramaConOrdenes();

        if (!vivo) return;

        setError(null);
        setPrograma(datos.programa);
        setVisitas(datos.visitas);
        setOrdenes(datos.ordenes);
        setFallidas(datos.fallidas);
        setTruncado(datos.truncado);

        if (datos.estadosOt) setEstadosOt(datos.estadosOt);
        if (datos.estadosDetalle) setEstadosDetalle(datos.estadosDetalle);
      } catch (e) {
        if (!vivo) return;
        setError(e.message || 'No se pudieron cargar las órdenes de trabajo');
        setOrdenes([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [recarga]);

  // ------------------------------------------------------------------ detalle
  // El detalle NO se saca de la lista: se relee por su ruta, que es la respuesta
  // autoritativa de esa orden. Así un detalle abierto tras una creación o un refresco
  // muestra lo que la base tiene, no lo que la lista recordaba.
  const abrirOrden = useCallback((programacionId, otId) => {
    setAbiertaId({ programacionId, otId });
  }, []);

  // Qué orden tiene que mostrar el detalle: la que el usuario pulsó, o la que llegó por
  // navegación desde Programa. Es un DERIVADO, no una copia en estado: copiar `destino` a
  // estado obligaría a un setState en el cuerpo de un efecto, que es justo lo que
  // react-hooks/set-state-in-effect prohíbe.
  const objetivo = useMemo(() => {
    if (abiertaId) return abiertaId;

    if (destino?.programacionId && destino?.otId) {
      return {
        programacionId: destino.programacionId,
        otId: destino.otId
      };
    }

    return null;
  }, [abiertaId, destino]);

  // El detalle NO se saca de la lista: se relee por su ruta, que es la respuesta
  // autoritativa de esa orden. Así un detalle abierto justo tras una creación muestra lo
  // que la base tiene, no lo que la lista recordaba.
  useEffect(() => {
    if (!programa || !objetivo) return undefined;

    let vivo = true;

    (async () => {
      try {
        const fresca = await apiTiPr01.obtenerOrdenTrabajo(
          programa.id,
          objetivo.programacionId,
          objetivo.otId
        );

        if (!vivo) return;

        setAbierta(fresca);
      } catch (e) {
        if (!vivo) return;
        toast.error(e.message);
        setAbiertaId(null);
        setAbierta(null);
      }
    })();

    return () => { vivo = false; };
  }, [programa, objetivo]);

  // Navegación entrante sin id de orden: se llega desde una visita que ya tiene órdenes,
  // y cuál mostrar lo sabe su listado. Manda la no anulada; si todas están anuladas se
  // abre la más reciente, que es la primera del listado -el backend ordena por
  // fecha_apertura DESC, id DESC-. El caso con otId no pasa por aquí: lo resuelve
  // `objetivo` sin una petición extra.
  useEffect(() => {
    if (!programa || !destino || destino.otId) return undefined;

    let vivo = true;

    (async () => {
      try {
        const datos = await apiTiPr01.listarOrdenesTrabajo(
          programa.id,
          destino.programacionId
        );

        if (!vivo) return;

        const todas = datos.ordenes_trabajo ?? [];
        const elegida = todas.find(o => o.activa) ?? todas[0] ?? null;

        if (elegida) {
          setAbiertaId({
            programacionId: destino.programacionId,
            otId: elegida.id
          });
        } else {
          toast.error('Esa visita todavía no tiene ninguna orden de trabajo');
        }
      } catch (e) {
        if (!vivo) return;
        toast.error(e.message);
      } finally {
        if (vivo) onDestinoConsumido?.();
      }
    })();

    return () => { vivo = false; };
  }, [programa, destino, onDestinoConsumido]);

  // ------------------------------------------------------------------ edición (F2.2)
  // Los dos PATCH devuelven la ORDEN COMPLETA ya presentada, así que la respuesta ES el
  // estado fresco: no hace falta una relectura, y así el detalle nunca queda desincronizado
  // respecto a lo que la base acaba de aceptar.
  //
  // Se devuelve el error en vez de lanzarlo, para que el formulario lo pinte en su propia
  // caja: un 409 de regla de negocio tiene que quedarse en pantalla, no desvanecerse.
  const aplicar = async (trabajo, exito) => {
    if (!programa || !abierta) return { message: 'No hay una orden abierta' };

    setGuardando(true);

    try {
      const fresca = await trabajo();

      setAbierta(fresca);

      // La lista también cambia: minutos, el técnico y el resultado por equipo se leen ahí.
      setOrdenes(prev => prev.map(o => (o.id === fresca.id ? fresca : o)));

      // El cierre añade a la respuesta lo que DERIVÓ cerrar_orden_trabajo(): el resultado
      // de la visita y cuántos ciclos movió. Se guarda aparte porque es el efecto de la
      // operación, no un campo de la orden, y merece quedarse visible.
      if (fresca.estado_programacion !== undefined) {
        setResultadoCierre({
          estado_programacion: fresca.estado_programacion,
          ciclos_afectados: fresca.ciclos_afectados,
          visita_resultado: fresca.visita_resultado
        });
      }

      toast.success(
        fresca.ya_estaba_anulada
          ? 'La orden ya estaba anulada. No se realizaron nuevos cambios'
          : exito
      );

      return null;
    } catch (e) {
      return { message: e.message, status: e.status, code: e.code, incumplimientos: e.incumplimientos };
    } finally {
      setGuardando(false);
    }
  };

  const guardarCabecera = campos => aplicar(
    () => apiTiPr01.editarOrdenTrabajo(
      programa.id, abierta.programacion_id, abierta.id, campos),
    'Cabecera guardada'
  );

  const guardarDetalle = (detalleId, campos) => aplicar(
    () => apiTiPr01.editarDetalleOrdenTrabajo(
      programa.id, abierta.programacion_id, abierta.id, detalleId, campos),
    'Resultado del equipo guardado'
  );

  // ------------------------------------------------------------------ F2.3
  // El cierre devuelve la orden ya CERRADA mas estado_programacion, ciclos_afectados y
  // visita_resultado: es la respuesta la que dicta el nuevo estado, no una suposicion. Al
  // quedar CERRADA, sus `acciones` llegan en false y la pantalla pasa a lectura sola, sin
  // recargar nada a mano.
  const confirmarCierre = async datos => {
    const antes = abierta;

    const error = await aplicar(
      () => apiTiPr01.cerrarOrdenTrabajo(
        programa.id, antes.programacion_id, antes.id, datos),
      'Orden de trabajo cerrada'
    );

    if (error) return error;

    setModal(null);

    return null;
  };

  // Anular es idempotente: si ya estaba anulada el backend responde con la orden tal cual
  // y `ya_estaba_anulada`, sin tocar la base. Se distingue en el mensaje para no afirmar
  // una accion que no ocurrio.
  const confirmarAnulacion = async motivo => {
    const antes = abierta;

    const error = await aplicar(
      () => apiTiPr01.anularOrdenTrabajo(
        programa.id, antes.programacion_id, antes.id, motivo),
      'Orden de trabajo anulada'
    );

    if (error) return error;

    setModal(null);

    return null;
  };

  // Cerrar el detalle también consume el destino: si no, `objetivo` volvería a resolverlo
  // y la pantalla no dejaría salir.
  const cerrarDetalle = () => {
    setAbiertaId(null);
    setAbierta(null);
    setModal(null);
    setResultadoCierre(null);
    onDestinoConsumido?.();
  };

  // ------------------------------------------------------------------ derivados
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toUpperCase();
    const soloDigitos = texto.replace(/[^0-9]/g, '');

    return ordenes.filter(o => {
      if (estadoFiltro && o.estado !== estadoFiltro) return false;
      if (!texto) return true;

      const placa = String(o.unidad?.placa ?? '').toUpperCase();

      // Un número suelto puede ser el id de la orden o parte de la placa: valen los dos.
      return placa.includes(texto)
        || (soloDigitos !== '' && String(o.id).includes(soloDigitos));
    });
  }, [ordenes, busqueda, estadoFiltro]);

  const abiertas = useMemo(
    () => filtradas.filter(o => o.estado === 'ABIERTA'),
    [filtradas]
  );

  const historicas = useMemo(
    () => filtradas.filter(o => o.estado !== 'ABIERTA'),
    [filtradas]
  );

  const totales = useMemo(() => ({
    abiertas: ordenes.filter(o => o.estado === 'ABIERTA').length,
    cerradas: ordenes.filter(o => o.estado === 'CERRADA').length,
    anuladas: ordenes.filter(o => o.estado === 'ANULADA').length
  }), [ordenes]);

  // ------------------------------------------------------------------ estados de carga
  if (cargando) {
    return (
      <div className="ti">
        <div className="ti-card">
          <div className="ti-empty">
            <div className="ti-spinner" />
            Cargando las órdenes de trabajo…
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

  // ------------------------------------------------------------------ detalle a pantalla
  if (objetivo) {
    if (!abierta) {
      return (
        <div className="ti">
          <div className="ti-card">
            <div className="ti-empty">
              <div className="ti-spinner" />
              Cargando la orden de trabajo…
            </div>
          </div>
        </div>
      );
    }

    const fila = visitas.find(v => v.id === abierta.programacion_id) ?? null;

    return (
      <div className="ti">
        <DetalleOrden
          programa={programa}
          programaId={programa.id}
          orden={abierta}
          visita={fila}
          estadosDetalle={estadosDetalle}
          guardando={guardando}
          trabajando={guardando}
          resultadoCierre={resultadoCierre}
          onGuardarCabecera={guardarCabecera}
          onGuardarDetalle={guardarDetalle}
          onPedirCierre={() => setModal('cerrar')}
          onPedirAnulacion={() => setModal('anular')}
          onVolver={cerrarDetalle}
          onVerEnPrograma={onVolverAPrograma}
        />

        {/* MODALES F2.3 · se montan sobre el detalle, nunca sobre el listado */}
        {modal === 'cerrar' && (
          <ModalCerrar
            orden={abierta}
            alcance={alcanceDeOrden(abierta)}
            trabajando={guardando}
            onCerrarModal={() => setModal(null)}
            onConfirmar={confirmarCierre}
          />
        )}

        {modal === 'anular' && (
          <ModalAnular
            orden={abierta}
            trabajando={guardando}
            onCerrarModal={() => setModal(null)}
            onConfirmar={confirmarAnulacion}
          />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ listado
  const tabla = (filas, columnas, cuerpo, vacio) => (
    filas.length === 0
      ? <div className="ti-empty">{vacio}</div>
      : (
        <div className="ti-scroll">
          <table className="ti-table">
            <thead>
              <tr>
                {columnas.map(c => <th key={c}>{c}</th>)}
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>{filas.map(cuerpo)}</tbody>
          </table>
        </div>
      )
  );

  const botonVer = orden => (
    <td className="ti-acciones">
      <button
        type="button"
        className="ti-btn small"
        onClick={() => abrirOrden(orden.programacion_id, orden.id)}
      >
        Ver alcance
      </button>
    </td>
  );

  return (
    <div className="ti">
      {/* KPIs */}
      <div className="ti-grid g4">
        <Kpi etiqueta="Abiertas" valor={totales.abiertas} />
        <Kpi etiqueta="Cerradas" valor={totales.cerradas} clase="ok" />
        <Kpi etiqueta="Anuladas" valor={totales.anuladas} />
        <Kpi
          etiqueta="Visitas del programa"
          valor={visitas.length}
          apoyo="las órdenes se abren desde una celda del programa"
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
          value={estadoFiltro}
          onChange={event => setEstadoFiltro(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {estadosOt.map(e => (
            <option key={e} value={e}>{etiquetaEstado(e)}</option>
          ))}
        </select>
        <span className="ti-smalltxt">
          {filtradas.length} de {ordenes.length} orden(es)
        </span>
        <button type="button" className="ti-btn small" onClick={recargar}>
          Refrescar
        </button>
      </div>

      {truncado && (
        <div className="ti-badbox">
          La programación llegó <b>incompleta</b>, así que pueden faltar órdenes. Vuelve a
          cargar antes de interpretar esta pantalla.
        </div>
      )}

      {fallidas > 0 && (
        <div className="ti-badbox">
          No se pudo leer el histórico de <b>{fallidas}</b> visita(s) con órdenes. La lista
          está incompleta.
        </div>
      )}

      {ordenes.length === 0 ? (
        <div className="ti-card">
          <h3>Órdenes de trabajo</h3>
          <div className="ti-empty">
            No hay órdenes de trabajo registradas. Se abren desde una celda del programa,
            en una visita PROGRAMADA o REPROGRAMADA.
          </div>
        </div>
      ) : (
        <>
          {/* ABIERTAS */}
          <div className="ti-card" style={{ marginBottom: 13 }}>
            <h3>
              Abiertas
              <span className="ti-right ti-smalltxt">{abiertas.length}</span>
            </h3>
            {tabla(
              abiertas,
              ['OT', 'Unidad', 'Quincena', 'Alcance', 'Técnico', 'Equipos'],
              orden => {
                const alcance = alcanceDeOrden(orden);

                return (
                  <tr key={orden.id}>
                    <td className="ti-mono">#{orden.id}</td>
                    <td className="ti-mono">{orden.unidad?.placa ?? '—'}</td>
                    <td>{quincenaDe(orden.visita?.quincena_efectiva)?.label ?? '—'}</td>
                    <td><Alcance alcance={alcance} /></td>
                    <td className="ti-smalltxt">
                      {orden.tecnico?.nombre ?? (orden.tecnico ? `personal #${orden.tecnico.id}` : 'sin asignar')}
                    </td>
                    <td className="ti-mono ti-smalltxt">
                      {orden.detalles?.total ?? 0}
                    </td>
                    {botonVer(orden)}
                  </tr>
                );
              },
              busqueda || estadoFiltro
                ? 'Ninguna orden abierta coincide con el filtro.'
                : 'No hay órdenes abiertas. Se crean desde una celda del programa.'
            )}
          </div>

          {/* CERRADAS Y ANULADAS */}
          <div className="ti-card">
            <h3>
              Cerradas y anuladas
              <span className="ti-right ti-smalltxt">{historicas.length}</span>
            </h3>
            {tabla(
              historicas,
              ['OT', 'Unidad', 'Fecha', 'Alcance', 'Resultado por equipo', 'Minutos'],
              orden => {
                const alcance = alcanceDeOrden(orden);
                const detalles = orden.detalles?.items ?? [];

                return (
                  <tr key={orden.id}>
                    <td className="ti-mono">#{orden.id}</td>
                    <td className="ti-mono">{orden.unidad?.placa ?? '—'}</td>
                    <td
                      className="ti-mono"
                      title={orden.fecha_cierre ?? orden.fecha_apertura ?? ''}
                    >
                      {fechaCorta(orden.fecha_cierre ?? orden.fecha_apertura)}
                    </td>
                    <td><Alcance alcance={alcance} /></td>
                    <td>
                      {orden.estado === 'ANULADA' ? (
                        <span
                          className="ti-chip grey"
                          title={orden.motivo_anulacion ?? ''}
                        >
                          Anulada
                        </span>
                      ) : (
                        [...detalles]
                          .sort((a, b) => a.tipo_equipo.localeCompare(b.tipo_equipo))
                          .map(d => (
                            <span
                              key={d.id}
                              className={`ti-chip ${CLASE_CHIP[d.estado] || 'grey'}`}
                              style={{ marginRight: 4 }}
                              title={
                                `${ETIQUETA_EQUIPO[d.tipo_equipo] ?? d.tipo_equipo}`
                                + ` · previsto ${d.nivel_programado}`
                                + ` · ${etiquetaEstado(d.estado)}`
                              }
                            >
                              {(ETIQUETA_EQUIPO[d.tipo_equipo] ?? d.tipo_equipo).slice(0, 3)}
                            </span>
                          ))
                      )}
                    </td>
                    <td className="ti-mono ti-smalltxt">{orden.minutos ?? '—'}</td>
                    {botonVer(orden)}
                  </tr>
                );
              },
              busqueda || estadoFiltro
                ? 'Ninguna orden cerrada o anulada coincide con el filtro.'
                : 'Todavía no hay órdenes cerradas ni anuladas.'
            )}
          </div>
        </>
      )}

      <div className="ti-legend">
        <span>
          M1 · M2 · M3 es el nivel regular común de CÁMARAS, COPILOTO y RADIO_BASE.
        </span>
        <span>
          <i
            className="ti-sq"
            style={{ background: '#5b4792', borderRadius: '50%', width: 8, height: 8 }}
          />
          GPS y ADAS son anualidades M3 adicionales: no elevan el nivel regular.
        </span>
        <span>
          Una visita admite una sola orden no anulada. Las anuladas se conservan.
        </span>
      </div>
    </div>
  );
}

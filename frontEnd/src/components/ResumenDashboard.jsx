import { quincenaActual, estadoEnQuincena } from '../utils/indicadoresQuincena';
import { formatearPlaca } from '../utils/formatos';
// DASHBOARD COLORES V2 - 04/09/2026
import { useEffect, useState, useRef } from "react";
import { api } from "../services/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Line,
} from "recharts";
import html2pdf from "html2pdf.js";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function ResumenDashboard() {
  const [data, setData] = useState({
    total: 0,
    mantenimientos: 0,
    operativas: 0,
    observadas: 0,
    faltaRevision: 0,
    sinInformacion: 0,
    parciales: 0,
    noEjecutadas: 0,
    noAplican: 0,
    aplicables: 0,
    trend: [],
    fallos: [],
    programasBarras: [],
    soporte: [],
    inventario: [],
  });
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [indicadores, setIndicadores] = useState(null);
  const [currentDate, setCurrentDate] = useState("");
  const [quincena, setQuincena] = useState("actual");
  const [quincenas, setQuincenas] = useState([]);
  const [quincenaMostrada, setQuincenaMostrada] = useState(null);
  const dashboardRef = useRef(null);

  // Estados para el buscador de placas interno y stats públicos integrados
  const [placa, setPlaca] = useState("");
  const [placasDisponibles, setPlacasDisponibles] = useState([]);
  const [result, setResult] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [publicStats, setPublicStats] = useState({
    ticker: [],
    trabajosTI: [],
  });

  useEffect(() => {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    setCurrentDate(new Date().toLocaleDateString("es-ES", options));

    let activo = true;
    const loadData = async () => {
      try {
        const mantenimiento = await api.getIndicadoresMantenimiento();
        if (!activo) return;
        setErrorCarga(null);
        const actual = quincenaActual(mantenimiento.fecha_negocio);
        if (!actual) throw new Error('El servidor no devolvió una fecha de negocio válida.');
        const elegida = quincena === "actual" ? actual : quincena;
        const opciones = new Set([actual]);
        for (const unidad of mantenimiento.unidades) {
          for (const visita of unidad.visitas_periodo || []) {
            if (visita.quincena_efectiva) opciones.add(visita.quincena_efectiva);
          }
        }
        setQuincenas([...opciones].filter(Boolean).sort().reverse());
        setQuincenaMostrada(elegida);
        const ordenesPeriodo = mantenimiento.ordenes.filter(o => o.quincena_efectiva === elegida);
        const cData = { soporte: mantenimiento.soporte || [], inventario: mantenimiento.inventario || [] };
        const actividad = { trabajosTI: mantenimiento.trabajosTI || [] };
        setIndicadores(mantenimiento);
        const estadoVisual = { 'AL DÍA': 'Operativa', 'VENCIDA': 'Observada', 'POR VENCER': 'Falta de revisión' };
        const vData = mantenimiento.unidades.map(v => {
          const estadoPeriodo = estadoEnQuincena(v.visitas_periodo, elegida, mantenimiento.fecha_negocio);
          return { ...v, estadoPeriodo, estado: estadoVisual[estadoPeriodo] || 'Otros' };
        });
        const dias = {};
        const resultados = {};
        const nombresEquipo = {
          CAMARAS: "Cámaras",
          COPILOTO: "Tablet / Copiloto",
          RADIO_BASE: "Radio base",
          GPS: "GPS",
          ADAS: "ADAS",
        };

        for (const orden of ordenesPeriodo) {
          if (orden.fecha) dias[orden.fecha] = (dias[orden.fecha] || 0) + 1;
          for (const equipo of orden.equipos || []) {
            const tipo = equipo.tipo || "SIN_IDENTIFICAR";
            if (!resultados[tipo]) {
              resultados[tipo] = {
                name: nombresEquipo[tipo] || tipo,
                COMPLETADO: 0, PARCIAL: 0, PENDIENTE: 0,
                NO_APLICA: 0, OTROS: 0,
              };
            }
            const estado = ["COMPLETADO", "PARCIAL", "PENDIENTE", "NO_APLICA"].includes(equipo.estado)
              ? equipo.estado : "OTROS";
            resultados[tipo][estado]++;
          }
        }
        const tendencia = Object.keys(dias).sort().slice(-14).map(date => ({ date, mantenimientos: dias[date] }));
        const resultadosEquipos = Object.values(resultados).sort((a, b) => a.name.localeCompare(b.name, "es"));
        setPublicStats({ ...actividad, ticker: [...ordenesPeriodo].sort((a, b) => `${b.fecha_cierre || ''} ${b.hora || ''}`.localeCompare(`${a.fecha_cierre || ''} ${a.hora || ''}`)).slice(0, 10).map(o => ({ ...o, estado: o.resultado })) });
        setPlacasDisponibles(
          [...new Set(vData.map((v) => v.placa).filter(Boolean))].sort(),
        );
        const operativas = vData.filter((v) => v.estado === "Operativa").length;
        const observadas = vData.filter((v) => v.estado === "Observada").length;
        const faltaRevision = vData.filter(
          (v) => v.estado === "Falta de revisión",
        ).length;

        // Agrupar la distribución principal por CLIENTE en lugar de operación.
        // Esto mantiene el gráfico compacto y conserva los mismos estados/colores.
        const clienteMap = Object.create(null);
        const nombresClientes = {
          repsol: "REPSOL",
          primax: "PRIMAX",
          solgas: "SOLGAS",
          "san jose": "SAN JOSE",
          austral: "AUSTRAL",
          "sin cliente": "Sin Cliente",
          "datos por revisar": "Datos por revisar",
        };

        vData.forEach((v) => {
          const original = String(v.cliente ?? "").trim();
          let clave = original
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ");

          if (
            [
              "",
              "null",
              "undefined",
              "sin cliente",
              "sin categoria",
              "falta identificar",
            ].includes(clave)
          ) {
            clave = "sin cliente";
          }

          if (["test", "text"].includes(clave)) {
            clave = "datos por revisar";
          }

          const nombre = Object.prototype.hasOwnProperty.call(
            nombresClientes,
            clave,
          )
            ? nombresClientes[clave]
            : original || "Sin Cliente";

          if (!clienteMap[clave]) {
            clienteMap[clave] = {
              name: nombre,
              Operativa: 0,
              Observada: 0,
              "Falta de revisión": 0,
              Otros: 0,
            };
          }

          const estado = [
            "Operativa",
            "Observada",
            "Falta de revisión",
          ].includes(v.estado)
            ? v.estado
            : "Otros";

          clienteMap[clave][estado]++;
        });

        setData({
          total: vData.length,
          mantenimientos: ordenesPeriodo.length,
          operativas,
          observadas,
          faltaRevision,
          sinInformacion: vData.filter(v => v.estadoPeriodo === 'SIN INFORMACIÓN').length,
          parciales: vData.filter(v => v.estadoPeriodo === 'PARCIAL').length,
          noEjecutadas: vData.filter(v => v.estadoPeriodo === 'NO EJECUTADO').length,
          noAplican: vData.filter(v => v.estadoPeriodo === 'NO APLICA').length,
          aplicables: vData.filter(v => ['AL DÍA', 'VENCIDA', 'POR VENCER', 'PARCIAL', 'NO EJECUTADO'].includes(v.estadoPeriodo)).length,
          trend: tendencia,
          fallos: resultadosEquipos,
          programasBarras: Object.values(clienteMap).sort((a, b) =>
            a.name.localeCompare(b.name, "es"),
          ),
          soporte: cData.soporte || [],
          inventario: cData.inventario || [],
        });
      } catch (error) {
        if (activo) {
          console.error(error);
          setErrorCarga(error.message || 'No se pudieron cargar los indicadores de mantenimiento');
        }
      } finally {
        if (activo) setLoading(false);
      }
    };
    loadData();
    return () => { activo = false; };
  }, [quincena]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!placa.trim()) return;

    setLoadingSearch(true);
    setErrorSearch("");
    setResult(null);

    try {
      const clave = placa.toUpperCase().replace(/[\s-]/g, '');
      const unidad = indicadores?.unidades.find(u => String(u.placa).toUpperCase().replace(/[\s-]/g, '') === clave);
      if (!unidad) throw new Error('Unidad no encontrada en nuestros registros.');
      const ordenes = indicadores.ordenes.filter(o => String(o.placa).toUpperCase().replace(/[\s-]/g, '') === clave);
      const ultima = ordenes[0];
      const equipo = tipo => ultima?.equipos?.find(e => e.tipo === tipo)?.estado || 'Sin registro';
      setResult({ placa: unidad.placa, estado_general: unidad.estado, fecha: ultima?.fecha || 'Sin registro', hora: '',
        camaras: equipo('CAMARAS'), radio: equipo('RADIO_BASE'), tablet: equipo('COPILOTO'),
        timeline: ordenes.slice(0, 3).map(o => ({ fecha: o.fecha, hora: '', estado: o.resultado })), fotos: [] });
      setShowResultModal(true);
    } catch (err) {
      setErrorSearch(err.message);
      alert(err.message);
    } finally {
      setLoadingSearch(false);
    }
  };

  if (loading)
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid var(--border-color)",
            borderTop: "4px solid var(--accent-color)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 1rem",
          }}
        ></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        Inicializando Centro de Control...
      </div>
    );

  if (errorCarga) return <div className="dashboard-empty-message" role="alert">{errorCarga}</div>;
  const unidadesConProgramacion = data.aplicables;
  const porcentajeSalud = unidadesConProgramacion > 0 ? Math.round((data.operativas / unidadesConProgramacion) * 100) : null;

  const handleExportPDF = () => {
    const element = dashboardRef.current;

    // Ocultar UI e inyectar layout formal
    const noPrintEls = element.querySelectorAll(".no-print");
    noPrintEls.forEach((el) => (el.style.display = "none"));

    const printOnlyEls = element.querySelectorAll(".print-header, .print-only");
    printOnlyEls.forEach((el) => (el.style.display = "block"));

    // Forzar modo claro para el PDF para que se vea formal y limpio
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      document.documentElement.classList.remove("dark");
    }

    const opt = {
      margin: 10,
      filename: "Reporte_Grafico_Centro_Control.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 1200,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        // Restaurar estilos y modo oscuro
        noPrintEls.forEach((el) => (el.style.display = ""));
        printOnlyEls.forEach((el) => (el.style.display = "none"));
        if (isDark) document.documentElement.classList.add("dark");
      });
  };

  const Needle = ({ value, color }) => {
    const angle = 180 - (value / 100) * 180;
    const rad = (Math.PI / 180) * angle;
    const cx = 50,
      cy = 80;
    const length = 35;
    const x = cx + length * Math.cos(rad);
    const y = cy - length * Math.sin(rad);

    return (
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <circle cx={cx} cy={cy} r="3" fill="var(--text-primary)" />
        <line
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  const Custom3DBar = (props) => {
    const { fill, x, y, width, height } = props;
    const depth = 8;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} />
        <path
          d={`M${x},${y} L${x + depth},${y - depth} L${x + width + depth},${y - depth} L${x + width},${y} Z`}
          fill={fill}
          filter="brightness(1.2)"
        />
        <path
          d={`M${x + width},${y} L${x + width + depth},${y - depth} L${x + width + depth},${y + height - depth} L${x + width},${y + height} Z`}
          fill={fill}
          filter="brightness(0.8)"
        />
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            padding: "1rem",
            borderRadius: "0.75rem",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <p
            style={{
              color: "var(--text-primary)",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
            }}
          >
            {label}
          </p>
          {payload.map((entry, index) => (
            <p
              key={index}
              style={{
                color: entry.color || entry.fill,
                margin: 0,
                fontSize: "0.875rem",
                fontWeight: "500",
              }}
            >
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const cardStyle = {
    backgroundColor: "var(--card-bg)",
    borderRadius: "1.25rem",
    padding: "1.5rem",
    boxShadow: "var(--shadow-sm)",
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    border: "1px solid var(--border-color)",
    transition:
      "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: "default",
    position: "relative",
    overflow: "hidden",
  };

  return (
    <div className="dashboard-page" ref={dashboardRef}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .power-card { 
          min-width: 0;
          background-color: var(--card-bg, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0); 
          border-radius: 0.75rem;
          box-shadow: var(--dashboard-card-shadow);
          transition: border-color 0.2s; 
          position: relative; 
          overflow: hidden; 
        }
        .power-card:hover { 
          border-color: color-mix(in srgb, var(--accent-color) 25%, var(--border-color));
        }
        .print-only { display: none; }
        @media print {
          .print-only { display: block !important; margin-bottom: 1rem; color: #333; font-size: 16pt; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }
          .page-break { page-break-after: always; padding-top: 2rem; }
        }
      `}</style>

      <div className="print-header" style={{ display: "none" }}>
        <h1>REPORTE GRÁFICO - ERPHSE</h1>
        <p>Generado el: {currentDate}</p>
        <p>
          <strong>Programación al día: {porcentajeSalud == null ? "Sin datos" : `${porcentajeSalud}%`}</strong>
        </p>
      </div>

      <div className="dashboard-heading no-print">
        <div>
          <h2 className="dashboard-title">Resumen operativo</h2>
          <p className="dashboard-subtitle">
            {currentDate.charAt(0).toUpperCase() + currentDate.slice(1)} ·{" "}
            {porcentajeSalud == null
              ? "No hay próximas visitas materializadas para calcular el indicador."
              : porcentajeSalud > 80
                ? "La mayoría de las programaciones tienen plazo vigente."
                : "Revisa las programaciones próximas y vencidas."}
          </p>
        </div>
        <div className="dashboard-actions">
          <label className="dashboard-quincena-filter">
            <span>Quincena</span>{" "}
            <select value={quincena} onChange={e => setQuincena(e.target.value)} aria-label="Filtrar indicadores por quincena">
              <option value="actual">Quincena actual{quincenaMostrada && quincena === 'actual' ? ` · ${quincenaMostrada}` : ''}</option>
              {quincenas.filter(q => q !== quincenaActual(indicadores?.fecha_negocio)).map(q => <option key={q} value={q}>{q.slice(8,10) === '01' ? 'Primera' : 'Segunda'} quincena · {q.slice(5,7)}/{q.slice(0,4)}</option>)}
            </select>
          </label>
          {/* Buscador de Placas Interno */}
          <form onSubmit={handleSearch} className="dashboard-search-form">
            <input
              type="text"
              list="placas-list-interno"
              placeholder="Buscar placa..."
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              className="dashboard-search-input"
            />
            <datalist id="placas-list-interno">
              {placasDisponibles.map((p, idx) => (
                <option key={idx} value={p} />
              ))}
            </datalist>
            <button
              type="submit"
              disabled={loadingSearch}
              className="dashboard-search-button"
            >
              {loadingSearch ? "..." : "Buscar"}
            </button>
          </form>

          <button onClick={handleExportPDF} className="dashboard-export-button">
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              ></path>
            </svg>
            Exportar PDF
          </button>
          <div className="dashboard-online-status">
            <span
              style={{
                position: "relative",
                display: "flex",
                width: "10px",
                height: "10px",
              }}
            >
              <span
                style={{
                  animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
                  position: "absolute",
                  display: "inline-flex",
                  height: "100%",
                  width: "100%",
                  borderRadius: "50%",
                  backgroundColor: "var(--green-text)",
                  opacity: 0.7,
                }}
              ></span>
              <span
                style={{
                  position: "relative",
                  display: "inline-flex",
                  borderRadius: "50%",
                  height: "10px",
                  width: "10px",
                  backgroundColor: "var(--green-text)",
                }}
              ></span>
            </span>
            <span
              style={{
                color: "var(--text-primary)",
                fontWeight: "600",
                fontSize: "0.75rem",
              }}
            >
              Sistema En Línea
            </span>
          </div>
        </div>
      </div>

      <p className="ti-smalltxt">Programación y OT: quincena efectiva {quincenaMostrada || '—'}. Soporte e inventario: histórico general.</p>
      {(data.parciales > 0 || data.noEjecutadas > 0 || data.noAplican > 0) && <p className="ti-smalltxt">En esta quincena: {data.parciales} parciales · {data.noEjecutadas} no ejecutadas · {data.noAplican} no aplican.</p>}
      <div className="dashboard-kpi-grid">
        <div
          className="power-card dashboard-kpi-card dashboard-kpi-card--total"
          style={{
            padding: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "var(--blue-bg)",
              borderRadius: "0.25rem",
              color: "var(--blue-text)",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              ></path>
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.65rem",
                fontWeight: "bold",
                margin: "0 0 0.1rem 0",
                textTransform: "uppercase",
              }}
            >
              Total Unidades
            </p>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "bold",
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: "1",
              }}
            >
              {data.total}
            </h3>
            <span className="dashboard-kpi-caption">Maestro vigente</span>
          </div>
        </div>
        <div
          className="power-card dashboard-kpi-card dashboard-kpi-card--operativas"
          style={{
            padding: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "var(--green-bg)",
              borderRadius: "0.25rem",
              color: "var(--green-text)",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.65rem",
                fontWeight: "bold",
                margin: "0 0 0.1rem 0",
                textTransform: "uppercase",
              }}
            >
              Al día
            </p>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "bold",
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: "1",
              }}
            >
              {data.operativas}
            </h3>
            <span className="dashboard-kpi-caption">
              {porcentajeSalud == null ? "Sin datos" : `${porcentajeSalud}% de unidades con programación`}
            </span>
          </div>
        </div>
        <div
          className="power-card dashboard-kpi-card dashboard-kpi-card--observadas"
          style={{
            padding: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "var(--red-bg)",
              borderRadius: "0.25rem",
              color: "var(--red-text)",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.65rem",
                fontWeight: "bold",
                margin: "0 0 0.1rem 0",
                textTransform: "uppercase",
              }}
            >
              Vencidas
            </p>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "bold",
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: "1",
              }}
            >
              {data.observadas}
            </h3>
            <span className="dashboard-kpi-caption">Plazo de quincena vencido</span>
          </div>
        </div>
        <div
          className="power-card dashboard-kpi-card dashboard-kpi-card--pendientes"
          style={{
            padding: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "var(--yellow-bg)",
              borderRadius: "0.25rem",
              color: "var(--yellow-text)",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              ></path>
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.65rem",
                fontWeight: "bold",
                margin: "0 0 0.1rem 0",
                textTransform: "uppercase",
              }}
            >
              Por vencer
            </p>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "bold",
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: "1",
              }}
            >
              {data.faltaRevision}
            </h3>
            <span className="dashboard-kpi-caption">Por vencer</span>
          </div>
        </div>
        <div className="power-card dashboard-kpi-card dashboard-kpi-card--sin-informacion">
          <div aria-hidden="true">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 8v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          </div>
          <div>
            <p>Sin información</p>
            <h3>{data.sinInformacion}</h3>
            <span className="dashboard-kpi-caption">Sin visita en la quincena</span>
          </div>
        </div>
        <div
          className="power-card dashboard-kpi-card dashboard-kpi-card--inspecciones"
          style={{
            padding: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "var(--purple-bg)",
              borderRadius: "0.25rem",
              color: "var(--purple-text)",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              ></path>
            </svg>
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.65rem",
                fontWeight: "bold",
                margin: "0 0 0.1rem 0",
                textTransform: "uppercase",
              }}
            >
              OT cerradas
            </p>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "bold",
                margin: 0,
                color: "var(--text-primary)",
                lineHeight: "1",
              }}
            >
              {data.mantenimientos}
            </h3>
            <span className="dashboard-kpi-caption">Histórico acumulado</span>
          </div>
        </div>
      </div>

      <div className="dashboard-desktop-overview">
        <section className="power-card dashboard-operation-summary">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Distribución de vehículos por cliente</h3>
              <p>Estado de las programaciones de mantenimiento</p>
            </div>
            <span>Actualizado hoy</span>
          </div>
          <div
            className="dashboard-operation-chart"
            style={{
              height: Math.max(210, data.programasBarras.length * 34 + 30),
            }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                layout="vertical"
                data={data.programasBarras}
                margin={{ top: 4, right: 18, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="var(--chart-grid)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={105}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-primary)", fontSize: 10 }}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.28 }}
                />
                <Bar
                  dataKey="Operativa"
                  name="Al día"
                  stackId="estado"
                  fill="var(--viz-teal)"
                  barSize={12}
                />
                <Bar
                  dataKey="Observada"
                  name="Vencidas"
                  stackId="estado"
                  fill="var(--viz-coral)"
                  barSize={12}
                />
                <Bar
                  dataKey="Falta de revisión"
                  name="Por vencer"
                  stackId="estado"
                  fill="var(--viz-amber)"
                  barSize={12}
                />
                <Bar
                  dataKey="Otros"
                  name="Otros / sin información"
                  stackId="estado"
                  fill="var(--text-secondary)"
                  barSize={12}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-operation-legend">
            <span><i className="is-blue"></i>Al día</span>
            <span><i className="is-red"></i>Vencidas</span>
            <span><i className="is-yellow"></i>Por vencer</span>
            <span><i className="is-muted"></i>Otros / sin información</span>
          </div>
        </section>

        <section className="power-card dashboard-recent-activity">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Actividad reciente</h3>
              <p>Últimos movimientos del ERP</p>
            </div>
            <span>Hoy</span>
          </div>
          <div className="dashboard-activity-list">
            {publicStats.ticker?.slice(0, 3).map((item, index) => (
              <div className="dashboard-activity-item" key={`inspection-${index}`}>
                <span className="dashboard-activity-symbol">✓</span>
                <div>
                  <strong>OT de mantenimiento cerrada</strong>
                  <p>{formatearPlaca(item.placa)} · {item.hora || "Hora no registrada"}</p>
                </div>
              </div>
            ))}
            {publicStats.trabajosTI?.slice(0, 2).map((item) => (
              <div className="dashboard-activity-item" key={`ticket-${item.id}`}>
                <span className="dashboard-activity-symbol is-ticket">#</span>
                <div>
                  <strong>Ticket de soporte completado</strong>
                  <p>{formatearPlaca(item.placa || "Sin placa")} · {item.tipo}</p>
                </div>
              </div>
            ))}
            {!publicStats.ticker?.length && !publicStats.trabajosTI?.length && (
              <p className="dashboard-empty-message">No hay actividad reciente.</p>
            )}
          </div>
        </section>
      </div>

      

      <div className="dashboard-section-heading">
        <div>
          <h3>Análisis complementario</h3>
          <p>Indicadores de mantenimiento, soporte e inventario TI</p>
        </div>
      </div>

      <div className="dashboard-chart-grid">
        <div
          className="power-card"
          style={{ padding: "1rem", display: "flex", flexDirection: "column" }}
        >
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
              color: "var(--text-primary)",
            }}
          >
            OT cerradas por fecha de ejecución
          </h3>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer width="100%" height={160} minWidth={1}>
              <AreaChart
                data={data.trend}
                margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorInsp" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--viz-blue)"
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--viz-blue)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                  tickFormatter={(val) => {
                    if (!val) return "";
                    const [y, m, d] = val.split("-");
                    return `${d}/${m}`;
                  }}
                  axisLine={false}
                  tickLine={false}
                  dy={5}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                  dx={-5}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="mantenimientos"
                  name="OT cerradas"
                  stroke="var(--viz-blue)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorInsp)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="power-card"
          style={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
          }}
        >
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
              color: "var(--text-primary)",
              alignSelf: "flex-start",
            }}
          >
            Programaciones al día
          </h3>
          <div
            style={{
              width: "100%",
              height: 160,
              position: "relative",
              minWidth: 0,
            }}
          >
            <ResponsiveContainer width="99%" minWidth={1}>
              <PieChart>
                <Pie
                  data={[
                    { value: porcentajeSalud ?? 0 },
                    { value: 100 - (porcentajeSalud ?? 0) },
                  ]}
                  cx="50%"
                  cy="80%"
                  innerRadius="70%"
                  outerRadius="100%"
                  stroke="none"
                  startAngle={180}
                  endAngle={0}
                  paddingAngle={0}
                >
                  <Cell
                    fill={
                      porcentajeSalud > 80
                        ? "var(--viz-teal)"
                        : porcentajeSalud > 50
                          ? "var(--viz-amber)"
                          : "var(--viz-coral)"
                    }
                  />
                  <Cell fill="var(--chart-grid)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                top: "75%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  color: "var(--text-primary)",
                  display: "block",
                  lineHeight: 1,
                }}
              >
                {porcentajeSalud == null ? 'Sin datos' : `${porcentajeSalud}%`}
              </span>
            </div>
          </div>
        </div>

        <div
          className="power-card"
          style={{ padding: "1rem", display: "flex", flexDirection: "column" }}
        >
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
              color: "var(--text-primary)",
            }}
          >
            Distribución de mantenimiento
          </h3>
          <div style={{ width: "100%", height: 160, minWidth: 0 }}>
            <ResponsiveContainer width="99%" minWidth={1}>
              <BarChart
                data={data.programasBarras}
                margin={{ top: 10, right: 0, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--text-primary)",
                    fontWeight: "bold",
                    fontSize: 10,
                  }}
                  dy={5}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                  dx={-5}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.3 }}
                />
                <Bar
                  dataKey="Operativa"
                  name="Al día"
                  stackId="a"
                  fill="var(--green-text)"
                  barSize={20}
                />
                <Bar
                  dataKey="Observada"
                  name="Vencidas"
                  stackId="a"
                  fill="var(--red-text)"
                  barSize={20}
                />
                <Bar
                  dataKey="Falta de revisión"
                  name="Por vencer"
                  stackId="a"
                  fill="var(--yellow-text)"
                  barSize={20}
                />
                <Bar dataKey="Otros" name="Otros / sin información" stackId="a" fill="var(--text-secondary)" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="power-card"
          style={{ padding: "1rem", display: "flex", flexDirection: "column" }}
        >
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
              color: "var(--text-primary)",
            }}
          >
            Resultados por equipo en OT cerradas
          </h3>
          {data.fallos.length === 0 ? (
            <p className="dashboard-empty-message">No hay resultados de equipos en OT cerradas.</p>
          ) : (
            <div style={{ width: "100%", height: Math.max(230, data.fallos.length * 36 + 70), minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                <BarChart data={data.fallos} layout="vertical" margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: "var(--text-primary)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="COMPLETADO" name="Completado" stackId="resultados" fill="var(--viz-teal)" />
                  <Bar dataKey="PARCIAL" name="Parcial" stackId="resultados" fill="var(--viz-blue)" />
                  <Bar dataKey="PENDIENTE" name="Pendiente" stackId="resultados" fill="var(--viz-amber)" />
                  <Bar dataKey="NO_APLICA" name="No aplica" stackId="resultados" fill="var(--text-secondary)" />
                  {data.fallos.some(item => item.OTROS > 0) && <Bar dataKey="OTROS" name="Otros" stackId="resultados" fill="var(--viz-purple)" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div
          className="power-card"
          style={{ padding: "1rem", display: "flex", flexDirection: "column" }}
        >
          <h3
            style={{
              fontSize: "0.9rem",
              fontWeight: "bold",
              margin: "0 0 0.5rem 0",
              color: "var(--text-primary)",
            }}
          >
            Soporte TI (Tickets)
          </h3>
          <div style={{ width: "100%", height: 160, minWidth: 0 }}>
            <ResponsiveContainer width="99%" minWidth={1}>
              <BarChart
                data={data.soporte}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "var(--text-primary)",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                  dy={5}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                  dx={-5}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.3 }}
                />
                <Bar dataKey="value" name="Tickets" barSize={30}>
                  {data.soporte.map((entry, index) => {
                    const name = entry.name.toLowerCase();
                    let color = "var(--viz-blue)";
                    if (name.includes("resuelto") || name.includes("cerrado"))
                      color = "var(--viz-teal)";
                    if (name.includes("pendiente") || name.includes("abierto"))
                      color = "var(--viz-coral)";
                    if (name.includes("proceso") || name.includes("espera"))
                      color = "var(--viz-amber)";
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        
      </div>

      {/* PANELES INTERACTIVOS (Trasladados del Portal Público) */}
      <div className="dashboard-detail-grid">
        {/* Panel A: Pizarra de Avisos */}
        <div
          className="power-card"
          style={{
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              margin: "0 0 1rem 0",
              color: "var(--accent-color)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>📋</span> Últimos mantenimientos
          </h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              flex: 1,
              overflowY: "auto",
              paddingRight: "0.5rem",
            }}
          >
            {publicStats.ticker && publicStats.ticker.length > 0 ? (
              publicStats.ticker.slice(0, 5).map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: "var(--bg-color)",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    borderLeft: `4px solid ${t.estado === "EJECUTADO" ? "var(--green-text)" : "var(--yellow-text)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.95rem",
                        fontWeight: "bold",
                        color: "var(--text-primary)",
                      }}
                    >
                      Placa: {formatearPlaca(t.placa)}
                    </p>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {t.hora}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.85rem",
                      color:
                        t.estado === "EJECUTADO"
                          ? "var(--green-text)"
                          : "var(--yellow-text)",
                    }}
                  >
                    {t.estado || 'Resultado no disponible'}
                  </p>
                </div>
              ))
            ) : (
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9rem",
                  textAlign: "center",
                  marginTop: "1rem",
                }}
              >
                No hay OT de mantenimiento cerradas.
              </p>
            )}
          </div>
        </div>

        {/* Panel B: Soporte en Acción */}
        <div
          className="power-card"
          style={{
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              margin: "0 0 1rem 0",
              color: "var(--accent-color)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>🔧</span> Trabajos de Soporte Recientes
          </h3>
          {publicStats.trabajosTI && publicStats.trabajosTI.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {publicStats.trabajosTI.map((tkt) => (
                <div
                  key={tkt.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "var(--bg-color)",
                    border: "1px solid var(--border-color)",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        color: "var(--text-primary)",
                        letterSpacing: "1px",
                      }}
                    >
                      {formatearPlaca(tkt.placa)}
                    </strong>
                    <p
                      style={{
                        margin: "0.25rem 0 0 0",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {tkt.tipo}
                    </p>
                  </div>
                  <span
                    style={{
                      backgroundColor: "var(--green-bg)",
                      color: "var(--green-text)",
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "1rem",
                      fontWeight: "bold",
                    }}
                  >
                    ✓ Completado
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                textAlign: "center",
                marginTop: "2rem",
              }}
            >
              No hay tickets recientes.
            </p>
          )}
        </div>
      </div>

      {/* MODAL RESULTADO BUSQUEDA (CARNET DIGITAL) */}
      {showResultModal && result && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(11,21,38,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            id="carnet-digital"
            style={{
              backgroundColor: "var(--card-bg)",
              width: "100%",
              maxWidth: "500px",
              borderRadius: "1.5rem",
              boxShadow: "0 20px 50px -14px rgba(16,27,51,0.35)",
              overflow: "hidden",
              border: "1px solid var(--border-color)",
              position: "relative",
            }}
          >
            <button
              className="no-print"
              onClick={() => setShowResultModal(false)}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                background: "rgba(16,27,51,0.35)",
                color: "white",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                cursor: "pointer",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              X
            </button>

            <div
              style={{
                backgroundColor:
                  result.estado_general === "AL DÍA" ? "#0e9f6e" : "#dc3b2a",
                color: "white",
                padding: "2rem 1.5rem 1.5rem 1.5rem",
                textAlign: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "1rem",
                  left: "1rem",
                  fontSize: "0.7rem",
                  opacity: 0.8,
                  letterSpacing: "2px",
                  fontFamily: "monospace",
                }}
              >
                ERPHSE
              </div>
              <h3
                style={{
                  fontSize: "2.5rem",
                  margin: 0,
                  fontWeight: "900",
                  letterSpacing: "2px",
                  textShadow: "0 2px 5px rgba(0,0,0,0.3)",
                }}
              >
                {formatearPlaca(result.placa)}
              </h3>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "1.25rem",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  background: "rgba(16,27,51,0.35)",
                  display: "inline-block",
                  padding: "0.2rem 1rem",
                  borderRadius: "2rem",
                }}
              >
                PROGRAMA: {result.estado_general}
              </p>
            </div>

            <div style={{ padding: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.5rem",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Último mantenimiento
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "1.1rem",
                      fontWeight: "bold",
                      color: "var(--text-primary)",
                    }}
                  >
                    {result.fecha} {result.hora}
                  </p>
                </div>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${window.location.origin}/?placa=${encodeURIComponent(result.placa)}`)}&color=0f172a&bgcolor=ffffff`}
                  alt={`QR de la unidad ${result.placa}`}
                  title={`Abrir ficha de ${formatearPlaca(result.placa)}`}
                  style={{
                    borderRadius: "0.5rem",
                    border: "2px solid #e2e8f0",
                    padding: "2px",
                    width: "80px",
                    height: "80px",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    padding: "0.75rem 0.25rem",
                    backgroundColor: "var(--bg-color)",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 0.25rem 0",
                      fontWeight: "bold",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Cámaras
                  </p>
                  <span
                    style={{
                      color:
                        result.camaras === "COMPLETADO" ? "#0e9f6e"
                          : ["NO_APLICA", "Sin registro"].includes(result.camaras) ? "#64748b" : "#a8650a",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    {result.camaras}
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "center",
                    padding: "0.75rem 0.25rem",
                    backgroundColor: "var(--bg-color)",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 0.25rem 0",
                      fontWeight: "bold",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Radio
                  </p>
                  <span
                    style={{
                      color:
                        result.radio === "COMPLETADO" ? "#0e9f6e"
                          : ["NO_APLICA", "Sin registro"].includes(result.radio) ? "#64748b" : "#a8650a",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    {result.radio}
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "center",
                    padding: "0.75rem 0.25rem",
                    backgroundColor: "var(--bg-color)",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 0.25rem 0",
                      fontWeight: "bold",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Tablet
                  </p>
                  <span
                    style={{
                      color:
                        result.tablet === "COMPLETADO" ? "#0e9f6e"
                          : ["NO_APLICA", "Sin registro"].includes(result.tablet) ? "#64748b" : "#a8650a",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    {result.tablet}
                  </span>
                </div>
              </div>

              {result.incidente_pendiente &&
                result.incidente_pendiente.estado !== "Resuelto" && (
                  <div
                    style={{
                      marginBottom: "1.5rem",
                      backgroundColor: "#fff6e4",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #f5deac",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                      <h4
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: "bold",
                          color: "#db8b0b",
                          margin: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        Ticket de Soporte Activo
                      </h4>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        fontSize: "0.85rem",
                        color: "#a8650a",
                      }}
                    >
                      <div>
                        <strong>Estado:</strong>{" "}
                        <span
                          style={{
                            backgroundColor: "#f5deac",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "0.25rem",
                          }}
                        >
                          {result.incidente_pendiente.estado}
                        </span>
                      </div>
                      <div>
                        <strong>Requerimiento:</strong>{" "}
                        {result.incidente_pendiente.tipo_solicitud}
                      </div>
                    </div>
                  </div>
                )}

              {/* TIMELINE */}
              {result.timeline && result.timeline.length > 0 && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    backgroundColor: "#f8fafc",
                    padding: "1rem",
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      color: "#475569",
                      margin: "0 0 0.75rem 0",
                      textTransform: "uppercase",
                    }}
                  >
                    Historial Reciente
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {result.timeline.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.85rem",
                          color: "#334155",
                        }}
                      >
                        <span
                          style={{
                            color:
                              item.estado === "EJECUTADO"
                                ? "#0e9f6e"
                                : "#dc3b2a",
                            fontSize: "1rem",
                          }}
                        >
                          {item.estado === "EJECUTADO" ? "🟢" : "🔴"}
                        </span>
                        <strong>{item.fecha}</strong> ({item.hora}) -{" "}
                        {item.estado}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="no-print" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Las fotografías de mantenimiento están disponibles en el detalle de la OT.
              </p>

              {/* Botones de Acción */}
              <div
                className="no-print"
                style={{ display: "flex", gap: "0.5rem" }}
              >
                <button
                  onClick={() => window.print()}
                  style={{
                    flex: 1,
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "center",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span>🖨️</span> Imprimir
                </button>
                <button
                  onClick={() => setShowResultModal(false)}
                  style={{
                    flex: 2,
                    backgroundColor: "#2458e8",
                    color: "#ffffff",
                    border: "none",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "center",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span>🔧</span> Solicitar Soporte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

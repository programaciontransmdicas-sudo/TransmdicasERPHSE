import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTENTS = [
  {
    id: "mantenimiento",
    tab: "mantenimiento",
    access: "mantenimiento",
    label: "Mantenimiento Técnico",
    words: [
      "mantenimiento",
      "mantenimientos",
      "ot",
      "orden de trabajo",
      "preventivo",
      "correctivo",
    ],
  },
  {
    id: "inspecciones",
    tab: "dashboard",
    access: "dashboard",
    label: "Registro de Inspecciones",
    words: [
      "inspeccion",
      "inspección",
      "inspecciones",
      "revisar unidad",
      "revision",
      "revisión",
    ],
  },
  {
    id: "tickets",
    tab: "tickets",
    access: "tickets",
    label: "Tickets de Soporte",
    words: [
      "ticket",
      "tickets",
      "soporte",
      "falla",
      "problema",
      "camara",
      "cámara",
      "radio",
      "tablet",
    ],
  },
  {
    id: "entregas",
    tab: "entregas",
    access: "entregas",
    label: "Entregas TI",
    words: [
      "entrega",
      "entregar",
      "entregar equipo",
      "entregar laptop",
      "asignar equipo",
      "asignar laptop",
    ],
  },
  {
    id: "devoluciones",
    tab: "devoluciones",
    access: "devoluciones",
    label: "Devoluciones TI",
    words: [
      "devolucion",
      "devolución",
      "devoluciones",
      "devolver",
      "retornar equipo",
      "devolver laptop",
      "devolver pulsera",
    ],
  },
  {
    id: "personal",
    tab: "personal",
    access: "personal",
    label: "Directorio de Personal",
    words: [
      "personal",
      "trabajador",
      "trabajadora",
      "empleado",
      "empleada",
      "dni",
      "colaborador",
    ],
  },
  {
    id: "flota",
    tab: "maestro",
    access: "flota",
    label: "Maestro de Flota",
    words: [
      "flota",
      "vehiculo",
      "vehículo",
      "unidad",
      "tracto",
      "placa",
      "semirremolque",
    ],
  },
  {
    id: "reportes",
    tab: "reportes",
    access: "reportes",
    label: "Reportes Gerenciales",
    words: ["reporte", "reportes", "estadistica", "estadística", "informe"],
  },
  {
    id: "usuarios",
    tab: "usuarios",
    adminOnly: true,
    label: "Gestión de Usuarios",
    words: ["usuario", "usuarios", "permisos", "roles", "rol", "acceso"],
  },
  {
    id: "resumen",
    tab: "resumen",
    access: "resumen",
    label: "Centro de Control",
    words: ["inicio", "resumen", "centro de control", "principal", "dashboard principal"],
  },
];

const QUICK_ACTIONS = [
  { label: "Buscar una unidad", text: "Quiero buscar una unidad" },
  { label: "Registrar inspección", text: "Quiero registrar una inspección" },
  { label: "Crear ticket", text: "Quiero crear un ticket de soporte" },
  { label: "Registrar mantenimiento", text: "Quiero registrar un mantenimiento" },
  { label: "Entregar equipo", text: "Quiero registrar una entrega de equipo" },
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findPlate(text) {
  const match = String(text || "")
    .toUpperCase()
    .match(/\b[A-Z0-9]{3}-[A-Z0-9]{3}\b/);

  return match?.[0] || null;
}

export function AsistenteERPHSE({
  user,
  isAdmin,
  hasAccess,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      from: "assistant",
      text: `Hola${user?.username ? `, ${user.username}` : ""}. ¿Qué necesitas hacer?`,
    },
  ]);

  const inputRef = useRef(null);
  const quickActions = useMemo(() => QUICK_ACTIONS, []);

  const canUseIntent = (intent) => {
    if (intent.adminOnly) return Boolean(isAdmin);
    if (!intent.access) return true;
    return typeof hasAccess === "function"
      ? hasAccess(intent.access)
      : true;
  };

  const resolveIntent = (rawText) => {
    const text = normalize(rawText);

    return INTENTS.find((intent) =>
      Array.isArray(intent.words) &&
      intent.words.some((word) => text.includes(normalize(word)))
    );
  };

  const send = (rawText = input) => {
    const clean = String(rawText || "").trim();
    if (!clean) return;

    const plate = findPlate(clean);
    const intent = resolveIntent(clean);

    setMessages((prev) => [
      ...prev,
      { from: "user", text: clean },
    ]);
    setInput("");

    if (!intent) {
      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text:
            'No identifiqué el módulo. Prueba con "crear ticket", "buscar unidad", "registrar inspección" o "mantenimiento".',
        },
      ]);
      return;
    }

    if (!canUseIntent(intent)) {
      setMessages((prev) => [
        ...prev,
        {
          from: "assistant",
          text: `No tienes acceso a ${intent.label}.`,
        },
      ]);
      return;
    }

    const context = {
      source: "assistant",
      intent: intent.id,
      tab: intent.tab,
      placa: plate,
      originalText: clean,
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem(
      "erphse_assistant_context",
      JSON.stringify(context)
    );

    setMessages((prev) => [
      ...prev,
      {
        from: "assistant",
        text: plate
          ? `Abriendo ${intent.label}. Detecté la placa ${plate}.`
          : `Abriendo ${intent.label}.`,
      },
    ]);

    if (typeof onNavigate === "function") {
      onNavigate(intent.tab, context);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {open && (
        <section
          aria-label="Asistente ERPHSE"
          style={{
            position: "fixed",
            right: 20,
            bottom: 88,
            width: "min(390px, calc(100vw - 28px))",
            height: "min(560px, calc(100vh - 120px))",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 18,
            border: "1px solid rgba(148,163,184,.28)",
            background: "var(--card-bg, #ffffff)",
            color: "var(--text-primary, #0f172a)",
            boxShadow: "0 22px 70px rgba(15,23,42,.34)",
            zIndex: 99998,
            pointerEvents: "auto",
          }}
        >
          <header
            style={{
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg,#173a63,#214e82)",
              color: "#fff",
            }}
          >
            <div>
              <strong style={{ display: "block", fontSize: 14 }}>
                ✦ Asistente ERPHSE
              </strong>
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                Navegación inteligente
              </span>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                width: 30,
                height: 30,
                border: 0,
                borderRadius: 8,
                background: "rgba(255,255,255,.12)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </header>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              background: "var(--bg-color, #f8fafc)",
            }}
          >
            {messages.map((message, index) => (
              <div
                key={`${message.from}-${index}`}
                style={{
                  marginBottom: 10,
                  marginLeft: message.from === "user" ? 44 : 0,
                  marginRight: message.from === "assistant" ? 36 : 0,
                  padding: "10px 12px",
                  borderRadius:
                    message.from === "user"
                      ? "14px 14px 4px 14px"
                      : "14px 14px 14px 4px",
                  background:
                    message.from === "user"
                      ? "#214e82"
                      : "var(--card-bg, #fff)",
                  color:
                    message.from === "user"
                      ? "#fff"
                      : "var(--text-primary, #0f172a)",
                  border:
                    message.from === "assistant"
                      ? "1px solid var(--border-color, #e5e7eb)"
                      : "none",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {message.text}
              </div>
            ))}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 12,
              }}
            >
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.text)}
                  style={{
                    border: "1px solid var(--border-color, #dbe3ec)",
                    background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #0f172a)",
                    borderRadius: 999,
                    padding: "7px 9px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            style={{
              padding: 12,
              display: "flex",
              gap: 8,
              borderTop: "1px solid var(--border-color, #e5e7eb)",
              background: "var(--card-bg, #fff)",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ej. Quiero crear un ticket..."
              style={{
                minWidth: 0,
                flex: 1,
                border: "1px solid var(--border-color, #cbd5e1)",
                borderRadius: 10,
                padding: "10px 11px",
                background: "var(--bg-color, #fff)",
                color: "var(--text-primary, #0f172a)",
                outline: "none",
                fontSize: 13,
              }}
            />

            <button
              type="submit"
              style={{
                border: 0,
                borderRadius: 10,
                padding: "0 14px",
                background: "#214e82",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);

          setTimeout(() => {
            inputRef.current?.focus();
          }, 50);
        }}
        title="Abrir Asistente ERPHSE"
        aria-label="Abrir Asistente ERPHSE"
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          width: 56,
          height: 56,
          display: "grid",
          placeItems: "center",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: "50%",
          background: "linear-gradient(135deg,#214e82,#2f6fa8)",
          color: "#fff",
          boxShadow: "0 14px 34px rgba(15,23,42,.3)",
          fontSize: 22,
          cursor: "pointer",
          zIndex: 99999,
          pointerEvents: "auto",
        }}
      >
        ✦
      </button>
    </>,
    document.body
  );
}

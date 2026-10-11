import React, { useState, useEffect } from "react";
import { FlotasDashboard } from "./components/FlotasDashboard";
import { ResumenDashboard } from "./components/ResumenDashboard";
import { EntregasTIDashboard } from "./components/EntregasTIDashboard";
import { MantenimientoTecnico } from "./components/MantenimientoTecnico";
import { SoporteTicketsDashboard } from "./components/SoporteTicketsDashboard";
import { PublicPortal } from "./components/PublicPortal";
import { Login } from "./components/Login";
import { MaestroFlotaDashboard } from "./components/MaestroFlotaDashboard";
import { DirectorioPersonal } from "./components/DirectorioPersonal";
import { ReportesDashboard } from "./components/ReportesDashboard";
import { GestionUsuariosDashboard } from "./components/GestionUsuariosDashboard";
import { Toaster } from "react-hot-toast";
import "./index.css";
import transmdicasLogo from "./assets/transmdicas-logo.png";
import { AsistenteERPHSE } from "./components/AsistenteERPHSE";
import {
  NotificacionesBell
} from './components/NotificacionesBell';

const APP_ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  masters: (
    <>
      <path d="M4 7h16" />
      <path d="M6 3h12l2 4v13H4V7z" />
      <path d="M9 11h6" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v10H3z" />
      <path d="M14 9h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2" />
      <path d="m9 13 2 2 4-5" />
    </>
  ),
  support: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2z" />
      <path d="M20 14h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2z" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" />
      <path d="M13 5v14" />
    </>
  ),
  inventory: (
    <>
      <path d="m12 3 8 4-8 4-8-4z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4z" />
      <path d="M12 11v10" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L4 17l3 3 7.7-8.3a4 4 0 0 0 0-5.4z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" />,
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
};

function AppIcon({ name, size = 18 }) {
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {APP_ICONS[name]}
    </svg>
  );
}

function App() {
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);

    return params.get("placa")
      ? "public"
      : "login";
  });// 'public', 'login', 'admin'
  const [activeTab, setActiveTabState] = useState("resumen");
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isTiOpen, setIsTiOpen] = useState(true);
  const [isSeguridadOpen, setIsSeguridadOpen] = useState(false);
  const [isSoporteOpen, setIsSoporteOpen] = useState(false);
  const [isInventarioOpen, setIsInventarioOpen] = useState(false);
  const [isMantenimientoOpen, setIsMantenimientoOpen] = useState(true);
  const [mantenimientoVista, setMantenimientoVista] = useState("programa");
  const [mantenimientoNavKey, setMantenimientoNavKey] = useState(0);
  const [activeMenu, setActiveMenu] = useState(null); // Para menú colapsable de maestros
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("jdcali_theme");
    return saved === "dark";
  });
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("nexus_user");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) {
      setViewMode("admin");
    }
    // Pantalla de carga artificial de 1.5s
    const timer = setTimeout(() => setIsAppLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("jdcali_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("jdcali_theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (activeTab === "mantenimiento") {
      setIsMantenimientoOpen(true);
    }
  }, [activeTab]);

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem("jdcali_tab", tab);
    setIsSidebarOpen(false); // Cierra en móviles al navegar
  };

  const abrirMantenimiento = (vista) => {
    setMantenimientoVista(vista);
    setMantenimientoNavKey((prev) => prev + 1);
    setActiveTab("mantenimiento");
  };

  const handleLogout = () => {
    localStorage.removeItem("nexus_token");
    localStorage.removeItem("nexus_user");
    setUser(null);
    setViewMode("login");
  };

  const isAdmin =
    user?.rol?.toLowerCase() === "admin" ||
    user?.rol?.toLowerCase() === "administrador";
  const hasAccess = (modulo) => {
    if (isAdmin) return true;
    return user?.permisos?.[modulo]?.ver === true;
  };

  const tiModules = [
    "resumen",
    "flota",
    "personal",
    "dashboard",
    "tickets",
    "entregas",
    "devoluciones",
    "mantenimiento",
  ];
  const hasAnyTiAccess = tiModules.some(hasAccess);
  const isTiActive = [
    "resumen",
    "maestro",
    "personal",
    "dashboard",
    "tickets",
    "entregas",
    "devoluciones",
    "mantenimiento",
  ].includes(activeTab);

  if (isAppLoading) {
    return (
      <div className="erp-loading-screen">
        <div className="erp-loading-brand">
          <span className="erp-logo-crop"><img src={transmdicasLogo} alt="Transmdicas S.R.L." /></span>
          <div>
            <strong>ERPHSE</strong>
            <span>Grupo Transmdicas</span>
          </div>
        </div>
        <div className="erp-loading-bar">
          <span />
        </div>
        <p>Preparando el sistema…</p>
      </div>
    );
  }

  if (!user && viewMode === "public") {
    return (
      <>
        <Toaster position="bottom-right" />
        <PublicPortal
          onAdminClick={() => setViewMode("login")}
          openSupportOnLoad
        />
      </>
    );
  }

  if (!user && viewMode === "login") {
    return (
      <>
        <Toaster position="bottom-right" />
        <Login
          onLoginSuccess={(u) => {
            setUser(u);
            setViewMode("admin");
            setActiveTab("resumen");
          }}
        />
      </>
    );
  }

  const moduleTitles = {
    resumen: "Resumen operativo",
    maestro: "Maestro de flota",
    personal: "Directorio de personal",
    dashboard: "Registro de inspecciones",
    entregas: "Entregas TI",
    devoluciones: "Devoluciones TI",
    tickets: "Tickets de soporte",
    mantenimiento: "Mantenimiento técnico",
    reportes: "Reportes gerenciales",
    usuarios: "Usuarios y permisos",
  };

  const NavItem = ({ tab, icon, label, nested = false }) => (
    <button
      type="button"
      className={`erp-nav-item ${nested ? "erp-nav-subitem" : ""} ${activeTab === tab ? "active" : ""}`}
      onClick={() => setActiveTab(tab)}
      title={isDesktopCollapsed ? label : undefined}
    >
      <AppIcon name={icon} />
      {!isDesktopCollapsed && <span>{label}</span>}
    </button>
  );

  const MenuToggle = ({ icon, label, open, onClick, active, nested = false }) => (
    <button
      type="button"
      className={`erp-nav-item erp-nav-toggle ${nested ? "erp-nav-subitem" : ""} ${active ? "group-active" : ""}`}
      onClick={onClick}
      title={isDesktopCollapsed ? label : undefined}
      aria-expanded={open}
    >
      <AppIcon name={icon} />
      {!isDesktopCollapsed && (
        <>
          <span>{label}</span>
          <span className={`erp-nav-chevron ${open ? "open" : ""}`}>
            <AppIcon name="chevron" size={15} />
          </span>
        </>
      )}
    </button>
  );

  const MantenimientoSubItem = ({ vista, icon, label }) => (
    <button
      type="button"
      className={`erp-nav-item erp-nav-subitem ${activeTab === "mantenimiento" && mantenimientoVista === vista
          ? "active"
          : ""
        }`}
      onClick={() => abrirMantenimiento(vista)}
    >
      <AppIcon name={icon} />
      {!isDesktopCollapsed && <span>{label}</span>}
    </button>
  );

  return (
    <div
      className={`erp-app-shell ${isDesktopCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <Toaster position="bottom-right" />

      <button
        className="hamburger-btn"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label={isSidebarOpen ? "Cerrar menú" : "Abrir menú"}
      >
        <span className="erp-mobile-brand">
          <span className="erp-mobile-logo"><img src={transmdicasLogo} alt="Transmdicas S.R.L." /></span> ERPHSE
        </span>
        <AppIcon name={isSidebarOpen ? "close" : "menu"} size={22} />
      </button>

      {isSidebarOpen && (
        <button
          className="erp-mobile-overlay"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        className={`sidebar-container ${isSidebarOpen ? "open" : ""} ${isDesktopCollapsed ? "collapsed" : ""}`}
      >
        <div className="erp-sidebar-header">
          <div className="erp-logo-crop"><img src={transmdicasLogo} alt="Transmdicas S.R.L." /></div>
          {!isDesktopCollapsed && (
            <div className="erp-brand-copy">
              <strong>ERPHSE</strong>
              <span>Grupo Transmdicas</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="erp-collapse-button no-print"
            title={isDesktopCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <AppIcon name="menu" size={19} />
          </button>
        </div>

        <nav className="erp-sidebar-nav">
          {!isDesktopCollapsed && <p className="erp-nav-section">Principal</p>}
          {hasAnyTiAccess && (
            <div className="erp-nav-group erp-area-group">
              <MenuToggle
                icon="inventory"
                label="TI"
                open={isTiOpen}
                active={isTiActive}
                onClick={() => {
                  if (isDesktopCollapsed) setIsDesktopCollapsed(false);
                  setIsTiOpen(!isTiOpen);
                }}
              />

              {isTiOpen && !isDesktopCollapsed && (
                <div className="erp-nav-submenu erp-area-submenu">
                  {hasAccess("resumen") && (
                    <NavItem tab="resumen" icon="dashboard" label="Centro de Control" nested />
                  )}

                  {(hasAccess("flota") || hasAccess("personal")) && (
                    <div className="erp-nav-group">
                      <MenuToggle
                        icon="masters"
                        label="Maestros Generales"
                        open={activeMenu === "maestros"}
                        active={["maestro", "personal"].includes(activeTab)}
                        nested
                        onClick={() =>
                          setActiveMenu(activeMenu === "maestros" ? null : "maestros")
                        }
                      />
                      {activeMenu === "maestros" && (
                        <div className="erp-nav-submenu erp-nav-submenu-level-2">
                          {hasAccess("flota") && (
                            <NavItem tab="maestro" icon="truck" label="Flota" nested />
                          )}
                          {hasAccess("personal") && (
                            <NavItem tab="personal" icon="user" label="Personal" nested />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {hasAccess("dashboard") && (
                    <NavItem tab="dashboard" icon="clipboard" label="Registro de Inspecciones" nested />
                  )}

                  {hasAccess("tickets") && (
                    <div className="erp-nav-group">
                      <MenuToggle
                        icon="support"
                        label="Soporte TI"
                        open={isSoporteOpen}
                        active={activeTab === "tickets"}
                        nested
                        onClick={() => setIsSoporteOpen(!isSoporteOpen)}
                      />
                      {isSoporteOpen && (
                        <div className="erp-nav-submenu erp-nav-submenu-level-2">
                          <NavItem tab="tickets" icon="ticket" label="Tickets de Soporte" nested />
                        </div>
                      )}
                    </div>
                  )}

                  {(hasAccess("entregas") || hasAccess("devoluciones")) && (
                    <div className="erp-nav-group">
                      <MenuToggle
                        icon="inventory"
                        label="Inventario TI"
                        open={isInventarioOpen}
                        active={["entregas", "devoluciones"].includes(activeTab)}
                        nested
                        onClick={() => setIsInventarioOpen(!isInventarioOpen)}
                      />
                      {isInventarioOpen && (
                        <div className="erp-nav-submenu erp-nav-submenu-level-2">
                          {hasAccess("entregas") && (
                            <NavItem tab="entregas" icon="upload" label="Entregas" nested />
                          )}
                          {hasAccess("devoluciones") && (
                            <NavItem tab="devoluciones" icon="download" label="Devoluciones" nested />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {hasAccess("mantenimiento") && (
                    <div className="erp-nav-group">
                      <MenuToggle
                        icon="wrench"
                        label="Mantenimientos Técnicos"
                        open={isMantenimientoOpen}
                        active={activeTab === "mantenimiento"}
                        nested
                        onClick={() => {
                          if (isDesktopCollapsed) {
                            setIsDesktopCollapsed(false);
                            setIsMantenimientoOpen(true);
                            return;
                          }
                          setIsMantenimientoOpen((prev) => !prev);
                        }}
                      />

                      {isMantenimientoOpen && !isDesktopCollapsed && (
                        <div className="erp-nav-submenu erp-nav-submenu-level-2">
                          <MantenimientoSubItem
                            vista="programa"
                            icon="clipboard"
                            label="Programa"
                          />
                          <MantenimientoSubItem
                            vista="unidades"
                            icon="truck"
                            label="Unidades"
                          />
                          <MantenimientoSubItem
                            vista="ots"
                            icon="wrench"
                            label="Órdenes de trabajo"
                          />
                          <MantenimientoSubItem
                            vista="historial"
                            icon="download"
                            label="Historial"
                          />

                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="erp-nav-group erp-area-group erp-security-group">
            <MenuToggle
              icon="shield"
              label="Seguridad"
              open={isSeguridadOpen}
              active={false}
              onClick={() => {
                if (isDesktopCollapsed) setIsDesktopCollapsed(false);
                setIsSeguridadOpen(!isSeguridadOpen);
              }}
            />
            {isSeguridadOpen && !isDesktopCollapsed && (
              <div className="erp-security-empty">Sin módulos registrados</div>
            )}
          </div>

          {!isDesktopCollapsed && (
            <p className="erp-nav-section erp-nav-section-spaced">Gestión</p>
          )}
          {hasAccess("reportes") && (
            <NavItem tab="reportes" icon="chart" label="Reportes Gerenciales" />
          )}
          {isAdmin && (
            <NavItem tab="usuarios" icon="shield" label="Gestión de Usuarios" />
          )}
        </nav>

        {!isDesktopCollapsed && (
          <div className="erp-sidebar-footer">
            <span className="erp-online-dot" /> Sistema en línea
          </div>
        )}
      </aside>

      <div className="main-area-wrapper">
        <header className="erp-topbar">
          <div className="erp-breadcrumb">
            <span>ERP Transmdicas</span>
            <AppIcon name="chevron" size={14} />
            <strong>{moduleTitles[activeTab]}</strong>
          </div>
          <div className="erp-topbar-actions">
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="erp-icon-button"
              title={
                isDarkMode ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
            >
              <AppIcon name={isDarkMode ? "sun" : "moon"} size={18} />
            </button>
            <NotificacionesBell
              onNavigate={setActiveTab}
            />
            <div className="erp-user-info">
              <div>
                <strong>{user.username}</strong>
                <span>{user.rol}</span>
              </div>
              <div className="erp-user-avatar">
                {user.username.charAt(0).toUpperCase()}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="erp-logout-button"
              title="Cerrar sesión"
            >
              <AppIcon name="logout" size={17} />
              <span>Salir</span>
            </button>
          </div>
        </header>

        <main className="main-content-admin">
          {activeTab === "resumen" && hasAccess("resumen") && (
            <ResumenDashboard
              permisos={isAdmin ? { editar: true } : user?.permisos?.resumen}
            />
          )}
          {activeTab === "maestro" && hasAccess("flota") && (
            <MaestroFlotaDashboard
              permisos={
                isAdmin ? { ver: true, editar: true } : user?.permisos?.flota
              }
            />
          )}
          {activeTab === "personal" && hasAccess("personal") && (
            <DirectorioPersonal
              permisos={
                isAdmin ? { ver: true, editar: true } : user?.permisos?.personal
              }
            />
          )}
          {activeTab === "dashboard" && hasAccess("dashboard") && (
            <FlotasDashboard
              permisos={isAdmin ? { editar: true } : user?.permisos?.dashboard}
            />
          )}
          {activeTab === "entregas" && hasAccess("entregas") && (
            <EntregasTIDashboard
              vista="Entrega"
              permisos={
                isAdmin ? { ver: true, editar: true } : user?.permisos?.entregas
              }
              usuario={user}
            />
          )}
          {activeTab === "devoluciones" && hasAccess("devoluciones") && (
            <EntregasTIDashboard
              vista="Devolución"
              permisos={
                isAdmin
                  ? { ver: true, editar: true }
                  : user?.permisos?.devoluciones
              }
              usuario={user}
            />
          )}
          {activeTab === "tickets" && hasAccess("tickets") && (
            <SoporteTicketsDashboard
              permisos={
                isAdmin
                  ? { ver: true, editar: true, crear: true, gestionar: true }
                  : user?.permisos?.tickets
              }
              usuario={user}
            />
          )}
          {activeTab === "mantenimiento" && hasAccess("mantenimiento") && (
            <MantenimientoTecnico
              permisos={
                isAdmin ? { editar: true } : user?.permisos?.mantenimiento
              }
              vistaInicial={mantenimientoVista}
              navegacionId={mantenimientoNavKey}
              onVistaChange={setMantenimientoVista}
            />
          )}
          {activeTab === "reportes" && hasAccess("reportes") && (
            <ReportesDashboard
              permisos={isAdmin ? { editar: true } : user?.permisos?.reportes}
            />
          )}
          {activeTab === "usuarios" && isAdmin && <GestionUsuariosDashboard />}
        </main>
      </div>
      <AsistenteERPHSE
        user={user}
        isAdmin={isAdmin}
        hasAccess={hasAccess}
        onNavigate={(tab) => setActiveTab(tab)}
      />

    </div>
  );
}

export default App;

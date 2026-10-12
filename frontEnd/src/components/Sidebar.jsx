export function Sidebar({ currentTab, setTab }) {
  const menuItems = [
    { id: 'flotas', label: 'Dashboard de Flotas', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z' },
    { id: 'incidentes', label: 'Gestión Incidentes', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
    { id: 'entregas', label: 'Entregas TI', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Sistema Integrado TI</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>JDCALi Corporativo</p>
      </div>
      <nav>
        {menuItems.map(item => (
          <div 
            key={item.id}
            className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </div>
        ))}
      </nav>
    </aside>
  );
}

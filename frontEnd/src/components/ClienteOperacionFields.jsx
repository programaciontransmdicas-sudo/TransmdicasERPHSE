export function ClienteOperacionFields({
  opciones = [], cliente, relacionId, onChange, required = true,
  cargando = false, error = '', onReintentar
}) {
  const catalogo = opciones.map(item => ({
    ...item,
    cliente: String(item.cliente || '').trim(),
    operacion: String(item.operacion || '').trim()
  })).filter(item => item.cliente && item.operacion);
  const clienteActual = String(cliente || '').trim();
  const clientes = [...new Set(catalogo.map(item => item.cliente))];
  const operaciones = catalogo.filter(item => item.cliente === clienteActual);
  const estilo = { width: '100%', padding: '0.65rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' };

  return <>
    <label>Cliente
      <select aria-label="Cliente" style={estilo} value={clienteActual} required={required}
        disabled={cargando || Boolean(error) || !clientes.length}
        onChange={event => onChange({ cliente: event.target.value, operacion: '', cliente_operacion_id: '' })}>
        <option value="">{cargando ? 'Cargando clientes…' : 'Seleccione un cliente'}</option>
        {clientes.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
      </select>
    </label>
    <label>Operación
      <select aria-label="Operación" style={estilo} value={relacionId || ''} required={required}
        disabled={cargando || Boolean(error) || !clienteActual || !operaciones.length}
        onChange={event => {
          const relacion = operaciones.find(item => String(item.id) === event.target.value);
          onChange({ cliente: clienteActual, operacion: relacion?.operacion || '', cliente_operacion_id: event.target.value });
        }}>
        <option value="">{cargando ? 'Cargando operaciones…' : !clienteActual ? 'Seleccione primero un cliente' : !operaciones.length ? 'Sin operaciones disponibles' : 'Seleccione una operación'}</option>
        {operaciones.map(item => <option key={item.id} value={item.id}>{item.operacion}</option>)}
      </select>
    </label>
    {error && <div role="alert" style={{ gridColumn: '1 / -1', color: '#b42318' }}>
      {error} {onReintentar && <button type="button" className="ui-button ui-button-secondary" onClick={onReintentar}>Volver a cargar</button>}
    </div>}
  </>;
}

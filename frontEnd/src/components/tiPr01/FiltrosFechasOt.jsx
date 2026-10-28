import { CAMPOS_FECHA_OT } from './fechasOt';

export function FiltrosFechasOt({ valor, onChange }) {
  const cambiar = cambios => onChange({ ...valor, ...cambios });
  const opciones = Object.entries(CAMPOS_FECHA_OT);
  return <>
    <div className="ti-bar" style={{ marginTop: 12 }} aria-label="Filtros de fechas">
      <label className="ti-smalltxt">Filtrar por{' '}
        <select aria-label="Filtrar fechas por" value={valor.filtrarPor}
          onChange={e => cambiar({ filtrarPor: e.target.value })}>
          {opciones.map(([campo, etiqueta]) => <option key={campo} value={campo}>{etiqueta}</option>)}
        </select>
      </label>
      <label className="ti-smalltxt">Desde{' '}
        <input type="date" aria-label="Fecha desde" value={valor.desde}
          onChange={e => cambiar({ desde: e.target.value })} />
      </label>
      <label className="ti-smalltxt">Hasta{' '}
        <input type="date" aria-label="Fecha hasta" value={valor.hasta}
          onChange={e => cambiar({ hasta: e.target.value })} />
      </label>
      <label className="ti-smalltxt">Ordenar por{' '}
        <select aria-label="Ordenar fechas por" value={valor.ordenarPor}
          onChange={e => cambiar({ ordenarPor: e.target.value })}>
          {opciones.map(([campo, etiqueta]) => <option key={campo} value={campo}>{etiqueta}</option>)}
        </select>
      </label>
      <select aria-label="Sentido del orden de fechas" value={valor.sentido}
        onChange={e => cambiar({ sentido: e.target.value })}>
        <option value="desc">Más recientes primero</option>
        <option value="asc">Más antiguas primero</option>
      </select>
      {(valor.desde || valor.hasta) && <button type="button" className="ti-btn small"
        onClick={() => cambiar({ desde: '', hasta: '' })}>Limpiar fechas</button>}
    </div>
    {valor.desde && valor.hasta && valor.desde > valor.hasta &&
      <p role="alert" className="ti-badbox">La fecha hasta debe ser igual o posterior a la fecha desde.</p>}
    <p className="ti-smalltxt">
      Ejecución: día del trabajo. Cierre: día de registro en el ERP. Quincena efectiva: período previsto, incluidas las reprogramaciones.
      {' '}Los sellos de apertura y cierre se muestran en hora de Perú.
      {(valor.desde || valor.hasta) && <> El rango incluye solo registros con {CAMPOS_FECHA_OT[valor.filtrarPor].toLowerCase()} dentro de esas fechas.</>}
    </p>
  </>;
}

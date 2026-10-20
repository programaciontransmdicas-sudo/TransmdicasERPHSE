import { CATALOGO_EQUIPOS } from '../utils/equiposVehiculo';
import './inventarioVehiculo.css';

export function EquiposVehiculoFields({ equipos, onChange, disabled = false }) {
  const cambiar = (tipo, campo, valor) => {
    onChange(equipos.map(e => {
      if (e.tipo_equipo !== tipo) return e;
      const actualizado = { ...e, [campo]: valor };
      if (campo === 'estado_inventario' && valor !== 'INSTALADO') {
        Object.assign(actualizado, { marca: '', modelo: '', numero_serie: '', fecha_instalacion: '' });
      }
      return actualizado;
    }));
  };
  return (
    <div className="inventario-form-list">
      {CATALOGO_EQUIPOS.map(([tipo, nombre]) => {
        const equipo = equipos.find(e => e.tipo_equipo === tipo);
        if (!equipo) return null;
        return (
          <fieldset className="inventario-equipo-form" key={tipo} disabled={disabled}>
            <legend>{nombre}</legend>
            <label>Situación del dispositivo
              <select required aria-label={`Situación de ${nombre}`} value={equipo.estado_inventario}
                onChange={e => cambiar(tipo, 'estado_inventario', e.target.value)}>
                <option value="">Seleccione una opción</option>
                <option value="INSTALADO">Instalado</option>
                <option value="NO_APLICA">No aplica</option>
                <option value="POR_VALIDAR">Por confirmar</option>
              </select>
            </label>
            {equipo.estado_inventario === 'INSTALADO' && (
              <div className="inventario-campos">
                {[
                  ['marca', 'Marca', 'text', 120],
                  ['modelo', 'Modelo', 'text', 120],
                  ['numero_serie', 'Número de serie', 'text', 120],
                  ['fecha_instalacion', 'Fecha de instalación', 'date', undefined]
                ].map(([campo, etiqueta, tipoInput, maxLength]) => (
                  <label key={campo}>{etiqueta}
                    <input type={tipoInput} aria-label={`${etiqueta} de ${nombre}`}
                      maxLength={maxLength} value={equipo[campo]}
                      onChange={e => cambiar(tipo, campo, e.target.value)} />
                  </label>
                ))}
              </div>
            )}
            <label>Observaciones
              <textarea rows={2} maxLength={2000} aria-label={`Observaciones de ${nombre}`}
                value={equipo.observaciones} onChange={e => cambiar(tipo, 'observaciones', e.target.value)} />
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}

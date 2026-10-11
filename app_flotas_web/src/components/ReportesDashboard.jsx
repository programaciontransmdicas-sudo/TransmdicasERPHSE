import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { UiIcon } from './UiIcon';

export function ReportesDashboard() {
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [operaciones, setOperaciones] = useState([]);
  const [
    clienteOperacionId,
    setClienteOperacionId
  ] = useState('');
  const [loadingOps, setLoadingOps] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(defaultStart);
  const [fechaFin, setFechaFin] = useState(defaultEnd);

  const handleOpenExport = async () => {
    if (!fechaInicio || !fechaFin) return toast.error('Seleccione un rango de fechas válido.');
    if (fechaInicio > fechaFin) return toast.error('La fecha de inicio no puede ser mayor a la fecha de fin.');
    setModalOpen(true);
    setLoadingOps(true);
    setClienteOperacionId('');
    setOperaciones([]);
    try {
      const data = await api.getOperacionesReportes();
      setOperaciones(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar las operaciones.');
      setModalOpen(false);
    } finally {
      setLoadingOps(false);
    }
  };

  const handleDownloadMaster = async () => {
    if (loading) return;

    const relacionSeleccionada =
      operaciones.find(
        item =>
          String(item.id) ===
          String(clienteOperacionId)
      );

    if (!relacionSeleccionada) {
      return toast.error(
        'Seleccione un cliente y operación válidos.'
      );
    }

    setLoading(true);
    const loadingToast = toast.loading('Generando las tres pestañas de la operación seleccionada...');
    try {
      const blob = await api.downloadMasterReport(
        fechaInicio,
        fechaFin,
        clienteOperacionId
      );
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Reporte_${clienteOperacionId.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')}_${fechaInicio}_al_${fechaFin}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
      setModalOpen(false);
      toast.success('Reporte descargado exitosamente', { id: loadingToast });
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Ocurrió un error al descargar el reporte', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="erp-module-page erp-reports-page">
      <header className="reports-page-header">
        <h2>Reportes Gerenciales</h2>
        <p>Módulo centralizado de exportación de datos e indicadores clave de rendimiento.</p>
      </header>

      <section className="reports-layout">
        <article className="report-master-card">
          <span className="report-card-decoration" aria-hidden="true" />
          <div className="report-card-heading">
            <span className="report-card-icon"><UiIcon name="chart" size={24} /></span>
            <div>
              <h3>Reporte Master de Auditoría</h3>
              <p>Genera un único archivo Excel con tres pestañas y fotografías incrustadas.</p>
            </div>
          </div>

          <div className="report-date-grid">
            <label><span>Fecha de inicio</span><input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} /></label>
            <label><span>Fecha de fin</span><input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} /></label>
          </div>

          <button className="ui-button ui-button-success report-download-button" onClick={handleOpenExport} disabled={loading || loadingOps || modalOpen}>
            {loading ? <span className="ui-spinner" /> : <UiIcon name="download" />}
            {loading ? 'Procesando fotos e información...' : 'Descargar Excel Master'}
          </button>
          <p className="report-card-footnote">Incluye: TI-PR-01, REGISTRO y la hoja de la operación seleccionada.</p>
        </article>
      </section>

      {modalOpen && (
        <div className="ui-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="export-title" onKeyDown={(event) => { if (event.key === 'Escape' && !loading) setModalOpen(false); }}>
          <div className="ui-modal-card">
            <div className="ui-modal-heading">
              <div><h3 id="export-title">Exportar por operación</h3><p>Se tomará la última inspección de cada placa dentro del período seleccionado.</p></div>
              <button className="ui-icon-button" type="button" onClick={() => setModalOpen(false)} disabled={loading} aria-label="Cerrar"><UiIcon name="close" /></button>
            </div>
            <div className="report-period-summary"><span>Período seleccionado</span><strong>{fechaInicio} al {fechaFin}</strong></div>
            <label className="ui-field" htmlFor="export-operacion">
              <span>Operación</span>
              <select
                id="export-operacion"
                autoFocus
                value={clienteOperacionId}
                onChange={event =>
                  setClienteOperacionId(
                    event.target.value
                  )
                }
                disabled={loading || loadingOps}
              >
                <option value="">
                  {loadingOps
                    ? 'Cargando clientes y operaciones...'
                    : 'Seleccione cliente y operación'}
                </option>

                {operaciones.map(item => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {!loadingOps && !operaciones.length && <p className="ui-empty-note">No hay operaciones disponibles.</p>}
            <div className="ui-modal-actions">
              <button className="ui-button ui-button-secondary" type="button" disabled={loading} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="ui-button ui-button-success" type="button" disabled={
                loading ||
                loadingOps ||
                !clienteOperacionId
              } onClick={handleDownloadMaster}>
                {loading ? <span className="ui-spinner" /> : <UiIcon name="download" />}{loading ? 'Generando...' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

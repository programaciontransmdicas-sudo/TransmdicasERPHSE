import { tieneAccesoTotalFlota, obtenerClienteOperacionIds } from '../../middlewares/auth.js';
import { esAdministrador } from '../../services/catalogoService.js';
import { logAction } from '../../services/auditService.js';
import { clavePlaca, prepararEquiposVehiculo } from './equiposService.js';
import { buscarUnidadConAcceso, leerEquipos, leerFamiliasConfirmadas, guardarInventarioVehiculo } from './equiposRepository.js';

function responderError(res, error) {
  if ([400, 403, 404, 409].includes(error.status)) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('Error en el inventario de la unidad:', error);
  return res.status(500).json({ error: 'No se pudo procesar el inventario de la unidad' });
}

export async function consultarEquiposVehiculo(req, res) {
  try {
    const vehiculo = await buscarUnidadConAcceso(clavePlaca(req.params.placa),
      tieneAccesoTotalFlota(req), obtenerClienteOperacionIds(req));
    if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });
    const [equipos, familias_confirmadas] = await Promise.all([
      leerEquipos(vehiculo.placa), leerFamiliasConfirmadas(vehiculo.placa)
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ placa: vehiculo.placa, equipos, familias_confirmadas });
  } catch (error) {
    return responderError(res, error);
  }
}

export async function actualizarEquiposVehiculo(req, res) {
  if (!esAdministrador(req)) {
    return res.status(403).json({ error: 'Solo el administrador puede modificar los dispositivos de una unidad existente' });
  }
  try {
    const equipos = prepararEquiposVehiculo(req.body?.equipos);
    const resultado = await guardarInventarioVehiculo(clavePlaca(req.params.placa), equipos);
    await logAction(req.user.id, `Actualizó los dispositivos de ${resultado.placa}`,
      'vehiculo_equipos', req, resultado.anteriores, resultado.actuales);
    return res.json({ placa: resultado.placa, equipos: resultado.actuales });
  } catch (error) {
    return responderError(res, error);
  }
}

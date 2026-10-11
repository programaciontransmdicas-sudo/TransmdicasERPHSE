import {
  obtenerHistorial,
  crearInspeccion,
  obtenerInspeccionPorId,
  actualizarInspeccion,
  eliminarInspeccion
} from './repository.js';

import {
  validarDatosInspeccion,
  validarEvidenciasInspeccion,
  subirImagenesInspeccion,
  eliminarImagenes,
  InspeccionValidationError
} from './service.js';

import {
  uploadToCloudinary
} from '../../services/cloudinaryService.js';

import {
  logAction
} from '../../services/auditService.js';

import {
  tieneAccesoTotalFlota,
  obtenerClienteOperacionIds
} from '../../middlewares/auth.js';

const obtenerAlcance = req => ({
  accesoTotal:
    tieneAccesoTotalFlota(req),
  clienteOperacionIds:
    obtenerClienteOperacionIds(req) || []
});

export const listarHistorial =
  async (req, res) => {
    try {
      const historial =
        await obtenerHistorial({
          placa:
            req.params.placa,
          ...obtenerAlcance(req)
        });

      return res.json(historial);
    } catch (error) {
      console.error(
        'Error al obtener historial:',
        error
      );

      return res.status(500).json({
        error:
          'Error al obtener historial'
      });
    }
  };

export const registrarInspeccion =
  async (req, res) => {
    let imagenes = {
      imgTablet: '',
      imgRadio: '',
      imgCamaras: ''
    };

    try {
      const alcance =
        obtenerAlcance(req);

      validarEvidenciasInspeccion(req.files);

      const datos =
        await validarDatosInspeccion(
          req.body,
          true,
          alcance
        );

      imagenes =
        await subirImagenesInspeccion(
          req.files
        );

      const inspeccionCreada =
        await crearInspeccion({
          placa: datos.placa,
          fechaHora: datos.fecha_hora,
          tablet: datos.tablet,
          radio: datos.radio,
          camaras: datos.camaras,
          imgTablet:
            imagenes.imgTablet,
          imgRadio:
            imagenes.imgRadio,
          imgCamaras:
            imagenes.imgCamaras,
          observaciones:
            datos.observaciones,
          ...alcance
        });

      if (!inspeccionCreada) {
        throw new InspeccionValidationError(
          'La placa no existe o no pertenece a sus clientes y operaciones asignados.',
          403
        );
      }

      await logAction(
        req.user.id,
        `Registró inspección en ${datos.placa}`,
        'inspecciones_flota',
        req,
        null,
        inspeccionCreada
      );

      return res
        .status(201)
        .json(inspeccionCreada);
    } catch (error) {
      if (
        error instanceof
        InspeccionValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error: error.message
          });
      }

      await eliminarImagenes([
        imagenes.imgTablet,
        imagenes.imgRadio,
        imagenes.imgCamaras
      ]);

      if (
        error.code === '23503'
      ) {
        return res.status(400).json({
          error:
            'La placa ya no existe en el maestro de vehículos.'
        });
      }

      console.error(
        'Error al registrar inspección:',
        error
      );

      return res.status(500).json({
        error:
          'Error al registrar inspección'
      });
    }
  };

export const borrarInspeccion =
  async (req, res) => {
    const { id } = req.params;

    try {
      const alcance =
        obtenerAlcance(req);

      const inspeccionEliminada =
        await eliminarInspeccion({
          id,
          ...alcance
        });

      if (!inspeccionEliminada) {
        return res.status(404).json({
          error:
            'Inspección no encontrada'
        });
      }

      await eliminarImagenes([
        inspeccionEliminada.img_tablet,
        inspeccionEliminada.img_radio,
        inspeccionEliminada.img_camaras
      ]);

      await logAction(
        req.user.id,
        `Eliminó inspección #${id} de ${inspeccionEliminada.placa}`,
        'inspecciones_flota',
        req,
        inspeccionEliminada,
        null
      );

      return res.json({
        message:
          'Inspección eliminada'
      });
    } catch (error) {
      console.error(
        'Error al eliminar inspección:',
        error
      );

      return res.status(500).json({
        error:
          'Error al eliminar inspección'
      });
    }
  };

export const editarInspeccion =
  async (req, res) => {
    const { id } = req.params;

    const nuevasUrls = [];
    const urlsAnteriores = [];

    try {
      const alcance =
        obtenerAlcance(req);

      const datos =
        await validarDatosInspeccion(
          req.body,
          false,
          alcance
        );

      const actual =
        await obtenerInspeccionPorId({
          id,
          ...alcance
        });

      if (!actual) {
        return res.status(404).json({
          error:
            'Inspección no encontrada'
        });
      }

      if (
        String(
          actual.fecha ?? ''
        ).trim() &&
        !datos.fecha
      ) {
        return res.status(400).json({
          error:
            'No puedes vaciar una fecha ya registrada.'
        });
      }

      if (
        String(
          actual.hora ?? ''
        ).trim() &&
        !datos.hora
      ) {
        return res.status(400).json({
          error:
            'No puedes vaciar una hora ya registrada.'
        });
      }

      let imgTablet =
        actual.img_tablet;

      let imgRadio =
        actual.img_radio;

      let imgCamaras =
        actual.img_camaras;

      if (
        req.files?.img_tablet?.length
      ) {
        imgTablet =
          await uploadToCloudinary(
            req.files.img_tablet[0].buffer,
            'flotas_inspecciones'
          );

        nuevasUrls.push(imgTablet);

        if (actual.img_tablet) {
          urlsAnteriores.push(
            actual.img_tablet
          );
        }
      }

      if (
        req.files?.img_radio?.length
      ) {
        imgRadio =
          await uploadToCloudinary(
            req.files.img_radio[0].buffer,
            'flotas_inspecciones'
          );

        nuevasUrls.push(imgRadio);

        if (actual.img_radio) {
          urlsAnteriores.push(
            actual.img_radio
          );
        }
      }

      if (
        req.files?.img_camaras?.length
      ) {
        imgCamaras =
          await uploadToCloudinary(
            req.files.img_camaras[0].buffer,
            'flotas_inspecciones'
          );

        nuevasUrls.push(imgCamaras);

        if (actual.img_camaras) {
          urlsAnteriores.push(
            actual.img_camaras
          );
        }
      }

      const inspeccionActualizada =
        await actualizarInspeccion({
          id,
          fechaHora: datos.fecha_hora,
          tablet: datos.tablet,
          radio: datos.radio,
          camaras: datos.camaras,
          imgTablet,
          imgRadio,
          imgCamaras,
          observaciones:
            datos.observaciones,
          ...alcance
        });

      if (!inspeccionActualizada) {
        return res.status(404).json({
          error:
            'Inspección no encontrada'
        });
      }

      await logAction(
        req.user.id,
        `Actualizó inspección #${id} de ${inspeccionActualizada.placa}`,
        'inspecciones_flota',
        req,
        actual,
        inspeccionActualizada
      );

      await eliminarImagenes(
        urlsAnteriores
      );

      return res.json(
        inspeccionActualizada
      );
    } catch (error) {
      await eliminarImagenes(
        nuevasUrls
      );

      if (
        error instanceof
        InspeccionValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error: error.message
          });
      }

      console.error(
        'Error al actualizar inspección:',
        error
      );

      return res.status(500).json({
        error:
          'Error al actualizar inspección completa'
      });
    }
  };

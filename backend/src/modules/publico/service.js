export const componenteCorrecto =
  valor => {
    const estado =
      String(valor || '')
        .trim()
        .toUpperCase();

    return [
      'OK',
      'N/A',
      'NO APLICA'
    ].includes(estado);
  };

export const calcularEstado =
  inspeccion => {
    const aprobado =
      componenteCorrecto(
        inspeccion.tablet
      ) &&
      componenteCorrecto(
        inspeccion.radio
      ) &&
      componenteCorrecto(
        inspeccion.camaras
      );

    return aprobado
      ? 'APROBADO'
      : 'OBSERVADO';
  };

export const construirUrlImagen =
  (
    req,
    valor
  ) => {
    if (!valor) {
      return null;
    }

    if (
      /^https?:\/\//i.test(
        valor
      )
    ) {
      return valor;
    }

    const nombreArchivo =
      String(valor)
        .replace(
          /^\/+/,
          ''
        )
        .replace(
          /^uploads\//i,
          ''
        );

    return (
      `${req.protocol}://` +
      `${req.get('host')}` +
      `/uploads/${nombreArchivo}`
    );
  };

export const fechaActualPeru =
  () => {
    const partes =
      new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone:
            'America/Lima',
          year:
            'numeric',
          month:
            '2-digit',
          day:
            '2-digit'
        }
      ).formatToParts(
        new Date()
      );

    const valores =
      Object.fromEntries(
        partes.map(
          parte => [
            parte.type,
            parte.value
          ]
        )
      );

    return (
      `${valores.year}-` +
      `${valores.month}-` +
      `${valores.day}`
    );
  };

export const normalizarPlacaPublica =
  valor => {
    const placa =
      String(valor || '')
        .trim()
        .toUpperCase();

    if (
      !placa ||
      placa.length > 20
    ) {
      const error =
        new Error(
          'La placa proporcionada no es válida'
        );

      error.status = 400;

      throw error;
    }

    return placa;
  };
export const fechaISOValida =
  value => {
    if (
      typeof value !==
        'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value
      )
    ) {
      return false;
    }

    const date =
      new Date(
        `${value}T00:00:00Z`
      );

    return (
      Number.isFinite(
        date.getTime()
      ) &&
      date
        .toISOString()
        .slice(0, 10) ===
        value
    );
  };

export const validarParametrosMaster =
  ({
    startDate,
    endDate,
    clienteOperacionId
  }) => {
    if (
      !fechaISOValida(startDate) ||
      !fechaISOValida(endDate) ||
      startDate > endDate
    ) {
      const error = new Error(
        'El rango de fechas no es válido'
      );

      error.status = 400;
      throw error;
    }

    const clienteOperacionIdFinal =
      Number.parseInt(
        clienteOperacionId,
        10
      );

    if (
      !Number.isInteger(
        clienteOperacionIdFinal
      ) ||
      clienteOperacionIdFinal <= 0
    ) {
      const error = new Error(
        'Seleccione un cliente y operación válidos'
      );

      error.status = 400;
      throw error;
    }

    return {
      startDate,
      endDate,
      clienteOperacionId:
        clienteOperacionIdFinal
    };
  };
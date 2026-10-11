export const construirTendencia =
  inspecciones => {
    const conteoFechas = {};

    inspecciones.forEach(
      row => {
        if (!row.fecha) {
          return;
        }

        conteoFechas[
          row.fecha
        ] =
          (
            conteoFechas[
              row.fecha
            ] || 0
          ) + 1;
      }
    );

    const fechasOrdenadas =
      Object
        .keys(
          conteoFechas
        )
        .sort(
          (
            fechaA,
            fechaB
          ) =>
            new Date(
              `${fechaA}T00:00:00`
            ).getTime() -
            new Date(
              `${fechaB}T00:00:00`
            ).getTime()
        );

    return fechasOrdenadas
      .slice(-14)
      .map(
        fecha => ({
          date:
            fecha,

          inspecciones:
            conteoFechas[
              fecha
            ]
        })
      );
  };

export const mapearProgramas =
  rows =>
    rows.map(
      row => ({
        name:
          row.programa,

        value:
          Number(
            row.cantidad
          )
      })
    );

export const mapearSoporte =
  rows =>
    rows.map(
      row => ({
        name:
          row.estado,

        value:
          Number(
            row.cantidad
          )
      })
    );

export const mapearInventario =
  rows =>
    rows.map(
      row => ({
        name:
          row.tipo_movimiento,

        value:
          Number(
            row.cantidad
          )
      })
    );

export const construirFallos =
  errores => [
    {
      name:
        'Tablet',

      errores:
        Number(
          errores
            ?.tablet_errors || 0
        )
    },
    {
      name:
        'Radio',

      errores:
        Number(
          errores
            ?.radio_errors || 0
        )
    },
    {
      name:
        'Cámaras',

      errores:
        Number(
          errores
            ?.camaras_errors || 0
        )
    }
  ];

export const construirSalud =
  salud => ({
    aprobados:
      Number(
        salud
          ?.aprobados || 0
      ),

    observados:
      Number(
        salud
          ?.observados || 0
      )
  });
import ExcelJS from 'exceljs';
import { createHash } from 'crypto';

import {
  pool
} from '../../config/database.js';

export class EntregaValidationError extends Error {
  constructor(
    message,
    status = 400
  ) {
    super(message);

    this.name =
      'EntregaValidationError';

    this.status = status;
  }
}

export const normalizarTipoMovimiento =
  valor => {
    const tipo =
      String(
        valor || 'Entrega'
      )
        .trim()
        .toLowerCase();

    if (
      ![
        'entrega',
        'devolución',
        'devolucion'
      ].includes(tipo)
    ) {
      throw new EntregaValidationError(
        'Tipo de movimiento no válido'
      );
    }

    return tipo === 'entrega'
      ? 'Entrega'
      : 'Devolución';
  };

export const normalizarDni =
  valor => {
    const dni =
      String(
        valor || ''
      ).trim();

    if (
      !/^[0-9]{1,20}$/.test(
        dni
      )
    ) {
      throw new EntregaValidationError(
        'Ingrese un DNI válido, solo con números'
      );
    }

    return dni;
  };

export const normalizarPrecio =
  valor => {
    const precio =
      Number.parseFloat(
        valor
      );

    return Number.isNaN(
      precio
    )
      ? null
      : precio;
  };

export const normalizarFecha =
  valor =>
    valor || null;

export const obtenerResourceTypeActa =
  mimetype =>
    mimetype ===
      'application/pdf'
      ? 'raw'
      : 'auto';

// ==========================================
// IMPORTACIÓN EXCEL
// ==========================================

export const procesarImportacionExcel =
  async ({
    buffer,
    tipo,
    confirmar,
    firmaRecibida
  }) => {
    const texto = valor =>
      String(
        valor ?? ''
      ).trim();

    const normalizar = valor =>
      texto(valor)
        .replace(
          /\s+/g,
          ' '
        )
        .toUpperCase();

    const serieClave = valor =>
      /^(?:-*|S\/N|N\/A|NULL|SIN SERIE|NO APLICA)$/.test(
        normalizar(valor)
      )
        ? ''
        : normalizar(valor);

    const fallo = mensaje => {
      throw new EntregaValidationError(
        mensaje,
        400
      );
    };

    if (
      !buffer
    ) {
      fallo(
        'Selecciona un archivo Excel'
      );
    }

    if (
      ![
        'Entrega',
        'Devolución'
      ].includes(tipo)
    ) {
      fallo(
        'Selecciona Entregas o Devoluciones antes de importar'
      );
    }

    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(
      buffer
    );

    const sheet =
      workbook.worksheets[0];

    if (!sheet) {
      fallo(
        'El archivo no contiene una hoja'
      );
    }
    const valorCelda =
      celda => {
        const valor =
          celda?.value;

        if (
          valor == null ||
          valor === undefined
        ) {
          return null;
        }
        if (typeof valor === 'object') {
          if (Object.hasOwn(valor, 'result')) {
            return valor.result ?? null;
          }
          if (Array.isArray(valor.richText)) {
            return valor.richText.map(parte => parte.text || '').join('')
          }
          if (Object.hasOwn(valor, 'text')) {
            return valor.text ?? null;
          }
        }
        return valor;
      };
    const data = [];

    for (let fila = 1; fila <= sheet.rowCount; fila += 1) {
      const valores = [];
      for (let columna = 1; columna <= sheet.columnCount; columna += 1) {
        valores.push(valorCelda(sheet.getCell(fila, columna)));
      }
      data.push(valores);
    }
    const titulo = normalizar(valorCelda(sheet.getCell('D2')));

    const tipoArchivo =
      titulo.includes(
        'DEVOLUCIONES'
      )
        ? 'Devolución'
        : titulo.includes(
          'ENTREGAS'
        )
          ? 'Entrega'
          : null;

    if (
      tipoArchivo !== tipo
    ) {
      fallo(
        'El título del Excel no corresponde a la sección seleccionada'
      );
    }

    const cabecera =
      data.findIndex(
        row => {
          return (
            normalizar(
              row[1]
            ) === 'FECHA' &&
            normalizar(
              row[4]
            ) === 'DNI' &&
            normalizar(
              row[8]
            ) === 'EQUIPO' &&
            normalizar(
              row[11]
            ).startsWith(
              'S/N'
            )
          );
        }
      );

    if (
      cabecera < 0
    ) {
      fallo(
        'No se reconocen las columnas del formato de inventario TI'
      );
    }

    const convertirFecha =
      (
        valor,
        fila
      ) => {
        if (
          !texto(valor)
        ) {
          return null;
        }

        let fechaISO;

        if (
          valor instanceof Date
        ) {
          fechaISO =
            valor
              .toISOString()
              .slice(0, 10);
        } else if (
          typeof valor ===
          'number'
        ) {
          const usa1904 =
            Boolean(
              workbook
                .properties
                ?.date1904
            );

          const dias =
            Math.floor(
              valor
            );

          if (
            !Number.isFinite(
              valor
            ) ||
            dias <
            (
              usa1904
                ? 0
                : 1
            ) ||
            (
              !usa1904 &&
              dias === 60
            )
          ) {
            fallo(
              `Fecha numérica no válida en la fila ${fila}`
            );
          }

          const base =
            usa1904
              ? Date.UTC(
                1904,
                0,
                1
              )
              : Date.UTC(
                1899,
                11,
                dias < 60
                  ? 31
                  : 30
              );

          const fecha =
            new Date(
              base +
              dias *
              86400000
            );

          if (
            Number.isNaN(
              fecha.getTime()
            )
          ) {
            fallo(
              `Fecha no válida en la fila ${fila}`
            );
          }

          fechaISO =
            fecha
              .toISOString()
              .slice(
                0,
                10
              );
        } else {
          const partes =
            texto(
              valor
            ).match(
              /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
            );

          fechaISO =
            partes
              ? `${partes[3]}-${partes[2].padStart(2, '0')}-${partes[1].padStart(2, '0')}`
              : texto(
                valor
              );
        }

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(
            fechaISO
          ) ||
          fechaISO.startsWith(
            '0000-'
          )
        ) {
          fallo(
            `Formato de fecha no válido en la fila ${fila}`
          );
        }

        const fecha =
          new Date(
            `${fechaISO}T00:00:00.000Z`
          );

        if (
          Number.isNaN(
            fecha.getTime()
          ) ||
          fecha
            .toISOString()
            .slice(
              0,
              10
            ) !== fechaISO
        ) {
          fallo(
            `Fecha inexistente en la fila ${fila}`
          );
        }

        return fechaISO;
      };

    const campos = [
      'fecha',
      'encargado',
      'nombre',
      'dni',
      'cargo',
      'operacion',
      'condicion',
      'equipo_tipo',
      'marca',
      'modelo',
      'serie',
      'laptop',
      'mouse',
      'cargador',
      'motivo',
      'observaciones',
      'precio',
      'tipo_movimiento'
    ];

    const registros = [];

    for (
      let i =
        cabecera + 1;
      i < data.length;
      i++
    ) {
      const row =
        data[i];

      if (
        !row?.some(
          value =>
            texto(value)
        )
      ) {
        continue;
      }

      if (
        !texto(
          row[3]
        )
      ) {
        fallo(
          `Falta el nombre en la fila ${i + 1}`
        );
      }

      const registro =
        Object.fromEntries(
          campos
            .slice(
              0,
              17
            )
            .map(
              (
                campo,
                index
              ) => [
                  campo,
                  texto(
                    row[
                    index + 1
                    ]
                  ) ||
                  null
                ]
            )
        );

      registro.fecha =
        convertirFecha(
          row[1],
          i + 1
        );

      registro.precio =
        !texto(
          row[17]
        ) ||
          /^-+$/.test(
            texto(
              row[17]
            )
          )
          ? null
          : Number(
            row[17]
          );

      if (
        registro.precio !==
        null &&
        !Number.isFinite(
          registro.precio
        )
      ) {
        fallo(
          `Precio no válido en la fila ${i + 1}`
        );
      }

      registro.tipo_movimiento =
        tipo;

      registro.fila =
        i + 1;

      registros.push(
        registro
      );
    }

    if (
      !registros.length ||
      registros.length >
      10000
    ) {
      fallo(
        'El Excel debe contener entre 1 y 10000 registros'
      );
    }

    const clave =
      registro =>
        JSON.stringify([
          normalizar(
            registro
              .tipo_movimiento ||
            'Entrega'
          ).replace(
            'DEVOLUCION',
            'DEVOLUCIÓN'
          ),

          registro.fecha ||
          '',

          normalizar(
            registro.dni
          ),

          normalizar(
            registro.nombre
          ),

          normalizar(
            registro.equipo_tipo
          ),

          serieClave(
            registro.serie
          )
        ]);

    let client;

    try {
      client =
        await pool.connect();

      await client.query(
        'BEGIN'
      );

      await client.query(
        "SET LOCAL lock_timeout = '5s'"
      );

      await client.query(
        "SET LOCAL statement_timeout = '30s'"
      );

      await client.query(
        'LOCK TABLE public.entregas_ti IN SHARE ROW EXCLUSIVE MODE'
      );

      const actual =
        await client.query(
          `SELECT *,
             to_char(
               fecha,
               'YYYY-MM-DD'
             ) AS fecha
           FROM public.entregas_ti`
        );

      const conocidas =
        new Set(
          actual.rows.map(
            clave
          )
        );

      const nuevos = [];

      let omitidos = 0;

      for (
        const registro
        of registros
      ) {
        const llave =
          clave(
            registro
          );

        if (
          conocidas.has(
            llave
          )
        ) {
          omitidos++;
          continue;
        }

        if (
          !registro.fecha ||
          !registro.dni ||
          !registro.equipo_tipo ||
          normalizar(
            registro.equipo_tipo
          ) === 'NUEVO'
        ) {
          fallo(
            `La fila ${registro.fila} no coincide con un registro existente y necesita revisar fecha, DNI o equipo antes de importarse`
          );
        }

        conocidas.add(
          llave
        );

        nuevos.push(
          registro
        );
      }

      const firma =
        createHash(
          'sha256'
        )
          .update(
            JSON.stringify(
              nuevos.map(
                registro =>
                  campos.map(
                    campo =>
                      registro[
                      campo
                      ]
                  )
              )
            )
          )
          .digest(
            'hex'
          );

      const resumen = {
        total:
          registros.length,
        nuevos:
          nuevos.length,
        omitidos,
        firma
      };

      if (
        confirmar !==
        'si'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return {
          ...resumen,
          revision: true,
          message:
            `Revisión: ${nuevos.length} por agregar; ${omitidos} ya reconocidos. No se guardó nada.`
        };
      }

      if (
        firmaRecibida !==
        firma
      ) {
        fallo(
          'Los datos cambiaron desde la revisión. Vuelve a seleccionar el archivo para revisarlo otra vez'
        );
      }

      const sql = `
        INSERT INTO public.entregas_ti (
          ${campos.join(', ')}
        )
        VALUES (
          ${campos
          .map(
            (
              _,
              index
            ) =>
              `$${index + 1}`
          )
          .join(', ')}
        )
      `;

      for (
        const registro
        of nuevos
      ) {
        await client.query(
          sql,
          campos.map(
            campo =>
              registro[
              campo
              ]
          )
        );
      }

      await client.query(
        'COMMIT'
      );

      return {
        ...resumen,
        insertados:
          nuevos.length,
        message:
          `Importación completada: ${nuevos.length} agregados y ${omitidos} ya reconocidos.`
      };
    } catch (error) {
      if (client) {
        try {
          await client.query(
            'ROLLBACK'
          );
        } catch (
        rollbackError
        ) {
          client.release(
            rollbackError
          );

          client = null;
        }
      }

      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  };
// ==========================================
// EXPORTACIÓN EXCEL
// ==========================================

export const esFechaISOValida =
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
        .slice(
          0,
          10
        ) === value
    );
  };

export const normalizarTipoExportacion =
  valor => {
    const tipo =
      String(valor || '')
        .trim()
        .toLowerCase();

    if (
      tipo &&
      ![
        'entrega',
        'devolución',
        'devolucion'
      ].includes(tipo)
    ) {
      throw new EntregaValidationError(
        'Tipo de movimiento no válido'
      );
    }

    if (
      tipo === 'entrega'
    ) {
      return 'Entrega';
    }

    if (
      tipo === 'devolución' ||
      tipo === 'devolucion'
    ) {
      return 'Devolución';
    }

    return null;
  };
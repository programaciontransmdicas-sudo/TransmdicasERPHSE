import ExcelJS from 'exceljs';
import fs from 'fs';

// ==========================================
// GENERADOR EXCEL ENTREGAS / DEVOLUCIONES
// ==========================================

const formatDMY =
  dateObj => {
    if (!dateObj) {
      return '';
    }

    const day =
      dateObj
        .getDate()
        .toString()
        .padStart(
          2,
          '0'
        );

    const month =
      (
        dateObj.getMonth() +
        1
      )
        .toString()
        .padStart(
          2,
          '0'
        );

    const year =
      dateObj.getFullYear();

    return (
      `${day}-${month}-${year}`
    );
  };

export const generarExcelEntregas =
  async ({
    entregas,
    tipo,
    fechaInicio,
    fechaFin
  }) => {
    const workbook =
      new ExcelJS.Workbook();

    const worksheet =
      workbook.addWorksheet(
        'ENTREGAS TI',
        {
          views: [
            {
              showGridLines:
                false
            }
          ]
        }
      );

    // ======================================
    // LOGO
    // ======================================

    const logoPath =
      'C:\\Users\\LEONARDONEIRA\\.gemini\\antigravity\\brain\\e3497895-f6e2-4012-b5fb-890e3415d02a\\media__1781535209025.png';

    if (
      fs.existsSync(
        logoPath
      )
    ) {
      const logoImage =
        workbook.addImage({
          filename:
            logoPath,
          extension:
            'png'
        });

      worksheet.addImage(
        logoImage,
        {
          tl: {
            col: 0,
            row: 0
          },
          ext: {
            width: 250,
            height: 80
          }
        }
      );
    }

    // ======================================
    // TÍTULO
    // ======================================

    worksheet.mergeCells(
      'D2:J3'
    );

    const titleCell =
      worksheet.getCell(
        'D2'
      );

    titleCell.value =
      tipo === 'Devolución'
        ? 'REGISTRO DE DEVOLUCIONES TI'
        : 'REGISTRO DE ENTREGAS TI';

    titleCell.font = {
      name: 'Arial',
      size: 16,
      bold: true,
      color: {
        argb:
          'FFFFFFFF'
      }
    };

    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb:
          'FF1E40AF'
      }
    };

    titleCell.alignment = {
      vertical: 'middle',
      horizontal:
        'center'
    };

    worksheet.getRow(
      5
    ).height = 10;

    // ======================================
    // CABECERAS
    // ======================================

    const headers = [
      'N°',
      'FECHA',
      'ENTREGADO POR TI',
      'NOMBRES Y APELLIDOS / CUSTODIO',
      'DNI',
      'CARGO',
      'OPERACION',
      'CONDICION DE EQUIPO A ENTREGAR',
      'EQUIPO',
      'MARCA',
      'MODELO',
      'S/N Y/O N° DE SERIE',
      'LAPTOP',
      'MOUSE',
      'CARGADOR',
      'MOTIVO DE ENTREGA Y/O CAMBIO',
      'OBSERVACION',
      'PRECIO'
    ];

    const headerRow =
      worksheet.getRow(6);

    headerRow.values =
      headers;

    headerRow.height =
      30;

    headerRow.eachCell(
      cell => {
        cell.fill = {
          type:
            'pattern',
          pattern:
            'solid',
          fgColor: {
            argb:
              'FF3B82F6'
          }
        };

        cell.font = {
          name:
            'Arial',
          size: 10,
          bold: true,
          color: {
            argb:
              'FFFFFFFF'
          }
        };

        cell.alignment = {
          vertical:
            'middle',
          horizontal:
            'center',
          wrapText: true
        };

        cell.border = {
          top: {
            style: 'thin'
          },
          left: {
            style: 'thin'
          },
          bottom: {
            style: 'thin'
          },
          right: {
            style: 'thin'
          }
        };
      }
    );

    // ======================================
    // REGISTROS
    // ======================================

    entregas.forEach(
      (
        entrega,
        index
      ) => {
        const row =
          worksheet.addRow([
            index + 1,

            entrega.fecha
              ? formatDMY(
                  new Date(
                    entrega.fecha
                  )
                )
              : '',

            entrega.encargado ||
              '',

            entrega.nombre ||
              '',

            entrega.dni ||
              '',

            entrega.cargo ||
              '',

            entrega.operacion ||
              '',

            entrega.condicion ||
              '',

            entrega.equipo_tipo ||
              '',

            entrega.marca ||
              '',

            entrega.modelo ||
              '',

            entrega.serie ||
              '',

            entrega.laptop ||
              '',

            entrega.mouse ||
              '',

            entrega.cargador ||
              '',

            entrega.motivo ||
              '',

            entrega.observaciones ||
              '',

            entrega.precio ||
              ''
          ]);

        row.eachCell(
          cell => {
            cell.font = {
              name:
                'Arial',
              size: 10
            };

            cell.alignment = {
              vertical:
                'middle',
              horizontal:
                'left',
              wrapText: true
            };

            cell.border = {
              top: {
                style:
                  'thin',
                color: {
                  argb:
                    'FFDDDDDD'
                }
              },

              left: {
                style:
                  'thin',
                color: {
                  argb:
                    'FFDDDDDD'
                }
              },

              bottom: {
                style:
                  'thin',
                color: {
                  argb:
                    'FFDDDDDD'
                }
              },

              right: {
                style:
                  'thin',
                color: {
                  argb:
                    'FFDDDDDD'
                }
              }
            };
          }
        );

        if (
          index % 2 === 0
        ) {
          row.eachCell(
            cell => {
              cell.fill = {
                type:
                  'pattern',
                pattern:
                  'solid',
                fgColor: {
                  argb:
                    'FFF9FAFB'
                }
              };
            }
          );
        }
      }
    );

    // ======================================
    // ANCHOS
    // ======================================

    worksheet.columns = [
      { width: 5 },
      { width: 12 },
      { width: 20 },
      { width: 35 },
      { width: 15 },
      { width: 25 },
      { width: 20 },
      { width: 25 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 20 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 30 },
      { width: 30 },
      { width: 15 }
    ];

    const buffer =
      await workbook.xlsx
        .writeBuffer();

    const filename =
      tipo === 'Devolución'
        ? `Devoluciones_TI_${fechaInicio}_al_${fechaFin}.xlsx`
        : `Entregas_TI_${fechaInicio}_al_${fechaFin}.xlsx`;

    return {
      buffer,
      filename
    };
  };
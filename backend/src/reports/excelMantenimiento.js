import ExcelJS from 'exceljs';

const borderAll = {
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

const fontBold = {
  bold: true,
  name: 'Arial',
  size: 10
};

const fontNormal = {
  name: 'Arial',
  size: 9
};

const centerAlign = {
  vertical: 'middle',
  horizontal: 'center',
  wrapText: true
};

const greenHeader = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {
    argb: 'FF00FF99'
  }
};

const normalizarFechaMantenimiento =
  valor => {
    let rawFecha = valor;

    if (
      rawFecha &&
      rawFecha.includes('--')
    ) {
      rawFecha = null;
    }

    if (
      rawFecha &&
      rawFecha.includes('/')
    ) {
      const parts =
        rawFecha.split('/');

      if (
        parts.length === 3
      ) {
        rawFecha =
          `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    return rawFecha;
  };

const formatDate =
  date => {
    return date
      ? date
          .toISOString()
          .split('T')[0]
      : '';
  };

// ==========================================
// EXCEL DE MANTENIMIENTO
// ==========================================

export const generarExcelMantenimiento =
  async datos => {
    const workbook =
      new ExcelJS.Workbook();

    const sheet =
      workbook.addWorksheet(
        'Mantenimiento',
        {
          views: [
            {
              showGridLines:
                false
            }
          ]
        }
      );

    // ========================================
    // FILA 1
    // ========================================

    sheet.mergeCells(
      'A1:U1'
    );

    const f1 =
      sheet.getCell(
        'A1'
      );

    f1.value =
      'PROGRAMA';

    f1.fill = {
      type:
        'pattern',
      pattern:
        'solid',
      fgColor: {
        argb:
          'FF1F4E99'
      }
    };

    f1.font = {
      bold: true,
      color: {
        argb:
          'FFFFFFFF'
      },
      name: 'Arial'
    };

    f1.alignment =
      centerAlign;

    f1.border =
      borderAll;

    sheet.getCell(
      'V1'
    ).value =
      'TI - PR - 01';

    sheet.getCell(
      'V1'
    ).font =
      fontBold;

    sheet.getCell(
      'V1'
    ).alignment =
      centerAlign;

    sheet.getCell(
      'V1'
    ).border =
      borderAll;

    // ========================================
    // FILAS 2 A 5
    // ========================================

    sheet.mergeCells(
      'D2:U5'
    );

    const titulo =
      sheet.getCell(
        'D2'
      );

    titulo.value =
      'MANTENIMIENTO DE EQUIPOS TECNOLÓGICOS - TRACTO/CAMIONETAS';

    titulo.font = {
      bold: true,
      size: 14,
      name: 'Arial'
    };

    titulo.alignment =
      centerAlign;

    titulo.border =
      borderAll;

    sheet.mergeCells(
      'A2:C5'
    );

    sheet.getCell(
      'A2'
    ).value =
      'TRANSMDICAS S.R.L.';

    sheet.getCell(
      'A2'
    ).alignment =
      centerAlign;

    sheet.getCell(
      'A2'
    ).font =
      fontBold;

    sheet.getCell(
      'A2'
    ).border =
      borderAll;

    const metadata = [
      'Versión:',
      'Fecha:',
      'Revisa:',
      'Aprueba:'
    ];

    for (
      let i = 0;
      i <
        metadata.length;
      i++
    ) {
      const celda =
        sheet.getCell(
          `V${i + 2}`
        );

      celda.value =
        metadata[i];

      celda.border =
        borderAll;

      celda.font =
        fontNormal;
    }

    // ========================================
    // FILA 6
    // ========================================

    sheet.mergeCells(
      'A6:H6'
    );

    sheet.getCell(
      'A6'
    ).value =
      'DATOS';

    sheet.mergeCells(
      'I6:K6'
    );

    sheet.getCell(
      'I6'
    ).value =
      'PROGRAMADO';

    sheet.mergeCells(
      'L6:V6'
    );

    sheet.getCell(
      'L6'
    ).value =
      'EJECUTADO';

    [
      'A6',
      'I6',
      'L6'
    ].forEach(
      cell => {
        const celda =
          sheet.getCell(
            cell
          );

        celda.fill =
          greenHeader;

        celda.font =
          fontBold;

        celda.alignment =
          centerAlign;

        celda.border =
          borderAll;
      }
    );

    // ========================================
    // FILA 7
    // ========================================

    const headers = [
      'N°',
      'TIPO DE VEHÍCULO',
      'PLACA',
      'MARCA TRACTO',
      'MODELO TRACTO',
      'AÑO FABRICACIÓN TRACTO',
      'OPERACIÓN',
      'CLIENTE',
      'FECHA ULT MANTENIMIENTO',
      'FRECUENCIA',
      'FECHA PROX MANTENIMIENTO',
      'DVR',
      'COPILOTO',
      'RADIO BASE',
      'HANDY',
      'CAMARA INTERNA',
      'CAMARA EXTERNA',
      'CAMARA DE RETROCESO',
      'SENSORES DE RETROCESO',
      'SENSORES DELANTEROS',
      'SISTEMA ADAS',
      'FECHA EJECUTADA'
    ];

    const widths = [
      4,
      15,
      12,
      12,
      12,
      15,
      12,
      12,
      15,
      10,
      15,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      15
    ];

    headers.forEach(
      (
        header,
        index
      ) => {
        const colLetter =
          sheet
            .getColumn(
              index + 1
            )
            .letter;

        const celda =
          sheet.getCell(
            `${colLetter}7`
          );

        celda.value =
          header;

        celda.fill =
          greenHeader;

        celda.font = {
          bold: true,
          size: 8,
          name: 'Arial'
        };

        celda.alignment =
          centerAlign;

        celda.border =
          borderAll;

        sheet.getColumn(
          index + 1
        ).width =
          widths[index];
      }
    );

    sheet.getRow(
      7
    ).height = 80;

    // ========================================
    // DATOS
    // ========================================

    let rowNum = 8;

    datos.forEach(
      (
        row,
        index
      ) => {
        const rawFecha =
          normalizarFechaMantenimiento(
            row.fecha_ejecutada_raw
          );

        const ultimoMantenimiento =
          rawFecha
            ? new Date(
                rawFecha
              )
            : null;

        const frecuencia =
          row.frecuencia_dias ||
          30;

        let proximoMantenimiento =
          null;

        if (
          ultimoMantenimiento
        ) {
          proximoMantenimiento =
            new Date(
              ultimoMantenimiento
            );

          proximoMantenimiento
            .setDate(
              proximoMantenimiento
                .getDate() +
                frecuencia
            );
        }

        const rowData = [
          index + 1,
          row.tipo_vehiculo ||
            '',
          row.placa,
          row.marca_tracto ||
            '',
          row.modelo_tracto ||
            '',
          row.anio_fabricacion ||
            '',
          row.operacion ||
            '',
          row.cliente ||
            '',

          formatDate(
            ultimoMantenimiento
          ),

          frecuencia ===
            180
            ? 'Semestral'
            : `${frecuencia} días`,

          formatDate(
            proximoMantenimiento
          ),

          row.dvr || '',
          row.copiloto || '',
          row.radio_base || '',
          row.handy || '',
          row.camara_interna || '',
          row.camara_externa || '',
          row.camara_retroceso ||
            '',
          row.sensores_retroceso ||
            '',
          row.sensores_delanteros ||
            '',
          row.sistema_adas || '',

          formatDate(
            ultimoMantenimiento
          )
        ];

        rowData.forEach(
          (
            value,
            colIndex
          ) => {
            const celda =
              sheet.getCell(
                `${
                  sheet.getColumn(
                    colIndex + 1
                  ).letter
                }${rowNum}`
              );

            celda.value =
              value;

            celda.border =
              borderAll;

            celda.alignment =
              centerAlign;

            celda.font =
              fontNormal;
          }
        );

        rowNum++;
      }
    );

    return workbook;
  };
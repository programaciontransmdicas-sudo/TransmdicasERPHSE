// ==========================================
// PIEZAS COMPARTIDAS DEL MODULO PROGRAMAS (TI-PR-01)
// ==========================================
// Vive dentro del modulo, no en una carpeta global de utilidades: lo usan programas y
// unidades, y nadie mas. Cada pieza esta aqui porque estaba duplicada literalmente en los
// dos controllers o en los dos services, no por gusto de abstraer.

// code es OPCIONAL y solo lo usan los rechazos que el cliente necesita distinguir sin
// leer el texto -hoy los cuatro motivos por los que una quincena de destino no sirve-. Sin
// code la respuesta conserva exactamente la forma que ya tenia, { error }, para no cambiar
// el contrato de los rechazos que ya existian.
export class ValidationError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);

    this.name = 'ValidationError';
    this.status = status;
    this.code = code;
  }
}

export const noEncontrado = mensaje =>
  new ValidationError(mensaje, 404);

// ==========================================
// EL ROL DE TI · F5.1
// ==========================================
// Vive aqui, en las piezas compartidas del modulo, porque lo necesitan DOS capas que no
// deben depender una de otra: el catalogo de tecnicos -programas/controller.js- y la
// resolucion del tecnico al cerrar -programacion/ordenes/service.js-. Definirlo en una de
// las dos obligaria a la otra a importar de su hermana o a repetir la cadena.
//
// 'ti' es el valor REAL de usuarios.rol, medido en la base: los tres valores de hecho son
// admin(2), supervisor(2) y ti(1). La columna NO tiene CHECK, asi que se normaliza igual
// que lo hace el middleware de autenticacion -trim y minusculas- en vez de comparar crudo.
export const ROL_TI = 'ti';

export const esUsuarioTi = usuario =>
  String(usuario?.rol ?? '')
    .trim()
    .toLowerCase() === ROL_TI;

// F5.2 · el rol de ADMIN, con la MISMA normalizacion. Lo necesita el retiro de evidencia:
// con la orden CERRADA o ANULADA solo un administrador puede retirar una fotografia.
//
// 'administrador' se acepta ademas de 'admin' porque el middleware de autenticacion ya hace
// ese alias -rolOriginal === 'administrador' ? 'admin' : rolOriginal- y req.user llega
// normalizado; aceptar los dos evita que esta funcion dependa de que ese alias siga ahi.
export const ROL_ADMIN = 'admin';

export const esUsuarioAdmin = usuario => {
  const rol = String(usuario?.rol ?? '')
    .trim()
    .toLowerCase();

  return rol === ROL_ADMIN || rol === 'administrador';
};

// Todas las columnas a las que viajan estos id son integer de PostgreSQL -int4-: los id de
// programas_mantenimiento, programa_mantenimiento_unidades, programacion_mantenimiento,
// ordenes_trabajo, ordenes_trabajo_detalle y personal, mas minutos. Un valor mayor no cabe,
// y el servidor contestaria 22003 'value out of range for type integer', que es un fallo de
// la peticion y no del servidor. Se rechaza aqui, ANTES de consultar la base.
const INT4_MAX = 2147483647;

// etiqueta va en el mensaje para que cada ruta diga de QUE id habla.
export const normalizarId = (
  etiqueta,
  valor
) => {
  // SOLO number y string. parseInt coacciona estructuras: [7] daba 7, ["7"] daba 7, y
  // cualquier objeto con su propio toString tambien, de modo que una entrada del tipo
  // equivocado se convertia en un id valido. Por las rutas no es alcanzable -los
  // parametros llegan como texto- pero por el cuerpo JSON si: {"tecnico_id": [7]}.
  //
  // La comprobacion alimenta la MISMA condicion de abajo en vez de lanzar aparte, para que
  // null, undefined, true y los demas casos que ya se rechazaban conserven su mensaje.
  const esPrimitivo =
    typeof valor === 'number' ||
    typeof valor === 'string';

  const id = esPrimitivo
    ? Number.parseInt(valor, 10)
    : Number.NaN;

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    String(valor).trim() !== String(id)
  ) {
    throw new ValidationError(
      `${etiqueta} debe ser un entero positivo`
    );
  }

  // Mensaje propio: 2147483648 SI es un entero positivo, asi que decir lo contrario
  // confundiria a quien llama. El rechazo anterior conserva su texto intacto.
  if (id > INT4_MAX) {
    throw new ValidationError(
      `${etiqueta} no puede superar ${INT4_MAX}`
    );
  }

  return id;
};

export const normalizarTextoObligatorio = (
  campo,
  valor,
  maximo
) => {
  if (typeof valor !== 'string') {
    throw new ValidationError(
      `${campo} es obligatorio`
    );
  }

  const texto = valor.trim();

  if (!texto) {
    throw new ValidationError(
      `${campo} es obligatorio`
    );
  }

  if (texto.length > maximo) {
    throw new ValidationError(
      `${campo} no puede superar ${maximo} caracteres`
    );
  }

  return texto;
};

export const normalizarTextoOpcional = (
  campo,
  valor
) => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  if (typeof valor !== 'string') {
    throw new ValidationError(
      `${campo} debe ser texto`
    );
  }

  const texto = valor.trim();

  return texto === ''
    ? null
    : texto;
};

// Rechaza por NOMBRE lo que no se edita, en vez de ignorarlo en silencio: quien intente
// escribir una columna que el cleanup elimina tiene que enterarse. Devuelve la lista de
// campos realmente enviados, en el orden de la lista blanca.
//
// permitirVacio existe para las ALTAS cuyos campos son todos opcionales -abrir una orden de
// trabajo, por ejemplo-: ahi un cuerpo vacio es valido y no hay nada que reprochar. En un
// PATCH sigue siendo un error, que es el comportamiento por defecto.
export const separarCamposEditables = (
  datos,
  editables,
  { sujeto, ayuda = '', verbo = 'editan', permitirVacio = false }
) => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      `Datos ${sujeto} no válidos`
    );
  }

  const enviados = Object.keys(datos);

  const rechazados = enviados.filter(
    campo => !editables.includes(campo)
  );

  if (rechazados.length > 0) {
    throw new ValidationError(
      `Estos campos no se ${verbo} ${sujeto}: ${rechazados.join(', ')}. `
      + `${verbo === 'editan' ? 'Editables' : 'Admitidos'}: ${editables.join(', ')}.`
      + (ayuda ? ` ${ayuda}` : '')
    );
  }

  const campos = editables.filter(
    campo => enviados.includes(campo)
  );

  if (
    campos.length === 0 &&
    !permitirVacio
  ) {
    throw new ValidationError(
      `Nada que actualizar. Editables: ${editables.join(', ')}`
    );
  }

  return campos;
};

// ==========================================
// TRADUCCION DE ERRORES A HTTP
// ==========================================
// PostgreSQL es la autoridad: los CHECK, las FK y los UNIQUE rechazan antes que cualquier
// validacion de aqui. Esta funcion solo traduce ese rechazo; nunca devuelve el mensaje
// crudo del driver, que puede citar nombres de columnas y de constraints.
//
// mensajes permite que cada dominio ponga su texto por constraint sin repetir la taxonomia.
const HTTP_POR_CODIGO = {
  23505: 409,
  23503: 409,
  23514: 400,
  23502: 422,
  22008: 400,
  22007: 400,
  // Defensa secundaria. La entrada conocida se rechaza en normalizarId, antes de llegar a
  // la base; esto cubre cualquier otro camino por el que un numero fuera del rango de una
  // columna numerica alcance al servidor. Es un error de la peticion, nunca un 500.
  22003: 400
};

export const traducirError = (
  error,
  res,
  {
    mensajeGenerico,
    mensajes = {},
    porCodigo = {},
    reglasDeNegocio = []
  }
) => {
  if (error instanceof ValidationError) {
    // `incumplimientos` es OPCIONAL y la usa el rechazo del cierre de F5.2, que necesita
    // devolver la lista completa de apartados sin sustento para que el cliente pinte una
    // linea por apartado en vez de un parrafo. Sin ella la respuesta conserva exactamente
    // la forma que ya tenia.
    return res
      .status(error.status)
      .json({
        error: error.message,
        ...(error.code
          ? { code: error.code }
          : {}),
        ...(Array.isArray(error.incumplimientos)
          ? { incumplimientos: error.incumplimientos }
          : {})
      });
  }

  // P0001 es un RAISE EXCEPTION de un trigger: una regla de negocio de 013/015/016, no un
  // fallo del servidor. Nunca puede contestar 500. Cada dominio declara qué patrón de su
  // mensaje corresponde a qué respuesta; el texto del driver no se devuelve nunca.
  if (error.code === 'P0001') {
    const regla = reglasDeNegocio.find(
      r => r.patron.test(error.message ?? '')
    );

    return res
      .status(regla?.status ?? 409)
      .json({
        error: regla?.error ?? mensajeGenerico,
        code: regla?.code ?? 'REGLA_DE_NEGOCIO'
      });
  }

  const porConstraint =
    error.constraint
      ? mensajes[error.constraint]
      : undefined;

  if (porConstraint) {
    return res
      .status(porConstraint.status)
      .json({
        error: porConstraint.error,
        constraint: error.constraint
      });
  }

  const estado =
    porCodigo[error.code] ??
    HTTP_POR_CODIGO[error.code];

  if (estado) {
    return res
      .status(estado)
      .json({
        error: mensajeGenerico,
        constraint: error.constraint ?? null
      });
  }

  // El detalle tecnico se queda en el log del servidor, no en la respuesta publica.
  console.error(
    mensajeGenerico,
    error
  );

  return res
    .status(500)
    .json({
      error: mensajeGenerico
    });
};

// Quita el try/catch identico que tenian los nueve handlers.
export const manejar = (
  fn,
  opciones
) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (error) {
    return traducirError(
      error,
      res,
      opciones
    );
  }
};

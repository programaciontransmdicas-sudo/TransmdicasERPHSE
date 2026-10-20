import { FlotaValidationError } from './service.js';

export const TIPOS_EQUIPO_VEHICULO = [
  'DVR', 'CAMARA_INTERNA', 'CAMARA_EXTERNA',
  'ADAS', 'COPILOTO', 'RADIO_BASE', 'GPS'
];
const ESTADOS = ['INSTALADO', 'NO_APLICA', 'POR_VALIDAR'];

export function fechaNegocioPeru() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export function clavePlaca(placa) {
  const clave = typeof placa === 'string'
    ? placa.trim().toUpperCase().replace(/[-\s]/g, '')
    : '';
  if (!/^[A-Z0-9]{6}$/.test(clave)) {
    throw new FlotaValidationError('Ingrese una placa válida con el formato XXX-XXX');
  }
  return clave;
}

function textoOpcional(valor, campo, limite) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new FlotaValidationError(`${campo} debe contener texto`);
  const texto = valor.trim();
  if (texto.length > limite) throw new FlotaValidationError(`${campo} admite hasta ${limite} caracteres`);
  return texto || null;
}

export function prepararEquiposVehiculo(equipos, hoy = fechaNegocioPeru()) {
  if (!Array.isArray(equipos) || equipos.length !== TIPOS_EQUIPO_VEHICULO.length) {
    throw new FlotaValidationError('Indique la situación de los siete tipos de dispositivo');
  }
  const vistos = new Set();
  const preparados = equipos.map(equipo => {
    if (!equipo || typeof equipo !== 'object' || Array.isArray(equipo)) {
      throw new FlotaValidationError('Los datos de un dispositivo no son válidos');
    }
    const { tipo_equipo, estado_inventario } = equipo;
    if (!TIPOS_EQUIPO_VEHICULO.includes(tipo_equipo) || vistos.has(tipo_equipo)) {
      throw new FlotaValidationError('Hay un tipo de dispositivo desconocido o repetido');
    }
    vistos.add(tipo_equipo);
    if (!ESTADOS.includes(estado_inventario)) {
      throw new FlotaValidationError('Seleccione la situación de cada dispositivo');
    }
    const datos = {
      tipo_equipo,
      estado_inventario,
      marca: textoOpcional(equipo.marca, 'La marca', 120),
      modelo: textoOpcional(equipo.modelo, 'El modelo', 120),
      numero_serie: textoOpcional(equipo.numero_serie, 'La serie', 120),
      fecha_instalacion: textoOpcional(equipo.fecha_instalacion, 'La fecha de instalación', 10),
      observaciones: textoOpcional(equipo.observaciones, 'Las observaciones', 2000)
    };
    if (estado_inventario !== 'INSTALADO' &&
        [datos.marca, datos.modelo, datos.numero_serie, datos.fecha_instalacion].some(Boolean)) {
      throw new FlotaValidationError('Los datos técnicos corresponden únicamente a dispositivos instalados');
    }
    if (datos.fecha_instalacion) {
      const fecha = datos.fecha_instalacion;
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null;
      if (!dia || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha || fecha > hoy) {
        throw new FlotaValidationError('La fecha de instalación debe ser válida y no puede ser futura');
      }
    }
    return datos;
  });
  return TIPOS_EQUIPO_VEHICULO.map(tipo => preparados.find(e => e.tipo_equipo === tipo));
}

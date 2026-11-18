import { z } from 'zod';
import { fallo } from '../validaciones.js';

export const BASES = ['Peruarbo', 'Moquegua', 'Espinar'];
export const uuid = z.uuid().transform(v => v.toLowerCase());
export const texto = z.string().trim().min(1).max(10000);
export const opcional = z.string().trim().max(10000).default('');
export const dia = z.iso.date();
export function instante(valor) {
  if (typeof valor !== 'string') return NaN;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) {
    const [a, m, d, h, min] = valor.match(/\d+/g).map(Number);
    const t = new Date(Date.UTC(a, m - 1, d, h, min));
    if (a < 2000 || a > 2100 || t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== min) return NaN;
    return t.getTime() + 5 * 3600000;
  }
  return z.iso.datetime({ offset: true }).safeParse(valor).success ? Date.parse(valor) : NaN;
}
export const fecha = z.string().refine(v => Number.isFinite(instante(v)), 'Revisa la fecha y la hora.').transform(v => new Date(instante(v)).toISOString());
export const meta = { id: uuid, base: z.enum(BASES) };
export const comun = { ...meta, fecha };
export function exigir(condicion, mensaje, estado = 422) { if (!condicion) throw fallo(mensaje, estado); }
export function fechaPosterior(fin, inicio) { exigir(instante(fin) >= instante(inicio), 'La fecha de cierre no puede ser anterior al registro inicial.'); }
export function revisionValida(row, revision) { exigir(row.revision === revision, 'El registro cambió. Actualiza el detalle antes de continuar.', 409); }

const NOMBRES = { nombre: 'los nombres', dni: 'los DNI', base: 'la base', fecha: 'la fecha y hora', fechaIngreso: 'la fecha de ingreso', fechaSalida: 'la fecha prevista de salida', horaIngreso: 'la hora de ingreso', responsableSolicitud: 'el responsable de la solicitud', responsableSitio: 'el responsable en sitio', empresa: 'la empresa', area: 'el área', motivo: 'el motivo', movimiento: 'el movimiento', documento: 'el documento de sustento', numero: 'el número de documento', autoriza: 'el responsable que autoriza', retorna: 'la opción de retorno', fechaPrevista: 'la fecha prevista de retorno', agente: 'el agente', bienes: 'los bienes y sus series', seleccion: 'los bienes recibidos', retorno: 'la fecha de retorno', recibe: 'la persona que recibe', documentoRetorno: 'el documento de retorno', revision: 'la versión del registro' };
export function validarEntrada(schema, valor) {
  const resultado = schema.safeParse(valor);
  if (resultado.success) return resultado.data;
  const problema = resultado.error.issues[0];
  throw fallo(problema.code === 'custom' ? problema.message : `Revisa ${NOMBRES[problema.path[0]] || 'los campos del formulario'}.`, 422);
}

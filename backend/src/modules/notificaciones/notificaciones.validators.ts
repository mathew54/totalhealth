import { z } from 'zod';

export const CANALES_NOTIFICACION = ['push', 'whatsapp', 'sms', 'email'] as const;
export const TIPOS_NOTIFICACION = ['cita', 'resultado', 'domicilio', 'turno', 'pago'] as const;

export const crearNotificacionSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  telefono: z.string().max(30).optional().nullable(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  canal: z.enum(CANALES_NOTIFICACION).default('sms'),
  tipo: z.enum(TIPOS_NOTIFICACION),
  mensaje: z.string().min(3, 'Mensaje requerido').max(1600),
  programada_para: z.string().datetime('Fecha programada inválida'),
});

export const enviarPendientesSchema = z.object({
  ids: z.array(z.string().uuid('ID inválido')).optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });
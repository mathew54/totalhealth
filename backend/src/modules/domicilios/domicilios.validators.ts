import { z } from 'zod';

export { idParamSchema } from '../../utils/schemas.js';

export const crearDomicilioSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  solicitud_id: z.string().uuid().optional().nullable(),
  direccion: z.string().min(5, 'Dirección requerida').max(500),
  telefono: z.string().max(30).optional().nullable(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  fecha_visita: z.string().datetime().optional().nullable(),
  estado: z.enum(['solicitada', 'programada', 'en_ruta', 'tomada', 'completada', 'cancelada']).optional(),
  notas: z.string().max(1000).optional().nullable(),
});

export const actualizarDomicilioSchema = z.object({
  estado: z.enum(['programada', 'en_ruta', 'tomada', 'completada', 'cancelada']).optional(),
  ubicacion: z.string().max(300).optional(),
  fecha_visita: z.string().datetime().optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
});

export const domicilioQuery = z.object({
  estado: z.enum(['solicitada', 'programada', 'en_ruta', 'tomada', 'completada', 'cancelada']).optional(),
});
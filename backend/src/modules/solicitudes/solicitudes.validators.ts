import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const createSolicitudSchema = z.object({
  consulta_id: z.string().uuid().optional(),
  paciente_id: z.string().uuid('Paciente inválido'),
  examenes: z.array(z.string().uuid('Examen inválido')).min(1, 'Selecciona al menos un examen'),
  nota: z.string().max(1000).optional(),
});

export const updateEstadoSchema = z.object({
  estado: z.enum(['pendiente', 'en_proceso', 'listo']),
});

export const resultadosSchema = z.object({
  lineas: z
    .array(
      z.object({
        solicitud_detalle_id: z.string().uuid(),
        valores: z.record(z.string(), z.unknown()).optional(),
        observaciones: z.string().max(2000).optional(),
      }),
    )
    .min(1, 'Debes cargar al menos un resultado'),
});

export const solicitudesQuery = z.object({
  estado: z.enum(['pendiente', 'en_proceso', 'listo', 'entregado']).optional(),
  cobrado: z.enum(['true', 'false']).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
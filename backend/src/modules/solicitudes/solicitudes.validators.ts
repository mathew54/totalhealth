import { z } from 'zod';

export { idParamSchema } from '../../utils/schemas.js';

export const createSolicitudSchema = z.object({
  consulta_id: z.string().uuid().optional(),
  paciente_id: z.string().uuid('Paciente inválido'),
  examenes: z.array(z.string().uuid('Examen inválido')).min(1, 'Selecciona al menos un examen').optional(),
  paquete_id: z.string().uuid('Paquete inválido').optional(),
  fecha: z.string().datetime({ offset: true }).optional(),
  nota: z.string().max(1000).optional(),
});

export const updateEstadoSchema = z.object({
  estado: z.enum(['pendiente', 'en_proceso', 'listo']),
});

export const updateSolicitudSchema = z.object({
  nota: z.string().max(1000).optional(),
  examenes: z.array(z.string().uuid('Examen inválido')).min(1, 'Selecciona al menos un examen').optional(),
});

// Caja: agrega/quita exámenes de una solicitud no cobrada y sin resultados.
export const examenesCajaSchema = z.object({
  examenes: z.array(z.string().uuid('Examen inválido')).min(1, 'La solicitud debe conservar al menos un examen'),
});

export const resultadosSchema = z.object({
  lineas: z
    .array(
      z.object({
        solicitud_detalle_id: z.string().uuid(),
        valores: z.record(z.string(), z.unknown()).optional(),
        observaciones: z.string().max(2000).optional(),
        // Consumo de reactivos por línea (FEFO). No bloquea la emisión del
        // resultado: si el stock es insuficiente, se reporta en la respuesta.
        reactivos: z
          .array(
            z.object({
              reactivo_id: z.string().uuid('Reactivo inválido'),
              cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
            }),
          )
          .max(10)
          .optional(),
      }),
    )
    .min(1, 'Debes cargar al menos un resultado'),
});

export const solicitudesQuery = z.object({
  estado: z.enum(['pendiente', 'en_proceso', 'listo', 'entregado', 'anulada']).optional(),
  cobrado: z.enum(['true', 'false']).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD').optional(),
  incluir_anuladas: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
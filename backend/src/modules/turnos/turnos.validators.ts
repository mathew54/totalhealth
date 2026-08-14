import { z } from 'zod';

export { idParamSchema } from '../../utils/schemas.js';

export const crearTurnoSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_id: z.string().uuid().optional().nullable(),
  prioridad: z.enum(['normal', 'prioridad', 'urgente']).optional(),
  medico_id: z.string().uuid('Médico inválido').optional().nullable(),
});

export const asignarMedicoSchema = z.object({
  medico_id: z.string().uuid('Médico inválido'),
});

export const estadoTurnoSchema = z.object({
  estado: z.enum(['llamado', 'atendido', 'saltado', 'cancelado'], {
    required_error: 'Estado inválido',
  }),
});

export const turnosQuery = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional(),
  estado: z.enum(['esperando', 'llamado', 'atendido', 'saltado', 'cancelado']).optional(),
});
import { z } from 'zod';
import { TIPOS_CONSULTA } from '../tarifas/tarifas.validators.js';

export { idParamSchema } from '../../utils/schemas.js';

export const createConsultaSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  medico_id: z.string().uuid().optional(),
  fecha_hora: z.string().datetime('Fecha/hora inválida'),
  motivo: z.string().max(500).optional(),
  notas: z.string().max(2000).optional(),
  tipo_consulta: z.enum(TIPOS_CONSULTA).default('consulta_general'),
});

export const actualizarConsultaSchema = z
  .object({
    medico_id: z.string().uuid().optional(),
    fecha_hora: z.string().datetime('Fecha/hora inválida').optional(),
    motivo: z.string().max(500).optional(),
    notas: z.string().max(2000).optional().nullable(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay campos para actualizar' });

export const diagnosticoSchema = z.object({
  diagnostico: z.string().min(2, 'Diagnóstico requerido'),
  notas: z.string().max(2000).optional(),
});

export const consultasQuery = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD').optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD').optional(),
  medico_id: z.string().uuid().optional(),
  estado: z.enum(['programada', 'en_curso', 'completada', 'cancelada']).optional(),
  estado_pago: z.enum(['pendiente', 'pagada', 'parcial', 'anulada']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
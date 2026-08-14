import { z } from 'zod';
import { cedulaSchema } from '../pacientes/pacientes.validators.js';

export const generarCodigoSchema = z.object({
  cedula: cedulaSchema,
});

export const verificarSchema = z.object({
  cedula: cedulaSchema,
  codigo: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});

export { idParamSchema } from '../../utils/schemas.js';

export const reservarSchema = z.object({
  medico_id: z.string().uuid('Médico inválido'),
  fecha_hora: z.string().datetime('Fecha/hora inválida'),
  motivo: z.string().max(500).optional(),
});

export const reprogramarSchema = z.object({
  fecha_hora: z.string().datetime('Fecha/hora inválida'),
});

export const cancelarSchema = z.object({
  motivo: z.string().max(500).optional(),
});

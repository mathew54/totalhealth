import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const fechaSoloSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD');

export const paqueteSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(100),
  descripcion: z.string().max(300).optional(),
  precio: z.coerce.number().positive('El precio debe ser mayor a 0'),
  activo: z.boolean().optional(),
  examen_ids: z.array(z.string().uuid('Examen inválido')).min(1, 'Selecciona al menos un examen'),
});

export const paqueteUpdateSchema = paqueteSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Debes enviar al menos un campo a actualizar',
});

export const convenioSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(150),
  rif: z.string().max(20).optional().nullable(),
  descuento_porcentaje: z.coerce.number().min(0, 'Mínimo 0').max(100, 'Máximo 100'),
  activo: z.boolean().optional(),
});

export const convenioUpdateSchema = convenioSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Debes enviar al menos un campo a actualizar',
});

export const promocionSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(150),
  descuento_porcentaje: z.coerce.number().min(0.01, 'Mínimo 0.01').max(100, 'Máximo 100'),
  fecha_inicio: fechaSoloSchema,
  fecha_fin: fechaSoloSchema,
  activo: z.boolean().optional(),
  examen_ids: z.array(z.string().uuid('Examen inválido')).min(1, 'Selecciona al menos un examen'),
});

export const promocionUpdateSchema = promocionSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Debes enviar al menos un campo a actualizar',
});
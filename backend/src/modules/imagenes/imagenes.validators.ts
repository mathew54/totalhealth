import { z } from 'zod';

export const TIPOS = ['rx', 'ecografia', 'tomografia', 'resonancia', 'foto', 'otro'] as const;
export const ESTADOS = ['pendiente', 'leido'] as const;

export { idParamSchema } from '../../utils/schemas.js';

const dataUrl = z
  .string()
  .min(30, 'La imagen debe ser una data URL válida')
  .refine((v) => v.startsWith('data:image/'), 'Debe ser una imagen (data URL)');

export const crearImagenSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  estudio_id: z.string().uuid('Estudio inválido').optional().nullable(),
  data_url: dataUrl,
  tipo: z.enum(TIPOS).default('rx'),
  region: z.string().max(120).optional().nullable(),
  descripcion: z.string().max(1000).optional().nullable(),
});

export const actualizarImagenSchema = z
  .object({
    descripcion: z.string().max(1000).optional().nullable(),
    region: z.string().max(120).optional().nullable(),
    orden: z.number().int().min(0).optional(),
    estudio_id: z.string().uuid('Estudio inválido').optional().nullable(),
    tipo: z.enum(TIPOS).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay campos para actualizar' });

const imagenNueva = z.object({
  data_url: dataUrl,
  descripcion: z.string().max(1000).optional().nullable(),
});

export const crearEstudioSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  tipo: z.enum(TIPOS).default('rx'),
  region: z.string().max(120).optional().nullable(),
  titulo: z.string().max(200).optional().nullable(),
  hallazgos: z.string().max(5000).optional().nullable(),
  impresion: z.string().max(5000).optional().nullable(),
  estado: z.enum(ESTADOS).default('pendiente'),
  medico_id: z.string().uuid('Médico inválido').optional().nullable(),
  fecha_estudio: z.string().datetime('Fecha de estudio inválida').optional(),
  retencion_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Retención en formato YYYY-MM-DD').optional().nullable(),
  imagenes: z.array(imagenNueva).max(50).optional(),
});

export const actualizarEstudioSchema = z
  .object({
    consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
    tipo: z.enum(TIPOS).optional(),
    region: z.string().max(120).optional().nullable(),
    titulo: z.string().max(200).optional().nullable(),
    hallazgos: z.string().max(5000).optional().nullable(),
    impresion: z.string().max(5000).optional().nullable(),
    estado: z.enum(ESTADOS).optional(),
    medico_id: z.string().uuid('Médico inválido').optional().nullable(),
    fecha_estudio: z.string().datetime('Fecha de estudio inválida').optional(),
    retencion_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Retención en formato YYYY-MM-DD').optional().nullable(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay campos para actualizar' });

export const agregarImagenesSchema = z.object({
  imagenes: z.array(imagenNueva).min(1).max(50),
});

export const estudiosQuery = z.object({
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  consulta_id: z.string().uuid('Consulta inválida').optional(),
  tipo: z.enum(TIPOS).optional(),
  estado: z.enum(ESTADOS).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'desde en formato YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'hasta en formato YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const imagenesQuery = z.object({
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  consulta_id: z.string().uuid('Consulta inválida').optional(),
  estudio_id: z.string().uuid('Estudio inválido').optional(),
  tipo: z.enum(TIPOS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const accesoSchema = z.object({
  accion: z.enum(['ver', 'exportar', 'compartir']).default('ver'),
});

export const compartirSchema = z.object({
  dias: z.coerce.number().int().min(1).max(90).default(7),
});
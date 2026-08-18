import { z } from 'zod';
import { ROLES } from '../auth/types.js';
import { documentoSchema } from '../pacientes/pacientes.validators.js';

const roleEnum = z.enum(ROLES as [string, ...string[]]);

export const createStaffSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  roles: z.array(roleEnum).min(1, 'Selecciona al menos un rol'),
  nombre_completo: z.string().min(3, 'Nombre requerido'),
  cedula: documentoSchema.optional(),
  telefono: z.string().optional(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  // Perfil médico flexible: N especialidades, colegiatura/licencia y firma.
  especialidad: z.string().max(100).optional(),
  especialidades: z.array(z.string().max(100)).max(10).optional(),
  categoria_medica: z.string().max(50).optional(),
  colegiatura: z.string().max(50).optional(),
  firma_digital: z.string().max(2000).optional(),
});

export const updateStaffSchema = z.object({
  nombre_completo: z.string().min(3).optional(),
  roles: z.array(roleEnum).min(1).optional(),
  telefono: z.string().optional(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  cedula: documentoSchema.optional(),
  activo: z.boolean().optional(),
  especialidad: z.string().max(100).optional(),
  especialidades: z.array(z.string().max(100)).max(10).optional(),
  categoria_medica: z.string().max(50).optional().nullable(),
  colegiatura: z.string().max(50).optional().nullable(),
  firma_digital: z.string().max(2000).optional().nullable(),
});

export const auditoriaQuerySchema = z.object({
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const reporteriaQuerySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
});

export const examenSchema = z.object({
  nombre: z.string().min(2),
  categoria: z.string().optional(),
  precio: z.coerce.number().min(0).default(0),
  interno: z.coerce.boolean().default(true),
  duracion_min: z.coerce.number().int().min(0).optional(),
  condiciones_previas: z.string().max(1000).optional(),
  tiempo_entrega: z.string().max(200).optional(),
  codigo_loinc: z.string().max(30).optional().nullable(),
  codigo_externo: z.string().max(100).optional().nullable(),
  activo: z.coerce.boolean().default(true),
  // Facturación VE: tratamiento fiscal del examen (los servicios de laboratorio
  // pueden estar exentos de IVA según la Ley de IVA, art. 18 numeral 4).
  impuesto: z.enum(['gravado', 'exento', 'no_sujeto']).default('gravado'),
});

const origenSchema = z.enum(['mock', 'db']);

export const crearBackupSchema = z.object({
  origen: origenSchema.optional(),
});

export const restaurarBackupSchema = z.object({
  archivo: z.string().min(1).max(200).optional(),
  data: z.unknown().optional(),
}).refine((v) => v.archivo || v.data !== undefined, {
  message: 'Indica un archivo del servidor o sube el contenido del respaldo',
});

export const resetInicialSchema = z.object({
  origen: origenSchema.optional(),
});

export const configSchema = z.object({
  razon_social: z.string().min(3, 'Razon social requerida').max(200).optional(),
  rif: z.string().max(30).optional(),
  direccion: z.string().max(300).optional().nullable(),
  telefono: z.string().max(40).optional().nullable(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  logo_url: z.string().max(3_000_000).optional().nullable(),
  header_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'Color hexadecimal invalido')
    .optional(),
  // Facturación VE: alícuotas configurables (0.16 = 16%, 0.03 = 3%).
  iva: z.coerce.number().min(0).max(1).optional(),
  igtf: z.coerce.number().min(0).max(1).optional(),
  contribuyente_especial: z.coerce.boolean().optional(),
});

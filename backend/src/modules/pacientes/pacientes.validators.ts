import { z } from 'zod';

/**
 * Tipos de documento de identidad de Venezuela aceptados:
 * - V: venezolano por nacimiento / naturalización
 * - E: cédula de extranjero / residente
 * - J: jurídico (RIF)
 * - P: pasaporte
 * - C: cédula de extranjero/residente (S.AIME/SIME) — caso común en la práctica
 */
export const TIPOS_DOCUMENTO = ['V', 'E', 'J', 'P', 'C'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPOS_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  V: 'Venezolano (V)',
  E: 'Extranjero (E)',
  J: 'Jurídico / RIF (J)',
  P: 'Pasaporte (P)',
  C: 'Cédula extranjero (C)',
};

/** Regex que normaliza prefijo y formato de cada tipo (acepta V, v-, V-123, etc.). */
export const DOCUMENTO_REGEX = /^([VEPJCE])\s*-?\s*(\d{4,9})(?:-(\d))?$/i;

export const CEDULA_REGEX = DOCUMENTO_REGEX;

/**
 * Normaliza un documento de identidad al formato canónico `LETRA-12345678`
 * (los RIF tipo J conservan su dígito de control: `J-12345678-0`).
 * Acepta cualquier formato de entrada: `v12345678`, `V-12345678`, `V 12345678`, etc.
 */
export const normalizeDocumento = (input: string): string => {
  const m = String(input ?? '')
    .trim()
    .match(DOCUMENTO_REGEX);
  if (!m) return String(input ?? '').trim().toUpperCase();
  const [, letra, numero, digito] = m;
  return `${letra.toUpperCase()}-${numero}${digito ? `-${digito}` : ''}`;
};

/** Alias retrocompatible (cédula era el único tipo antes de V/E/J/P/C). */
export const normalizeCedula = normalizeDocumento;

export const documentoSchema = z
  .string()
  .regex(DOCUMENTO_REGEX, 'Documento inválido (ej. V-12345678, E-12345678, P-1234567, J-12345678-0)');

export const cedulaSchema = documentoSchema;

export { idParamSchema } from '../../utils/schemas.js';

/** Datos de un hijo menor que se agrega junto al alta del paciente responsable. */
export const crearHijoSchema = z.object({
  nombre_completo: z.string().min(3, 'Nombre requerido'),
  fecha_nacimiento: z.coerce.date().optional(),
  telefono: z.string().optional(),
  country_code: z.string().max(6).optional(),
  local_number: z.string().max(20).optional(),
  sexo: z.enum(['M', 'F']).optional(),
});

export const createPacienteSchema = z
  .object({
    // La cédula es opcional si el paciente es menor (se identifica por el representante).
    cedula: documentoSchema.optional(),
    tipo_documento: z.enum(TIPOS_DOCUMENTO).optional(),
    nombre_completo: z.string().min(3, 'Nombre requerido'),
    fecha_nacimiento: z.coerce.date().optional(),
    telefono: z.string().optional(),
    country_code: z.string().max(6).optional(),
    local_number: z.string().max(20).optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    direccion: z.string().optional(),
    sexo: z.enum(['M', 'F']).optional(),
    es_menor: z.boolean().optional().default(false),
    representante_id: z.string().uuid('Representante inválido').optional(),
    parentesco_representante: z.string().max(50).optional(),
    hijo: crearHijoSchema.optional(),
    // Facturación VE: datos fiscales del receptor (RIF y dirección fiscal).
    rif: z.string().max(30).optional().nullable(),
    direccion_fiscal: z.string().max(300).optional().nullable(),
    // Convenio comercial (aseguradora/empresa) del paciente.
    convenio_id: z.string().uuid('Convenio inválido').optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.es_menor) {
      if (!v.representante_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representante_id'], message: 'Un menor debe tener un representante' });
      }
    } else if (!v.cedula) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cedula'], message: 'Cédula requerida (o marca el paciente como menor)' });
    }
  });

export const updatePacienteSchema = z
  .object({
    cedula: documentoSchema.optional(),
    nombre_completo: z.string().min(3).optional(),
    tipo_documento: z.enum(TIPOS_DOCUMENTO).optional(),
    fecha_nacimiento: z.coerce.date().optional(),
    telefono: z.string().optional(),
    country_code: z.string().max(6).optional(),
    local_number: z.string().max(20).optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    direccion: z.string().optional(),
    sexo: z.enum(['M', 'F']).optional(),
    es_menor: z.boolean().optional(),
    representante_id: z.string().uuid('Representante inválido').optional(),
    parentesco_representante: z.string().max(50).optional(),
    fecha_consentimiento: z.coerce.date().optional(),
    // Facturación VE: datos fiscales del receptor (RIF y dirección fiscal).
    rif: z.string().max(30).optional().nullable(),
    direccion_fiscal: z.string().max(300).optional().nullable(),
    // Convenio comercial (aseguradora/empresa) del paciente.
    convenio_id: z.string().uuid('Convenio inválido').optional().nullable(),
  })
  .strict();

export const searchPacientesQuery = z.object({
  q: z.string().trim().max(80).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

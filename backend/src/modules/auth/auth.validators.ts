import { z } from 'zod';
import { ROLES } from './types.js';

export const loginSchema = z.object({
  cedula: z.string().min(3, 'Cédula requerida'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

export const switchRoleSchema = z.object({
  role: z.enum(ROLES as [string, ...string[]]),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token requerido'),
});

export const mfaCodigoSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});

export const mfaVerifyLoginSchema = z.object({
  mfa_token: z.string().min(1, 'mfa_token requerido'),
  code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});

/**
 * Actualización autogestionada del perfil (sin escalar permisos):
 * - especialidad_activa: contexto del dashboard médico (debe estar en el array).
 * - dashboard_config.vista: 'activa' (una especialidad) o 'consolidada' (todas).
 * - colegiatura / firma_digital: el usuario puede completar sus datos.
 */
export const perfilUpdateSchema = z.object({
  especialidad_activa: z.string().max(100).optional(),
  dashboard_config: z
    .object({
      vista: z.enum(['activa', 'consolidada']).optional(),
    })
    .strict()
    .optional(),
  colegiatura: z.string().max(50).optional().nullable(),
  firma_digital: z.string().max(2000).optional().nullable(),
});
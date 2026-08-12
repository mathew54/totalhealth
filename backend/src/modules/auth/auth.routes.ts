import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { signStaffToken } from '../../utils/jwt.js';
import { forbidden } from '../../utils/httpError.js';
import { normalizeDocumento } from '../pacientes/pacientes.validators.js';
import { estadoBloqueo, registrarIntentoFallido, reiniciarIntentos } from '../../services/loginLockout.js';
import { encryptCampo, decryptCampo } from '../../services/cifrado.js';
import { conTelefonoSeparado } from '../../services/phoneNumber.js';
import { generarSecreto, otpauthUri, validarCodigo } from '../../services/totp.js';
import { guardarSesionPendiente, registrarCodigoInvalido, tomarSesionPendiente } from '../../services/mfaSessions.js';
import { signMfaToken, verifyMfaToken } from '../../utils/jwt.js';
import type { Rol } from './types.js';
import { loginSchema, mfaCodigoSchema, mfaVerifyLoginSchema, perfilUpdateSchema, refreshSchema, switchRoleSchema } from './auth.validators.js';

const router = Router();

/**
 * POST /api/auth/login
 * Autentica por cédula + contraseña. Resuelve la cédula al email del
 * perfil y valida contra Supabase Auth. Devuelve el token con su rol activo.
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { cedula, password } = req.body as z.infer<typeof loginSchema>;

    // Normaliza cualquier tipo de documento (V/E/J/P/C) antes de buscar el perfil.
    const cedulaNorm = normalizeDocumento(cedula);

    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('id, email, role, roles, activo, mfa_activo')
      .eq('cedula', cedulaNorm)
      .maybeSingle();

    if (!profile || !profile.email) {
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Credenciales inválidas' } });
    }
    if (profile.activo === false) {
      return res.status(403).json({ error: { code: 'USER_DISABLED', message: 'Usuario desactivado' } });
    }

    // Bloqueo por intentos fallidos: si la cuenta está bloqueada, se rechaza
    // incluso con la contraseña correcta hasta que expire la ventana.
    const bloqueo = await estadoBloqueo(cedulaNorm);
    if (bloqueo.bloqueado) {
      const minutos = Math.max(1, Math.ceil(bloqueo.retryAfterSec / 60));
      return res.status(423).json({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} min.`,
          retry_after: bloqueo.retryAfterSec,
        },
      });
    }

    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error || !data.session) {
      const trasFallido = await registrarIntentoFallido(cedulaNorm);
      if (trasFallido.bloqueado) {
        const minutos = Math.max(1, Math.ceil(trasFallido.retryAfterSec / 60));
        return res.status(423).json({
          error: {
            code: 'ACCOUNT_LOCKED',
            message: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intenta de nuevo en ${minutos} min.`,
            retry_after: trasFallido.retryAfterSec,
          },
        });
      }
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Credenciales inválidas' } });
    }
    await reiniciarIntentos(cedulaNorm);

    // MFA: el primer factor (contraseña) fue válido, pero falta el segundo.
    if (profile.mfa_activo === true) {
      const mfaToken = signMfaToken(profile.id);
      guardarSesionPendiente(mfaToken, data.session);
      return res.json({ mfa_required: true, mfa_token: mfaToken });
    }

    res.json(data.session);
  } catch (err) {
    next(err);
  }
});

/**
 * Seguridad MFA (TOTP). El alta/gestión queda restringido a admin/super_root;
 * el login exige el segundo factor solo a quienes lo activaron.
 */
const MFA_ROLES: Rol[] = ['admin', 'super_root'];
const esRolMfa = (role: Rol) => MFA_ROLES.includes(role);

/** GET /api/auth/mfa/estado — estado del segundo factor del usuario. */
router.get('/mfa/estado', authRequired, async (req, res, next) => {
  try {
    const user = req.user!;
    const { data } = await getSupabase()
      .from('profiles')
      .select('mfa_activo')
      .eq('id', user.id)
      .single();
    res.json({ activo: data?.mfa_activo === true, habilitado_para_rol: esRolMfa(user.role) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/mfa/setup — genera un secreto TOTP y su URI para escanear. */
router.post('/mfa/setup', authRequired, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!esRolMfa(user.role)) return next(forbidden('MFA disponible solo para admin y super_root'));

    const { data: perfil } = await getSupabase()
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    const secreto = generarSecreto();
    await getSupabase()
      .from('profiles')
      .update({ mfa_secret: encryptCampo(secreto), mfa_activo: false })
      .eq('id', user.id);

    res.json({
      secret: secreto,
      otpauth_url: otpauthUri(secreto, perfil?.email ?? user.nombre),
      activo: false,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/mfa/verify — confirma la activación con un código válido. */
router.post('/mfa/verify', authRequired, validate(mfaCodigoSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const { code } = req.body as z.infer<typeof mfaCodigoSchema>;

    const { data: perfil } = await getSupabase()
      .from('profiles')
      .select('mfa_secret')
      .eq('id', user.id)
      .single();
    const secreto = decryptCampo((perfil?.mfa_secret as string | null) ?? null);
    if (!secreto || !validarCodigo(secreto, code)) {
      return res.status(401).json({ error: { code: 'MFA_INVALID', message: 'Código inválido o vencido' } });
    }

    await getSupabase().from('profiles').update({ mfa_activo: true }).eq('id', user.id);
    res.json({ ok: true, activo: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/mfa/desactivar — desactiva exigiendo un código válido. */
router.post('/mfa/desactivar', authRequired, validate(mfaCodigoSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    if (!esRolMfa(user.role)) return next(forbidden('MFA disponible solo para admin y super_root'));

    const { code } = req.body as z.infer<typeof mfaCodigoSchema>;
    const { data: perfil } = await getSupabase()
      .from('profiles')
      .select('mfa_secret')
      .eq('id', user.id)
      .single();
    const secreto = decryptCampo((perfil?.mfa_secret as string | null) ?? null);
    if (!secreto || !validarCodigo(secreto, code)) {
      return res.status(401).json({ error: { code: 'MFA_INVALID', message: 'Código inválido o vencido' } });
    }

    await getSupabase().from('profiles').update({ mfa_secret: null, mfa_activo: false }).eq('id', user.id);
    res.json({ ok: true, activo: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/mfa/verify-login — completa el segundo factor y entrega la sesión. */
router.post('/mfa/verify-login', validate(mfaVerifyLoginSchema), async (req, res, next) => {
  try {
    const { mfa_token, code } = req.body as z.infer<typeof mfaVerifyLoginSchema>;

    let payload: { sub: string; scope: 'mfa' };
    try {
      payload = verifyMfaToken(mfa_token);
    } catch (err) {
      return next(err);
    }

    const { data: perfil } = await getSupabase()
      .from('profiles')
      .select('mfa_secret, mfa_activo')
      .eq('id', payload.sub)
      .single();
    const secreto = decryptCampo((perfil?.mfa_secret as string | null) ?? null);
    if (perfil?.mfa_activo !== true || !secreto || !validarCodigo(secreto, code)) {
      if (registrarCodigoInvalido(mfa_token)) {
        return res.status(423).json({ error: { code: 'MFA_EXHAUSTED', message: 'Demasiados intentos. Vuelve a iniciar sesión.' } });
      }
      return res.status(401).json({ error: { code: 'MFA_INVALID', message: 'Código inválido o vencido' } });
    }

    const session = tomarSesionPendiente(mfa_token);
    if (!session) {
      return res.status(401).json({ error: { code: 'MFA_EXPIRED', message: 'Sesión vencida. Vuelve a iniciar sesión.' } });
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/switch-role
 * Cambia el rol activo del usuario (si tiene varios asignados) y devuelve
 * un nuevo access token con ese rol, sin volver a iniciar sesión.
 */
router.post('/switch-role', authRequired, validate(switchRoleSchema), async (req, res, next) => {
  try {
const user = req.user!;
    const { role } = req.body as z.infer<typeof switchRoleSchema>;
    const target = role as Rol;
    if (!user.roles.includes(target)) return next(forbidden('Rol no asignado a este usuario'));

    const access = signStaffToken({
      id: user.id,
      role: target,
      roles: user.roles,
      clinicaId: user.clinicaId,
      nombre: user.nombre,
    });
    res.json({ access_token: access });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Renueva la sesión con un refresh token.
 */
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refresh_token } = req.body as { refresh_token: string };
    const { data, error } = await getSupabase().auth.refreshSession({ refresh_token });
    if (error) {
      return res.status(401).json({ error: { code: 'REFRESH_FAILED', message: 'Refresh token inválido' } });
    }
    res.json(data.session);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authRequired, async (req, res, next) => {
  try {
    await getSupabase().auth.signOut();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Devuelve el perfil del usuario autenticado con su rol activo y la lista
 * de roles asignados (inyectado por el middleware).
 */
router.get('/me', authRequired, async (req, res, next) => {
  try {
    if (!req.user) return next(forbidden());
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('id, clinica_id, nombre_completo, cedula, telefono, roles, activo, especialidad, especialidades, especialidad_activa, categoria_medica, colegiatura, firma_digital, dashboard_config, mfa_activo, created_at')
      .eq('id', req.user.id)
      .single();
    if (error) return next(error);

const roles = Array.isArray(profile.roles) ? (profile.roles as Rol[]) : [req.user.role];
    res.json(
      conTelefonoSeparado({
        ...profile,
        telefono: decryptCampo((profile.telefono as string | null | undefined) ?? null),
        firma_digital: decryptCampo((profile.firma_digital as string | null | undefined) ?? null),
        role: req.user.role,
        roles,
        mfa_activo: profile.mfa_activo === true,
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/auth/perfil
 * El usuario actualiza su propio contexto (médico multiespecialidad):
 * especialidad activa y configuración de dashboard (vista activa/consolidada),
 * colegiatura y firma digital. No permite escalar roles.
 */
router.patch('/perfil', authRequired, validate(perfilUpdateSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const body = req.body as z.infer<typeof perfilUpdateSchema>;

    const { data: perfil, error: gErr } = await getSupabase()
      .from('profiles')
      .select('id, especialidades, especialidad_activa, dashboard_config')
      .eq('id', user.id)
      .single();
    if (gErr || !perfil) return next(forbidden('Perfil no encontrado'));

    const especialidades = Array.isArray(perfil.especialidades) ? (perfil.especialidades as string[]) : [];
    const update: Record<string, unknown> = {};

    if (body.especialidad_activa !== undefined) {
      if (!especialidades.includes(body.especialidad_activa)) {
        return next(forbidden('La especialidad activa no está asignada a este perfil'));
      }
      update.especialidad_activa = body.especialidad_activa;
    }
    if (body.dashboard_config !== undefined) {
      const actual = (perfil.dashboard_config as Record<string, unknown> | null) ?? {};
      update.dashboard_config = { ...actual, ...body.dashboard_config };
    }
    if (body.colegiatura !== undefined) update.colegiatura = body.colegiatura;
    if (body.firma_digital !== undefined) update.firma_digital = encryptCampo(body.firma_digital);

    const { data: actualizado, error } = await getSupabase()
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id, especialidad_activa, especialidades, dashboard_config, colegiatura, firma_digital')
      .single();
    if (error) return next(error);

    res.json({
      ...actualizado,
      firma_digital: decryptCampo((actualizado.firma_digital as string | null | undefined) ?? null),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
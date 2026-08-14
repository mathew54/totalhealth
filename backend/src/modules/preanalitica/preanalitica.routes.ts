import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import {
  checkpointSchema,
  configPreanaliticaSchema,
  idParamSchema,
  validarSolicitudSchema,
} from './preanalitica.validators.js';

const router = Router();
router.use(authRequired, requireRole('admin', 'laboratorio', 'secretaria', 'super_root'));

const CONFIG_ID = true;

/** Lee la config pre-analítica de app_config (con default). */
async function leerConfig() {
  const { data } = await getSupabase().from('app_config').select('preanalitica').eq('id', CONFIG_ID).maybeSingle();
  const conf = (data?.preanalitica as { habilitado?: boolean; obligatorio?: boolean } | undefined) ?? {};
  return { habilitado: conf.habilitado !== false, obligatorio: conf.obligatorio === true };
}

/**
 * GET /api/preanalitica
 * Config + catálogo de checkpoints. El laboratorio la consulta para saber si
 * debe validar y con qué puntos.
 */
router.get('/', async (_req, res, next) => {
  try {
    const [{ data: checkpoints }, config] = await Promise.all([
      getSupabase().from('checkpoints_preanalitica').select('*').order('created_at', { ascending: true }),
      leerConfig(),
    ]);
    res.json({ config, checkpoints: checkpoints ?? [] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/preanalitica/config
 * Activa/desactiva el módulo y decide si la validación es obligatoria.
 */
router.put('/config', requireRole(...ROLES_ADMIN_SUPER), validate(configPreanaliticaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof configPreanaliticaSchema>;
    const { data, error } = await getSupabase()
      .from('app_config')
      .update({
        preanalitica: { habilitado: body.habilitado, obligatorio: body.obligatorio },
        updated_at: new Date().toISOString(),
      })
      .eq('id', CONFIG_ID)
      .select('preanalitica')
      .single();
    if (error) return next(badRequest(error.message));
    res.json(data?.preanalitica ?? body);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/preanalitica/checkpoints
 * Agrega un nuevo punto de verificación al catálogo.
 */
router.post('/checkpoints', requireRole(...ROLES_ADMIN_SUPER), validate(checkpointSchema), async (req, res, next) => {
  try {
    const { nombre } = req.body as z.infer<typeof checkpointSchema>;
    const user = req.user!;
    const { data, error } = await getSupabase()
      .from('checkpoints_preanalitica')
      .insert({ clinica_id: user.clinicaId, nombre })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/preanalitica/checkpoints/:id
 * Activa/desactiva un checkpoint.
 */
router.patch('/checkpoints/:id', requireRole(...ROLES_ADMIN_SUPER), validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { activo } = req.body as { activo?: boolean };
    if (typeof activo !== 'boolean') return next(badRequest('activo es requerido'));

    const { data, error } = await getSupabase()
      .from('checkpoints_preanalitica')
      .update({ activo })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/preanalitica/solicitudes/:id
 * Estado de la validación pre-analítica de una solicitud.
 */
router.get('/solicitudes/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;

    const { data: solicitud } = await getSupabase().from('solicitudes').select('id').eq('id', id).maybeSingle();
    if (!solicitud) return next(notFound('Solicitud no encontrada'));

    const { data: checkpoints } = await getSupabase()
      .from('checkpoints_preanalitica')
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: true });

    const { data: realizadas } = await getSupabase()
      .from('solicitudes_preanalitica')
      .select('checkpoint_id')
      .eq('solicitud_id', id);

    const hechos = new Set((realizadas ?? []).map((r) => r.checkpoint_id));

    const { data: creadasPor } = await getSupabase()
      .from('solicitudes_preanalitica')
      .select('validado_por')
      .eq('solicitud_id', id);

    const config = await leerConfig();
    const completo = ((checkpoints ?? []).length > 0 && (checkpoints ?? []).every((c) => hechos.has(c.id)));

    res.json({
      config,
      validaciones: (checkpoints ?? []).map((c) => ({ ...c, cumplido: hechos.has(c.id) })),
      completado: completo,
      validado_por: (creadasPor ?? [])[0]?.validado_por ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/preanalitica/solicitudes/:id/validar
 * Registra la validación pre-analítica de una solicitud.
 */
router.post(
  '/solicitudes/:id/validar',
  requireRole('admin', 'laboratorio', 'secretaria', 'super_root'),
  validate(idParamSchema, 'params'),
  validate(validarSolicitudSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { checkpoints } = req.body as z.infer<typeof validarSolicitudSchema>;
      const user = req.user!;

      const { data: solicitud } = await getSupabase().from('solicitudes').select('id').eq('id', id).maybeSingle();
      if (!solicitud) return next(notFound('Solicitud no encontrada'));

      // Valida que existan todos los checkpoints solicitados.
      const { data: activos } = await getSupabase()
        .from('checkpoints_preanalitica')
        .select('id')
        .eq('activo', true);
      const idsActivos = new Set((activos ?? []).map((c) => c.id));
        for (const cp of checkpoints) {
          if (!idsActivos.has(cp)) return next(badRequest('Un checkpoint no existe o está inactivo'));
        }

      const { data: previos } = await getSupabase()
        .from('solicitudes_preanalitica')
        .select('checkpoint_id')
        .eq('solicitud_id', id);
      const yaExiste = new Set((previos ?? []).map((p) => p.checkpoint_id));

      const filas = checkpoints
        .filter((cp) => !yaExiste.has(cp))
        .map((cp) => ({ solicitud_id: id, checkpoint_id: cp, cumplido: true, validado_por: user.id }));

      if (filas.length > 0) {
        const { error } = await getSupabase().from('solicitudes_preanalitica').insert(filas);
        if (error) return next(badRequest(error.message));
      }

      res.status(201).json({ registrados: filas.length, solicitud_id: id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
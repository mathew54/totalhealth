import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { notificarDomicilio } from '../../services/notifier.js';
import { telefonoDesdeBody, conTelefonoSeparado } from '../../services/phoneNumber.js';
import { crearDomicilioSchema, idParamSchema, actualizarDomicilioSchema, domicilioQuery } from './domicilios.validators.js';

const router = Router();
router.use(authRequired, requireRole('secretaria', 'laboratorio', 'admin', 'super_root'));

const COLS = 'id, clinica_id, solicitud_id, paciente_id, direccion, telefono, fecha_visita, estado, ubicacion, notas, created_at';

/**
 * GET /api/domicilios?estado=
 * Cola de toma de muestras a domicilio.
 */
router.get('/', validate(domicilioQuery, 'query'), async (_req, res, next) => {
  try {
    const { estado } = _req.query as z.infer<typeof domicilioQuery>;
    let query = getSupabase().from('muestras_domicilio').select(COLS);
    if (estado) query = query.eq('estado', estado);
    query = query.order('created_at', { ascending: false });

    const { data } = await query;
    res.json((data ?? []).map(conTelefonoSeparado));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/domicilios
 * La secretaría programa una toma de muestra a domicilio.
 */
router.post('/', validate(crearDomicilioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearDomicilioSchema>;
    const user = req.user!;

    const { data, error } = await getSupabase()
      .from('muestras_domicilio')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        solicitud_id: body.solicitud_id ?? null,
        direccion: body.direccion,
        telefono: telefonoDesdeBody(body),
        fecha_visita: body.fecha_visita ?? null,
        estado: body.estado ?? 'solicitada',
        notas: body.notas ?? null,
        creado_por: user.id,
      })
      .select(COLS)
      .single();
    if (error) return next(badRequest(error.message));

    await notificarDomicilio({ pacienteId: body.paciente_id, direccion: body.direccion, fechaVisita: body.fecha_visita ?? null });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/domicilios/:id
 * Actualiza estado (programada → en_ruta → tomada → completada) o ubicación
 * de rastreo en vivo.
 */
router.patch('/:id', validate(idParamSchema, 'params'), validate(actualizarDomicilioSchema, 'body'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof actualizarDomicilioSchema>;
    const user = req.user!;

    const { data: actual } = await getSupabase().from('muestras_domicilio').select('id').eq('id', id).maybeSingle();
    if (!actual) return next(notFound('Solicitud de domicilio no encontrada'));

    const { data, error } = await getSupabase()
      .from('muestras_domicilio')
      .update({ ...body, updated_at: new Date().toISOString(), creado_por: user.id })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return next(badRequest(error.message));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
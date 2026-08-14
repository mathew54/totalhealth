import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import {
  enviarNotificacionesPendientes,
  generarRecordatoriosManuales,
  limpiarNotificacionesEnviadas,
  crearNotificacionPendiente,
} from '../../services/notifier.js';
import { crearNotificacionSchema, actualizarNotificacionSchema, enviarPendientesSchema, idParamSchema } from './notificaciones.validators.js';
import { telefonoDesdeBody, conTelefonoSeparado } from '../../services/phoneNumber.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_SECRETARIA_ADMIN));

/**
 * GET /api/notificaciones
 * Cola de notificaciones generadas (historial de recordatorios).
 * El teléfono se expone como E.164 + piezas separadas (country_code / local_number).
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data } = await getSupabase()
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 199);
    res.json((data ?? []).map(conTelefonoSeparado));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notificaciones
 * Creación manual de una notificación (queda en estado pendiente hasta su
 * `programada_para`).
 */
router.post('/', validate(crearNotificacionSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearNotificacionSchema>;
    const id = await crearNotificacionPendiente({
      pacienteId: body.paciente_id,
      telefono: telefonoDesdeBody(body) ?? undefined,
      canal: body.canal,
      tipo: body.tipo,
      mensaje: body.mensaje,
      programadaPara: body.programada_para,
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notificaciones/:id
 * Edita una notificación pendiente o fallida (para reenviar). Las ya enviadas
 * no se pueden modificar. Al editar se vuelve a `pendiente` y se limpia el error.
 */
router.patch('/:id', validate(idParamSchema, 'params'), validate(actualizarNotificacionSchema), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof actualizarNotificacionSchema>;

    const { data: existente } = await getSupabase()
      .from('notificaciones')
      .select('id, estado')
      .eq('id', id)
      .maybeSingle();
    if (!existente) return res.status(404).json({ error: 'Notificación no encontrada' });
    if (existente.estado === 'enviada') {
      return res.status(400).json({ error: 'No se puede editar una notificación ya enviada' });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), estado: 'pendiente', error: null };
    if (body.canal !== undefined) updates.canal = body.canal;
    if (body.tipo !== undefined) updates.tipo = body.tipo;
    if (body.mensaje !== undefined) updates.mensaje = body.mensaje;
    if (body.programada_para !== undefined) updates.programada_para = body.programada_para;
    if (body.telefono !== undefined || body.country_code !== undefined || body.local_number !== undefined) {
      updates.telefono = telefonoDesdeBody(body);
    }

    const { data, error } = await getSupabase().from('notificaciones').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(conTelefonoSeparado(data));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notificaciones/:id
 * Elimina una notificación de la cola o del historial.
 */
router.delete('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const { data: existente } = await getSupabase()
      .from('notificaciones')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!existente) return res.status(404).json({ error: 'Notificación no encontrada' });

    const { error } = await getSupabase().from('notificaciones').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notificaciones/enviar-pendientes
 * Job: procesa los recordatorios cuya hora ya llegó. Acepta un lote opcional de
 * IDs (desde la UI). Invocable por cron sin body.
 */
router.post('/enviar-pendientes', validate(enviarPendientesSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof enviarPendientesSchema>;
    const resultado = await enviarNotificacionesPendientes({ ids: body.ids });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notificaciones/generar-recordatorios
 * Generación manual de recordatorios pendientes a partir del estado actual de
 * los datos (citas, resultados, turnos del día y domicilios). Evita duplicados.
 */
router.post('/generar-recordatorios', async (_req, res, next) => {
  try {
    const resumen = await generarRecordatoriosManuales();
    res.json({ ok: true, resumen });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notificaciones/limpiar-enviadas
 * Elimina el historial de recordatorios ya enviados (mantiene la cola limpia).
 */
router.post('/limpiar-enviadas', async (_req, res, next) => {
  try {
    const eliminadas = await limpiarNotificacionesEnviadas();
    res.json({ ok: true, eliminadas });
  } catch (err) {
    next(err);
  }
});

export default router;
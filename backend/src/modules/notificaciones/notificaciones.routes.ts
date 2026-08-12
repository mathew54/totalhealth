import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  enviarNotificacionesPendientes,
  generarRecordatoriosManuales,
  limpiarNotificacionesEnviadas,
  crearNotificacionPendiente,
} from '../../services/notifier.js';
import { crearNotificacionSchema, enviarPendientesSchema } from './notificaciones.validators.js';
import { telefonoDesdeBody, conTelefonoSeparado } from '../../services/phoneNumber.js';

const router = Router();
router.use(authRequired, requireRole('secretaria', 'admin', 'super_root'));

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
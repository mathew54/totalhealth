import { Router } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { enviarNotificacionesPendientes } from '../../services/notifier.js';

const router = Router();
router.use(authRequired, requireRole('secretaria', 'admin', 'super_root'));

/**
 * GET /api/notificaciones
 * Cola de notificaciones generadas (historial de recordatorios).
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data } = await getSupabase()
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 99);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notificaciones/enviar-pendientes
 * Job: procesa los recordatorios cuya hora ya llegó. Invocable por cron.
 */
router.post('/enviar-pendientes', async (_req, res, next) => {
  try {
    const enviadas = await enviarNotificacionesPendientes();
    res.json({ enviadas });
  } catch (err) {
    next(err);
  }
});

export default router;
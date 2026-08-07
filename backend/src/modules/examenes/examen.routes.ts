import { Router } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';

const router = Router();
router.use(authRequired);

/**
 * GET /api/examenes
 * Catálogo activo de exámenes de laboratorio.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id, nombre, categoria, precio, interno, duracion_min, condiciones_previas, tiempo_entrega, activo')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

export default router;

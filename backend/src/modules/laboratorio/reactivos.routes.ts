import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest } from '../../utils/httpError.js';

const router = Router();
router.use(authRequired);

const reactivoSchema = z.object({
  nombre: z.string().min(2),
  lote: z.string().optional(),
  fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  cantidad: z.coerce.number().min(0).default(0),
  alerta_minima: z.coerce.number().min(0).optional(),
  proveedor: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

/**
 * GET /api/reactivos
 * Inventario de reactivos.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('reactivos')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reactivos — laboratorio/admin
 */
router.post(
  '/',
  requireRole('laboratorio', 'admin', 'super_root'),
  validate(reactivoSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof reactivoSchema>;
      const { data, error } = await getSupabase()
        .from('reactivos')
        .insert({ ...body, clinica_id: req.user!.clinicaId })
        .select()
        .single();
      if (error) return next(badRequest(error.message));
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/reactivos/:id — laboratorio/admin
 */
router.patch(
  '/:id',
  requireRole('laboratorio', 'admin', 'super_root'),
  validate(reactivoSchema.partial()),
  validate(idParam, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParam>;
      const body = req.body as z.infer<typeof reactivoSchema>;
      const { data, error } = await getSupabase().from('reactivos').update(body).eq('id', id).select().single();
      if (error) return next(badRequest(error.message));
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;

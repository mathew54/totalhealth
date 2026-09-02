// modules/facturas/facturas.routes.ts
// TotalHealth: facturación VE persistida. Listado del libro de facturas y
// anulación (estatus emitida -> anulada). Las facturas se crean al cobrar
// (POST /api/pagos/laboratorio); aquí solo consulta y anulación.

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { anularFactura } from '../../services/factura.js';
import { anularFacturaSchema, facturasQuery } from './facturas.validators.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_SECRETARIA_ADMIN));

const FACTURA_COLS =
  'id, pago_id, solicitud_id, consulta_id, paciente_id, tipo_documento, serie, numero_factura, numero_control, moneda, tasa_usd, base_gravada, base_exenta, iva, descuento, igtf, retencion_iva, retencion_islr, total, receptor_razon_social, receptor_rif, estatus, emitida_por, fecha_emision, anulada_por, anulada_en, motivo_anulacion';

/**
 * GET /api/facturas?desde=&hasta=&paciente_id=&solicitud_id=&estatus=&tipo=
 * Libro de facturas/recibos por rango de emisión.
 */
router.get('/', validate(facturasQuery, 'query'), async (req, res, next) => {
  try {
    const { desde, hasta, paciente_id, solicitud_id, estatus, tipo } = req.query as unknown as z.infer<typeof facturasQuery>;
    const user = req.user!;

    let query = getSupabase()
      .from('facturas')
      .select(FACTURA_COLS)
      .eq('clinica_id', user.clinicaId)
      .order('fecha_emision', { ascending: false });
    if (desde) query = query.gte('fecha_emision', `${desde}T00:00:00.000Z`);
    if (hasta) query = query.lte('fecha_emision', `${hasta}T23:59:59.999Z`);
    if (paciente_id) query = query.eq('paciente_id', paciente_id);
    if (solicitud_id) query = query.eq('solicitud_id', solicitud_id);
    if (estatus) query = query.eq('estatus', estatus);
    if (tipo) query = query.eq('tipo_documento', tipo);

    const { data, error } = await query;
    if (error) return next(error);

    res.json({
      count: (data ?? []).length,
      facturas: data ?? [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facturas/:id
 * Detalle de una factura con sus líneas.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { data: factura, error } = await getSupabase()
      .from('facturas')
      .select(FACTURA_COLS)
      .eq('id', id)
      .single();
    if (error || !factura) return next(notFound('Factura no encontrada'));
    const { data: lineas } = await getSupabase()
      .from('factura_lineas')
      .select('*')
      .eq('factura_id', id);
    res.json({ ...factura, lineas: lineas ?? [] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/facturas/:id/anular
 * Anula una factura emitida (motivo obligatorio). El correlativo no se reutiliza.
 */
router.post('/:id/anular', validate(anularFacturaSchema), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { motivo } = req.body as z.infer<typeof anularFacturaSchema>;

    let factura;
    try {
      factura = await anularFactura(id, motivo, req.user!.id);
    } catch (e) {
      if ((e as { code?: string }).code === 'CONFLICT') {
        return next(badRequest((e as Error).message));
      }
      return next(e);
    }

    res.json(factura);
  } catch (err) {
    next(err);
  }
});

export default router;

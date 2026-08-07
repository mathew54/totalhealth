import { Router } from 'express';
import { getSupabase } from '../../config/supabase.js';

const router = Router();

const CONFIG_ID = true;

/**
 * GET /api/config
 * Marca pública de la app (razón social, RIF, logo, color del header).
 * La consume el portal y los documentos imprimibles/descargables.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('app_config')
      .select('razon_social, rif, logo_url, header_color')
      .eq('id', CONFIG_ID)
      .maybeSingle();
    if (error) return next(error);
    res.json(
      data ?? {
        razon_social: 'TotalHealth',
        rif: '',
        logo_url: '',
        header_color: '#8b5cf6',
      },
    );
  } catch (err) {
    next(err);
  }
});

export default router;

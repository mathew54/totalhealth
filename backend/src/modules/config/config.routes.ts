import { Router } from 'express';
import { getSupabase } from '../../config/supabase.js';
import { conTelefonoSeparado } from '../../services/phoneNumber.js';

const router = Router();

const CONFIG_ID = true;

/**
 * GET /api/config
 * Marca pública de la app (razón social, RIF, dirección, teléfono, logo, color del header).
 * La consume el portal y los documentos imprimibles/descargables.
 * El teléfono se expone como E.164 + piezas separadas (country_code / local_number).
 */
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('app_config')
      .select('razon_social, rif, direccion, telefono, logo_url, header_color')
      .eq('id', CONFIG_ID)
      .maybeSingle();
    if (error) return next(error);
    res.json(
      conTelefonoSeparado(
        data ?? {
          razon_social: 'TotalHealth',
          rif: '',
          direccion: '',
          telefono: '',
          logo_url: '',
          header_color: '#8b5cf6',
        },
      ),
    );
  } catch (err) {
    next(err);
  }
});

export default router;

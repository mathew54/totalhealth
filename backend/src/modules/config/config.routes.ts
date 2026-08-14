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
      .select('razon_social, rif, direccion, telefono, logo_url, header_color, iva')
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
          iva: 0.16,
        },
      ),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/config/paises
 * Catálogo de países para el selector E.164, leído desde la BD (única fuente).
 * Alimentado por src/data/paises.ts (seed + migración 0030).
 */
router.get('/paises', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase().from('paises').select('id, nombre, codigo').order('nombre', { ascending: true });
    if (error) return next(error);
    res.json(
      (data ?? []).map((p) => ({ iso2: p.id as string, nombre: p.nombre as string, codigo: p.codigo as string })),
    );
  } catch (err) {
    next(err);
  }
});

export default router;

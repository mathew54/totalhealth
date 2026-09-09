// modules/tarifas/tarifas.routes.ts
// TotalHealth: CRUD de tarifas de consulta. Permite definir precios por tipo
// de consulta (general, especialista, domicilio, telemedicina, control) y
// opcionalmente por médico específico. Las tarifas se usan al agendar para
// asignar el monto_base_usd de la consulta y permitir su cobro desde caja.

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { registrarAuditoria } from '../../services/auditoria.js';
import {
  tarifaConsultaSchema,
  tarifasQuery,
  idParamSchema,
  resolverTarifaQuery,
} from './tarifas.validators.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_ADMIN_SUPER));

const TARIFA_COLS =
  'id, clinica_id, nombre, tipo, especialidad, medico_id, precio_usd, impuesto, duracion_min, activo, created_at, updated_at';

/**
 * Resuelve los nombres de especialidad (catálogo) para una lista de tarifas.
 */
async function enriquecerEspecialidades(tarifas: Record<string, unknown>[]) {
  const ids = [...new Set(tarifas.map((t) => t.especialidad).filter(Boolean) as string[])];
  if (!ids.length) return;
  const nombrePorId = new Map<string, string>();
  if (ids.length) {
    const { data: especialidades } = await getSupabase()
      .from('especialidades_medicas')
      .select('id, nombre')
      .in('id', ids);
    for (const e of especialidades ?? []) {
      nombrePorId.set(e.id as string, e.nombre as string);
    }
  }
  for (const t of tarifas) {
    t.especialidad_nombre = t.especialidad ? (nombrePorId.get(t.especialidad as string) ?? null) : null;
  }
}

/**
 * GET /api/tarifas
 * Lista todas las tarifas de la clínica, con filtros opcionales por tipo,
 * médico y estado activo/inactivo.
 */
router.get('/', validate(tarifasQuery, 'query'), async (req, res, next) => {
  try {
    const { tipo, especialidad, medico_id, activo } = req.query as unknown as z.infer<typeof tarifasQuery>;
    const user = req.user!;

    let query = getSupabase()
      .from('tarifas_consulta')
      .select(TARIFA_COLS)
      .order('tipo', { ascending: true })
      .order('nombre', { ascending: true });

    if (user.clinicaId) query = query.eq('clinica_id', user.clinicaId);
    if (tipo) query = query.eq('tipo', tipo);
    if (especialidad) query = query.eq('especialidad', especialidad);
    if (medico_id) query = query.eq('medico_id', medico_id);
    if (activo !== undefined) query = query.eq('activo', activo);

    const { data, error } = await query;
    if (error) return next(error);

    const tarifas = (data ?? []) as Record<string, unknown>[];
    await enriquecerEspecialidades(tarifas);

    // Enriquecer con nombre del médico si tiene medico_id.
    const medicoIds = [...new Set(tarifas.map((t) => t.medico_id).filter(Boolean))] as string[];
    let medicosMap = new Map<string, { nombre_completo: string }>();
    if (medicoIds.length) {
      const { data: medicos } = await getSupabase()
        .from('profiles')
        .select('id, nombre_completo')
        .in('id', medicoIds);
      for (const m of medicos ?? []) {
        medicosMap.set(m.id as string, { nombre_completo: m.nombre_completo as string });
      }
    }

    res.json(
      tarifas.map((t) => ({
        ...t,
        precio_usd: Number(t.precio_usd),
        medico: t.medico_id ? (medicosMap.get(t.medico_id as string) ?? null) : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tarifas/resolver?tipo=&medico_id=&clinica_id=
 * Resuelve la tarifa aplicable para un tipo + médico dado.
 * Prioridad: tarifa específica del médico > tarifa default del tipo (medico_id = null).
 * Esta ruta es pública (no requiere admin) porque la usa el módulo de consultas al agendar.
 */
router.get('/resolver', validate(resolverTarifaQuery, 'query'), async (req, res, next) => {
  try {
    const { tipo, medico_id, clinica_id } = req.query as unknown as z.infer<typeof resolverTarifaQuery>;
    const user = req.user!;
    const cid = clinica_id ?? user.clinicaId;

    // 1. Buscar tarifa específica del médico.
    if (medico_id) {
      const { data: especifica } = await getSupabase()
        .from('tarifas_consulta')
        .select(TARIFA_COLS)
        .eq('tipo', tipo)
        .eq('medico_id', medico_id)
        .eq('activo', true)
        .maybeSingle();
      if (especifica && (!cid || especifica.clinica_id === cid)) {
        return res.json({ ...especifica, precio_usd: Number(especifica.precio_usd) });
      }
    }

    // 2. Buscar tarifa default del tipo (medico_id = null).
    const { data: defaultTarifa } = await getSupabase()
      .from('tarifas_consulta')
      .select(TARIFA_COLS)
      .eq('tipo', tipo)
      .is('medico_id', null)
      .eq('activo', true)
      .maybeSingle();
    if (defaultTarifa && (!cid || defaultTarifa.clinica_id === cid)) {
      return res.json({ ...defaultTarifa, precio_usd: Number(defaultTarifa.precio_usd) });
    }

    // 3. Sin tarifa configurada → precio 0.
    res.json(null);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tarifas/:id
 * Detalle de una tarifa.
 */
router.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { data, error } = await getSupabase()
      .from('tarifas_consulta')
      .select(TARIFA_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return next(notFound('Tarifa no encontrada'));
    const tarifas = [{ ...data }] as Record<string, unknown>[];
    await enriquecerEspecialidades(tarifas);
    res.json({ ...tarifas[0], precio_usd: Number(tarifas[0].precio_usd) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tarifas
 * Crea una nueva tarifa de consulta.
 */
router.post('/', validate(tarifaConsultaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof tarifaConsultaSchema>;
    const user = req.user!;

    const { data, error } = await getSupabase()
      .from('tarifas_consulta')
      .insert({
        clinica_id: user.clinicaId,
        nombre: body.nombre,
        tipo: body.tipo,
        especialidad: body.especialidad ?? null,
        medico_id: body.medico_id ?? null,
        precio_usd: body.precio_usd,
        impuesto: body.impuesto,
        duracion_min: body.duracion_min ?? null,
        activo: body.activo ?? true,
      })
      .select(TARIFA_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    void registrarAuditoria(
      { accion: 'INSERT', tabla: 'tarifas_consulta', registroId: data.id as string, detalles: body },
      user.id,
    );
    const tarifas = [{ ...data }] as Record<string, unknown>[];
    await enriquecerEspecialidades(tarifas);
    res.status(201).json({ ...tarifas[0], precio_usd: Number(tarifas[0].precio_usd) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/tarifas/:id
 * Actualiza una tarifa existente.
 */
router.put('/:id', validate(idParamSchema, 'params'), validate(tarifaConsultaSchema.partial()), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<ReturnType<typeof tarifaConsultaSchema['partial']>>;
    const user = req.user!;

    const patch: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

    const { data, error } = await getSupabase()
      .from('tarifas_consulta')
      .update(patch)
      .eq('id', id)
      .select(TARIFA_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    void registrarAuditoria(
      { accion: 'UPDATE', tabla: 'tarifas_consulta', registroId: id, detalles: patch },
      user.id,
    );
    const tarifas = [{ ...data }] as Record<string, unknown>[];
    await enriquecerEspecialidades(tarifas);
    res.json({ ...tarifas[0], precio_usd: Number(tarifas[0].precio_usd) });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tarifas/:id
 * Desactiva una tarifa (soft delete). No la borra para preservar el
 * historial de consultas que la referencian.
 */
router.delete('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data, error } = await getSupabase()
      .from('tarifas_consulta')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(TARIFA_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    void registrarAuditoria(
      { accion: 'UPDATE', tabla: 'tarifas_consulta', registroId: id, detalles: { activo: false } },
      user.id,
    );
    res.json({ ok: true, mensaje: 'Tarifa desactivada' });
  } catch (err) {
    next(err);
  }
});

export default router;

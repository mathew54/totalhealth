import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../utils/httpError.js';
import {
  casoSchema,
  evolucionSchema,
  idParamSchema,
  notaPrivadaSchema,
  pacienteIdQuerySchema,
  tutorIdQuerySchema,
} from './expediente.validators.js';

/**
 * Módulo Expediente Clínico Unificado.
 *
 * Agrega las piezas que el flujo SPA médico necesita y que no viven en otros
 * módulos: evoluciones SOAP con signos vitales, notas privadas (solo autor),
 * casos compartidos anonimizados y órdenes de laboratorio (CPOE). Las tablas
 * se crean automáticamente vacías en el mock (`MockStore.rows`).
 */
const router = Router();
router.use(authRequired);

const MEDICO = requireRole('medico', 'admin', 'super_root');
const CPOE = requireRole('medico', 'secretaria', 'admin', 'super_root');

const EVOLUCION_COLS = 'id, paciente_id, medico_id, especialidad_id, subjetivo, objetivo, evaluacion, plan, signos_vitales, especialidad_data, created_at';
const NOTA_COLS = 'id, paciente_id, medico_id, contenido, updated_at, created_at';
const CASO_COLS = 'id, medico_id, especialidad_id, titulo, resumen, created_at';

/** Convierte strings vacíos de signos vitales en null para JSON consistente. */
function normalizarSignos(signos: Record<string, unknown> | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(signos ?? {})) {
    if (v === null || v === undefined || v === '') {
      out[k] = null;
      continue;
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    out[k] = Number.isFinite(n) ? n : null;
  }
  return out;
}

// ── Notas de evolución (SOAP) ────────────────────────────────────────────────
/** GET /api/expediente/evoluciones?paciente_id= */
router.get('/evoluciones', MEDICO, validate(pacienteIdQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { paciente_id } = req.query as never as z.infer<typeof pacienteIdQuerySchema>;
    const { data } = await getSupabase()
      .from('evoluciones')
      .select(EVOLUCION_COLS)
      .eq('paciente_id', paciente_id)
      .order('created_at', { ascending: false })
      .range(0, 199);
    const rows = (data ?? []) as Record<string, unknown>[];

    const medicoIds = [...new Set(rows.map((e) => String(e.medico_id)).filter(Boolean))];
    const espIds = [...new Set(rows.map((e) => String(e.especialidad_id)).filter(Boolean))];
    const [medicos, especialidades] = await Promise.all([
      medicoIds.length
        ? getSupabase().from('profiles').select('id, nombre_completo')
        : Promise.resolve({ data: [] }),
      espIds.length
        ? getSupabase().from('especialidades_medicas').select('id, nombre')
        : Promise.resolve({ data: [] }),
    ]);
    const nombreMedico = new Map((medicos.data ?? []).map((m) => [String(m.id), m.nombre_completo]));
    const nombreEsp = new Map((especialidades.data ?? []).map((e) => [String(e.id), e.nombre]));

    res.json(
      rows.map((e) => ({
        ...e,
        medico_nombre: nombreMedico.get(String(e.medico_id)) ?? null,
        especialidad_nombre: nombreEsp.get(String(e.especialidad_id)) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/expediente/evoluciones — crea nota SOAP + signos + datos de especialidad. */
router.post('/evoluciones', MEDICO, async (req, res, next) => {
  try {
    const body = evolucionSchema.parse(req.body);
    const row = {
      id: randomUUID(),
      paciente_id: body.paciente_id,
      medico_id: req.user!.id,
      especialidad_id: body.especialidad_id ?? null,
      subjetivo: body.subjetivo,
      objetivo: body.objetivo,
      evaluacion: body.evaluacion,
      plan: body.plan,
      signos_vitales: normalizarSignos(body.signos_vitales as Record<string, unknown> | undefined),
      especialidad_data: body.especialidad_data ?? {},
      created_at: new Date().toISOString(),
    };
    const { data } = await getSupabase().from('evoluciones').insert(row).select(EVOLUCION_COLS).single();
    res.status(201).json(data ?? row);
  } catch (err) {
    next(err);
  }
});

// ── Notas privadas del médico (solo visibles al autor) ───────────────────────
/** GET /api/expediente/notas?paciente_id= — solo del autor de la sesión. */
router.get('/notas', MEDICO, validate(pacienteIdQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { paciente_id } = req.query as never as z.infer<typeof pacienteIdQuerySchema>;
    const { data } = await getSupabase()
      .from('notas_privadas')
      .select(NOTA_COLS)
      .eq('paciente_id', paciente_id)
      .eq('medico_id', req.user!.id)
      .order('updated_at', { ascending: false })
      .range(0, 99);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/** POST /api/expediente/notas — crea la nota privada del autor. */
router.post('/notas', MEDICO, async (req, res, next) => {
  try {
    const body = notaPrivadaSchema.parse(req.body);
    const row = {
      id: randomUUID(),
      paciente_id: body.paciente_id,
      medico_id: req.user!.id,
      contenido: body.contenido,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const { data } = await getSupabase().from('notas_privadas').insert(row).select(NOTA_COLS).single();
    res.status(201).json(data ?? row);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/expediente/notas/:id — solo el autor. */
router.delete('/notas/:id', MEDICO, validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { data: existente } = await getSupabase()
      .from('notas_privadas')
      .select('id')
      .eq('id', id)
      .eq('medico_id', req.user!.id)
      .maybeSingle();
    if (!existente) return next(notFound('Nota no encontrada'));
    await getSupabase().from('notas_privadas').delete().eq('id', id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Casos compartidos (foro interno anonimizado) ─────────────────────────────
/** GET /api/expediente/casos — feed interno de casos. */
router.get('/casos', MEDICO, async (_req, res, next) => {
  try {
    const { data: casos } = await getSupabase()
      .from('casos_compartidos')
      .select(CASO_COLS)
      .order('created_at', { ascending: false })
      .range(0, 99);
    const rows = (casos ?? []) as Record<string, unknown>[];

    const medicoIds = [...new Set(rows.map((c) => String(c.medico_id)).filter(Boolean))];
    const espIds = [...new Set(rows.map((c) => String(c.especialidad_id)).filter(Boolean))];
    const [medicos, especialidades] = await Promise.all([
      medicoIds.length
        ? getSupabase().from('profiles').select('id, nombre_completo')
        : Promise.resolve({ data: [] }),
      espIds.length
        ? getSupabase().from('especialidades_medicas').select('id, nombre')
        : Promise.resolve({ data: [] }),
    ]);
    const nombreMedico = new Map((medicos.data ?? []).map((m) => [String(m.id), m.nombre_completo]));
    const nombreEsp = new Map((especialidades.data ?? []).map((e) => [String(e.id), e.nombre]));

    res.json(
      rows.map((c) => ({
        ...c,
        medico_nombre: nombreMedico.get(String(c.medico_id)) ?? null,
        especialidad_nombre: nombreEsp.get(String(c.especialidad_id)) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/expediente/casos — publica caso anonimizado (nunca guarda el paciente). */
router.post('/casos', MEDICO, async (req, res, next) => {
  try {
    const body = casoSchema.parse(req.body);
    const row = {
      id: randomUUID(),
      medico_id: req.user!.id,
      especialidad_id: body.especialidad_id ?? null,
      titulo: body.titulo,
      resumen: body.resumen,
      created_at: new Date().toISOString(),
    };
    const { data } = await getSupabase().from('casos_compartidos').insert(row).select(CASO_COLS).single();
    res.status(201).json(data ?? row);
  } catch (err) {
    next(err);
  }
});

// ── Órdenes de laboratorio (CPOE) ────────────────────────────────────────────
/**
 * GET /api/expediente/ordenes?paciente_id=
 * Órdenes del médico para el paciente, leídas desde la tubería real de
 * laboratorio (`solicitudes` + `solicitudes_detalle` + `examenes_laboratorio`),
 * para no duplicar estado. La creación la hace el módulo de solicitudes
 * (POST /api/solicitudes).
 */
router.get('/ordenes', CPOE, validate(pacienteIdQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { paciente_id } = req.query as never as z.infer<typeof pacienteIdQuerySchema>;
    const user = req.user!;

    const { data: sols } = await getSupabase()
      .from('solicitudes')
      .select('id, paciente_id, medico_id, nota, estado, created_at')
      .eq('paciente_id', paciente_id)
      .eq('medico_id', user.id)
      .order('created_at', { ascending: false });

    const solicitudes = (sols ?? []) as Record<string, unknown>[];
    const ids = solicitudes.map((s) => s.id as string);
    if (ids.length === 0) return res.json([]);

    const [{ data: lineas }, { data: examenes }] = await Promise.all([
      getSupabase().from('solicitudes_detalle').select('solicitud_id, examen_id, precio').in('solicitud_id', ids),
      getSupabase().from('examenes_laboratorio').select('id, nombre, categoria, precio'),
    ]);

    const catalogo = new Map((examenes ?? []).map((e) => [String(e.id), e]));
    const itemsPorSolicitud = new Map<string, { id: string; nombre: string; tema: string; precio: number | null }[]>();
    for (const l of lineas ?? []) {
      const ex = catalogo.get(String(l.examen_id));
      const arr = itemsPorSolicitud.get(String(l.solicitud_id)) ?? [];
      arr.push({
        id: String(l.examen_id),
        nombre: ex ? String(ex.nombre) : String(l.examen_id),
        tema: ex ? String(ex.categoria ?? 'Otros') : 'Otros',
        precio: ex ? (ex.precio ?? null) as number | null : (l.precio ?? null) as number | null,
      });
      itemsPorSolicitud.set(String(l.solicitud_id), arr);
    }

    res.json(
      solicitudes.map((s) => ({
        id: s.id,
        paciente_id: s.paciente_id,
        medico_id: s.medico_id,
        examenes: itemsPorSolicitud.get(String(s.id)) ?? [],
        nota: s.nota ?? '',
        estado: s.estado,
        created_at: s.created_at,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ── Menores vinculados a un tutor ────────────────────────────────────────────
/** GET /api/expediente/menores?tutor_id= — expedientes de menores del tutor. */
router.get('/menores', MEDICO, validate(tutorIdQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { tutor_id } = req.query as never as z.infer<typeof tutorIdQuerySchema>;
    const { data } = await getSupabase()
      .from('pacientes')
      .select('id, cedula, nombre_completo, fecha_nacimiento, sexo, es_menor, representante_id, parentesco_representante, deleted_at')
      .eq('representante_id', tutor_id)
      .eq('deleted_at', null)
      .order('created_at', { ascending: false });
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

export default router;

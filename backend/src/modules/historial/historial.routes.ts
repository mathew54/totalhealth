import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import cuestionarioRoutes from './cuestionarios/cuestionario.routes.js';
import {
  alertaCriticaSchema,
  alertaUpdateSchema,
  correccionSchema,
  idParamSchema,
  interconsultasQuery,
  interconsultaSchema,
  interconsultaUpdateSchema,
  notaSchema,
  notaUpdateSchema,
  pacienteIdParamSchema,
  registroSchema,
} from './historial.validators.js';

const router = Router();
router.use(authRequired);

// CRUD del cuestionario de anamnesis: vive dentro del módulo de historial.
router.use(cuestionarioRoutes);

const MEDICO_ROLES = ['medico', 'admin', 'super_root'] as const;

function firmaHash(medicoId: string, marca: string, contenido: unknown): string {
  return createHash('sha256').update(`${medicoId}:${marca}:${JSON.stringify(contenido ?? {})}`).digest('hex').slice(0, 32);
}

/** Resuelve nombres de perfiles/catálogos manualmente (mock sin joins). */
async function resolverNombres(tabla: string, ids: string[], idCol: string, nameCol: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await getSupabase().from(tabla).select(`${idCol}, ${nameCol}` as never);
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const key = r[idCol];
    if (key != null) map.set(String(key), String(r[nameCol] ?? ''));
  }
  return map;
}

async function categoriaDeMedico(medicoId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('categoria_medica')
    .eq('id', medicoId)
    .maybeSingle();
  return (data?.categoria_medica as string | null) ?? null;
}

/**
 * GET /api/historial/especialidades
 * Catálogo de las 7 categorías y sus especialidades (formularios + interconsultas).
 */
router.get('/especialidades', async (_req, res, next) => {
  try {
    const [categorias, especialidades] = await Promise.all([
      getSupabase().from('categorias_medicas').select('*').order('orden', { ascending: true }),
      getSupabase().from('especialidades_medicas').select('*').order('nombre', { ascending: true }),
    ]);
    res.json({ categorias: categorias.data ?? [], especialidades: especialidades.data ?? [] });
  } catch (err) {
    next(err);
  }
});

/**
 * Resultados de laboratorio del paciente (solicitudes no anuladas + líneas con
 * su resultado). Visible para todo el staff autenticado: médico, secretaria,
 * laboratorio y admin (el portal lo consume por su propia ruta).
 */
async function resultadosLaboratorioDe(pacienteId: string) {
  const { data: sols } = await getSupabase()
    .from('solicitudes')
    .select('id, fecha, estado, cobrado')
    .eq('paciente_id', pacienteId)
    .order('fecha', { ascending: false });
  const solicitudes = (sols ?? []).filter((s) => s.estado !== 'anulada');
  const solicitudIds = solicitudes.map((s) => s.id as string);
  if (solicitudIds.length === 0) return [];

  const [{ data: lineas }, { data: examenes }] = await Promise.all([
    getSupabase().from('solicitudes_detalle').select('id, solicitud_id, examen_id, resultado_id, precio').in('solicitud_id', solicitudIds),
    getSupabase().from('examenes_laboratorio').select('id, nombre'),
  ]);

  const detalleIds = (lineas ?? []).map((l) => l.id as string);
  let resultados: Record<string, unknown>[] = [];
  if (detalleIds.length) {
    const { data } = await getSupabase().from('resultados').select('*').in('solicitud_detalle_id', detalleIds);
    resultados = data ?? [];
  }

  const nombres = new Map((examenes ?? []).map((e) => [e.id, e.nombre]));
  const resultadoPorDetalle = new Map(resultados.map((r) => [r.solicitud_detalle_id, r]));
  const lineasPorSolicitud = new Map<string, { id: string; examen_id: string; examen: string; precio: number; resultado: Record<string, unknown> | null }[]>();

  for (const l of lineas ?? []) {
    const arr = lineasPorSolicitud.get(String(l.solicitud_id)) ?? [];
    arr.push({
      id: String(l.id),
      examen_id: String(l.examen_id),
      examen: nombres.get(String(l.examen_id)) ?? String(l.examen_id),
      precio: Number(l.precio),
      resultado: resultadoPorDetalle.get(String(l.id)) ?? null,
    });
    lineasPorSolicitud.set(String(l.solicitud_id), arr);
  }

  return solicitudes.map((s) => ({
    id: s.id,
    fecha: s.fecha,
    estado: s.estado,
    cobrado: s.cobrado,
    lineas: lineasPorSolicitud.get(String(s.id)) ?? [],
  }));
}

/**
 * GET /api/historial/pacientes/:id
 * Expediente digital: registros compartidos + correcciones, alertas críticas
 * (banner) e interconsultas del paciente. Lectura global para el personal
 * médico; laboratorio/secretaria solo ven el banner de alertas críticas.
 */
router.get('/pacientes/:id', validate(pacienteIdParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const user = req.user!;
    const esMedico = MEDICO_ROLES.includes(user.role as (typeof MEDICO_ROLES)[number]);

    const { data: paciente, error: pErr } = await getSupabase()
      .from('pacientes')
      .select('id, cedula, nombre_completo, fecha_nacimiento, sexo')
      .eq('id', id)
      .maybeSingle();
    if (pErr) return next(pErr);
    if (!paciente) return next(notFound('Paciente no encontrado'));

    const [alertas, historial, interconsultas] = await Promise.all([
      getSupabase()
        .from('alertas_criticas')
        .select('*')
        .eq('paciente_id', id)
        .eq('activa', true)
        .order('severidad', { ascending: false })
        .order('created_at', { ascending: false }),
      esMedico
        ? getSupabase().from('historial_clinico').select('*').eq('paciente_id', id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      esMedico
        ? getSupabase().from('interconsultas').select('*').eq('paciente_id', id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    // Resultados de laboratorio: visibles para todo el staff (incluida secretaria).
    const resultados = await resultadosLaboratorioDe(id);

    const registros = historial.data ?? [];
    const correcciones = await Promise.all(
      registros.map(async (r) => {
        const { data } = await getSupabase().from('historial_correcciones').select('*').eq('historial_id', r.id).order('created_at', { ascending: true });
        return data ?? [];
      }),
    );

    const perfilesIds = new Set<string>();
    for (const r of registros) if (r.medico_id) perfilesIds.add(String(r.medico_id));
    for (const c of correcciones.flat()) if (c.medico_id) perfilesIds.add(String(c.medico_id));
    for (const i of interconsultas.data ?? []) {
      if (i.medico_origen_id) perfilesIds.add(String(i.medico_origen_id));
      if (i.medico_destino_id) perfilesIds.add(String(i.medico_destino_id));
      if (i.medico_responde_id) perfilesIds.add(String(i.medico_responde_id));
    }
    const categoriasIds = new Set<string>();
    for (const r of registros) if (r.categoria_origen) categoriasIds.add(String(r.categoria_origen));
    for (const i of interconsultas.data ?? []) if (i.categoria_destino) categoriasIds.add(String(i.categoria_destino));
    const especialidadesIds = new Set<string>();
    for (const i of interconsultas.data ?? []) if (i.especialidad_destino) especialidadesIds.add(String(i.especialidad_destino));

    const [perfiles, categorias, especialidades] = await Promise.all([
      resolverNombres('profiles', [...perfilesIds], 'id', 'nombre_completo'),
      resolverNombres('categorias_medicas', [...categoriasIds], 'id', 'nombre'),
      resolverNombres('especialidades_medicas', [...especialidadesIds], 'id', 'nombre'),
    ]);

    res.json({
      paciente,
      alertas_criticas: alertas.data ?? [],
      resultados_laboratorio: resultados,
      historial: registros.map((r, idx) => ({
        ...r,
        medico_nombre: perfiles.get(String(r.medico_id)) ?? null,
        categoria_origen_nombre: r.categoria_origen ? (categorias.get(String(r.categoria_origen)) ?? null) : null,
        correcciones: (correcciones[idx] ?? []).map((c) => ({
          ...c,
          medico_nombre: perfiles.get(String(c.medico_id)) ?? null,
          firma: c.firma_hash,
        })),
        firma: r.firma_hash,
      })),
      interconsultas: (interconsultas.data ?? []).map((i) => ({
        ...i,
        medico_origen_nombre: perfiles.get(String(i.medico_origen_id)) ?? null,
        medico_destino_nombre: i.medico_destino_id ? (perfiles.get(String(i.medico_destino_id)) ?? null) : null,
        medico_responde_nombre: i.medico_responde_id ? (perfiles.get(String(i.medico_responde_id)) ?? null) : null,
        categoria_destino_nombre: i.categoria_destino ? (categorias.get(String(i.categoria_destino)) ?? null) : null,
        especialidad_destino_nombre: i.especialidad_destino ? (especialidades.get(String(i.especialidad_destino)) ?? null) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial
 * Crea un registro del historial compartido. Solo personal médico activo, y
 * (para el rol médico) únicamente si es el autor de la consulta asociada.
 * La categoría de origen se deriva del perfil (no se acepta del cliente).
 * Inmutable: no hay endpoints de UPDATE/DELETE.
 */
router.post('/', requireRole('medico', 'admin', 'super_root'), validate(registroSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof registroSchema>;
    const user = req.user!;

    const { data: paciente, error: pErr } = await getSupabase()
      .from('pacientes')
      .select('id')
      .eq('id', body.paciente_id)
      .maybeSingle();
    if (pErr) return next(pErr);
    if (!paciente) return next(notFound('Paciente no encontrado'));

    if (body.consulta_id) {
      const { data: consulta, error: cErr } = await getSupabase()
        .from('consultas')
        .select('id, paciente_id, medico_id')
        .eq('id', body.consulta_id)
        .maybeSingle();
      if (cErr) return next(cErr);
      if (!consulta) return next(notFound('Consulta no encontrada'));
      if (consulta.paciente_id !== body.paciente_id) {
        return next(badRequest('La consulta no pertenece a este paciente'));
      }
      if (user.role === 'medico' && consulta.medico_id !== user.id) {
        return next(forbidden('Solo el médico asignado a la consulta puede registrar'));
      }
    }

    const categoria_origen = await categoriaDeMedico(user.id);
    const creadoEn = new Date().toISOString();
    const firma = firmaHash(user.id, creadoEn, body.contenido);

    const { data, error } = await getSupabase()
      .from('historial_clinico')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: body.consulta_id ?? null,
        medico_id: user.id,
        tipo: body.tipo,
        categoria_origen,
        titulo: body.titulo,
        contenido: body.contenido,
        firma_hash: firma,
        created_at: creadoEn,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, medico_nombre: user.nombre, categoria_origen_nombre: null, firma });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/historial/interconsultas?estado=&paciente_id=
 * Bandeja: el médico ve las interconsultas dirigidas a su categoría/especialidad,
 * las asignadas a él y las que originó; admin/super_root ven todas.
 * (Debe declararse antes de GET /:id para no ser capturada como UUID.)
 */
router.get('/interconsultas', validate(interconsultasQuery, 'query'), async (req, res, next) => {
  try {
    const { estado, paciente_id } = req.query as unknown as z.infer<typeof interconsultasQuery>;
    const user = req.user!;

    let rows = (await getSupabase().from('interconsultas').select('*')).data ?? [];

    if (user.role === 'medico') {
      const categoria = await categoriaDeMedico(user.id);
      rows = rows.filter(
        (i) =>
          (categoria !== null && i.categoria_destino === categoria) ||
          i.medico_destino_id === user.id ||
          i.medico_origen_id === user.id,
      );
    }
    if (estado) rows = rows.filter((i) => i.estado === estado);
    if (paciente_id) rows = rows.filter((i) => i.paciente_id === paciente_id);
    rows = rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

    const perfiles = await resolverNombres(
      'profiles',
      rows.flatMap((i) => [i.medico_origen_id, i.medico_destino_id, i.medico_responde_id]).filter(Boolean),
      'id',
      'nombre_completo',
    );
    const categorias = await resolverNombres('categorias_medicas', rows.map((i) => i.categoria_destino), 'id', 'nombre');
    const especialidades = await resolverNombres('especialidades_medicas', rows.map((i) => i.especialidad_destino).filter(Boolean), 'id', 'nombre');

    res.json(
      rows.map((i) => ({
        ...i,
        medico_origen_nombre: perfiles.get(String(i.medico_origen_id)) ?? null,
        medico_destino_nombre: i.medico_destino_id ? (perfiles.get(String(i.medico_destino_id)) ?? null) : null,
        medico_responde_nombre: i.medico_responde_id ? (perfiles.get(String(i.medico_responde_id)) ?? null) : null,
        categoria_destino_nombre: categorias.get(String(i.categoria_destino)) ?? null,
        especialidad_destino_nombre: i.especialidad_destino ? (especialidades.get(String(i.especialidad_destino)) ?? null) : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/historial/:id
 * Detalle de un registro + sus correcciones (Fe de Erratas / Adenda).
 */
router.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;
    if (!MEDICO_ROLES.includes(user.role as (typeof MEDICO_ROLES)[number])) return next(forbidden('Acceso denegado'));

    const { data: registro, error } = await getSupabase().from('historial_clinico').select('*').eq('id', id).maybeSingle();
    if (error) return next(error);
    if (!registro) return next(notFound('Registro no encontrado'));

    const { data: correcciones } = await getSupabase()
      .from('historial_correcciones')
      .select('*')
      .eq('historial_id', id)
      .order('created_at', { ascending: true });

    const perfiles = await resolverNombres(
      'profiles',
      [registro.medico_id, ...(correcciones ?? []).map((c) => c.medico_id)],
      'id',
      'nombre_completo',
    );

    res.json({
      ...registro,
      medico_nombre: perfiles.get(String(registro.medico_id)) ?? null,
      firma: registro.firma_hash,
      correcciones: (correcciones ?? []).map((c) => ({
        ...c,
        medico_nombre: perfiles.get(String(c.medico_id)) ?? null,
        firma: c.firma_hash,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/:id/correcciones
 * Fe de Erratas o Adenda vinculada al registro original (marca de agua).
 * Solo el autor original, admin o super_root. No modifica el registro.
 */
router.post('/:id/correcciones', requireRole('medico', 'admin', 'super_root'), validate(idParamSchema, 'params'), validate(correccionSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof correccionSchema>;
    const user = req.user!;

    const { data: registro, error: rErr } = await getSupabase()
      .from('historial_clinico')
      .select('id, medico_id')
      .eq('id', id)
      .maybeSingle();
    if (rErr) return next(rErr);
    if (!registro) return next(notFound('Registro no encontrado'));

    if (user.role === 'medico' && registro.medico_id !== user.id) {
      return next(forbidden('Solo el autor del registro (o un administrador) puede corregir'));
    }

    const creadoEn = new Date().toISOString();
    const firma = firmaHash(user.id, creadoEn, body.contenido);

    const { data, error } = await getSupabase()
      .from('historial_correcciones')
      .insert({
        historial_id: id,
        tipo: body.tipo,
        contenido: body.contenido,
        medico_id: user.id,
        firma_hash: firma,
        created_at: creadoEn,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, medico_nombre: user.nombre, firma });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/historial/pacientes/:id/notas
 * Notas privadas del expediente: solo las del médico autor (módulo B).
 */
router.get('/pacientes/:id/notas', validate(pacienteIdParamSchema, 'params'), requireRole('medico', 'admin', 'super_root'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const user = req.user!;

    const { data, error } = await getSupabase()
      .from('notas_privadas')
      .select('*')
      .eq('paciente_id', id)
      .eq('medico_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return next(badRequest(error.message));

    res.json((data ?? []).map((n) => ({ ...n, medico_nombre: user.nombre })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/pacientes/:id/notas
 * Crea una nota privada de consulta (visible solo para el autor).
 */
router.post('/pacientes/:id/notas', validate(pacienteIdParamSchema, 'params'), requireRole('medico', 'admin', 'super_root'), validate(notaSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const body = req.body as z.infer<typeof notaSchema>;
    const user = req.user!;

    const { data: paciente, error: pErr } = await getSupabase().from('pacientes').select('id').eq('id', id).maybeSingle();
    if (pErr) return next(pErr);
    if (!paciente) return next(notFound('Paciente no encontrado'));

    const { data, error } = await getSupabase()
      .from('notas_privadas')
      .insert({ paciente_id: id, consulta_id: body.consulta_id ?? null, medico_id: user.id, contenido: body.contenido })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, medico_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/historial/notas/:id
 * Actualiza una nota privada (solo el autor o super_root).
 */
router.patch('/notas/:id', validate(idParamSchema, 'params'), requireRole('medico', 'admin', 'super_root'), validate(notaUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof notaUpdateSchema>;
    const user = req.user!;

    const { data: nota, error: nErr } = await getSupabase()
      .from('notas_privadas')
      .select('id, medico_id')
      .eq('id', id)
      .maybeSingle();
    if (nErr) return next(nErr);
    if (!nota) return next(notFound('Nota no encontrada'));
    if (nota.medico_id !== user.id && user.role !== 'super_root') {
      return next(forbidden('Solo el autor de la nota puede editarla'));
    }

    const { data, error } = await getSupabase()
      .from('notas_privadas')
      .update({ contenido: body.contenido, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.json({ ...data, medico_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/pacientes/:id/alertas
 * Alta de una alerta crítica para el banner global (módulo A).
 */
router.post('/pacientes/:id/alertas', validate(pacienteIdParamSchema, 'params'), requireRole('medico', 'admin', 'super_root'), validate(alertaCriticaSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const body = req.body as z.infer<typeof alertaCriticaSchema>;
    const user = req.user!;

    const { data, error } = await getSupabase()
      .from('alertas_criticas')
      .insert({ clinica_id: user.clinicaId, paciente_id: id, ...body, creado_por: user.id })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, creado_por_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/historial/alertas/:id
 * Desactiva/activa una alerta crítica (admin/super_root). Sin borrado físico.
 */
router.patch('/alertas/:id', validate(idParamSchema, 'params'), requireRole('admin', 'super_root'), validate(alertaUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof alertaUpdateSchema>;

    const { data, error } = await getSupabase()
      .from('alertas_criticas')
      .update({ activa: body.activa })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    if (!data) return next(notFound('Alerta no encontrada'));

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/interconsultas
 * Deriva al paciente a otra categoría de especialidad (módulo C).
 */
router.post('/interconsultas', requireRole('medico', 'admin', 'super_root'), validate(interconsultaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof interconsultaSchema>;
    const user = req.user!;

    const { data: categoria, error: catErr } = await getSupabase()
      .from('categorias_medicas')
      .select('id')
      .eq('id', body.categoria_destino)
      .maybeSingle();
    if (catErr) return next(catErr);
    if (!categoria) return next(badRequest('Categoría destino no existe'));

    if (body.especialidad_destino) {
      const { data: esp } = await getSupabase()
        .from('especialidades_medicas')
        .select('id')
        .eq('id', body.especialidad_destino)
        .eq('categoria', body.categoria_destino)
        .maybeSingle();
      if (!esp) return next(badRequest('La especialidad no pertenece a la categoría seleccionada'));
    }

    const { data: paciente, error: pErr } = await getSupabase().from('pacientes').select('id').eq('id', body.paciente_id).maybeSingle();
    if (pErr) return next(pErr);
    if (!paciente) return next(notFound('Paciente no encontrado'));

    const { data, error } = await getSupabase()
      .from('interconsultas')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_origen_id: body.consulta_origen_id ?? null,
        medico_origen_id: user.id,
        categoria_destino: body.categoria_destino,
        especialidad_destino: body.especialidad_destino ?? null,
        medico_destino_id: body.medico_destino_id ?? null,
        motivo: body.motivo,
        hipotesis: body.hipotesis ?? null,
        estado: 'enviada',
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, medico_origen_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/historial/interconsultas/:id
 * Responde la interconsulta: aceptar → completar, o cancelar. El médico de la
 * categoría/especialidad destino (o admin/super_root) puede responder.
 */
router.patch('/interconsultas/:id', validate(idParamSchema, 'params'), validate(interconsultaUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof interconsultaUpdateSchema>;
    const user = req.user!;

    const { data: ic, error: iErr } = await getSupabase()
      .from('interconsultas')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (iErr) return next(iErr);
    if (!ic) return next(notFound('Interconsulta no encontrada'));

    if (!MEDICO_ROLES.includes(user.role as (typeof MEDICO_ROLES)[number])) {
      return next(forbidden('Solo personal médico puede responder interconsultas'));
    }

    if (user.role === 'medico') {
      const categoria = await categoriaDeMedico(user.id);
      const esDestino = (categoria !== null && ic.categoria_destino === categoria) || ic.medico_destino_id === user.id;
      const esOrigen = ic.medico_origen_id === user.id;
      if (!esDestino && !esOrigen) {
        return next(forbidden('Solo el médico de la especialidad destino puede responder'));
      }
    }

    const patch: Record<string, unknown> = { estado: body.estado };
    if (body.estado !== 'cancelada') {
      if (body.respuesta) patch.respuesta = body.respuesta;
      if (user.role === 'medico') patch.medico_responde_id = user.id;
    }

    const { data, error } = await getSupabase()
      .from('interconsultas')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

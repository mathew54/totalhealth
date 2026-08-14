import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { resolverNombres } from '../../services/resolverNombres.js';
import {
  TIPOS,
  accesoSchema,
  actualizarEstudioSchema,
  actualizarImagenSchema,
  agregarImagenesSchema,
  compartirSchema,
  crearEstudioSchema,
  crearImagenSchema,
  estudiosQuery,
  idParamSchema,
  imagenesQuery,
} from './imagenes.validators.js';

const router = Router();

/**
 * GET /api/imagenes/compartir/:token
 * Vista PÚBLICA (sin autenticación) de un estudio compartido. Solo funciona si
 * el token existe y no ha expirado. Devuelve el estudio + sus imágenes.
 */
router.get('/compartir/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { data: estudios } = await getSupabase().from('estudios_imagen').select('*').eq('token', token);
    const estudio = (estudios ?? [])[0];
    if (!estudio) return next(notFound('Enlace de compartición no encontrado'));
    if (estudio.token_expira && new Date(String(estudio.token_expira)).getTime() < Date.now()) {
      return next(badRequest('Este enlace de compartición ha expirado'));
    }

    const { data: imagenes } = await getSupabase()
      .from('imagenes_clinicas')
      .select('*')
      .eq('estudio_id', estudio.id)
      .order('orden', { ascending: true });

    const [pacientes, medicos] = await Promise.all([
      resolverNombres('pacientes', [String(estudio.paciente_id)], 'id', 'nombre_completo'),
      resolverNombres('profiles', [String(estudio.creado_por ?? '')].filter(Boolean), 'id', 'nombre_completo'),
    ]);

    res.json({
      estudio: {
        id: estudio.id,
        tipo: estudio.tipo,
        region: estudio.region ?? null,
        titulo: estudio.titulo ?? null,
        hallazgos: estudio.hallazgos ?? null,
        impresion: estudio.impresion ?? null,
        fecha_estudio: estudio.fecha_estudio,
        paciente_nombre: pacientes.get(String(estudio.paciente_id)) ?? null,
        creado_por_nombre: estudio.creado_por ? medicos.get(String(estudio.creado_por)) ?? null : null,
      },
      imagenes: imagenes ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// A partir de aquí todo requiere autenticación (staff).
router.use(authRequired, requireRole('medico', 'secretaria', 'laboratorio', 'admin', 'super_root'));

/** ¿Puede el usuario gestionar (editar/eliminar/compartir) este estudio? */
function puedeGestionar(estudio: Record<string, unknown>, user: { id: string; role: string }): boolean {
  if (user.role === 'admin' || user.role === 'super_root') return true;
  if (String(estudio.creado_por ?? '') === user.id) return true;
  // El médico asignado gestiona el informe (hallazgos/impresión/estado).
  return user.role === 'medico' && String(estudio.medico_id ?? '') === user.id;
}

/**
 * GET /api/imagenes/estudios
 * Lista de estudios, filtrable por paciente, consulta, tipo, estado y rango de fechas.
 * Cada estudio incluye nº de imágenes y la URL de la primera (portada).
 */
router.get('/estudios', validate(estudiosQuery, 'query'), async (req, res, next) => {
  try {
    const { paciente_id, consulta_id, tipo, estado, desde, hasta, limit } = req.query as unknown as z.infer<typeof estudiosQuery>;

    let q = getSupabase().from('estudios_imagen').select('*').order('fecha_estudio', { ascending: false });
    if (paciente_id) q = q.eq('paciente_id', paciente_id);
    if (consulta_id) q = q.eq('consulta_id', consulta_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (estado) q = q.eq('estado', estado);
    if (desde) q = q.gte('fecha_estudio', `${desde}T00:00:00.000Z`);
    if (hasta) q = q.lte('fecha_estudio', `${hasta}T23:59:59.999Z`);
    q = q.range(0, limit - 1);

    const { data: filas, error } = await q;
    if (error) return next(badRequest(error.message));
    const rows = (filas ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return res.json([]);

    const estudioIds = rows.map((r) => String(r.id));
    const { data: imagenes } = await getSupabase()
      .from('imagenes_clinicas')
      .select('estudio_id, url, orden')
      .in('estudio_id', estudioIds)
      .order('orden', { ascending: true });

    const imagenesPorEstudio = new Map<string, { count: number; portada: string | null }>();
    for (const img of imagenes ?? []) {
      const sid = String(img.estudio_id);
      const acc = imagenesPorEstudio.get(sid) ?? { count: 0, portada: null };
      acc.count += 1;
      if (!acc.portada) acc.portada = String(img.url);
      imagenesPorEstudio.set(sid, acc);
    }

    const pacientes = await resolverNombres('pacientes', rows.map((r) => String(r.paciente_id)), 'id', 'nombre_completo');
    const medicos = await resolverNombres(
      'profiles',
      rows.map((r) => (r.creado_por ? String(r.creado_por) : '')).filter(Boolean),
      'id',
      'nombre_completo',
    );

    res.json(
      rows.map((r) => {
        const meta = imagenesPorEstudio.get(String(r.id)) ?? { count: 0, portada: null };
        return {
          ...r,
          imagenes_count: meta.count,
          portada: meta.portada,
          paciente_nombre: pacientes.get(String(r.paciente_id)) ?? null,
          creado_por_nombre: r.creado_por ? medicos.get(String(r.creado_por)) ?? null : null,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes/estudios
 * Crea un estudio con su metadata clínica y opcionalmente las imágenes de la serie.
 */
router.post('/estudios', validate(crearEstudioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearEstudioSchema>;
    const user = req.user!;

    const { data: paciente } = await getSupabase().from('pacientes').select('id').eq('id', body.paciente_id).maybeSingle();
    if (!paciente) return next(notFound('Paciente no encontrado'));

    if (body.consulta_id) {
      const { data: consulta } = await getSupabase().from('consultas').select('id').eq('id', body.consulta_id).maybeSingle();
      if (!consulta) return next(notFound('Consulta no encontrada'));
    }

    const { data: estudio, error } = await getSupabase()
      .from('estudios_imagen')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: body.consulta_id ?? null,
        tipo: body.tipo,
        region: body.region ?? null,
        titulo: body.titulo ?? null,
        hallazgos: body.hallazgos ?? null,
        impresion: body.impresion ?? null,
        estado: body.estado,
        medico_id: body.medico_id ?? null,
        creado_por: user.id,
        fecha_estudio: body.fecha_estudio ?? new Date().toISOString(),
        retencion_hasta: body.retencion_hasta ?? null,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    const imagenes = await insertarImagenes(estudio.id, {
      paciente_id: body.paciente_id,
      consulta_id: body.consulta_id ?? null,
      tipo: body.tipo,
      clinica_id: user.clinicaId,
      creado_por: user.id,
      imagenes: body.imagenes ?? [],
    });

    res.status(201).json({ ...estudio, imagenes });
  } catch (err) {
    next(err);
  }
});

async function insertarImagenes(
  estudioId: string,
  ctx: {
    paciente_id: string;
    consulta_id: string | null;
    tipo: string;
    clinica_id: string | null;
    creado_por: string;
    imagenes: { data_url: string; descripcion?: string | null }[];
  },
) {
  if (ctx.imagenes.length === 0) return [];
  const { data: max } = await getSupabase()
    .from('imagenes_clinicas')
    .select('orden')
    .eq('estudio_id', estudioId)
    .order('orden', { ascending: false })
    .range(0, 0);
  let orden = (max?.[0]?.orden as number ?? 0) + 1;
  const { data, error } = await getSupabase()
    .from('imagenes_clinicas')
    .insert(
      ctx.imagenes.map((img) => ({
        clinica_id: ctx.clinica_id,
        paciente_id: ctx.paciente_id,
        consulta_id: ctx.consulta_id,
        estudio_id: estudioId,
        url: img.data_url,
        tipo: ctx.tipo,
        descripcion: img.descripcion ?? null,
        orden: orden++,
        creado_por: ctx.creado_por,
      })),
    )
    .select('*');
  if (error) throw error;
  return data ?? [];
}

/**
 * GET /api/imagenes/estudios/:id
 * Detalle del estudio con sus imágenes en orden de serie. Registra el acceso
 * de auditoría (acción "ver").
 */
router.get('/estudios/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: estudio, error } = await getSupabase().from('estudios_imagen').select('*').eq('id', id).maybeSingle();
    if (error) return next(badRequest(error.message));
    if (!estudio) return next(notFound('Estudio no encontrado'));

    const { data: imagenes } = await getSupabase()
      .from('imagenes_clinicas')
      .select('*')
      .eq('estudio_id', id)
      .order('orden', { ascending: true });

    const [pacientes, medicos] = await Promise.all([
      resolverNombres('pacientes', [String(estudio.paciente_id)], 'id', 'nombre_completo'),
      resolverNombres('profiles', [String(estudio.creado_por ?? ''), String(estudio.medico_id ?? '')].filter(Boolean), 'id', 'nombre_completo'),
    ]);

    // Auditoría: registro de visualización.
    await getSupabase().from('imagenes_accesos').insert({
      clinica_id: user.clinicaId,
      estudio_id: id,
      usuario_id: user.id,
      accion: 'ver',
    });

    res.json({
      ...estudio,
      imagenes: imagenes ?? [],
      paciente_nombre: pacientes.get(String(estudio.paciente_id)) ?? null,
      creado_por_nombre: estudio.creado_por ? medicos.get(String(estudio.creado_por)) ?? null : null,
      medico_nombre: estudio.medico_id ? medicos.get(String(estudio.medico_id)) ?? null : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/imagenes/estudios/:id
 * Actualiza metadata del estudio (título, hallazgos, impresión, estado, región,
 * tipo, médico, retención…). Solo creador/admin/super_root o el médico asignado.
 */
router.patch('/estudios/:id', validate(idParamSchema, 'params'), validate(actualizarEstudioSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof actualizarEstudioSchema>;
    const user = req.user!;

    const { data: estudio, error: getErr } = await getSupabase().from('estudios_imagen').select('*').eq('id', id).maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!estudio) return next(notFound('Estudio no encontrado'));
    if (!puedeGestionar(estudio, user)) return next(forbidden('No puedes editar este estudio'));

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.consulta_id !== undefined) updates.consulta_id = body.consulta_id;
    if (body.tipo !== undefined) updates.tipo = body.tipo;
    if (body.region !== undefined) updates.region = body.region;
    if (body.titulo !== undefined) updates.titulo = body.titulo;
    if (body.hallazgos !== undefined) updates.hallazgos = body.hallazgos;
    if (body.impresion !== undefined) updates.impresion = body.impresion;
    if (body.estado !== undefined) updates.estado = body.estado;
    if (body.medico_id !== undefined) updates.medico_id = body.medico_id;
    if (body.fecha_estudio !== undefined) updates.fecha_estudio = body.fecha_estudio;
    if (body.retencion_hasta !== undefined) updates.retencion_hasta = body.retencion_hasta;

    const { data: updated, error } = await getSupabase().from('estudios_imagen').update(updates).eq('id', id).select('*').single();
    if (error) return next(badRequest(error.message));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/imagenes/estudios/:id
 * Elimina el estudio (las imágenes se borran en cascada por FK). Solo
 * creador/admin/super_root.
 */
router.delete('/estudios/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: estudio, error: getErr } = await getSupabase().from('estudios_imagen').select('id, creado_por').eq('id', id).maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!estudio) return next(notFound('Estudio no encontrado'));
    if (!puedeGestionar(estudio, user)) return next(forbidden('No puedes eliminar este estudio'));

    const { error } = await getSupabase().from('estudios_imagen').delete().eq('id', id);
    if (error) return next(badRequest(error.message));
    // El mock no aplica borrado en cascada por FK; se eliminan las imágenes de
    // la serie explícitamente (idempotente en producción con ON DELETE CASCADE).
    await getSupabase().from('imagenes_clinicas').delete().eq('estudio_id', id);
    await getSupabase().from('imagenes_accesos').delete().eq('estudio_id', id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes/estudios/:id/imagenes
 * Agrega una o más imágenes a un estudio existente (serie).
 */
router.post('/estudios/:id/imagenes', validate(idParamSchema, 'params'), validate(agregarImagenesSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof agregarImagenesSchema>;
    const user = req.user!;

    const { data: estudio, error: getErr } = await getSupabase().from('estudios_imagen').select('id, creado_por, medico_id, paciente_id, consulta_id, tipo').eq('id', id).maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!estudio) return next(notFound('Estudio no encontrado'));
    if (!puedeGestionar(estudio, user)) return next(forbidden('No puedes modificar este estudio'));

    const imagenes = await insertarImagenes(id, {
      paciente_id: String(estudio.paciente_id),
      consulta_id: (estudio.consulta_id as string | null) ?? null,
      tipo: String(estudio.tipo),
      clinica_id: user.clinicaId,
      creado_por: user.id,
      imagenes: body.imagenes,
    });
    res.status(201).json(imagenes);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes/estudios/:id/compartir
 * Genera un enlace de compartición seguro (token + expiración). Solo
 * creador/admin/super_root.
 */
router.post('/estudios/:id/compartir', validate(idParamSchema, 'params'), validate(compartirSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { dias } = req.body as z.infer<typeof compartirSchema>;
    const user = req.user!;

    const { data: estudio, error: getErr } = await getSupabase().from('estudios_imagen').select('id, creado_por').eq('id', id).maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!estudio) return next(notFound('Estudio no encontrado'));
    if (!puedeGestionar(estudio, user)) return next(forbidden('No puedes compartir este estudio'));

    const token = crypto.randomBytes(24).toString('hex');
    const expira = new Date(Date.now() + dias * 24 * 3600_000).toISOString();

    const { data: updated, error } = await getSupabase()
      .from('estudios_imagen')
      .update({ token, token_expira: expira, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, token, token_expira')
      .single();
    if (error) return next(badRequest(error.message));

    await getSupabase().from('imagenes_accesos').insert({
      clinica_id: user.clinicaId,
      estudio_id: id,
      usuario_id: user.id,
      accion: 'compartir',
    });

    res.json({ token: updated.token, expira: updated.token_expira });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes/estudios/:id/acceso
 * Registra un acceso de auditoría (exportar, etc.).
 */
router.post('/estudios/:id/acceso', validate(idParamSchema, 'params'), validate(accesoSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { accion } = req.body as z.infer<typeof accesoSchema>;
    const user = req.user!;

    const { data: estudio } = await getSupabase().from('estudios_imagen').select('id').eq('id', id).maybeSingle();
    if (!estudio) return next(notFound('Estudio no encontrado'));

    const { error } = await getSupabase().from('imagenes_accesos').insert({
      clinica_id: user.clinicaId,
      estudio_id: id,
      usuario_id: user.id,
      accion,
    });
    if (error) return next(badRequest(error.message));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/imagenes
 * Lista plana de imágenes (compatibilidad con el widget del dashboard).
 */
router.get('/', validate(imagenesQuery, 'query'), async (req, res, next) => {
  try {
    const { paciente_id, consulta_id, estudio_id, tipo, limit } = req.query as unknown as z.infer<typeof imagenesQuery>;
    let q = getSupabase().from('imagenes_clinicas').select('*').order('created_at', { ascending: false });
    if (paciente_id) q = q.eq('paciente_id', paciente_id);
    if (consulta_id) q = q.eq('consulta_id', consulta_id);
    if (estudio_id) q = q.eq('estudio_id', estudio_id);
    if (tipo) q = q.eq('tipo', tipo);
    q = q.range(0, limit - 1);

    const { data: filas, error } = await q;
    if (error) return next(badRequest(error.message));
    const rows = (filas ?? []) as Array<Record<string, unknown>>;

    const [pacientes, medicos] = await Promise.all([
      resolverNombres('pacientes', rows.map((r) => String(r.paciente_id)), 'id', 'nombre_completo'),
      resolverNombres('profiles', rows.map((r) => (r.creado_por ? String(r.creado_por) : '')).filter(Boolean), 'id', 'nombre_completo'),
    ]);

    res.json(
      rows.map((r) => ({
        ...r,
        paciente_nombre: pacientes.get(String(r.paciente_id)) ?? null,
        creado_por_nombre: r.creado_por ? medicos.get(String(r.creado_por)) ?? null : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes
 * Adjunta una imagen a un estudio (crea uno automático si no se indica) y
 * agrega un acceso de auditoría. Mantiene compatibilidad con el flujo original.
 */
router.post('/', validate(crearImagenSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearImagenSchema>;
    const user = req.user!;

    const { data: paciente } = await getSupabase().from('pacientes').select('id').eq('id', body.paciente_id).maybeSingle();
    if (!paciente) return next(notFound('Paciente no encontrado'));

    let estudioId = body.estudio_id ?? null;
    if (!estudioId) {
      const { data: estudio, error: eErr } = await getSupabase()
        .from('estudios_imagen')
        .insert({
          clinica_id: user.clinicaId,
          paciente_id: body.paciente_id,
          consulta_id: body.consulta_id ?? null,
          tipo: body.tipo,
          region: body.region ?? null,
          creado_por: user.id,
        })
        .select('id')
        .single();
      if (eErr) return next(badRequest(eErr.message));
      estudioId = estudio.id;
    } else {
      const { data: estudio } = await getSupabase().from('estudios_imagen').select('id').eq('id', estudioId).maybeSingle();
      if (!estudio) return next(notFound('Estudio no encontrado'));
    }

    const { data: max } = await getSupabase()
      .from('imagenes_clinicas')
      .select('orden')
      .eq('estudio_id', estudioId)
      .order('orden', { ascending: false })
      .range(0, 0);

    const { data, error } = await getSupabase()
      .from('imagenes_clinicas')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: body.consulta_id ?? null,
        estudio_id: estudioId,
        url: body.data_url,
        tipo: body.tipo,
        region: body.region ?? null,
        descripcion: body.descripcion ?? null,
        orden: (max?.[0]?.orden as number ?? 0) + 1,
        creado_por: user.id,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    await getSupabase().from('imagenes_accesos').insert({
      clinica_id: user.clinicaId,
      estudio_id: estudioId,
      usuario_id: user.id,
      accion: 'ver',
    });

    res.status(201).json({ ...data, estudio_id: estudioId });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/imagenes/:id
 * Edita metadata de una imagen (descripción, región, orden, estudio, tipo).
 */
router.patch('/:id', validate(idParamSchema, 'params'), validate(actualizarImagenSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof actualizarImagenSchema>;
    const user = req.user!;

    const { data: imagen, error: getErr } = await getSupabase()
      .from('imagenes_clinicas')
      .select('id, creado_por, estudio_id')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!imagen) return next(notFound('Imagen no encontrada'));

    if (user.role !== 'admin' && user.role !== 'super_root' && String(imagen.creado_por ?? '') !== user.id) {
      return next(forbidden('No puedes editar esta imagen'));
    }

    const updates: Record<string, unknown> = {};
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion;
    if (body.region !== undefined) updates.region = body.region;
    if (body.orden !== undefined) updates.orden = body.orden;
    if (body.estudio_id !== undefined) updates.estudio_id = body.estudio_id;
    if (body.tipo !== undefined) updates.tipo = body.tipo;

    const { data: updated, error } = await getSupabase().from('imagenes_clinicas').update(updates).eq('id', id).select('*').single();
    if (error) return next(badRequest(error.message));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/imagenes/:id
 * Elimina una imagen individual (creador/admin/super_root).
 */
router.delete('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: imagen, error: getErr } = await getSupabase()
      .from('imagenes_clinicas')
      .select('id, creado_por')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return next(badRequest(getErr.message));
    if (!imagen) return next(notFound('Imagen no encontrada'));

    if (user.role !== 'admin' && user.role !== 'super_root' && String(imagen.creado_por ?? '') !== user.id) {
      return next(forbidden('No puedes eliminar esta imagen'));
    }

    const { error } = await getSupabase().from('imagenes_clinicas').delete().eq('id', id);
    if (error) return next(badRequest(error.message));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
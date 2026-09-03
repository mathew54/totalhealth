import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../../config/supabase.js';
import { requireRole } from '../../../middleware/rbac.js';
import { validate } from '../../../middleware/validate.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../../utils/httpError.js';
import { registrarAuditoria, ipDeRequest } from '../../../services/auditoria.js';
import { MEDICO_ROLES, ROLES_ADMIN_SUPER } from '../../../roles.js';
import { firmaHash } from '../../../services/firma.js';
import { resolverNombres } from '../../../services/resolverNombres.js';
import { MODULOS_CUESTIONARIO, OBSERVACIONES_MODULO, normalizarRespuestas, respuestasVacias, OBSERVACIONES_KEY } from './definicion.js';
import { pacienteIdParamSchema } from '../historial.validators.js';
import {
  actualizarRespuestasSchema,
  adendaSchema,
  consolidarSchema,
  crearCuestionarioPacienteSchema,
  cuestionarioPacienteQuerySchema,
  eliminarCuestionarioSchema,
  idParamSchema,
} from './cuestionario.validators.js';

// Sub-router montado por historial.routes.ts bajo /api/historial (la
// autenticación ya la aplica el router padre).

const router = Router();

const ESCRITURA = requireRole(...MEDICO_ROLES);

const CUESTIONARIO_COLS = 'id, clinica_id, paciente_id, consulta_id, origen, creado_por_paciente, creado_por_medico, titulo, estado, respuestas, consolidado_at, deleted_at, created_at, updated_at';

/** Verifica que el paciente pertenezca a la clínica del staff (si aplica). */
async function pacienteEnClinica(pacienteId: string, clinicaId: string | null): Promise<boolean> {
  if (clinicaId === null) return true;
  const { data } = await getSupabase().from('pacientes').select('id').eq('id', pacienteId).eq('clinica_id', clinicaId).maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/historial/cuestionarios/definicion
 * Definición declarativa del checklist (módulos + ítems + cierre). El frontend
 * (staff y portal) la consume para renderizar el wizard dinámicamente.
 */
router.get('/cuestionarios/definicion', (_req, res) => {
  res.json({ modulos: MODULOS_CUESTIONARIO, cierre: OBSERVACIONES_MODULO });
});

/**
 * GET /api/historial/pacientes/:id/cuestionarios?estado=
 * Listado de cuestionarios de un paciente. Lectura abierta a todo el cuerpo
 * médico (medico/admin/super_root): cualquier médico verificado puede leer el
 * historial de cualquier paciente, sin importar quién lo haya creado.
 */
router.get('/pacientes/:id/cuestionarios', validate(pacienteIdParamSchema, 'params'), validate(cuestionarioPacienteQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { id: pacienteId } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const { estado } = req.query as unknown as z.infer<typeof cuestionarioPacienteQuerySchema>;
    const user = req.user!;

    let rows = (await getSupabase().from('cuestionarios_historial').select(CUESTIONARIO_COLS)).data ?? [];
    rows = rows.filter((c) => !c.deleted_at);

    if (user.clinicaId) rows = rows.filter((c) => c.clinica_id === user.clinicaId);
    rows = rows.filter((c) => c.paciente_id === pacienteId);
    if (estado) rows = rows.filter((c) => c.estado === estado);

    rows = rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

    const pacienteIds = [...new Set(rows.map((c) => c.paciente_id as string))];
    const perfilesIds = [...new Set(rows.map((c) => c.creado_por_medico).filter(Boolean) as string[])];
    const [pacientes, medicos] = await Promise.all([
      resolverNombres('pacientes', pacienteIds, 'id', 'nombre_completo'),
      resolverNombres('profiles', perfilesIds, 'id', 'nombre_completo'),
    ]);

    res.json(rows.map((c) => ({
      ...c,
      paciente_nombre: pacientes.get(String(c.paciente_id)) ?? null,
      creado_por_medico_nombre: c.creado_por_medico ? (medicos.get(String(c.creado_por_medico)) ?? null) : null,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/pacientes/:id/cuestionarios
 * CREATE: el personal médico inicia y guarda un nuevo cuestionario para el
 * paciente del path (estado inicial: borrador).
 */
router.post('/pacientes/:id/cuestionarios', ESCRITURA, validate(pacienteIdParamSchema, 'params'), validate(crearCuestionarioPacienteSchema), async (req, res, next) => {
  try {
    const { id: pacienteId } = req.params as z.infer<typeof pacienteIdParamSchema>;
    const body = req.body as z.infer<typeof crearCuestionarioPacienteSchema>;
    const user = req.user!;

    if (!(await pacienteEnClinica(pacienteId, user.clinicaId))) {
      return next(forbidden('El paciente no pertenece a tu clínica'));
    }

    const { data: paciente } = await getSupabase().from('pacientes').select('id').eq('id', pacienteId).maybeSingle();
    if (!paciente) return next(notFound('Paciente no encontrado'));

    if (body.consulta_id) {
      const { data: consulta } = await getSupabase().from('consultas').select('id, paciente_id').eq('id', body.consulta_id).maybeSingle();
      if (!consulta) return next(notFound('Consulta no encontrada'));
      if (consulta.paciente_id !== pacienteId) return next(badRequest('La consulta no pertenece a este paciente'));
    }

    const respuestas = normalizarRespuestas(body.respuestas as Record<string, unknown>);

    const { data, error } = await getSupabase()
      .from('cuestionarios_historial')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: pacienteId,
        consulta_id: body.consulta_id ?? null,
        origen: 'medico',
        creado_por_medico: user.id,
        titulo: 'Cuestionario de historial médico',
        estado: 'borrador',
        respuestas,
      })
      .select(CUESTIONARIO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ ...data, paciente_nombre: null, creado_por_medico_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/historial/cuestionarios/:id
 * Detalle de un cuestionario con sus adendas (lectura del cuerpo médico).
 */
router.get('/cuestionarios/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: cuestionario, error } = await getSupabase()
      .from('cuestionarios_historial')
      .select(CUESTIONARIO_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error) return next(error);
    if (!cuestionario || cuestionario.deleted_at) return next(notFound('Cuestionario no encontrado'));

    if (user.clinicaId && cuestionario.clinica_id !== user.clinicaId) {
      return next(forbidden('El cuestionario no pertenece a tu clínica'));
    }

    const { data: adendas } = await getSupabase()
      .from('cuestionario_adendas')
      .select('*')
      .eq('cuestionario_id', id)
      .order('created_at', { ascending: true });

    const perfilesIds = [...new Set([
      cuestionario.creado_por_medico,
      ...(adendas ?? []).map((a) => a.medico_id),
    ].filter(Boolean) as string[])];
    const { data: perfiles } = await getSupabase().from('profiles').select('id, nombre_completo').in('id', perfilesIds);
    const porId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));

    const { data: paciente } = await getSupabase().from('pacientes').select('id, cedula, nombre_completo').eq('id', cuestionario.paciente_id).maybeSingle();

    res.json({
      ...cuestionario,
      paciente,
      creado_por_medico_nombre: cuestionario.creado_por_medico ? (porId.get(String(cuestionario.creado_por_medico)) ?? null) : null,
      adendas: (adendas ?? []).map((a) => ({
        ...a,
        medico_nombre: porId.get(String(a.medico_id)) ?? null,
        firma: a.firma_hash,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/historial/cuestionarios/:id/respuestas
 * UPDATE: el personal médico modifica las respuestas MIENTRAS el cuestionario
 * esté en borrador (antes de que la consulta finalice). Una vez consolidado,
 * se rechaza con 409: la edición debe hacerse vía adenda con marca de agua.
 */
router.patch('/cuestionarios/:id/respuestas', ESCRITURA, validate(idParamSchema, 'params'), validate(actualizarRespuestasSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof actualizarRespuestasSchema>;
    const user = req.user!;

    const { data: actual, error: gErr } = await getSupabase()
      .from('cuestionarios_historial')
      .select('id, estado, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!actual || actual.deleted_at) return next(notFound('Cuestionario no encontrado'));
    if (actual.estado === 'consolidado') {
      return next(conflict('El historial ya está consolidado. Las ediciones posteriores se registran como adenda con marca de agua.'));
    }
    if (actual.estado === 'eliminado') return next(notFound('Cuestionario no encontrado'));

    const { data, error } = await getSupabase()
      .from('cuestionarios_historial')
      .update({ respuestas: normalizarRespuestas(body.respuestas as Record<string, unknown>) })
      .eq('id', id)
      .select(CUESTIONARIO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.json({ ...data, creado_por_medico_nombre: user.nombre });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/cuestionarios/:id/consolidar
 * La consulta finalizó: el historial se consolida y las respuestas quedan
 * inmutables. Exige que el campo de observaciones no esté vacío.
 */
router.post('/cuestionarios/:id/consolidar', ESCRITURA, validate(idParamSchema, 'params'), validate(consolidarSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: actual, error: gErr } = await getSupabase()
      .from('cuestionarios_historial')
      .select('id, paciente_id, estado, respuestas, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!actual || actual.deleted_at) return next(notFound('Cuestionario no encontrado'));
    if (actual.estado === 'consolidado') return next(conflict('El cuestionario ya está consolidado'));

    const respuestas = normalizarRespuestas(actual.respuestas as Record<string, unknown>);
    const observaciones = String(respuestas[OBSERVACIONES_KEY] ?? '').trim();
    if (!observaciones) {
      return next(badRequest('El campo "Otros / Observaciones Adicionales" es obligatorio para consolidar el historial'));
    }

    const { data, error } = await getSupabase()
      .from('cuestionarios_historial')
      .update({ estado: 'consolidado', consolidado_at: new Date().toISOString() })
      .eq('id', id)
      .select(CUESTIONARIO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    await registrarAuditoria(
      {
        accion: 'CUESTIONARIO_CONSOLIDAR',
        tabla: 'cuestionarios_historial',
        registroId: id,
        detalles: { paciente_id: actual.paciente_id, medico_id: user.id },
        ip: ipDeRequest(req),
      },
      user.id,
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/historial/cuestionarios/:id/adendas
 * Edición posterior a la consolidación: se registra como ADENDA inmutable con
 * marca de agua (fecha, hora, ID del médico y firma digital). El registro
 * original no se modifica.
 */
router.post('/cuestionarios/:id/adendas', ESCRITURA, validate(idParamSchema, 'params'), validate(adendaSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof adendaSchema>;
    const user = req.user!;

    const { data: actual, error: gErr } = await getSupabase()
      .from('cuestionarios_historial')
      .select('id, estado, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!actual || actual.deleted_at) return next(notFound('Cuestionario no encontrado'));
    if (actual.estado !== 'consolidado') {
      return next(conflict('Solo se registran adendas sobre historiales consolidados. Mientras esté en borrador, edita las respuestas directamente.'));
    }

    const respuestas = normalizarRespuestas(body.respuestas as Record<string, unknown>);
    const firma = firmaHash(user.id, new Date().toISOString(), respuestas);

    const { data, error } = await getSupabase()
      .from('cuestionario_adendas')
      .insert({
        cuestionario_id: id,
        medico_id: user.id,
        respuestas,
        firma_hash: firma,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    await registrarAuditoria(
      {
        accion: 'CUESTIONARIO_ADENDA',
        tabla: 'cuestionario_adendas',
        registroId: data.id,
        detalles: { cuestionario_id: id, medico_id: user.id, observacion: body.observacion ?? null },
        ip: ipDeRequest(req),
      },
      user.id,
    );

    res.status(201).json({ ...data, medico_nombre: user.nombre, firma });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/historial/cuestionarios/:id
 * DELETE restringido a Administradores (admin/super_root). Exige re-autenticación
 * administrativa explícita (contraseña) + justificación. Es soft-delete: marca
 * deleted_at/estado y deja un snapshot en `cuestionario_borrados` y un log en
 * `audit_logs`. Prohibido para el resto de roles.
 */
router.delete('/cuestionarios/:id', requireRole(...ROLES_ADMIN_SUPER), validate(idParamSchema, 'params'), validate(eliminarCuestionarioSchema), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof eliminarCuestionarioSchema>;
    const user = req.user!;

    const { data: actual, error: gErr } = await getSupabase()
      .from('cuestionarios_historial')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!actual || actual.deleted_at) return next(notFound('Cuestionario no encontrado'));

    // Re-autenticación administrativa explícita: se valida la contraseña contra
    // el email del perfil. En mock valida contra los AUTH_USERS; en producción
    // contra Supabase Auth. Sin verificación no se ejecuta el borrado.
    const { data: authUser } = await getSupabase().auth.admin.getUserById(user.id);
    const email = authUser?.user?.email ?? null;
    if (!email) return next(unauthorized('No se pudo verificar las credenciales administrativas'));

    const { data: verificado, error: authError } = await getSupabase().auth.signInWithPassword({
      email: email as string,
      password: body.password,
    });
    if (authError || !verificado?.session) {
      return next(unauthorized('Credenciales administrativas inválidas'));
    }

    const snapshot = actual;
    const ahora = new Date().toISOString();

    const { error: upErr } = await getSupabase()
      .from('cuestionarios_historial')
      .update({
        estado: 'eliminado',
        deleted_at: ahora,
        deleted_por: user.id,
        deleted_justificacion: body.justificacion,
      })
      .eq('id', id);
    if (upErr) return next(badRequest(upErr.message));

    await getSupabase().from('cuestionario_borrados').insert({
      cuestionario_id: id,
      eliminado_por: user.id,
      justificacion: body.justificacion,
      snapshot,
    });

    await registrarAuditoria(
      {
        accion: 'CUESTIONARIO_DELETE',
        tabla: 'cuestionarios_historial',
        registroId: id,
        detalles: { paciente_id: actual.paciente_id, justificacion: body.justificacion, soft_delete: true },
        ip: ipDeRequest(req),
      },
      user.id,
    );

    res.json({ ok: true, id, mensaje: 'Cuestionario eliminado (borrado lógico) y registrado en auditoría' });
  } catch (err) {
    next(err);
  }
});

export default router;

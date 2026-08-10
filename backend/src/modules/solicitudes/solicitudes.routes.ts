import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound, forbidden, conflict } from '../../utils/httpError.js';
import { notificarResultadoListo } from '../../services/notifier.js';
import { evaluarAlertas, registrarAlertas } from '../alertas/alertas.service.js';
import {
  createSolicitudSchema,
  idParamSchema,
  resultadosSchema,
  solicitudesQuery,
  updateEstadoSchema,
  updateSolicitudSchema,
} from './solicitudes.validators.js';

const router = Router();
router.use(authRequired);

const SOLICITUD_COLS =
  'id, consulta_id, paciente_id, medico_id, clinica_id, fecha, estado, cobrado, nota, created_at';

/** Mapa id → examen del catálogo (para precios y nombres). */
async function catalogoExamenes(): Promise<Map<string, { nombre: string; precio: number }>> {
  const { data } = await getSupabase().from('examenes_laboratorio').select('id, nombre, precio');
  const map = new Map<string, { nombre: string; precio: number }>();
  for (const row of data ?? []) map.set(row.id as string, { nombre: row.nombre as string, precio: Number(row.precio) });
  return map;
}

/** Lee las líneas de una solicitud enriqueciendo con examen y resultado. */
async function detalleLineas(solicitudId: string) {
  const catalogo = await catalogoExamenes();

  const { data: lineas } = await getSupabase()
    .from('solicitudes_detalle')
    .select('id, solicitud_id, examen_id, resultado_id, precio')
    .eq('solicitud_id', solicitudId);

  const { data: resultados } = await getSupabase().from('resultados').select('*');

  return (lineas ?? []).map((l) => {
    const resultado = (resultados ?? []).find((r) => r.id === l.resultado_id);
    const examen = catalogo.get(l.examen_id as string);
    return {
      ...l,
      examen: examen?.nombre ?? l.examen_id,
      resultado: resultado ?? null,
    };
  });
}

/**
 * POST /api/solicitudes
 * Ordena exámenes (desde una consulta o directo). Crea solicitud + líneas.
 * Médico, laboratorio, secretaria y admin pueden generar órdenes.
 */
router.post(
  '/',
  requireRole('medico', 'laboratorio', 'secretaria', 'admin', 'super_root'),
  validate(createSolicitudSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createSolicitudSchema>;
      const user = req.user!;
      const catalogo = await catalogoExamenes();

      for (const examenId of body.examenes) {
        if (!catalogo.has(examenId)) return next(badRequest('Uno de los exámenes no existe'));
      }

      const { data: paciente, error: pErr } = await getSupabase()
        .from('pacientes')
        .select('id')
        .eq('id', body.paciente_id)
        .maybeSingle();
      if (pErr) return next(pErr);
      if (!paciente) return next(notFound('Paciente no encontrado'));

      const medico_id = user.role === 'medico' ? user.id : null;

      const { data: solicitud, error: sErr } = await getSupabase()
        .from('solicitudes')
        .insert({
          consulta_id: body.consulta_id ?? null,
          paciente_id: body.paciente_id,
          medico_id,
          clinica_id: user.clinicaId,
          fecha: body.fecha ?? new Date().toISOString(),
          estado: 'pendiente',
          cobrado: false,
          nota: body.nota,
        })
        .select(SOLICITUD_COLS)
        .single();
      if (sErr) return next(badRequest(sErr.message));

      const lineas = body.examenes.map((examen_id) => ({
        solicitud_id: solicitud.id,
        examen_id,
        precio: catalogo.get(examen_id)!.precio,
      }));
      const { data: insertadas, error: lErr } = await getSupabase()
        .from('solicitudes_detalle')
        .insert(lineas)
        .select('id, examen_id, precio');
      if (lErr) return next(badRequest(lErr.message));

      const total = (insertadas ?? []).reduce((acc, l) => acc + Number(l.precio), 0);
      res.status(201).json({ ...solicitud, total, lineas: insertadas });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/solicitudes?estado=&cobrado=&fecha=
 * Cola del laboratorio (todas) o del médico (solo las propias).
 */
router.get('/', validate(solicitudesQuery, 'query'), async (req, res, next) => {
  try {
    const { estado, cobrado, fecha, incluir_anuladas, limit } = req.query as unknown as z.infer<typeof solicitudesQuery>;
    const user = req.user!;

    let query = getSupabase().from('solicitudes').select(SOLICITUD_COLS);
    if (user.role === 'medico') query = query.eq('medico_id', user.id);

    if (estado) {
      query = query.eq('estado', estado);
    } else if (incluir_anuladas !== 'true') {
      // Por defecto se ocultan las solicitudes anuladas (escondidas).
      query = query.in('estado', ['pendiente', 'en_proceso', 'listo', 'entregado']);
    }
    if (cobrado) query = query.eq('cobrado', cobrado === 'true');
    if (fecha) query = query.gte('fecha', `${fecha}T00:00:00.000Z`).lte('fecha', `${fecha}T23:59:59.999Z`);

    query = query.order('fecha', { ascending: false });

    const { data, error } = await query;
    if (error) return next(error);

    const rows = (data ?? []).slice(0, limit);

    // Totales por solicitud (suma de precios de líneas).
    const { data: detalle } = await getSupabase().from('solicitudes_detalle').select('solicitud_id, precio');
    const totales = new Map<string, number>();
    for (const d of detalle ?? []) {
      const sid = d.solicitud_id as string;
      totales.set(sid, (totales.get(sid) ?? 0) + Number(d.precio));
    }

    // Nombre del paciente para la caja y la cola.
    const { data: pacientes } = await getSupabase().from('pacientes').select('id, cedula, nombre_completo');
    const porId = new Map((pacientes ?? []).map((p) => [p.id, p]));

    res.json(rows.map((s) => ({
      ...s,
      total: totales.get(s.id as string) ?? 0,
      paciente: porId.get(s.paciente_id as string) ?? null,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/solicitudes/:id
 * Detalle con líneas (examen + resultado) y datos del paciente.
 */
router.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: solicitud, error } = await getSupabase().from('solicitudes').select(SOLICITUD_COLS).eq('id', id).single();
    if (error || !solicitud) return next(notFound('Solicitud no encontrada'));
    if (user.role === 'medico' && solicitud.medico_id !== user.id) return next(forbidden('No puedes ver esta solicitud'));

    const [lineas, paciente] = await Promise.all([
      detalleLineas(id),
      getSupabase().from('pacientes').select('id, cedula, nombre_completo').eq('id', solicitud.paciente_id).single(),
    ]);

    const total = (lineas as { precio: number }[]).reduce((acc, l) => acc + Number(l.precio), 0);
    res.json({ ...solicitud, total, lineas, paciente: paciente.data ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/solicitudes/:id
 * Edita una solicitud pendiente: cambia la nota y/o la lista de exámenes
 * (reemplaza las líneas sin resultado). No afecta solicitudes en proceso,
 * listas, entregadas o anuladas.
 */
router.patch(
  '/:id',
  requireRole('medico', 'laboratorio', 'secretaria', 'admin', 'super_root'),
  validate(idParamSchema, 'params'),
  validate(updateSolicitudSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof updateSolicitudSchema>;
      const user = req.user!;

      const { data: solicitud, error: gErr } = await getSupabase()
        .from('solicitudes')
        .select(SOLICITUD_COLS)
        .eq('id', id)
        .single();
      if (gErr || !solicitud) return next(notFound('Solicitud no encontrada'));
      if (user.role === 'medico' && solicitud.medico_id !== user.id) {
        return next(forbidden('Solo puedes editar tus propias solicitudes'));
      }
      if (solicitud.estado !== 'pendiente') {
        return next(conflict('Solo se pueden editar solicitudes pendientes'));
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.nota !== undefined) patch.nota = body.nota;

      if (body.examenes) {
        const catalogo = await catalogoExamenes();
        for (const examenId of body.examenes) {
          if (!catalogo.has(examenId)) return next(badRequest('Uno de los exámenes no existe'));
        }

        // Reemplaza las líneas actuales por la nueva selección.
        const { error: delErr } = await getSupabase().from('solicitudes_detalle').delete().eq('solicitud_id', id);
        if (delErr) return next(badRequest(delErr.message));

        const lineas = body.examenes.map((examen_id) => ({
          solicitud_id: id,
          examen_id,
          precio: catalogo.get(examen_id)!.precio,
        }));
        const { data: insertadas, error: lErr } = await getSupabase()
          .from('solicitudes_detalle')
          .insert(lineas)
          .select('id, examen_id, precio');
        if (lErr) return next(badRequest(lErr.message));
        (patch as { lineas?: unknown[] }).lineas = insertadas;
      }

      const { data: updated, error } = await getSupabase()
        .from('solicitudes')
        .update(patch)
        .eq('id', id)
        .select(SOLICITUD_COLS)
        .single();
      if (error) return next(badRequest(error.message));

      const lineas = await detalleLineas(id);
      const total = (lineas as { precio: number }[]).reduce((acc, l) => acc + Number(l.precio), 0);
      res.json({ ...updated, total, lineas });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/solicitudes/:id/anular
 * Anulación suave ("esconder"): marca la solicitud como anulada. Desaparece de
 * la cola del laboratorio y de los listados del paciente/portal, pero queda
 * registrada en el historial interno. Se puede volver a activar.
 */
router.post(
  '/:id/anular',
  requireRole('medico', 'laboratorio', 'secretaria', 'admin', 'super_root'),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { activa } = (req.body ?? {}) as { activa?: boolean };
      const user = req.user!;

      const { data: solicitud, error: gErr } = await getSupabase()
        .from('solicitudes')
        .select(SOLICITUD_COLS)
        .eq('id', id)
        .single();
      if (gErr || !solicitud) return next(notFound('Solicitud no encontrada'));
      if (user.role === 'medico' && solicitud.medico_id !== user.id) {
        return next(forbidden('Solo puedes anular tus propias solicitudes'));
      }

      // "esconder" = anulada; activa=false vuelve a mostrarla como pendiente.
      const nuevoEstado = activa === false ? 'pendiente' : 'anulada';
      const { data: updated, error } = await getSupabase()
        .from('solicitudes')
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SOLICITUD_COLS)
        .single();
      if (error) return next(badRequest(error.message));

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/solicitudes/pacientes/:id/resultados
 * Historial de resultados de un paciente (lectura global del cuerpo médico)
 * para tendencias: agrupa valores, examen y fecha por resultado firmado.
 */
router.get('/pacientes/:id/resultados', validate(idParamSchema, 'params'), authRequired, async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;

    const { data: sols } = await getSupabase()
      .from('solicitudes')
      .select('id, fecha, estado')
      .eq('paciente_id', id)
      .order('fecha', { ascending: true });
    // Los resultados de solicitudes anuladas no se exponen en tendencias.
    const solicitudIds = (sols ?? [])
      .filter((s) => s.estado !== 'anulada')
      .map((s) => s.id);
    if (solicitudIds.length === 0) return res.json([]);

    const { data: lineas } = await getSupabase()
      .from('solicitudes_detalle')
      .select('id, solicitud_id, examen_id, resultado_id')
      .in('solicitud_id', solicitudIds);
    const detalleIds = (lineas ?? []).map((l) => l.id);
    if (detalleIds.length === 0) return res.json([]);

    const { data: resultados } = await getSupabase()
      .from('resultados')
      .select('*')
      .in('solicitud_detalle_id', detalleIds);

    const catalogo = await catalogoExamenes();
    const solicitudPorId = new Map((sols ?? []).map((s) => [s.id, s.fecha]));
    const examenPorDetalle = new Map((lineas ?? []).map((l) => [l.id, { examen_id: l.examen_id, solicitud_id: l.solicitud_id }]));

    res.json(
      (resultados ?? []).map((r) => {
        const det = examenPorDetalle.get(String(r.solicitud_detalle_id));
        const examen = det ? catalogo.get(String(det.examen_id)) : undefined;
        return {
          resultado_id: r.id,
          examen_id: det?.examen_id ?? null,
          examen: examen?.nombre ?? null,
          fecha: det ? (solicitudPorId.get(String(det.solicitud_id)) ?? r.procesado_at) : r.procesado_at,
          valores: r.valores ?? null,
          observaciones: r.observaciones ?? null,
          bioanalista_id: r.bioanalista_id ?? null,
          firma_hash: r.firma_hash ?? null,
          procesado_at: r.procesado_at,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/solicitudes/:id/estado
 * El laboratorio actualiza el estatus (pendiente → en_proceso → listo).
 */
router.patch(
  '/:id/estado',
  requireRole('laboratorio', 'admin', 'super_root'),
  validate(updateEstadoSchema),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { estado } = req.body as z.infer<typeof updateEstadoSchema>;

      const { data: solicitud, error: gErr } = await getSupabase()
        .from('solicitudes')
        .select('id, estado, cobrado')
        .eq('id', id)
        .single();
      if (gErr || !solicitud) return next(notFound('Solicitud no encontrada'));

      if (solicitud.cobrado && solicitud.estado === 'pendiente' && estado !== 'en_proceso') {
        // sin bloqueo: el laboratorio puede marcarla en proceso aunque no se valide cobro aquí
      }

      const { data: updated, error } = await getSupabase()
        .from('solicitudes')
        .update({ estado })
        .eq('id', id)
        .select(SOLICITUD_COLS)
        .single();
      if (error) return next(badRequest(error.message));

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/** Verifica que la validación pre-analítica esté completa cuando es obligatoria. */
async function preanaliticaOk(solicitudId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: configRow } = await getSupabase().from('app_config').select('preanalitica').eq('id', true).maybeSingle();
  const conf = (configRow?.preanalitica as { habilitado?: boolean; obligatorio?: boolean } | undefined) ?? {};
  const habilitado = conf.habilitado !== false;
  const obligatorio = conf.obligatorio === true;

  if (!habilitado || !obligatorio) return { ok: true };

  const { data: checkpoints } = await getSupabase()
    .from('checkpoints_preanalitica')
    .select('id')
    .eq('activo', true);
  if (!(checkpoints ?? []).length) return { ok: false, motivo: 'No hay checkpoints pre-analíticos activos' };

  const { data: hechos } = await getSupabase()
    .from('solicitudes_preanalitica')
    .select('checkpoint_id')
    .eq('solicitud_id', solicitudId);
  const ids = new Set((hechos ?? []).map((h) => h.checkpoint_id));
  const completo = (checkpoints ?? []).every((c) => ids.has(c.id));

  return completo
    ? { ok: true }
    : { ok: false, motivo: 'La validación pre-analítica de la orden está pendiente' };
}

/**
 * POST /api/solicitudes/:id/resultados
 * El laboratorio sube resultados por línea. Si todas las líneas tienen
 * resultado, la solicitud pasa automáticamente a "listo".
 */
router.post(
  '/:id/resultados',
  requireRole('laboratorio', 'admin', 'super_root'),
  validate(resultadosSchema),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { lineas } = req.body as z.infer<typeof resultadosSchema>;
      const user = req.user!;

      const validacion = await preanaliticaOk(id);
      if (!validacion.ok) return next(badRequest(validacion.motivo ?? 'Validación pre-analítica pendiente'));

      const { data: solicitud, error: sErr } = await getSupabase()
        .from('solicitudes')
        .select('id, paciente_id, clinica_id')
        .eq('id', id)
        .single();
      if (sErr || !solicitud) return next(notFound('Solicitud no encontrada'));

      const { data: lineasDB } = await getSupabase()
        .from('solicitudes_detalle')
        .select('id, examen_id')
        .eq('solicitud_id', id);

      const idsValidos = new Set((lineasDB ?? []).map((l) => l.id));
      for (const linea of lineas) {
        if (!idsValidos.has(linea.solicitud_detalle_id)) {
          return next(badRequest('Una línea no pertenece a esta solicitud'));
        }
      }

      const inserts = lineas.map((l) => {
        const payload = JSON.stringify({
          bioanalista_id: user.id,
          solicitud_detalle_id: l.solicitud_detalle_id,
          valores: l.valores ?? null,
          observaciones: l.observaciones ?? null,
        });
        return {
          solicitud_detalle_id: l.solicitud_detalle_id,
          bioanalista_id: user.id,
          valores: l.valores ?? null,
          observaciones: l.observaciones ?? null,
          firma_hash: createHash('sha256').update(payload).digest('hex'),
          procesado_at: new Date().toISOString(),
        };
      });

      const { data: insertados, error: iErr } = await getSupabase()
        .from('resultados')
        .insert(inserts)
        .select('id, solicitud_detalle_id');
      if (iErr) return next(badRequest(iErr.message));

      const alertasGeneradas: Array<Record<string, unknown>> = [];
      for (const ins of insertados ?? []) {
        await getSupabase()
          .from('solicitudes_detalle')
          .update({ resultado_id: ins.id })
          .eq('id', ins.solicitud_detalle_id);

        // Evalúa y registra alertas clínicas por parámetros fuera de rango.
        const detalle = (lineasDB ?? []).find((l) => l.id === ins.solicitud_detalle_id);
        const valores = lineas.find((l) => l.solicitud_detalle_id === ins.solicitud_detalle_id)?.valores;
        if (detalle?.examen_id && valores) {
          const alertas = await evaluarAlertas(detalle.examen_id, valores);
          await registrarAlertas({
            clinicaId: solicitud.clinica_id ?? null,
            pacienteId: solicitud.paciente_id,
            examenId: detalle.examen_id,
            solicitudDetalleId: ins.solicitud_detalle_id,
            resultadoId: ins.id,
            alertas,
          });
          alertasGeneradas.push(
            ...alertas.map((a) => ({
              ...a,
              solicitud_detalle_id: ins.solicitud_detalle_id,
              examen_id: detalle.examen_id,
            })),
          );
        }
      }

      const { data: lineasActualizadas } = await getSupabase()
        .from('solicitudes_detalle')
        .select('resultado_id')
        .eq('solicitud_id', id);
      const todasListas = (lineasActualizadas ?? []).every((l) => l.resultado_id);

      if (todasListas) {
        await getSupabase().from('solicitudes').update({ estado: 'listo' }).eq('id', id);

        // Notifica al paciente que su resultado está disponible.
        const { data: paciente } = await getSupabase()
          .from('pacientes')
          .select('id, nombre_completo')
          .eq('id', solicitud.paciente_id)
          .maybeSingle();
        if (paciente) {
          await notificarResultadoListo({
            pacienteId: paciente.id,
            nombre: paciente.nombre_completo,
            examen: 'Tus análisis de laboratorio',
          }).catch(() => {});
        }
      }

      res.status(201).json({ resultados: insertados, solicitud_estado: todasListas ? 'listo' : 'en_proceso', alertas_generadas: alertasGeneradas });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { MEDICO_ROLES, ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { registrarAuditoria } from '../../services/auditoria.js';

const router = Router();
router.use(authRequired);

const alergiaSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  tipo: z.enum(['medicamento', 'alimento', 'otro']).default('medicamento').optional(),
  nombre: z.string().min(2, 'Nombre requerido'),
  reaccion: z.string().max(500).optional().nullable(),
  severidad: z.enum(['leve', 'moderada', 'grave']).optional().nullable(),
  activo: z.boolean().optional(),
});

const recordatorioSchema = z.object({
  recipe_detalle_id: z.string().uuid('Línea de receta inválida'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:mm requerida'),
  canal: z.enum(['push', 'whatsapp', 'sms']).default('push').optional(),
  activo: z.boolean().optional(),
});

const telemedicinaSchema = z.object({
  url: z.string().url('URL inválida').min(6).max(500),
});

/**
 * GET /api/atencion/pacientes/:id/alergias
 * Lista las alergias/contraindicaciones activas de un paciente.
 * Usado por el médico al prescribir (para alertar).
 */
router.get(
  '/pacientes/:id/alergias',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { data, error } = await getSupabase()
        .from('pacientes_alergias')
        .select('id, paciente_id, tipo, nombre, reaccion, severidad, activo, created_at')
        .eq('paciente_id', id)
        .order('created_at', { ascending: false });
      if (error) return next(badRequest(error.message));
      res.json(data ?? []);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/atencion/alergias — crea una alergia/contraindicación. */
router.post(
  '/alergias',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  validate(alergiaSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof alergiaSchema>;
      const { data: alergia, error } = await getSupabase()
        .from('pacientes_alergias')
        .insert({
          paciente_id: body.paciente_id,
          tipo: body.tipo ?? 'medicamento',
          nombre: body.nombre,
          reaccion: body.reaccion ?? null,
          severidad: body.severidad ?? null,
          clinica_id: req.user!.clinicaId,
          created_by: req.user!.id,
        })
        .select()
        .single();
      if (error) return next(badRequest(error.message));
      void registrarAuditoria(
        { accion: 'INSERT', tabla: 'pacientes_alergias', registroId: alergia.id as string, detalles: { paciente_id: body.paciente_id, nombre: body.nombre } },
        req.user!.id,
      );
      res.status(201).json(alergia);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/atencion/alergias/:id — marca leída/desactiva. */
router.patch(
  '/alergias/:id',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  validate(alergiaSchema.partial()),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const body = req.body as z.infer<typeof alergiaSchema>;
      const update: Record<string, unknown> = {};
      if (body.activo !== undefined) update.activo = body.activo;
      if (body.nombre) update.nombre = body.nombre;
      if (body.reaccion !== undefined) update.reaccion = body.reaccion ?? null;
      if (body.severidad !== undefined) update.severidad = body.severidad ?? null;
      if (body.tipo) update.tipo = body.tipo;
      update.updated_at = new Date().toISOString();
      const { data, error } = await getSupabase()
        .from('pacientes_alergias')
        .update(update)
        .eq('id', id)
        .select()
        .single();
      if (error) return next(badRequest(error.message));
      void registrarAuditoria({ accion: 'UPDATE', tabla: 'pacientes_alergias', registroId: id, detalles: update }, req.user!.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/atencion/alergias/:id — elimina una alergia. */
router.delete(
  '/alergias/:id',
  requireRole(...MEDICO_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { data, error } = await getSupabase().from('pacientes_alergias').delete().eq('id', id);
      if (error) return next(badRequest(error.message));
      void registrarAuditoria({ accion: 'DELETE', tabla: 'pacientes_alergias', registroId: id }, req.user!.id);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/atencion/recipes/:id/recordatorios
 * Lista los recordatorios de medicamentos de una receta.
 */
router.get(
  '/recipes/:id/recordatorios',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { data, error } = await getSupabase()
        .from('medicamento_recordatorios')
        .select('id, recipe_detalle_id, hora, canal, activo')
        .eq('recipe_detalle_id', id)
        .order('hora', { ascending: true });
      if (error) return next(badRequest(error.message));
      res.json(data ?? []);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/atencion/recordatorios — añade recordatorio de medicamento. */
router.post(
  '/recordatorios',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  validate(recordatorioSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof recordatorioSchema>;
      // Resolver paciente desde la línea de receta
      const { data: linea } = await getSupabase()
        .from('recipes_detalle')
        .select('recipe_id')
        .eq('id', body.recipe_detalle_id)
        .maybeSingle();
      if (!linea) return next(notFound('Línea de receta no encontrada'));
      const { data: receta } = await getSupabase()
        .from('recipes')
        .select('paciente_id')
        .eq('id', linea.recipe_id)
        .maybeSingle();
      if (!receta) return next(notFound('Receta no encontrada'));

      const { data, error } = await getSupabase()
        .from('medicamento_recordatorios')
        .insert({
          recipe_detalle_id: body.recipe_detalle_id,
          paciente_id: receta.paciente_id,
          hora: body.hora,
          canal: body.canal ?? 'push',
          activo: body.activo ?? true,
        })
        .select()
        .single();
      if (error) return next(badRequest(error.message));
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/atencion/recordatorios/:id — activa/desactiva o cambia canal/hora. */
router.patch(
  '/recordatorios/:id',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  validate(recordatorioSchema.partial()),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const body = req.body as z.infer<typeof recordatorioSchema>;
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.activo !== undefined) update.activo = body.activo;
      if (body.hora) update.hora = body.hora;
      if (body.canal) update.canal = body.canal;
      const { data, error } = await getSupabase()
        .from('medicamento_recordatorios')
        .update(update)
        .eq('id', id)
        .select()
        .single();
      if (error) return next(badRequest(error.message));
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/atencion/recordatorios/:id — elimina un recordatorio. */
router.delete(
  '/recordatorios/:id',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { error } = await getSupabase().from('medicamento_recordatorios').delete().eq('id', id);
      if (error) return next(badRequest(error.message));
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/atencion/consultas/:id/telemedicina
 * Guarda el enlace de videollamada de una consulta (telemedicina).
 */
router.put(
  '/consultas/:id/telemedicina',
  requireRole(...MEDICO_ROLES),
  validate(telemedicinaSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { url } = req.body as z.infer<typeof telemedicinaSchema>;
      const { data, error } = await getSupabase()
        .from('consultas')
        .update({ url_telemedicina: url, es_telemedicina: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, es_telemedicina, url_telemedicina')
        .single();
      if (error) return next(badRequest(error.message));
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/atencion/tat
 * Métricas de Turnaround Time: promedio de minutos desde la solicitud hasta
 * que cada examen queda listo, agrupado por examen/categoría.
 */
router.get(
  '/tat',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  async (_req, res, next) => {
    try {
      const { data: detalles } = await getSupabase()
        .from('solicitudes_detalle')
        .select('id, solicitud_id, examen_id, resultado_id')
        .not('resultado_id', 'is', null);
      const ids = (detalles ?? []).map((d) => d.solicitud_id as string);
      // Aplanar el catálogo de exámenes para nombres
      const { data: examenes } = await getSupabase().from('examenes_laboratorio').select('id, nombre, categoria');
      const nombreExamen = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, e.nombre as string]));
      const categoriaExamen = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, (e.categoria as string) ?? 'Otros']));

      const { data: solicitudes } = await getSupabase().from('solicitudes').select('id, fecha').in('id', ids);
      const fechaSolicitud = new Map<string, string>((solicitudes ?? []).map((s) => [s.id as string, s.fecha as string]));
      const { data: resultados } = await getSupabase().from('resultados').select('id, procesado_at');
      const fechaResultado = new Map<string, string>((resultados ?? []).map((r) => [r.id as string, r.procesado_at as string]));

      const porExamen: Record<string, { nombre: string; categoria: string; total: number; min: number }> = {};
      for (const d of detalles ?? []) {
        const fecS = d.solicitud_id ? fechaSolicitud.get(d.solicitud_id as string) : null;
        const fecR = d.resultado_id ? fechaResultado.get(d.resultado_id as string) : null;
        if (!fecS || !fecR) continue;
        const mins = Math.max(0, Math.round((new Date(fecR).getTime() - new Date(fecS).getTime()) / 60000));
        const exId = d.examen_id as string;
        const entry = porExamen[exId] ?? { nombre: nombreExamen.get(exId) ?? 'Desconocido', categoria: categoriaExamen.get(exId) ?? 'Otros', total: 0, min: 0 };
        entry.total += 1;
        entry.min += mins;
        porExamen[exId] = entry;
      }

      const porExamenArr = Object.values(porExamen).map((e) => ({ ...e, promedio_min: Math.round(e.min / e.total) }));
      const porCategoria: Record<string, { promedio_min: number; count: number }> = {};
      const porTodos = porExamenArr;
      for (const e of porExamenArr) {
        const c = porCategoria[e.categoria] ?? { promedio_min: 0, count: 0 };
        c.promedio_min += e.promedio_min * e.total;
        c.count += e.total;
        porCategoria[e.categoria] = c;
      }
      const porCategoriaArr = Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, promedio_min: Math.round(v.promedio_min / v.count), count: v.count }));
      res.json({ total: porTodos.length, por_examen: porExamenArr, por_categoria: porCategoriaArr });
    } catch (err) {
      next(err);
    }
  },
);

const estados_muestra = ['pendiente', 'recibida', 'en_analisis', 'completada'] as const;

/**
 * GET /api/atencion/solicitudes/:detalleId/tracking
 * Timeline de estados de una muestra (recepción → análisis → completado).
 */
router.get(
  '/solicitudes/:detalleId/tracking',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  async (req, res, next) => {
    try {
      const { detalleId } = req.params;
      const { data, error } = await getSupabase()
        .from('muestras_tracking')
        .select('id, estado, notas, usuario_id, created_at')
        .eq('solicitud_detalle_id', detalleId)
        .order('created_at', { ascending: true });
      if (error) return next(badRequest(error.message));

      // Resolver el nombre del usuario que registró cada movimiento.
      const ids = [...new Set((data ?? []).map((m) => m.usuario_id as string).filter(Boolean))];
      let nombres = new Map<string, string>();
      if (ids.length > 0) {
        const { data: perfiles } = await getSupabase().from('profiles').select('id, nombre_completo').in('id', ids);
        nombres = new Map<string, string>((perfiles ?? []).map((p) => [p.id as string, p.nombre_completo as string]));
      }
      const estados = (data ?? []).map((m) => ({
        ...m,
        usuario_nombre: m.usuario_id ? (nombres.get(m.usuario_id as string) ?? null) : null,
      }));

      const { data: detalle } = await getSupabase()
        .from('solicitudes_detalle')
        .select('estado_muestra')
        .eq('id', detalleId)
        .maybeSingle();

      res.json({ actual: detalle?.estado_muestra ?? 'pendiente', estados });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/atencion/solicitudes/:detalleId/estado
 * Avanza el estado de una muestra (recibida → en_analisis → completada) y
 * registra el movimiento en `muestras_tracking` para el timeline.
 */
router.put(
  '/solicitudes/:detalleId/estado',
  requireRole(...MEDICO_ROLES, ...ROLES_SECRETARIA_ADMIN),
  validate(z.object({ estado: z.enum(['pendiente', 'recibida', 'en_analisis', 'completada'] as [string, ...string[]], { errorMap: () => ({ message: 'Estado de muestra inválido' }) }), notas: z.string().max(300).optional().nullable() })),
  async (req, res, next) => {
    try {
      const { detalleId } = req.params;
      const { estado, notas } = req.body as { estado: (typeof estados_muestra)[number]; notas?: string | null };

      const { data: detalle } = await getSupabase().from('solicitudes_detalle').select('id, solicitud_id').eq('id', detalleId).maybeSingle();
      if (!detalle) return next(notFound('Línea de solicitud no encontrada'));

      const { data, error } = await getSupabase()
        .from('solicitudes_detalle')
        .update({ estado_muestra: estado, updated_at: new Date().toISOString() })
        .eq('id', detalleId)
        .select('id, estado_muestra')
        .single();
      if (error) return next(badRequest(error.message));

      await getSupabase().from('muestras_tracking').insert({
        solicitud_detalle_id: detalleId,
        solicitud_id: detalle.solicitud_id,
        estado,
        notas: notas ?? null,
        usuario_id: req.user!.id,
        clinica_id: req.user!.clinicaId,
      });

      void registrarAuditoria({ accion: 'UPDATE', tabla: 'solicitudes_detalle', registroId: detalleId, detalles: { estado_muestra: estado } }, req.user!.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound, conflict } from '../../utils/httpError.js';
import {
  idParamSchema,
  paqueteSchema,
  paqueteUpdateSchema,
  convenioSchema,
  convenioUpdateSchema,
  promocionSchema,
  promocionUpdateSchema,
} from './comercial.validators.js';

const router = Router();
router.use(authRequired);

/** Hace un mapa examen_id -> nombre desde el catálogo. */
async function catalogoExamenes(): Promise<Map<string, string>> {
  const { data } = await getSupabase().from('examenes_laboratorio').select('id, nombre');
  return new Map((data ?? []).map((e) => [e.id as string, e.nombre as string]));
}

/** Une las líneas de un paquete/promoción con el nombre del examen. */
async function detalleConNombres<T extends { examen_id: string }>(rows: T[] | null) {
  const catalogo = await catalogoExamenes();
  return (rows ?? []).map((l) => ({
    examen_id: l.examen_id,
    nombre: catalogo.get(l.examen_id) ?? l.examen_id,
  }));
}

// ============================== Paquetes ==============================

/** GET /api/comercial/paquetes */
router.get('/paquetes', async (_req, res, next) => {
  try {
    const { data: paquetes } = await getSupabase()
      .from('paquetes')
      .select('*')
      .order('nombre', { ascending: true });
    const { data: detalle } = await getSupabase().from('paquete_examenes').select('paquete_id, examen_id');
    const agrupados = new Map<string, { examen_id: string; nombre: string }[]>();
    const catalogo = await catalogoExamenes();
    for (const d of detalle ?? []) {
      const pid = d.paquete_id as string;
      const grupo = agrupados.get(pid) ?? [];
      grupo.push({ examen_id: d.examen_id as string, nombre: catalogo.get(d.examen_id as string) ?? '' });
      agrupados.set(pid, grupo);
    }
    res.json(
      (paquetes ?? []).map((p) => ({
        ...p,
        precio: Number(p.precio),
        examenes: agrupados.get(p.id as string) ?? [],
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/comercial/paquetes */
router.post('/paquetes', requireRole(...ROLES_ADMIN_SUPER), validate(paqueteSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof paqueteSchema>;

    const { data: existentes } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id')
      .in('id', body.examen_ids);
    if ((existentes ?? []).length !== new Set(body.examen_ids).size) {
      return next(badRequest('Uno de los exámenes no existe'));
    }

    const { data: paquete, error } = await getSupabase()
      .from('paquetes')
      .insert({
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        precio: body.precio,
        activo: body.activo ?? true,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    const { data: lineas, error: lErr } = await getSupabase()
      .from('paquete_examenes')
      .insert(body.examen_ids.map((examen_id) => ({ paquete_id: paquete.id, examen_id })))
      .select('*');
    if (lErr) return next(badRequest(lErr.message));

    res.status(201).json({ ...paquete, precio: Number(paquete.precio), examenes: await detalleConNombres(lineas) });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/comercial/paquetes/:id */
router.put(
  '/paquetes/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  validate(paqueteUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof paqueteUpdateSchema>;

      const { data: paquete, error } = await getSupabase()
        .from('paquetes')
        .update({
          ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
          ...(body.descripcion !== undefined ? { descripcion: body.descripcion ?? null } : {}),
          ...(body.precio !== undefined ? { precio: body.precio } : {}),
          ...(body.activo !== undefined ? { activo: body.activo } : {}),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(notFound('Paquete no encontrado'));

      let lineas: { examen_id: string; nombre: string }[] | null = null;
      if (body.examen_ids) {
        const { data: existentes } = await getSupabase()
          .from('examenes_laboratorio')
          .select('id')
          .in('id', body.examen_ids);
        if ((existentes ?? []).length !== new Set(body.examen_ids).size) {
          return next(badRequest('Uno de los exámenes no existe'));
        }
        await getSupabase().from('paquete_examenes').delete().eq('paquete_id', id);
        const { data: nuevas, error: lErr } = await getSupabase()
          .from('paquete_examenes')
          .insert(body.examen_ids.map((examen_id) => ({ paquete_id: id, examen_id })))
          .select('*');
        if (lErr) return next(badRequest(lErr.message));
        lineas = await detalleConNombres(nuevas);
      } else {
        const { data: actuales } = await getSupabase()
          .from('paquete_examenes')
          .select('examen_id')
          .eq('paquete_id', id);
        lineas = await detalleConNombres(actuales);
      }

      res.json({ ...paquete, precio: Number(paquete.precio), examenes: lineas });
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/comercial/paquetes/:id  (desactiva; conserva referencias históricas) */
router.delete(
  '/paquetes/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { data: paquete, error } = await getSupabase()
        .from('paquetes')
        .update({ activo: false })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(notFound('Paquete no encontrado'));
      res.json({ ...paquete, precio: Number(paquete.precio) });
    } catch (err) {
      next(err);
    }
  },
);

// ============================== Convenios ==============================

/** GET /api/comercial/convenios */
router.get('/convenios', async (_req, res, next) => {
  try {
    const { data } = await getSupabase().from('convenios').select('*').order('nombre', { ascending: true });
    res.json((data ?? []).map((c) => ({ ...c, descuento_porcentaje: Number(c.descuento_porcentaje) })));
  } catch (err) {
    next(err);
  }
});

/** POST /api/comercial/convenios */
router.post('/convenios', requireRole(...ROLES_ADMIN_SUPER), validate(convenioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof convenioSchema>;
    const { data, error } = await getSupabase()
      .from('convenios')
      .insert({
        nombre: body.nombre,
        rif: body.rif ?? null,
        descuento_porcentaje: body.descuento_porcentaje,
        activo: body.activo ?? true,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json({ ...data, descuento_porcentaje: Number(data.descuento_porcentaje) });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/comercial/convenios/:id */
router.put(
  '/convenios/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  validate(convenioUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof convenioUpdateSchema>;
      const { data, error } = await getSupabase()
        .from('convenios')
        .update({
          ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
          ...(body.rif !== undefined ? { rif: body.rif ?? null } : {}),
          ...(body.descuento_porcentaje !== undefined ? { descuento_porcentaje: body.descuento_porcentaje } : {}),
          ...(body.activo !== undefined ? { activo: body.activo } : {}),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(notFound('Convenio no encontrado'));
      res.json({ ...data, descuento_porcentaje: Number(data.descuento_porcentaje) });
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/comercial/convenios/:id (desactiva) */
router.delete(
  '/convenios/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { data, error } = await getSupabase()
        .from('convenios')
        .update({ activo: false })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(notFound('Convenio no encontrado'));
      res.json({ ...data, descuento_porcentaje: Number(data.descuento_porcentaje) });
    } catch (err) {
      next(err);
    }
  },
);

// ============================== Promociones ==============================

function validarVigencia(body: { fecha_inicio?: string; fecha_fin?: string }): string | null {
  if (body.fecha_inicio && body.fecha_fin && body.fecha_fin < body.fecha_inicio) {
    return 'La fecha de fin no puede ser anterior al inicio';
  }
  return null;
}

/** GET /api/comercial/promociones */
router.get('/promociones', async (_req, res, next) => {
  try {
    const { data: promos } = await getSupabase()
      .from('promociones')
      .select('*')
      .order('fecha_inicio', { ascending: false });
    const { data: detalle } = await getSupabase().from('promocion_examenes').select('promocion_id, examen_id');
    const catalogo = await catalogoExamenes();
    const agrupados = new Map<string, { examen_id: string; nombre: string }[]>();
    for (const d of detalle ?? []) {
      const pid = d.promocion_id as string;
      const grupo = agrupados.get(pid) ?? [];
      grupo.push({ examen_id: d.examen_id as string, nombre: catalogo.get(d.examen_id as string) ?? '' });
      agrupados.set(pid, grupo);
    }
    res.json(
      (promos ?? []).map((p) => ({
        ...p,
        descuento_porcentaje: Number(p.descuento_porcentaje),
        examenes: agrupados.get(p.id as string) ?? [],
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** POST /api/comercial/promociones */
router.post('/promociones', requireRole(...ROLES_ADMIN_SUPER), validate(promocionSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof promocionSchema>;
    const vigencia = validarVigencia(body);
    if (vigencia) return next(badRequest(vigencia));

    const { data: existentes } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id')
      .in('id', body.examen_ids);
    if ((existentes ?? []).length !== new Set(body.examen_ids).size) {
      return next(badRequest('Uno de los exámenes no existe'));
    }

    const { data: promocion, error } = await getSupabase()
      .from('promociones')
      .insert({
        nombre: body.nombre,
        descuento_porcentaje: body.descuento_porcentaje,
        fecha_inicio: body.fecha_inicio,
        fecha_fin: body.fecha_fin,
        activo: body.activo ?? true,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));

    const { data: lineas, error: lErr } = await getSupabase()
      .from('promocion_examenes')
      .insert(body.examen_ids.map((examen_id) => ({ promocion_id: promocion.id, examen_id })))
      .select('*');
    if (lErr) return next(badRequest(lErr.message));

    res.status(201).json({
      ...promocion,
      descuento_porcentaje: Number(promocion.descuento_porcentaje),
      examenes: await detalleConNombres(lineas),
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/comercial/promociones/:id */
router.put(
  '/promociones/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  validate(promocionUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof promocionUpdateSchema>;

      const { data: actual } = await getSupabase().from('promociones').select('fecha_inicio, fecha_fin').eq('id', id).single();
      if (!actual) return next(notFound('Promoción no encontrada'));
      const vigencia = validarVigencia({ ...actual, ...body });
      if (vigencia) return next(badRequest(vigencia));

      const { data: promocion, error } = await getSupabase()
        .from('promociones')
        .update({
          ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
          ...(body.descuento_porcentaje !== undefined ? { descuento_porcentaje: body.descuento_porcentaje } : {}),
          ...(body.fecha_inicio !== undefined ? { fecha_inicio: body.fecha_inicio } : {}),
          ...(body.fecha_fin !== undefined ? { fecha_fin: body.fecha_fin } : {}),
          ...(body.activo !== undefined ? { activo: body.activo } : {}),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(badRequest(error.message));

      let lineas: { examen_id: string; nombre: string }[] | null = null;
      if (body.examen_ids) {
        const { data: existentes } = await getSupabase()
          .from('examenes_laboratorio')
          .select('id')
          .in('id', body.examen_ids);
        if ((existentes ?? []).length !== new Set(body.examen_ids).size) {
          return next(badRequest('Uno de los exámenes no existe'));
        }
        await getSupabase().from('promocion_examenes').delete().eq('promocion_id', id);
        const { data: nuevas, error: lErr } = await getSupabase()
          .from('promocion_examenes')
          .insert(body.examen_ids.map((examen_id) => ({ promocion_id: id, examen_id })))
          .select('*');
        if (lErr) return next(badRequest(lErr.message));
        lineas = await detalleConNombres(nuevas);
      } else {
        const { data: actuales } = await getSupabase()
          .from('promocion_examenes')
          .select('examen_id')
          .eq('promocion_id', id);
        lineas = await detalleConNombres(actuales);
      }

      res.json({
        ...promocion,
        descuento_porcentaje: Number(promocion.descuento_porcentaje),
        examenes: lineas,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/comercial/promociones/:id (desactiva) */
router.delete(
  '/promociones/:id',
  requireRole(...ROLES_ADMIN_SUPER),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const { data, error } = await getSupabase()
        .from('promociones')
        .update({ activo: false })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return next(notFound('Promoción no encontrada'));
      res.json({ ...data, descuento_porcentaje: Number(data.descuento_porcentaje) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
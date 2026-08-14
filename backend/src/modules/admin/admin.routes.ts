import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden } from '../../utils/httpError.js';
import { normalizeDocumento } from '../pacientes/pacientes.validators.js';
import { auditoriaQuerySchema, configSchema, createStaffSchema, examenSchema, reporteriaQuerySchema, updateStaffSchema } from './admin.validators.js';
import { validarRenovarFirmas } from '../../services/storageService.js';
import { obtenerTasasActivas } from '../../services/moneda.js';
import { montoAUsd, usdABs } from '../../services/moneda.js';
import { encryptCampo, decryptCampo } from '../../services/cifrado.js';
import { telefonoDesdeBody, conTelefonoSeparado } from '../../services/phoneNumber.js';

const router = Router();

router.use(authRequired, requireRole(...ROLES_ADMIN_SUPER));

/** Descifra los campos sensibles de un perfil (telefono, firma_digital) y expone
 * el teléfono como E.164 + piezas separadas (country_code / local_number). */
function descifrarPerfil<T extends { telefono?: unknown; firma_digital?: unknown }>(perfil: T): T {
  if (!perfil) return perfil;
  const claro = decryptCampo((perfil.telefono as string | null | undefined) ?? null);
  return conTelefonoSeparado({
    ...perfil,
    telefono: claro,
    firma_digital: decryptCampo((perfil.firma_digital as string | null | undefined) ?? null),
  });
}

/**
 * Datos (nombre de visualización + categoría) de una especialidad del catálogo.
 * El `especialidad` único se guarda con el NOMBRE para no romper la agenda,
 * reservas online y listados que muestran/filtran por texto.
 */
async function infoEspecialidad(id: string): Promise<{ nombre: string; categoria: string | null } | null> {
  const { data } = await getSupabase()
    .from('especialidades_medicas')
    .select('nombre, categoria')
    .eq('id', id)
    .maybeSingle();
  return data ? { nombre: data.nombre as string, categoria: (data.categoria as string) ?? null } : null;
}

/**
 * Prepara las columnas de perfil médico desde el array de especialidades.
 * `especialidades` guarda los IDs del catálogo (fuente de verdad); `especialidad`
 * (única) conserva el nombre de la primera para los filtros existentes.
 */
async function prepararPerfilMedico(body: {
  especialidades?: string[];
  especialidad?: string;
  categoria_medica?: string | null;
}): Promise<{ especialidades: string[]; especialidad: string | null; categoria_medica: string | null; especialidad_activa: string | null }> {
  const especialidades = body.especialidades?.length ? [...new Set(body.especialidades)] : [];
  if (especialidades.length === 0) {
    return {
      especialidades: body.especialidad ? [body.especialidad] : [],
      especialidad: body.especialidad ?? null,
      categoria_medica: body.categoria_medica ?? null,
      especialidad_activa: body.especialidad ?? null,
    };
  }
  const primaria = especialidades[0];
  const info = await infoEspecialidad(primaria);
  return {
    especialidades,
    especialidad: info?.nombre ?? primaria,
    categoria_medica: body.categoria_medica ?? info?.categoria ?? null,
    especialidad_activa: primaria,
  };
}

/**
 * POST /api/admin/staff
 * Crea un usuario (médico/secretaria/bioanalista) en Supabase Auth + profile.
 * El admin asigna uno o varios roles al perfil.
 */
router.post('/staff', validate(createStaffSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createStaffSchema>;
    const user = req.user!;

    // Solo super_root puede asignar el rol de admin.
    if (body.roles.includes('admin') && user.role !== 'super_root') {
      return next(forbidden('Solo super_root puede crear administradores'));
    }

    const { data: authUser, error: authError } = await getSupabase().auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (authError) return next(badRequest(authError.message));
    if (!authUser?.user) return next(badRequest('No se pudo crear el usuario'));

    const activo = [...new Set(body.roles)];
    const medico = await prepararPerfilMedico(body);
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .insert({
        id: authUser.user.id,
        role: activo[0],
        roles: activo,
        email: body.email,
        clinica_id: user.clinicaId,
        nombre_completo: body.nombre_completo,
        cedula: body.cedula ? normalizeDocumento(body.cedula) : null,
        telefono: encryptCampo(telefonoDesdeBody(body)),
        especialidad: medico.especialidad,
        especialidades: medico.especialidades,
        especialidad_activa: medico.especialidad_activa,
        categoria_medica: medico.categoria_medica,
        colegiatura: body.colegiatura ?? null,
        firma_digital: encryptCampo(body.firma_digital ?? null),
      })
      .select()
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json(descifrarPerfil(profile));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/staff
 * Lista el personal de la clínica del admin.
 */
router.get('/staff', async (req, res, next) => {
  try {
    const user = req.user!;
    let query = getSupabase().from('profiles').select('id, role, roles, nombre_completo, cedula, telefono, activo, especialidad, especialidades, especialidad_activa, categoria_medica, colegiatura, firma_digital, created_at');

    if (user.role !== 'super_root') query = query.eq('clinica_id', user.clinicaId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return next(error);
    res.json((data ?? []).map(descifrarPerfil));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/staff/:id
 * Actualiza rol/estado/datos del personal.
 */
router.patch('/staff/:id', validate(updateStaffSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof updateStaffSchema>;
    const user = req.user!;

    const { data: target, error: getError } = await getSupabase()
      .from('profiles')
      .select('id, clinica_id, role')
      .eq('id', id)
      .single();
    if (getError) return next(badRequest('Personal no encontrado'));

    if (user.role !== 'super_root' && target.clinica_id !== user.clinicaId) {
      return next(forbidden('No pertenece a tu clínica'));
    }
    if (body.roles?.includes('admin') && user.role !== 'super_root') {
      return next(forbidden('Solo super_root puede asignar admin'));
    }

    const update: Record<string, unknown> = { ...body };
    delete update.country_code;
    delete update.local_number;
    if (body.roles) {
      const roles = [...new Set(body.roles)];
      update.roles = roles;
      update.role = roles[0];
    }
    if (body.telefono !== undefined || body.country_code !== undefined || body.local_number !== undefined) {
      update.telefono = encryptCampo(telefonoDesdeBody(body));
    }
    if (body.firma_digital !== undefined) update.firma_digital = encryptCampo(body.firma_digital);

    // Normaliza el array de especialidades y deriva la primaria + categoría.
    if (body.especialidades !== undefined || body.especialidad !== undefined) {
      const medico = await prepararPerfilMedico(body as { especialidades?: string[]; especialidad?: string; categoria_medica?: string | null });
      update.especialidades = medico.especialidades;
      update.especialidad = medico.especialidad;
      update.especialidad_activa = medico.especialidad_activa;
      if (medico.categoria_medica !== null) update.categoria_medica = medico.categoria_medica;
    }

    const { data: updated, error } = await getSupabase()
      .from('profiles')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return next(badRequest(error.message));

    res.json(descifrarPerfil(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/auditoria
 * Consulta los logs de auditoría (filtrable por rango).
 */
router.get('/auditoria', validate(auditoriaQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { desde, hasta, limit, offset } = req.query as unknown as z.infer<
      typeof auditoriaQuerySchema
    >;
    let query = getSupabase().from('audit_logs').select('*').order('fecha', { ascending: false });

    if (desde) query = query.gte('fecha', desde);
    if (hasta) query = query.lte('fecha', hasta);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return next(error);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/reporteria?desde=&hasta=
 * Resumen financiero: total por tipo de pago y conteo, normalizado a USD
 * (moneda base) con la tasa guardada en cada pago o la del día de respaldo.
 */
router.get('/reporteria', validate(reporteriaQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { desde, hasta } = req.query as unknown as z.infer<typeof reporteriaQuerySchema>;

    let query = getSupabase().from('pagos').select('tipo, monto, moneda, tasa_usd, fecha, estado');
    if (desde) query = query.gte('fecha', `${desde}T00:00:00.000Z`);
    if (hasta) query = query.lte('fecha', `${hasta}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) return next(error);

    const rows = data ?? [];
    const { usd: tasaDia } = await obtenerTasasActivas();

    const porTipo: Record<string, { total: number; count: number }> = {};
    let total = 0;
    for (const p of rows) {
      if (p.estado === 'reembolsado') continue;
      const montoUsd = (await montoAUsd(Number(p.monto), String(p.moneda ?? 'USD'), p.tasa_usd ? Number(p.tasa_usd) : null)) ?? 0;
      const t = String(p.tipo);
      porTipo[t] = porTipo[t] ?? { total: 0, count: 0 };
      porTipo[t].total += montoUsd;
      porTipo[t].count += 1;
      total += montoUsd;
    }

    res.json({
      total: Number(total.toFixed(2)),
      total_bs: usdABs(Number(total.toFixed(2)), tasaDia),
      tasa_usd: tasaDia,
      count: rows.length,
      por_tipo: Object.fromEntries(
        Object.entries(porTipo).map(([t, v]) => [t, { total: Number(v.total.toFixed(2)), count: v.count }]),
      ),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/examenes
 * Catálogo completo (incluye inactivos) para la gestión admin.
 */
router.get('/examenes', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id, nombre, categoria, precio, interno, duracion_min, condiciones_previas, tiempo_entrega, codigo_loinc, codigo_externo, fecha_mapeo, activo')
      .eq('clinica_id', req.user!.clinicaId)
      .order('nombre', { ascending: true });
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/examenes — crea examen en el catálogo.
 */
router.post('/examenes', validate(examenSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof examenSchema>;
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .insert({ ...body, clinica_id: req.user!.clinicaId })
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/examenes/:id — actualiza nombre/precio/estado del examen.
 */
router.put('/examenes/:id', validate(examenSchema.partial()), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof examenSchema>;
    const patch: Record<string, unknown> = { ...body };
    if ('codigo_loinc' in patch || 'codigo_externo' in patch) patch.fecha_mapeo = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/integracion/loinc
 * Estado de mapeo LOINC del catálogo (integración LIS/HIS/EMR). Devuelve cada
 * examen con su código LOINC/externo si fue mapeado, y una sugerencia LOINC
 * derivada de un diccionario base cuando aún no lo está.
 */
router.get('/integracion/loinc', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id, nombre, categoria, codigo_loinc, codigo_externo, fecha_mapeo')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) return next(badRequest(error.message));

    const items = (data ?? []).map((e) => {
      const mapeado = Boolean(e.codigo_loinc || e.codigo_externo);
      return {
        id: e.id,
        nombre: e.nombre,
        categoria: e.categoria,
        codigo_loinc: e.codigo_loinc ?? null,
        codigo_externo: e.codigo_externo ?? null,
        fecha_mapeo: e.fecha_mapeo ?? null,
        mapeado,
        sugerencia_loinc: mapeado ? null : sugerenciaLoinc(e.nombre),
      };
    });

    const mapeados = items.filter((i) => i.mapeado).length;
    res.json({ total: items.length, mapeados, pendientes: items.length - mapeados, examenes: items });
  } catch (err) {
    next(err);
  }
});

/** Diccionario base LOINC~nombre sugerido por clave de búsqueda en el nombre del examen. */
const LOINC_BASE: Array<[string, string]> = [
  ['glicemia', '2345-7:Glucosa [Masa/vol] en suero o plasma'],
  ['hemoglobina glicosilada', '4548-4:Hemoglobina A1c/Hemoglobina.total en Sangre'],
  ['hemoglobina', '718-7:Hemoglobina [Masa/vol] en Sangre'],
  ['colesterol total', '2093-3:Colesterol total [Masa/vol] en Suero o Plasma'],
  ['colesterol hdl', '2085-9:Colesterol LDL [Masa/vol] en Suero o Plasma'],
  ['hdl', '2085-9:Colesterol HDL [Masa/vol] en Suero o Plasma'],
  ['ldl', '13457-7:Colesterol LDL [Masa/vol] en Suero o Plasma'],
  ['triglicer', '2571-8:Triglicéridos [Masa/vol] en Suero o Plasma'],
  ['tsh', '3016-3:Tirotropina [Unidades/vol] en Suero o Plasma'],
  ['creatinina', '2160-0:Creatinina [Masa/vol] en Suero o Plasma'],
  ['urea', '3094-0:BUN [Masa/vol] en Suero o Plasma'],
  ['bilirrubina', '1975-2:Bilirrubina total [Masa/vol] en Suero o Plasma'],
  ['transaminas', '1742-6:ALT [Enz/vol] en Suero o Plasma'],
  ['hematolog', '58410-2:Panel CBC - Sangre por Impedancia'],
  ['uroanalisis', '24356-8:Uroanálisis - Orina'],
  ['orina', '24356-8:Uroanálisis - Orina'],
];

function sugerenciaLoinc(nombre: string): string | null {
  const n = (nombre ?? '').toLowerCase();
  for (const [clave, mapeo] of LOINC_BASE) {
    if (n.includes(clave)) return mapeo;
  }
  return null;
}

/**
 * POST /api/admin/integracion/loinc/adoptar
 * Adopta la sugerencia LOINC (o un valor explícito) para un examen no mapeado.
 */
router.post('/integracion/loinc/adoptar', async (req, res, next) => {
  try {
    const { examen_id, codigo_loinc, codigo_externo } = req.body as {
      examen_id?: string;
      codigo_loinc?: string;
      codigo_externo?: string;
    };
    if (!examen_id) return next(badRequest('examen_id requerido'));

    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .update({ codigo_loinc: codigo_loinc ?? null, codigo_externo: codigo_externo ?? null, fecha_mapeo: new Date().toISOString() })
      .eq('id', examen_id)
      .select('id, nombre, codigo_loinc, codigo_externo, fecha_mapeo')
      .single();
    if (error) return next(badRequest(error.message));
    if (!data) return next(badRequest('Examen no encontrado'));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/config
 * Marca de la app (razón social, RIF, dirección, teléfono, logo, color del header).
 */
router.get('/config', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('app_config')
      .select('razon_social, rif, direccion, telefono, logo_url, header_color, updated_at')
      .eq('id', true)
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
          updated_at: null,
        },
      ),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/config
 * Actualiza la marca de la app.
 */
router.put('/config', validate(configSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof configSchema>;
    const { country_code, local_number, ...resto } = body;
    const update: Record<string, unknown> = { ...resto, updated_at: new Date().toISOString() };
    if (body.telefono !== undefined || body.country_code !== undefined || body.local_number !== undefined) {
      update.telefono = telefonoDesdeBody(body);
    }
    const { data, error } = await getSupabase()
      .from('app_config')
      .update(update)
      .eq('id', true)
      .select('razon_social, rif, direccion, telefono, logo_url, header_color, updated_at')
      .single();
    if (error) return next(badRequest(error.message));
    res.json(conTelefonoSeparado(data));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/storage/validar-firmas
 * Job administrado: valida en batch las URLs firmadas de los PDF de resultados
 * (bucket "resultados") y renueva las vencidas o por vencer. Devuelve un resumen.
 */
router.post('/storage/validar-firmas', async (_req, res, next) => {
  try {
    const { data } = await getSupabase()
      .from('resultados')
      .select('id, pdf_path');
    const objetos = (data ?? [])
      .filter((r) => typeof r.pdf_path === 'string' && (r.pdf_path as string).length > 0)
      .map((r) => ({ path: r.pdf_path as string, url: r.pdf_path as string | null }));

    const resumen = await validarRenovarFirmas({ bucket: 'resultados', objetos });
    res.json(resumen);
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, notFound, forbidden } from '../../utils/httpError.js';
import type { AuthUser } from '../auth/types.js';
import type { Row } from '../../mock/store.js';
import {
  createPacienteSchema,
  idParamSchema,
  normalizeDocumento,
  searchPacientesQuery,
  updatePacienteSchema,
} from './pacientes.validators.js';
import { encryptCampo, decryptCampo } from '../../services/cifrado.js';
import { telefonoDesdeBody, conTelefonoSeparado } from '../../services/phoneNumber.js';

const router = Router();
router.use(authRequired);

const ESCRIBIR_PACIENTE = requireRole('medico', 'secretaria', 'admin', 'super_root');
const ELIMINAR_PACIENTE = requireRole('admin', 'super_root');

const PACIENTE_COLS = 'id, cedula, tipo_documento, nombre_completo, fecha_nacimiento, telefono, email, direccion, sexo, es_menor, representante_id, parentesco_representante, fecha_consentimiento, deleted_at, created_at';

/** Descifra los campos sensibles de una fila de paciente (telefono) y expone el
 * teléfono como E.164 + piezas separadas (country_code / local_number). */
function descifrarPaciente<T extends { telefono?: unknown }>(p: T): T {
  if (!p) return p;
  const claro = decryptCampo((p.telefono as string | null | undefined) ?? null);
  return conTelefonoSeparado({ ...p, telefono: claro });
}

/** Verifica que un paciente pertenezca a la clínica del usuario (si aplica). */
async function pacienteEnClinica(pacienteId: string, clinicaId: string | null): Promise<boolean> {
  if (clinicaId === null) return true; // super_root / multi-clínica
  const { data } = await getSupabase()
    .from('pacientes')
    .select('id')
    .eq('id', pacienteId)
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/pacientes?q=&limit=
 * Búsqueda por cédula o nombre. Todo el cuerpo médico puede buscar y leer el
 * expediente de cualquier paciente (lectura global, sin importar quién lo atendió).
 */
router.get('/', validate(searchPacientesQuery, 'query'), async (req, res, next) => {
  try {
    const { q, limit } = req.query as unknown as z.infer<typeof searchPacientesQuery>;
    const user = req.user!;

    const { data: rows, error } = await getSupabase()
      .from('pacientes')
      .select(PACIENTE_COLS)
      .order('created_at', { ascending: false });

    if (error) return next(error);

    let pacientes = (rows ?? []).filter((p) => !p.deleted_at);

    const ql = q.trim().toLowerCase();
    // Sólo tiene sentido buscar por teléfono si la query contiene dígitos.
    const qDigitos = ql.replace(/\D/g, '');
    if (ql) {
      // Resolver representantes para permitir buscar menores por la cédula/nombre/teléfono de su representante.
      const representanteIds = [...new Set(pacientes.map((p) => p.representante_id as string).filter(Boolean))];
      const representantes = new Map<string, Row>();
      if (representanteIds.length) {
        const { data: reps } = await getSupabase()
          .from('pacientes')
          .select('id, cedula, nombre_completo, telefono')
          .in('id', representanteIds);
        for (const r of reps ?? []) representantes.set(r.id as string, r);
      }

      /** Descifra y normaliza un teléfono a dígitos para comparación parcial. */
      const normalizaTelefono = (v: unknown): string => {
        const claro = decryptCampo(v as string | null | undefined);
        return claro ? String(claro).replace(/\D/g, '') : '';
      };

      pacientes = pacientes.filter((p) => {
        const rep = representantes.get(p.representante_id as string);
        const telPaciente = qDigitos ? normalizaTelefono(p.telefono) : '';
        const telRep = qDigitos && rep ? normalizaTelefono(rep.telefono) : '';
        return (
          String(p.cedula ?? '').toLowerCase().includes(ql) ||
          String(p.nombre_completo ?? '').toLowerCase().includes(ql) ||
          (qDigitos.length > 0 && telPaciente.includes(qDigitos)) ||
          String(rep?.cedula ?? '').toLowerCase().includes(ql) ||
          String(rep?.nombre_completo ?? '').toLowerCase().includes(ql) ||
          (qDigitos.length > 0 && telRep.includes(qDigitos))
        );
      });
    }

    res.json(pacientes.slice(0, limit).map(descifrarPaciente));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pacientes
 * Registro inicial de paciente (cualquier staff médico: medico/secretaria/admin).
 * Soporta:
 *  - Todos los tipos de documento de identidad VE (V/E/J/P/C).
 *  - Pacientes menores de edad sin cédula propia (es_menor + representante_id).
 *  - Alta simultánea de un hijo (`hijo`): crea al responsable y, en el mismo
 *    request, al menor vinculado como dependiente con parentesco "hijo".
 */
router.post('/', ESCRIBIR_PACIENTE, validate(createPacienteSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createPacienteSchema>;
    const user = req.user!;

    let cedula: string | null = null;
    if (body.cedula) {
      cedula = normalizeDocumento(body.cedula);
      const { data: dups, error: dupError } = await getSupabase()
        .from('pacientes')
        .select('id, deleted_at')
        .eq('cedula', cedula);
      if (dupError) return next(dupError);
      const enUso = (dups ?? []).some((r) => !r.deleted_at);
      if (enUso) return next(conflict(`Ya existe un paciente con cédula ${cedula}`));
    }

    if (body.es_menor) {
      if (!(await pacienteEnClinica(body.representante_id!, user.clinicaId))) {
        return next(forbidden('El representante no pertenece a la clínica'));
      }
    }

    const { hijo, country_code, local_number, ...datos } = body;
    const { data: paciente, error } = await getSupabase()
      .from('pacientes')
      .insert({
        ...datos,
        cedula,
        telefono: encryptCampo(telefonoDesdeBody({ telefono: datos.telefono, country_code, local_number })),
        tipo_documento: body.tipo_documento ?? (cedula ? cedula[0] : null),
        es_menor: body.es_menor ?? false,
        representante_id: body.es_menor ? body.representante_id : null,
        parentesco_representante: body.es_menor ? (body.parentesco_representante ?? 'hijo') : null,
        clinica_id: user.clinicaId,
        fecha_consentimiento: new Date().toISOString(),
      })
      .select(PACIENTE_COLS)
      .single();

    if (error) return next(badRequest(error.message));

    // Alta simultánea del hijo menor asociado al responsable (vínculo de representación).
    let hijoRegistrado: Row | null = null;
    if (hijo && paciente) {
      const { data: menor, error: mErr } = await getSupabase()
        .from('pacientes')
        .insert({
          cedula: null,
          tipo_documento: null,
          nombre_completo: hijo.nombre_completo,
          fecha_nacimiento: hijo.fecha_nacimiento ? new Date(hijo.fecha_nacimiento).toISOString() : null,
          telefono: encryptCampo(telefonoDesdeBody(hijo as { telefono?: string; country_code?: string; local_number?: string })),
          sexo: hijo.sexo ?? null,
          es_menor: true,
          representante_id: paciente.id,
          parentesco_representante: 'hijo',
          clinica_id: user.clinicaId,
          fecha_consentimiento: new Date().toISOString(),
        })
        .select(PACIENTE_COLS)
        .single();
      if (mErr) return next(badRequest(mErr.message));

      const { error: vErr } = await getSupabase().from('vinculos_familiares').insert({
        paciente_id: paciente.id,
        dependiente_id: menor.id,
        parentesco: 'hijo',
      });
      if (vErr) return next(badRequest(vErr.message));
      hijoRegistrado = menor;
    }

    res.status(201).json({ ...descifrarPaciente(paciente), hijo: hijoRegistrado ? descifrarPaciente(hijoRegistrado) : null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pacientes/:id
 * Ficha del paciente con historial resumido (consultas, recetas, resultados).
 */
router.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: paciente, error } = await getSupabase()
      .from('pacientes')
      .select(PACIENTE_COLS)
      .eq('id', id)
      .single();
    if (error || !paciente || paciente.deleted_at) return next(notFound('Paciente no encontrado'));

    const [consultas, recipes, representante] = await Promise.all([
      getSupabase().from('consultas').select('id, fecha_hora, motivo, diagnostico, estado, medico_id').eq('paciente_id', id).order('fecha_hora', { ascending: false }),
      getSupabase().from('recipes').select('id, fecha_emision, fecha_expiracion, estado, medico_id').eq('paciente_id', id).order('fecha_emision', { ascending: false }),
      paciente.representante_id
        ? getSupabase().from('pacientes').select('id, cedula, nombre_completo').eq('id', paciente.representante_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    res.json({
      ...descifrarPaciente(paciente),
      representante: representante?.data ?? null,
      historial: {
        consultas: consultas.data ?? [],
        recipes: recipes.data ?? [],
        total_consultas: (consultas.data ?? []).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/pacientes/:id
 * Actualiza datos del paciente (cualquier staff médico: medico/secretaria/admin).
 */
router.put('/:id', ESCRIBIR_PACIENTE, validate(updatePacienteSchema), validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updatePacienteSchema>;

    const { data: actual, error: gErr } = await getSupabase()
      .from('pacientes')
      .select('id, cedula, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!actual || actual.deleted_at) return next(notFound('Paciente no encontrado'));

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === 'cedula' || k === 'country_code' || k === 'local_number') continue;
      payload[k] = v === '' ? null : v instanceof Date ? v.toISOString() : v;
    }
    if ('telefono' in payload || body.country_code !== undefined || body.local_number !== undefined) {
      payload.telefono = encryptCampo(telefonoDesdeBody({ telefono: body.telefono, country_code: body.country_code, local_number: body.local_number }));
    }

    if (body.cedula) {
      const cedula = normalizeDocumento(body.cedula);
      if (cedula !== actual.cedula) {
        const { data: dups, error: dupError } = await getSupabase()
          .from('pacientes')
          .select('id, deleted_at')
          .eq('cedula', cedula);
        if (dupError) return next(dupError);
        const enUso = (dups ?? []).some((p) => !p.deleted_at && p.id !== id);
        if (enUso) return next(conflict(`Ya existe un paciente con cédula ${cedula}`));
      }
      payload.cedula = cedula;
      if (!('tipo_documento' in payload)) payload.tipo_documento = cedula[0];
    }

    const { data: paciente, error } = await getSupabase()
      .from('pacientes')
      .update(payload)
      .eq('id', id)
      .select(PACIENTE_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.json(descifrarPaciente(paciente));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/pacientes/:id
 * Borrado lógico (soft delete) restringido a admin/super_root: marca `deleted_at`
 * y lo excluye de búsquedas, conservando el histórico clínico para auditoría.
 * No se puede eliminar a un paciente que sea representante de menores o cabeza de dependientes.
 */
router.delete('/:id', ELIMINAR_PACIENTE, validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    if (!(await pacienteEnClinica(id, user.clinicaId))) {
      return next(forbidden('El paciente no pertenece a la clínica'));
    }

    const { data: paciente, error: gErr } = await getSupabase()
      .from('pacientes')
      .select('id, nombre_completo, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (gErr) return next(gErr);
    if (!paciente || paciente.deleted_at) return next(notFound('Paciente no encontrado'));

    const { data: menores } = await getSupabase()
      .from('pacientes')
      .select('id')
      .eq('representante_id', id);
    if ((menores ?? []).length) {
      return next(conflict(`No se puede eliminar a ${paciente.nombre_completo}: es representante de menores`));
    }

    const { data: dependientes } = await getSupabase()
      .from('vinculos_familiares')
      .select('id')
      .eq('paciente_id', id);
    if ((dependientes ?? []).length) {
      return next(conflict(`No se puede eliminar a ${paciente.nombre_completo}: tiene dependientes vinculados`));
    }

    const { error } = await getSupabase()
      .from('pacientes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return next(badRequest(error.message));

    res.json({ ok: true, id, mensaje: 'Paciente eliminado (borrado lógico)' });
  } catch (err) {
    next(err);
  }
});

export default router;

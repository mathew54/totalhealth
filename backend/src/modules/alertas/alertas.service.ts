import { getSupabase } from '../../config/supabase.js';

export interface Umbral {
  id: string;
  examen_id: string;
  parametro: string;
  nombre: string;
  unidad: string | null;
  normal_min: number | null;
  normal_max: number | null;
  critico_min: number | null;
  critico_max: number | null;
}

export interface EvaluacionAlerta {
  parametro: string;
  valor: string | null;
  unidad: string | null;
  nivel: 'alerta' | 'critico';
  motivo: string;
}

/** Extrae el primer número decimal de un string tipo "88 mg/dL" -> 88, o null. */
function extraerNumero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string') return null;
  const match = valor.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function evaluarValor(umbral: Umbral, valor: unknown): EvaluacionAlerta | null {
  const num = extraerNumero(valor);
  if (num === null) return null;

  const v = { valor: String(valor), unidad: umbral.unidad, parametro: umbral.parametro };

  if (
    (umbral.critico_max != null && num > umbral.critico_max) ||
    (umbral.critico_min != null && num < umbral.critico_min)
  ) {
    return {
      ...v,
      nivel: 'critico',
      motivo: `${umbral.nombre} fuera de rango crítico (${mostrarRef(umbral.critico_min, umbral.critico_max)}${umbral.unidad ? ' ' + umbral.unidad : ''})`,
    };
  }

  if (
    (umbral.normal_max != null && num > umbral.normal_max) ||
    (umbral.normal_min != null && num < umbral.normal_min)
  ) {
    return {
      ...v,
      nivel: 'alerta',
      motivo: `${umbral.nombre} fuera de rango de referencia (${mostrarRef(umbral.normal_min, umbral.normal_max)}${umbral.unidad ? ' ' + umbral.unidad : ''})`,
    };
  }

  return null;
}

function mostrarRef(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `> ${min}`;
  if (max != null) return `< ${max}`;
  return 'sin rango';
}

/**
 * Evalúa el jsonb de valores de un resultado contra los umbrales del examen.
 * Devuelve las alertas detectadas (vacío si todo dentro de rango).
 */
export async function evaluarAlertas(examenId: string, valores: unknown): Promise<EvaluacionAlerta[]> {
  if (!valores || typeof valores !== 'object') return [];

  const { data: umbrales } = await getSupabase()
    .from('parametros_referencia')
    .select('id, examen_id, parametro, nombre, unidad, normal_min, normal_max, critico_min, critico_max')
    .eq('examen_id', examenId)
    .eq('activo', true);

  if (!umbrales?.length) return [];

  const alertas: EvaluacionAlerta[] = [];
  for (const u of umbrales as Umbral[]) {
    const v = (valores as Record<string, unknown>)[u.parametro];
    const alerta = evaluarValor(u, v);
    if (alerta) alertas.push(alerta);
  }
  return alertas;
}

/** Persiste alertas clínicas calculadas para un resultado. Devuelve las insertadas. */
export async function registrarAlertas(input: {
  clinicaId: string | null;
  pacienteId: string;
  examenId: string;
  solicitudDetalleId: string;
  resultadoId: string;
  alertas: EvaluacionAlerta[];
}): Promise<{ inserted: number; fin: EvaluacionAlerta[] }> {
  if (!input.alertas.length) return { inserted: 0, fin: [] };
  const filas = input.alertas.map((a) => ({
    clinica_id: input.clinicaId,
    paciente_id: input.pacienteId,
    examen_id: input.examenId,
    solicitud_detalle_id: input.solicitudDetalleId,
    resultado_id: input.resultadoId,
    parametro: a.parametro,
    valor: a.valor,
    unidad: a.unidad,
    nivel: a.nivel,
    motivo: a.motivo,
    leida: false,
  }));
  try {
    await getSupabase().from('alertas_clinicas').insert(filas);
    return { inserted: filas.length, fin: input.alertas };
  } catch {
    // Las alertas no deben romper la carga de resultados.
    return { inserted: 0, fin: [] };
  }
}
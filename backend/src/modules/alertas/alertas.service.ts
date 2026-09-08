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
  edad_min: number | null;
  edad_max: number | null;
  sexo: 'M' | 'F' | null;
}

/** Perfil del paciente usado para elegir el rango de referencia aplicable. */
export interface PerfilPaciente {
  edadAnios: number | null;
  sexo: 'M' | 'F' | null;
}

/** Edad en años cumplidos a partir de una fecha de nacimiento. */
export function calcularEdadAnios(fechaNacimiento: string | Date | null): number | null {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mesDiaActual = hoy.getMonth() * 100 + hoy.getDate();
  const mesDiaNacimiento = fecha.getMonth() * 100 + fecha.getDate();
  if (mesDiaActual < mesDiaNacimiento) edad -= 1;
  return Math.max(edad, 0);
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
 * Puntúa qué tan específica es una fila de umbral para el paciente:
 *  -1 = no aplica (su grupo etario/sexo la descarta).
 *  Mayor puntaje = rango más específico (edad acotada > general; sexo exacto > ambos).
 */
function puntajeUmbral(u: Umbral, perfil: PerfilPaciente): number {
  const { edadAnios, sexo } = perfil;
  const acotadoMins = u.edad_min != null || u.edad_max != null;

  if (edadAnios != null) {
    if (u.edad_min != null && edadAnios < u.edad_min) return -1;
    if (u.edad_max != null && edadAnios > u.edad_max) return -1;
  } else if (acotadoMins) {
    // Sin edad conocida no se pueden aplicar rangos pediátricos.
    return -1;
  }

  let puntos = 0;
  if (acotadoMins) puntos += 2;
  if (sexo != null && u.sexo === sexo) puntos += 1;
  return puntos;
}

/** Elige el umbral aplicable de cada parámetro según edad y sexo del paciente. */
function umbralesAplicables(umbrales: Umbral[], perfil: PerfilPaciente): Umbral[] {
  const porParametro = new Map<string, Umbral[]>();
  for (const u of umbrales) {
    const arr = porParametro.get(u.parametro) ?? [];
    arr.push(u);
    porParametro.set(u.parametro, arr);
  }

  const elegidos: Umbral[] = [];
  for (const grupo of porParametro.values()) {
    const aplican = grupo
      .map((u) => ({ u, p: puntajeUmbral(u, perfil) }))
      .filter((r) => r.p > -1);
    if (aplican.length) {
      // Gana el más específico; a igualdad se mantiene el primer registro.
      aplican.sort((a, b) => b.p - a.p);
      elegidos.push(aplican[0].u);
      continue;
    }
    // Ningún rango acotado aplica: usar el general (edad sin restringir) si existe.
    const general = grupo.find((u) => u.edad_min == null && u.edad_max == null);
    if (general) elegidos.push(general);
  }
  return elegidos;
}

/**
 * Evalúa el jsonb de valores de un resultado contra los umbrales del examen.
 * Cuando el examen define varios rangos por edad/sexo, se usa el que aplica al
 * paciente (`perfil`); si no se proporciona el perfil, se usan los rangos generales.
 * Devuelve las alertas detectadas (vacío si todo dentro de rango).
 */
export async function evaluarAlertas(
  examenId: string,
  valores: unknown,
  perfil?: PerfilPaciente,
): Promise<EvaluacionAlerta[]> {
  if (!valores || typeof valores !== 'object') return [];

  const { data: umbrales } = await getSupabase()
    .from('parametros_referencia')
    .select('id, examen_id, parametro, nombre, unidad, normal_min, normal_max, critico_min, critico_max, edad_min, edad_max, sexo')
    .eq('examen_id', examenId)
    .eq('activo', true);

  if (!umbrales?.length) return [];

  const perfilFijo: PerfilPaciente = perfil ?? { edadAnios: null, sexo: null };
  const aplicables = umbralesAplicables(umbrales as Umbral[], perfilFijo);

  const alertas: EvaluacionAlerta[] = [];
  for (const u of aplicables) {
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
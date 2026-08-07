// definicion.ts
// TotalHealth: definición declarativa del cuestionario de historial médico
// (anamnesis). Es la única fuente de verdad de los módulos, puntos del
// checklist y del campo de cierre. Se comparte entre backend (validación y
// endpoints) y frontend (wizard paso a paso) vía GET /cuestionarios/definicion.

export interface ItemCuestionario {
  clave: string;
  etiqueta: string;
  placeholder: string;
}

export interface ModuloCuestionario {
  id: string;
  nombre: string;
  descripcion?: string;
  items: ItemCuestionario[];
}

export const MODULOS_CUESTIONARIO: ModuloCuestionario[] = [
  {
    id: 'modulo_1',
    nombre: 'Estilo de Vida y Hábitos',
    descripcion: 'Hábitos cotidianos y factores de riesgo modificables.',
    items: [
      { clave: 'alimentacion', etiqueta: 'Alimentación', placeholder: 'Restricciones, dietas especiales' },
      { clave: 'actividad_fisica', etiqueta: 'Actividad Física', placeholder: 'Tipo de ejercicio, frecuencia' },
      { clave: 'trastornos_sueno', etiqueta: 'Trastornos del Sueño / Insomnio', placeholder: 'Horas promedio, uso de inductores' },
      { clave: 'consumo_sustancias', etiqueta: 'Consumo de Alcohol / Tabaco / Vapeo', placeholder: 'Frecuencia y cantidad' },
      { clave: 'estres_salud_mental', etiqueta: 'Estrés o Afecciones de Salud Mental', placeholder: 'Diagnóstico previo, terapia' },
    ],
  },
  {
    id: 'modulo_2',
    nombre: 'Antecedentes Médicos Personales',
    descripcion: 'Enfermedades, medicación, alergias y antecedentes quirúrgicos.',
    items: [
      { clave: 'enfermedades_cronicas', etiqueta: 'Enfermedades Crónicas', placeholder: 'Hipertensión, diabetes, tiroides, asma, etc. Años de diagnóstico' },
      { clave: 'medicamentos_continuos', etiqueta: 'Consumo de Medicamentos Continuos', placeholder: 'Nombre comercial/genérico y dosis' },
      { clave: 'alergias', etiqueta: 'Alergias a Medicamentos, Alimentos o Insumos', placeholder: 'Sustancias y reacción' },
      { clave: 'cirugias_hospitalizaciones', etiqueta: 'Cirugías e Hospitalizaciones Previas', placeholder: 'Procedimiento y fecha aproximada' },
      { clave: 'vacunacion_incompleta', etiqueta: 'Esquema de Vacunación Incompleto / Pendiente', placeholder: 'Vacunas faltantes' },
    ],
  },
  {
    id: 'modulo_3',
    nombre: 'Antecedentes Heredofamiliares',
    descripcion: 'Padres, abuelos y hermanos.',
    items: [
      { clave: 'historial_familiar_cancer', etiqueta: 'Historial Familiar de Cáncer', placeholder: 'Tipo de cáncer y parentesco' },
      { clave: 'historial_cardiovascular', etiqueta: 'Historial de Enfermedades Cardiovasculares / Infartos', placeholder: 'Parentesco y edad del evento' },
      { clave: 'historial_diabetes_renal', etiqueta: 'Historial de Diabetes o Enfermedades Renales', placeholder: 'Parentesco' },
    ],
  },
  {
    id: 'modulo_4',
    nombre: 'Revisión por Sistemas',
    descripcion: 'Síntomas activos referidos por el paciente.',
    items: [
      { clave: 'sintomas_cardiovasculares', etiqueta: 'Síntomas Cardiovasculares', placeholder: 'Palpitaciones, dolor de pecho, mareos' },
      { clave: 'sintomas_gastrointestinales', etiqueta: 'Síntomas Gastrointestinales', placeholder: 'Acidez, reflujo, dolor abdominal' },
      { clave: 'sintomas_neurologicos', etiqueta: 'Síntomas Neurológicos', placeholder: 'Migrañas, hormigueo, convulsiones' },
      { clave: 'sintomas_urologicos_ginecologicos', etiqueta: 'Síntomas Urológicos / Ginecológicos', placeholder: 'Dolor al orinar, irregularidades' },
    ],
  },
];

export const OBSERVACIONES_KEY = 'observaciones';

/** Claves de todos los ítems del checklist (sin el campo de cierre). */
export const CLAVES_ITEMS = MODULOS_CUESTIONARIO.flatMap((m) => m.items.map((i) => i.clave));

export const OBSERVACIONES_MODULO: ModuloCuestionario = {
  id: 'modulo_5',
  nombre: 'Cierre de Anamnesis',
  descripcion: 'Otros / Observaciones Adicionales',
  items: [],
};

export type RespuestaItem = { marcado: boolean; detalle: string | null };
export type Respuestas = Record<string, unknown>;

/** Respuestas vacías (todo desmarcado + observaciones vacías). */
export function respuestasVacias(): Respuestas {
  const resp: Record<string, unknown> = {};
  for (const clave of CLAVES_ITEMS) resp[clave] = { marcado: false, detalle: null } satisfies RespuestaItem;
  resp[OBSERVACIONES_KEY] = '';
  return resp;
}

/** Normaliza respuestas arbitrarias a la estructura canónica (fallback seguro). */
export function normalizarRespuestas(entrada: Record<string, unknown> | null | undefined): Respuestas {
  const salida = respuestasVacias();
  const src = entrada ?? {};
  for (const clave of CLAVES_ITEMS) {
    const raw = src[clave];
    if (raw && typeof raw === 'object') {
      const v = raw as Record<string, unknown>;
      salida[clave] = {
        marcado: v.marcado === true,
        detalle: typeof v.detalle === 'string' ? (v.detalle as string) : v.detalle == null ? null : String(v.detalle),
      };
    } else if (typeof raw === 'boolean') {
      // Compatibilidad: un boolean simple se interpreta como "marcado".
      salida[clave] = { marcado: raw, detalle: null };
    }
  }
  salida[OBSERVACIONES_KEY] = typeof src[OBSERVACIONES_KEY] === 'string' ? (src[OBSERVACIONES_KEY] as string) : '';
  return salida;
}

/** Cantidad de ítems marcados (para el resumen del wizard). */
export function conteoMarcados(respuestas: Respuestas | null | undefined): number {
  const r = respuestas ?? {};
  return CLAVES_ITEMS.filter((c) => (r[c] as RespuestaItem | undefined)?.marcado === true).length;
}

// Fecha en hora de Venezuela (America/Caracas, UTC-4). Única implementación
// del formateo de fecha del sistema: lo usan consultas, portal, cotizaciones y
// el scraping BCV (evita divergencias de formato/zona horaria).

const FORMATO_CARACAS = {
  timeZone: 'America/Caracas',
  year: 'numeric' as const,
  month: '2-digit' as const,
  day: '2-digit' as const,
};

/** Fecha (YYYY-MM-DD, hora de Caracas) de una marca de tiempo ISO. null si inválida. */
export function fechaCaracasDeISO(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', FORMATO_CARACAS).format(d);
}

/** Fecha de hoy (YYYY-MM-DD) en hora de Caracas. */
export function hoyCaracas(): string {
  return new Intl.DateTimeFormat('en-CA', FORMATO_CARACAS).format(new Date());
}
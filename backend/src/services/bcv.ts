// services/bcv.ts
// TotalHealth: scraping de las tasas informativas del Banco Central de Venezuela.
// Extrae el valor del Dólar (USD) y el Euro (EUR) de la página pública del BCV.

import { hoyCaracas } from '../utils/fechaCaracas.js';

const BCV_URL = process.env.BCV_URL ?? 'https://www.bcv.org.ve/';

export interface TasaBcv {
  usd: number | null;
  eur: number | null;
  fecha: string; // YYYY-MM-DD
  fuente: string;
}

/**
 * Convierte un valor en formato venezolano (1.234,56 o 36,52 o 36.52) a number.
 * Devuelve null si no hay un número válido > 0.
 */
export function parseNumeroBcv(raw: string): number | null {
  const s = String(raw ?? '').replace(/[^\d.,]/g, '').trim();
  if (!s) return null;
  let n: number;
  if (s.includes(',') && s.includes('.')) {
    // El último separador es el decimal: 1.234,56 → 1234.56
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      n = Number(s.replace(/\./g, '').replace(',', '.'));
    } else {
      // 1,234.56 → 1234.56
      n = Number(s.replace(/,/g, ''));
    }
  } else if (s.includes(',')) {
    n = Number(s.replace(/,/g, '.'));
  } else {
    n = Number(s);
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrae los valores de USD y EUR del HTML de la página del BCV.
 * Estrategias en orden: elementos `id`/`class` (dolar, euro), luego patrón de
 * texto "Dólar <valor>" / "Euro <valor>". Devuelve null por moneda si no se
 * encontró un número.
 */
export function parseTasasBcv(html: string): { usd: number | null; eur: number | null } {
  const extraer = (nombres: string[]): number | null => {
    // El valor oficial se publica como "Bs <monto>" (Bs 755,9001 o Bs&nbsp;755,9001).
    // Se ancla en la etiqueta de la moneda y se toma el primer "Bs <monto>" tras
    // ella: así se ignora basura de layout (col-sm-12, ids, etc.).
    for (const nombre of nombres) {
      const mBs = html.match(new RegExp(`${nombre}[\\s\\S]{0,200}?Bs(?:&nbsp;|\\s|\\.)*([\\d.,]+)`, 'i'));
      if (mBs) {
        const n = parseNumeroBcv(mBs[1]);
        if (n != null) return n;
      }
    }
    // Respaldo: el número que sigue a la etiqueta de la moneda (texto visible).
    for (const nombre of nombres) {
      const mt = html.match(new RegExp(`${nombre}[^\\d]{0,120}([\\d.,]+)`, 'i'));
      if (mt) {
        const n = parseNumeroBcv(mt[1]);
        if (n != null) return n;
      }
    }
    return null;
  };

  return { usd: extraer(['dólar', 'dolar', 'usd']), eur: extraer(['euro', 'eur']) };
}

/** Fecha del día en hora de Caracas (America/Caracas), formato YYYY-MM-DD. */
export const fechaHoyCaracas = hoyCaracas;

/**
 * Consulta el sitio del BCV y devuelve las tasas del día.
 * Lanza un Error legible si la página no se pudo descargar o parsear.
 */
export async function obtenerTasasBCV(): Promise<TasaBcv> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let html: string;
  try {
    const res = await fetch(BCV_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`El sitio del BCV respondió HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    const causa = err instanceof Error && err.name === 'AbortError' ? 'tiempo de espera agotado' : (err as Error).message;
    throw new Error(`No se pudo obtener las tasas del BCV (${causa}). Revisa la conexión o usa la tasa manual.`);
  } finally {
    clearTimeout(timeout);
  }

  const { usd, eur } = parseTasasBcv(html);
  if (usd == null && eur == null) {
    throw new Error('No se pudieron extraer las tasas del BCV (el sitio cambió su estructura). Usa la tasa manual.');
  }

  return { usd, eur, fecha: fechaHoyCaracas(), fuente: BCV_URL };
}

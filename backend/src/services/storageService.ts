import { getSupabase } from '../config/supabase.js';
import { env } from '../config/env.js';

const DEFAULT_EXPIRA_SEG = 3600; // 1 h

let counter = 0; // nonce único para firmas mock

/**
 * Crea una URL firmada de visión temporal para un objeto de Storage.
 * - Producción: delega en Supabase Storage (firma real con expiración).
 * - Desarrollo/mock: devuelve una URL simulada con parámetro `e=` (expira) y
 *   `sig=` para poder probar el flujo de validación/renovación de firmas.
 */
export async function createSignedUrl(opts: {
  bucket: string;
  path: string;
  expiresInSeg?: number;
}): Promise<{ signedUrl: string; expiresAt: string }> {
  const expiraSeg = opts.expiresInSeg ?? DEFAULT_EXPIRA_SEG;
  const expiresAt = new Date(Date.now() + expiraSeg * 1000);

  if (!env.useMock) {
    const { data, error } = await getSupabase()
      .storage.from(opts.bucket)
      .createSignedUrl(opts.path, expiraSeg);
    if (error || !data) throw new Error(`No se pudo firmar ${opts.bucket}/${opts.path}: ${error?.message ?? ''}`);
    return { signedUrl: data.signedUrl, expiresAt: expiresAt.toISOString() };
  }

  const sig = `${Date.now().toString(36)}${(counter++).toString(36)}`;
  const base = `/api/storage/mock/${opts.bucket}/${opts.path}`;
  return { signedUrl: `${base}?e=${expiresAt.getTime()}&sig=${sig}`, expiresAt: expiresAt.toISOString() };
}

/** Extrae el instante de expiración (ms) desde una URL firmada, si aplica. */
export function expiracionDeUrl(url: string): number | null {
  const match = url.match(/[?&]e=(\d+)/);
  return match ? Number(match[1]) : null;
}

export interface EstadoFirma {
  path: string;
  bucket: string;
  url: string;
  expiraAt: string | null;
  vencida: boolean;
  renovada: boolean;
  nuevaUrl?: string;
}

/**
 * Validación batch (cron): recorre una lista de objetos con URL firmada,
 * detecta las vencidas o por vencer y las renueva. Devuelve un resumen con el
 * estado y, para las renovadas, la nueva URL.
 */
export async function validarRenovarFirmas(opts: {
  bucket: string;
  objetos: { path: string; url: string | null }[];
  margenSeg?: number;
}): Promise<{ validas: number; renovadas: number; vencidas: number; detalles: EstadoFirma[] }> {
  const margenMs = (opts.margenSeg ?? 300) * 1000; // renueva si expira en <5 min
  const resultados: EstadoFirma[] = [];

  for (const obj of opts.objetos) {
    if (!obj.url) {
      // Sin URL: emitir una nueva (primera firma).
      const nueva = await createSignedUrl({ bucket: opts.bucket, path: obj.path });
      resultados.push({
        path: obj.path,
        bucket: opts.bucket,
        url: obj.url ?? '',
        expiraAt: nueva.expiresAt,
        vencida: true,
        renovada: true,
        nuevaUrl: nueva.signedUrl,
      });
      continue;
    }

    const exp = expiracionDeUrl(obj.url);
    const vencida = exp === null || exp - Date.now() <= margenMs;

    if (vencida) {
      const nueva = await createSignedUrl({ bucket: opts.bucket, path: obj.path });
      resultados.push({
        path: obj.path,
        bucket: opts.bucket,
        url: obj.url,
        expiraAt: nueva.expiresAt,
        vencida: true,
        renovada: true,
        nuevaUrl: nueva.signedUrl,
      });
    } else {
      resultados.push({
        path: obj.path,
        bucket: opts.bucket,
        url: obj.url,
        expiraAt: new Date(exp).toISOString(),
        vencida: false,
        renovada: false,
      });
    }
  }

  const renovadas = resultados.filter((r) => r.renovada).length;
  return {
    validas: resultados.length - renovadas,
    renovadas,
    vencidas: renovadas,
    detalles: resultados,
  };
}
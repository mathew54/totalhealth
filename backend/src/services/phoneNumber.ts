/**
 * Utilidades E.164 para números telefónicos.
 *
 * Estrategia del sistema:
 *  - Persistencia: un único campo string con el formato estricto E.164
 *    (ej. `+584121234567`), sin separadores ni ceros a la izquierda.
 *  - Lectura/API: el string se expone además descompuesto en dos campos
 *    separados (`country_code` y `local_number`) para que el Front-end pueda
 *    renderizar el selector de país + número local.
 *  - Escritura: el Front-end envía `country_code` + `local_number` (o el
 *    string completo en `telefono` para compatibilidad) y aquí se unifica.
 */

import { PAISES } from '../data/paises.js';

export interface TelefonoSeparado {
  country_code: string | null;
  local_number: string | null;
}

const limpiar = (valor: unknown): string => String(valor ?? '').trim().replace(/[\s\-().]/g, '');

// Códigos E.164 de países, derivados del catálogo ÚNICO (src/data/paises.ts),
// ordenados de mayor a menor longitud para identificar el prefijo correcto.
const CODIGOS_PAIS: string[] = Array.from(new Set(PAISES.map((p) => p.codigo))).sort((a, b) => b.length - a.length);

/** Extrae `country_code` (+CC) y `local_number` de un string E.164 (o legado). */
export function separarTelefono(telefono: string | null | undefined): TelefonoSeparado {
  const t = limpiar(telefono);
  if (!t) return { country_code: null, local_number: null };

  const digits = t.replace(/\D/g, '');

  // Con prefijo de país ('+'): identifica el código de país por el prefijo más
  // largo conocido (p.ej. +584244458116 → '+58' + '4244458116', no '584').
  if (t.startsWith('+')) {
    for (const code of CODIGOS_PAIS) {
      if (digits.startsWith(code)) {
        const local = digits.slice(code.length);
        return { country_code: `+${code}`, local_number: local || null };
      }
    }
    // Sin coincidencia con un país conocido: devolver el número sin código.
    return { country_code: null, local_number: digits || null };
  }

  // Sin prefijo de país: se asume Venezuela (+58) y se quita el 0 inicial.
  const local = digits.replace(/^0+/, '');
  return { country_code: '+58', local_number: local || null };
}

/**
 * Une `country_code` + `local_number` en un string E.164 estricto.
 * Devuelve `null` si no hay ningún valor. Quita el 0 inicial del número local
 * (regla de validación del componente: el primer carácter no puede ser 0).
 */
export function unificarTelefono(partes: { country_code?: string | null; local_number?: string | null } | null | undefined): string | null {
  const cc = limpiar(partes?.country_code).replace(/^\+/, '');
  const local = limpiar(partes?.local_number).replace(/^0+/, '');
  if (!cc && !local) return null;
  if (!cc) return `+58${local}`;
  if (!local) return null;
  return `+${cc}${local}`;
}

/** Normaliza cualquier valor (string completo o piezas) a E.164 estricto. */
export function normalizarTelefonoE164(telefono: string | null | undefined): string | null {
  if (!limpiar(telefono)) return null;
  return unificarTelefono(separarTelefono(telefono));
}

/**
 * Resuelve el teléfono a guardar desde el body validado.
 * Prioriza las piezas separadas (`country_code`/`local_number`); si no vienen,
 * usa el string completo `telefono` (compatibilidad con clientes antiguos).
 */
export function telefonoDesdeBody(body: {
  telefono?: string | null;
  country_code?: string | null;
  local_number?: string | null;
}): string | null {
  if (limpiar(body.country_code) || limpiar(body.local_number)) {
    return unificarTelefono(body);
  }
  return normalizarTelefonoE164(body.telefono ?? null);
}

/**
 * Accessor de lectura: recibe una fila ya descifrada con `telefono` y devuelve
 * el objeto enriquecido con `country_code` y `local_number` para la API.
 */
export function conTelefonoSeparado<T extends Record<string, unknown>>(obj: T): T & TelefonoSeparado {
  if (!obj) return obj as T & TelefonoSeparado;
  return { ...obj, ...separarTelefono((obj.telefono as string | null | undefined) ?? null) };
}

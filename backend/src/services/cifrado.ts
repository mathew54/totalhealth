import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado en reposo (app-layer) de campos sensibles con AES-256-GCM.
 *
 * La clave se toma de `FIELD_ENCRYPTION_KEY` (leída en cada llamada para poder
 * activarla/desactivarla en runtime y en tests). Sin clave, los campos viajan
 * en claro (modo transparente, útil en dev/mock). Valores con prefijo
 * `enc:v1:` se descifran; valores en claro legados se devuelven tal cual.
 *
 * Formato persistido: `enc:v1:<base64(iv + authTag + ciphertext)>`
 */

const PREFIX = 'enc:v1:';

function claveBytes(): Buffer | null {
  const clave = process.env.FIELD_ENCRYPTION_KEY;
  if (!clave) return null;
  return createHash('sha256').update(clave).digest();
}

/** Cifra un campo sensible; devuelve `null` si el valor es nulo/vacío. */
export function encryptCampo(valor: string | null | undefined): string | null {
  if (valor == null || valor === '') return null;
  const key = claveBytes();
  if (!key) return valor;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encriptado = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encriptado]).toString('base64');
}

/** Descifra un campo sensible; valores en claro legados o indescifrables se devuelven tal cual. */
export function decryptCampo(valor: string | null | undefined): string | null {
  if (valor == null || valor === '') return null;
  if (!valor.startsWith(PREFIX)) return valor;

  const key = claveBytes();
  if (!key) return valor;

  try {
    const raw = Buffer.from(valor.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return valor;
  }
}

/** ¿Está activo el cifrado de campos? (permite validar que los datos van cifrados). */
export function cifradoActivo(): boolean {
  return Boolean(process.env.FIELD_ENCRYPTION_KEY);
}

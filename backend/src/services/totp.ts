import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP (RFC 6238) sin dependencias: HMAC-SHA1, 6 dígitos, periodo 30 s.
 * Compatible con Google Authenticator / Authy / Microsoft Authenticator.
 */

const PERIODO = 30;
const DIGITOS = 6;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 encode (RFC 4648, sin padding) — estándar para secretos OTP. */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

/** Base32 decode (acepta minúsculas, espacios y sin padding). */
export function base32Decode(secreto: string): Buffer {
  const limpio = secreto.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const ch of limpio) {
    const idx = ALFABETO.indexOf(ch);
    if (idx === -1) throw new Error('Secreto TOTP inválido');
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Genera un secreto TOTP de 160 bits (32 chars base32). */
export function generarSecreto(): string {
  return base32Encode(randomBytes(20));
}

/** Calcula el código TOTP para una marca de tiempo (ms); default = ahora. */
export function codigoTotp(secreto: string, ahoraMs: number = Date.now()): string {
  const contador = Math.floor(ahoraMs / 1000 / PERIODO);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', base32Decode(secreto)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/**
 * Valida un código TOTP contra el secreto. `ventana` permite tolerancia de
 * reloj: 1 = valida el paso actual, el anterior y el siguiente.
 */
export function validarCodigo(secreto: string, codigo: string, ventana = 1, ahoraMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  for (let i = -ventana; i <= ventana; i++) {
    if (codigoTotp(secreto, ahoraMs + i * PERIODO * 1000) === codigo) return true;
  }
  return false;
}

/** URI otpauth para apps de autenticación (clave para el QR). */
export function otpauthUri(secreto: string, cuenta: string, emisor = 'TotalHealth'): string {
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO}`;
}

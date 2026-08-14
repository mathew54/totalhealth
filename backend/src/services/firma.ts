// Firma digital de registros clínicos (historial compartido y cuestionario).
// SHA-256 del contenido + autor + marca de tiempo; única implementación para
// garantizar integridad/trazabilidad consistente entre módulos.

import { createHash } from 'node:crypto';

export function firmaHash(medicoId: string, marca: string, contenido: unknown): string {
  return createHash('sha256')
    .update(`${medicoId}:${marca}:${JSON.stringify(contenido ?? {})}`)
    .digest('hex')
    .slice(0, 32);
}
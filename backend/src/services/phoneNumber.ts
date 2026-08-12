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

export interface TelefonoSeparado {
  country_code: string | null;
  local_number: string | null;
}

const limpiar = (valor: unknown): string => String(valor ?? '').trim().replace(/[\s\-().]/g, '');

// Códigos E.164 de países conocidos (prefijos), ordenados de mayor a menor
// longitud para identificar el prefijo de país correcto (más largo primero).
const CODIGOS_PAIS: string[] = [
  '1242', '1246', '1264', '1268', '1284', '1340', '1345', '1441', '1473', '1649', '1664', '1671', '1684',
  '1721', '1758', '1767', '1784', '1787', '1809', '1868', '1869', '1876', '5997', '5999',
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
  '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244',
  '245', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '263',
  '264', '265', '266', '267', '268', '269', '291', '297', '298', '299', '350', '351', '352', '353', '354',
  '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
  '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504',
  '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '670',
  '673', '674', '675', '676', '677', '678', '679', '680', '682', '683', '685', '686', '687', '688', '690',
  '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965',
  '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995',
  '996', '998', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46',
  '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65',
  '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '1', '7',
].sort((a, b) => b.length - a.length);

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

// services/backupService.ts
// TotalHealth: respaldo y restauración de datos de la aplicación.
//
// Soporta dos orígenes:
//   - 'mock': la base en memoria del modo desarrollo (npm run dev). Incluye
//     las tablas + los usuarios auth de demostración.
//   - 'db'  : la base real (Supabase). Respalda las tablas públicas vía el
//     service role; los usuarios de `auth.users` no se respaldan (pertenecen a
//     Supabase Auth) y se presupone que ya existen al restaurar.
//
// Los backups se guardan como JSON en `backend/backups/` y se pueden descargar
// para guardarlos fuera del servidor. `cargarDataInicial` restablece la base al
// seed mínimo (reset) con el que la app funciona de cero.

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { getSupabase } from '../config/supabase.js';
import { mockDump, resetMock, setMockData } from '../mock/client.js';
import { AUTH_USERS, SEED } from '../mock/seed.js';
import type { Row } from '../mock/store.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const FORMATO = 'totalhealth-backup-v1';

/** Directorio donde se guardan los respaldos (backend/backups). */
const BACKUP_DIR = path.resolve(import.meta.dirname, '../../backups');

export type Origen = 'mock' | 'db';

export interface AuthUserSeed {
  id: string;
  email: string;
  password: string;
}

export interface BackupData {
  tables: Record<string, Row[]>;
  authUsers?: AuthUserSeed[];
}

export interface BackupFile {
  formato: string;
  creado_at: string;
  origen: Origen;
  data: BackupData;
}

export interface BackupResumen {
  archivo: string;
  creado_at: string;
  origen: Origen;
  tablas: { tabla: string; filas: number }[];
  total: number;
}

/**
 * Orden de inserción seguro por FKs (padres antes que hijos). La tabla
 * `solicitudes_detalle` tiene una dependencia circular con `resultados`
 * (resultado_id <-> solicitud_detalle_id): se inserta sin `resultado_id` y se
 * re-enlaza después. El borrado recorre la lista en orden inverso.
 */
const TABLAS_EN_ORDEN: string[] = [
  'app_config',
  'paises',
  'categorias_medicas',
  'especialidades_medicas',
  'clinicas',
  'profiles',
  'pacientes',
  'examenes_laboratorio',
  'parametros_referencia',
  'tasas_cambio',
  'consultas',
  'vinculos_familiares',
  'disponibilidad_medico',
  'checkpoints_preanalitica',
  'reactivos',
  'reactivo_lotes',
  'reactivo_movimientos',
  'alertas_inventario',
  'portal_codigos',
  'notificaciones',
  'solicitudes',
  'solicitudes_detalle',
  'resultados',
  'recipes',
  'recipes_detalle',
  'paquetes',
  'paquete_examenes',
  'convenios',
  'promociones',
  'promocion_examenes',
  'tarjetas_prepago',
  'pagos',
  'caja_turnos',
  'facturas',
  'factura_lineas',
  'muestras_domicilio',
  'turnos',
  'solicitudes_preanalitica',
  'alertas_clinicas',
  'estudios_imagen',
  'imagenes_clinicas',
  'imagenes_accesos',
  'historial_clinico',
  'historial_correcciones',
  'notas_privadas',
  'evoluciones',
  'alertas_criticas',
  'interconsultas',
  'cuestionarios_historial',
  'cuestionario_adendas',
  'cuestionario_borrados',
  'audit_logs',
];

function asegurarDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function esOrigen(valor: unknown): valor is Origen {
  return valor === 'mock' || valor === 'db';
}

function origenActual(): Origen {
  return env.useMock ? 'mock' : 'db';
}

/** Nombre de archivo seguro (evita path traversal). */
export function nombreArchivoSeguro(archivo: string): boolean {
  return typeof archivo === 'string' && /^[a-zA-Z0-9._-]+\.json$/.test(archivo) && !archivo.includes('/') && !archivo.includes('..');
}

function resumenDesde(archivo: string, backup: BackupFile): BackupResumen {
  const tablas = Object.entries(backup.data.tables)
    .filter(([, filas]) => filas.length > 0)
    .map(([tabla, filas]) => ({ tabla, filas: filas.length }));
  return {
    archivo,
    creado_at: backup.creado_at,
    origen: backup.origen,
    tablas,
    total: tablas.reduce((n, t) => n + t.filas, 0),
  };
}

/** Lee el contenido de un backup guardado. */
export function leerBackup(archivo: string): BackupFile {
  if (!nombreArchivoSeguro(archivo)) {
    throw new Error('Nombre de archivo de respaldo inválido');
  }
  const ruta = path.join(BACKUP_DIR, archivo);
  if (!fs.existsSync(ruta)) throw new Error('El respaldo no existe en el servidor');
  const backup = JSON.parse(fs.readFileSync(ruta, 'utf8')) as BackupFile;
  if (backup.formato !== FORMATO || !backup.data?.tables || !esOrigen(backup.origen)) {
    throw new Error('El archivo no es un respaldo válido de TotalHealth');
  }
  return backup;
}

// ============================== CREAR ==============================

async function leerTablasDb(sb: SupabaseClient): Promise<Record<string, Row[]>> {
  const tablas: Record<string, Row[]> = {};
  for (const tabla of TABLAS_EN_ORDEN) {
    const { data, error } = await sb.from(tabla).select('*');
    // Tolerancia a esquemas con menos tablas: si la relación no existe se omite
    // (vacía), de modo que el respaldo no falle por una tabla ausente.
    if (error) {
      if (/does not exist|relation|not found/i.test(error.message)) continue;
      throw new Error(`No se pudo respaldar la tabla '${tabla}': ${error.message}`);
    }
    tablas[tabla] = (data ?? []) as Row[];
  }
  return tablas;
}

/** Crea un respaldo del origen indicado (o del actual) y lo guarda en disco. */
export async function crearBackup(origen?: Origen): Promise<BackupResumen> {
  const destino: Origen = origen ? origen : origenActual();
  const data: BackupData =
    destino === 'mock' ? mockDump() : { tables: await leerTablasDb(getSupabase()) };

  const backup: BackupFile = {
    formato: FORMATO,
    creado_at: new Date().toISOString(),
    origen: destino,
    data,
  };

  asegurarDir();
  const stamp = backup.creado_at.replace(/[:.]/g, '-');
  const archivo = `backup-${destino}-${stamp}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, archivo), JSON.stringify(backup, null, 2), 'utf8');
  return resumenDesde(archivo, backup);
}

// ============================ LISTAR / LEER ============================

export interface BackupListado {
  archivo: string;
  creado_at: string;
  origen: Origen;
  total: number;
  tamano_kb: number;
}

/** Lista los respaldos guardados en el servidor (más recientes primero). */
export function listarBackups(): BackupListado[] {
  asegurarDir();
  const archivos = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json') && nombreArchivoSeguro(f))
    .sort()
    .reverse();
  return archivos.map((archivo) => {
    const ruta = path.join(BACKUP_DIR, archivo);
    const stats = fs.statSync(ruta);
    try {
      const backup = leerBackup(archivo);
      return {
        archivo,
        creado_at: backup.creado_at,
        origen: backup.origen,
        total: resumenDesde(archivo, backup).total,
        tamano_kb: Math.round(stats.size / 1024),
      };
    } catch {
      return {
        archivo,
        creado_at: new Date(stats.mtime).toISOString(),
        origen: 'db',
        total: 0,
        tamano_kb: Math.round(stats.size / 1024),
      };
    }
  });
}

/** Devuelve el contenido crudo de un respaldo para descargarlo. */
export function descargarBackup(archivo: string): { contenido: string; backup: BackupFile } {
  const backup = leerBackup(archivo);
  return { contenido: fs.readFileSync(path.join(BACKUP_DIR, archivo), 'utf8'), backup };
}

// ============================= RESTAURAR =============================

async function vaciarDb(sb: SupabaseClient): Promise<void> {
  // Rompe la dependencia circular solicitudes_detalle <-> resultados.
  const { error: nulo } = await sb.from('solicitudes_detalle').update({ resultado_id: null }).not('id', 'is', null);
  if (nulo) throw new Error(`No se pudo limpiar 'solicitudes_detalle': ${nulo.message}`);

  for (const tabla of [...TABLAS_EN_ORDEN].reverse()) {
    const { error } = await sb.from(tabla).delete().not('id', 'is', null);
    if (error && !/does not exist|relation|not found/i.test(error.message)) {
      throw new Error(`No se pudo vaciar la tabla '${tabla}': ${error.message}`);
    }
  }
}

async function insertarDb(sb: SupabaseClient, tables: Record<string, Row[]>): Promise<void> {
  for (const tabla of TABLAS_EN_ORDEN) {
    const filas = tables[tabla];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    if (tabla === 'solicitudes_detalle') {
      // Circular: inserta sin resultado_id y lo re-enlaza tras los resultados.
      const sinResultado = filas.map(({ resultado_id: _r, ...resto }) => resto);
      const { error } = await sb.from(tabla).insert(sinResultado);
      if (error) throw new Error(`No se pudo restaurar la tabla '${tabla}': ${error.message}`);
      continue;
    }

    const { error } = await sb.from(tabla).insert(filas);
    if (error) throw new Error(`No se pudo restaurar la tabla '${tabla}': ${error.message}`);
  }

  // Re-enlaza resultado_id en solicitudes_detalle tras insertar resultados.
  const detalle = tables['solicitudes_detalle'];
  if (Array.isArray(detalle)) {
    for (const r of detalle) {
      if (!r.resultado_id) continue;
      const { error } = await sb.from('solicitudes_detalle').update({ resultado_id: r.resultado_id }).eq('id', r.id);
      if (error) throw new Error(`No se pudo re-enlazar el resultado del detalle ${r.id}: ${error.message}`);
    }
  }
}

async function restaurarDb(tables: Record<string, Row[]>): Promise<void> {
  const sb = getSupabase();
  await vaciarDb(sb);
  await insertarDb(sb, tables);
}

/** Restaura un backup en el entorno actual. El origen del backup debe coincidir
 * con el modo activo (mock ↔ db) para evitar mezclar datos incompatibles. */
export async function restaurarBackup(backup: BackupFile): Promise<BackupResumen> {
  const actual = origenActual();
  if (backup.origen !== actual) {
    throw new Error(
      `El respaldo es de origen '${backup.origen}' pero la app está en modo '${actual}'. ` +
        'Crea el respaldo en el mismo origen donde lo restaurarás.',
    );
  }

  if (actual === 'mock') {
    setMockData(backup.data.tables, backup.data.authUsers);
  } else {
    await restaurarDb(backup.data.tables);
  }

  const archivo = `restaurado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  return resumenDesde(archivo, backup);
}

// ========================= DATA INICIAL (RESET) =========================

/** Re-mapea ids de usuarios del seed (10000000-…) hacia los reales de auth.users. */
function remapearIds(filas: Row[], mapa: Map<string, string>): Row[] {
  return filas.map((r) => {
    const out: Row = {};
    for (const [clave, valor] of Object.entries(r)) {
      out[clave] = typeof valor === 'string' ? (mapa.get(valor) ?? valor) : valor;
    }
    return out;
  });
}

/**
 * Crea (si no existen) los usuarios demo en Supabase Auth y devuelve un mapa
 * del id del seed → id real de auth.users. Es necesario porque `profiles.id`
 * referencia `auth.users.id` y el seed usa ids fijos de demostración.
 */
async function asegurarUsuariosAuth(sb: SupabaseClient): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const { data: listado, error: listError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`No se pudo listar los usuarios: ${listError.message}`);

  const porEmail = new Map<string, string>((listado?.users ?? []).map((u) => [u.email ?? '', u.id]));
  for (const seed of AUTH_USERS) {
    const existente = porEmail.get(seed.email);
    if (existente) {
      mapa.set(seed.id, existente);
      continue;
    }
    const { data, error } = await sb.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`No se pudo crear el usuario demo ${seed.email}: ${error?.message ?? 'desconocido'}`);
    }
    mapa.set(seed.id, data.user.id);
  }
  return mapa;
}

/**
 * Restablece la base al seed inicial (data mínima y primordial) con la que la
 * app funciona de cero: catálogos, clínica demo, usuarios demo, exámenes y un
 * set básico de datos transaccionales. Funciona como un "reset database".
 */
export async function cargarDataInicial(origen?: Origen): Promise<BackupResumen> {
  const destino: Origen = origen ? origen : origenActual();

  if (destino === 'mock') {
    resetMock();
    const dump = mockDump();
    return resumenDesde('seed-inicial', {
      formato: FORMATO,
      creado_at: new Date().toISOString(),
      origen: 'mock',
      data: dump,
    });
  }

  const sb = getSupabase();
  const mapa = await asegurarUsuariosAuth(sb);
  const tablas: Record<string, Row[]> = {};
  for (const [tabla, filas] of Object.entries(SEED)) {
    tablas[tabla] = remapearIds(structuredClone(filas), mapa);
  }

  await restaurarDb(tablas);

  return resumenDesde('seed-inicial', {
    formato: FORMATO,
    creado_at: new Date().toISOString(),
    origen: 'db',
    data: { tables: tablas },
  });
}

/** Estado de datos del entorno actual, útil para la UI del módulo admin. */
export async function estadoBackup(): Promise<{
  modo: Origen;
  backups: BackupListado[];
  conteos: Record<string, number>;
}> {
  const sb = getSupabase();
  const conteos: Record<string, number> = {};
  if (env.useMock) {
    const dump = mockDump();
    for (const [tabla, filas] of Object.entries(dump.tables)) conteos[tabla] = filas.length;
  } else {
    for (const tabla of TABLAS_EN_ORDEN) {
      const { data, error } = await sb.from(tabla).select('id');
      if (!error) conteos[tabla] = (data ?? []).length;
    }
  }
  return { modo: origenActual(), backups: listarBackups(), conteos };
}
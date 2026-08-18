// modules/admin/backup.routes.ts
// TotalHealth: respaldo, restauración y carga de data inicial (reset) desde el
// panel de administración. Todos los endpoints están tras authRequired +
// requireRole(admin, super_root) (se montan dentro de admin.routes.ts).

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import {
  cargarDataInicial,
  crearBackup,
  descargarBackup,
  estadoBackup,
  leerBackup,
  listarBackups,
  nombreArchivoSeguro,
  restaurarBackup,
} from '../../services/backupService.js';
import { crearBackupSchema, resetInicialSchema, restaurarBackupSchema } from './admin.validators.js';

const router = Router();

/** GET /api/admin/backup — estado del entorno + respaldos guardados. */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await estadoBackup());
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/backup/crear — genera un respaldo (mock o db) en disco. */
router.post('/crear', validate(crearBackupSchema), async (req, res, next) => {
  try {
    const { origen } = req.body as z.infer<typeof crearBackupSchema>;
    const resumen = await crearBackup(origen);
    res.status(201).json(resumen);
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/backup/archivos — lista los respaldos del servidor. */
router.get('/archivos', async (_req, res, next) => {
  try {
    res.json(listarBackups());
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/backup/archivos/:archivo — descarga el JSON de un respaldo. */
router.get('/archivos/:archivo', async (req, res, next) => {
  try {
    const { archivo } = req.params;
    if (!nombreArchivoSeguro(archivo)) return next(badRequest('Nombre de respaldo inválido'));
    const { contenido } = descargarBackup(archivo);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    res.send(contenido);
  } catch (err) {
    next(notFound((err as Error).message));
  }
});

/**
 * POST /api/admin/backup/restaurar
 * Restaura un respaldo. `archivo` hace referencia a un backup guardado en el
 * servidor; `data` permite subir el JSON de un backup descargado previamente.
 */
router.post('/restaurar', validate(restaurarBackupSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof restaurarBackupSchema>;
    const backup = body.archivo ? leerBackup(body.archivo) : (body.data as Parameters<typeof restaurarBackup>[0]);
    const resumen = await restaurarBackup(backup);
    res.json(resumen);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/admin/backup/reset-inicial
 * Carga la data inicial (seed) mínima y primordial de la app — reset de datos.
 * En modo db recrea además los usuarios demo en Supabase Auth si no existen.
 */
router.post('/reset-inicial', validate(resetInicialSchema), async (req, res, next) => {
  try {
    const { origen } = req.body as z.infer<typeof resetInicialSchema>;
    const resumen = await cargarDataInicial(origen);
    res.json(resumen);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

export default router;
// modules/mocks/mocks.routes.ts
// TotalHealth: módulo de datos mock SOLO disponible en desarrollo.
// Expone toda la data del seed para facilitar las pruebas. En producción
// (mock desactivado) responde 404 antes de cualquier autenticación.
//
//   GET  /api/mocks          → resumen: credenciales demo + tablas y conteos
//   GET  /api/mocks/tables   → copia completa de todas las tablas del mock
//   GET  /api/mocks/tables/:tabla → filas de una tabla concreta
//   POST /api/mocks/reset    → restablece la base mock al seed inicial
//
// Acceso público: es una herramienta de desarrollo accesible sin login (solo
// existe con mock activo, es decir, bajo `npm run dev`).

import { Router } from 'express';
import { env } from '../../config/env.js';
import { notFound } from '../../utils/httpError.js';
import { mockInfo, mockTables, resetMock } from '../../mock/client.js';

const router = Router();

router.use((_req, res, next) => {
  if (!env.useMock) {
    return res.status(404).json({ error: { message: 'Mock no activo (solo disponible con npm run dev)' } });
  }
  next();
});

/** GET /api/mocks — resumen con credenciales demo y conteos por tabla. */
router.get('/', (_req, res) => {
  const tablas = mockTables();
  const listado = Object.entries(tablas).map(([tabla, filas]) => ({ tabla, filas: filas.length }));
  const total = listado.reduce((n, t) => n + t.filas, 0);
  res.json({ ...mockInfo(), tablas: listado, total });
});

/** GET /api/mocks/tables — todas las filas de todas las tablas. */
router.get('/tables', (_req, res) => {
  res.json(mockTables());
});

/** GET /api/mocks/tables/:tabla — filas de una tabla específica. */
router.get('/tables/:tabla', (req, res, next) => {
  const tablas = mockTables();
  const { tabla } = req.params;
  if (!(tabla in tablas)) {
    return next(notFound(`La tabla '${tabla}' no existe en el mock`));
  }
  res.json({ tabla, filas: tablas[tabla] });
});

/** POST /api/mocks/reset — restablece el seed inicial (solo dev). */
router.post('/reset', (_req, res) => {
  resetMock();
  res.json({ ok: true, mensaje: 'Base mock restablecida al seed inicial' });
});

export default router;
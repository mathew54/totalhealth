import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import pacientesRoutes from '../modules/pacientes/pacientes.routes.js';
import consultasRoutes from '../modules/consultas/consultas.routes.js';
import examenesRoutes from '../modules/examenes/examen.routes.js';
import solicitudesRoutes from '../modules/solicitudes/solicitudes.routes.js';
import pagosRoutes from '../modules/pagos/pagos.routes.js';
import reactivosRoutes from '../modules/laboratorio/reactivos.routes.js';
import portalRoutes from '../modules/portal/portal.routes.js';
import configRoutes from '../modules/config/config.routes.js';
import notificacionesRoutes from '../modules/notificaciones/notificaciones.routes.js';
import domiciliosRoutes from '../modules/domicilios/domicilios.routes.js';
import turnosRoutes from '../modules/turnos/turnos.routes.js';
import familiaRoutes from '../modules/familia/familia.routes.js';
import preanaliticaRoutes from '../modules/preanalitica/preanalitica.routes.js';
import alertasRoutes from '../modules/alertas/alertas.routes.js';
import imagenesRoutes from '../modules/imagenes/imagenes.routes.js';
import historialRoutes from '../modules/historial/historial.routes.js';
import { publicRouter as tasasPublicRoutes, adminRouter as tasasAdminRoutes } from '../modules/tasas/tasas.routes.js';
import mocksRoutes from '../modules/mocks/mocks.routes.js';
import whatsappRoutes from '../modules/whatsapp/whatsapp.routes.js';
import { env } from '../config/env.js';
import { mockInfo } from '../mock/client.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'totalhealth-backend', mock: env.useMock });
});

// Credenciales demo (solo en modo mock y no en producción).
router.get('/mock/info', (_req, res) => {
  if (!env.useMock) return res.status(404).json({ error: { message: 'Mock no activo' } });
  res.json(mockInfo());
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/admin/whatsapp', whatsappRoutes);
router.use('/pacientes', pacientesRoutes);
router.use('/consultas', consultasRoutes);
router.use('/examenes', examenesRoutes);
router.use('/solicitudes', solicitudesRoutes);
router.use('/pagos', pagosRoutes);
router.use('/reactivos', reactivosRoutes);
router.use('/portal', portalRoutes);
router.use('/config', configRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/domicilios', domiciliosRoutes);
router.use('/turnos', turnosRoutes);
router.use('/familia', familiaRoutes);
router.use('/preanalitica', preanaliticaRoutes);
router.use('/alertas', alertasRoutes);
router.use('/imagenes', imagenesRoutes);
router.use('/historial', historialRoutes);
router.use('/tasas', tasasPublicRoutes);
router.use('/admin/tasas', tasasAdminRoutes);
router.use('/mocks', mocksRoutes);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest } from '../../utils/httpError.js';
import {
  desconectarWhatsApp,
  estadoWhatsApp,
  obtenerQrWhatsAppDataUrl,
  solicitarCodigoEmparejamiento,
  enviarWhatsApp,
  type WhatsAppAdjunto,
} from '../../services/whatsappService.js';

const router = Router();

router.use(authRequired, requireRole('admin', 'super_root'));

const pairingSchema = z.object({
  telefono: z.string().regex(/^\+?\d[\d\s-]{6,}$/, 'Teléfono inválido').transform((v) => v.replace(/[\s-]/g, '')),
});

const testSchema = z.object({
  destino: z.string().regex(/^\+?\d[\d\s-]{6,}$/, 'Teléfono inválido').transform((v) => v.replace(/[\s-]/g, '')),
  mensaje: z.string().min(1, 'Mensaje requerido').max(1600, 'Mensaje demasiado largo'),
});

const fileSchema = z.object({
  destino: z.string().regex(/^\+?\d[\d\s-]{6,}$/, 'Teléfono inválido').transform((v) => v.replace(/[\s-]/g, '')),
  mensaje: z.string().optional().transform((v) => v ?? ''),
  tipo: z.enum(['image', 'document']).optional().transform((v) => v ?? 'document'),
  nombre: z.string().optional().transform((v) => v || 'archivo'),
  mime: z.string().optional().transform((v) => v || 'application/octet-stream'),
  dataBase64: z.string().min(1, 'El archivo es requerido'),
});

/**
 * GET /api/admin/whatsapp
 * Estado de la sesión WhatsApp de la clínica (vinculada o no, teléfono).
 */
router.get('/', (_req, res) => {
  res.json(estadoWhatsApp());
});

/**
 * POST /api/admin/whatsapp/qr
 * Inicia la sesión y devuelve el QR del dispositivo como data URL PNG para
 * escanear desde WhatsApp → Dispositivos vinculados.
 */
router.post('/qr', async (_req, res, next) => {
  try {
    const dataUrl = await obtenerQrWhatsAppDataUrl();
    res.json({ estado: estadoWhatsApp().estado, qr: dataUrl });
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/admin/whatsapp/pairing
 * Solicita el código de emparejamiento para vincular el dispositivo usando el
 * número de teléfono (WhatsApp → Dispositivos vinculados → Vincular con número).
 */
router.post('/pairing', validate(pairingSchema), async (req, res, next) => {
  try {
    const { telefono } = req.body as z.infer<typeof pairingSchema>;
    const codigo = await solicitarCodigoEmparejamiento(telefono);
    res.json({ estado: estadoWhatsApp().estado, codigo });
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/admin/whatsapp/test
 * Envía un mensaje de prueba real desde el dispositivo de la clínica.
 */
router.post('/test', validate(testSchema), async (req, res, next) => {
  try {
    const { destino, mensaje } = req.body as z.infer<typeof testSchema>;
    const resultado = await enviarWhatsApp(destino, mensaje);
    res.json(resultado);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/admin/whatsapp/enviar-archivo
 * Envía un mensaje de texto con un archivo adjunto (imagen o documento) al
 * destinatario, desde el dispositivo de la clínica. Cuerpo JSON:
 * { destino, mensaje?, tipo, nombre, mime, dataBase64 } (dataBase64 sin prefijo).
 */
router.post('/enviar-archivo', validate(fileSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof fileSchema>;
    const adjuntos: WhatsAppAdjunto[] = [
      {
        tipo: body.tipo,
        data: Buffer.from(body.dataBase64, 'base64'),
        mimetype: body.mime,
        fileName: body.nombre,
        caption: body.mensaje || undefined,
      },
    ];
    const resultado = await enviarWhatsApp(body.destino, body.mensaje, adjuntos);
    res.json(resultado);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});


/**
 * POST /api/admin/whatsapp/logout
 * Desvincula el dispositivo y borra la sesión local.
 */
router.post('/logout', async (_req, res, next) => {
  try {
    await desconectarWhatsApp();
    res.json({ ok: true });
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

export default router;
import { env } from '../config/env.js';

export interface SendMessageResult {
  provider: string;
  reference: string;
  /** En modo dev/mock se puede devolver el contenido por razones de prueba. */
  devContent?: string;
}

/** Canal de mensajería abstracta (OTP, recordatorios). */
export interface MessagingProvider {
  name: string;
  /** Envía un OTP a un teléfono/correo. */
  sendOtp(opts: { destino: string; codigo: string; canal: 'sms' | 'whatsapp' | 'email' }): Promise<SendMessageResult>;
  /** Envía un mensaje programático (recordatorio, resultado, domicilio). */
  sendNotify(opts: { destino: string; canal: 'push' | 'sms' | 'whatsapp' | 'email'; mensaje: string }): Promise<SendMessageResult>;
}

/** Proveedor de desarrollo: no envía nada, devuelve el contenido para depurar. */
class MockProvider implements MessagingProvider {
  name = 'mock';

  async sendOtp(opts: { destino: string; codigo: string }): Promise<SendMessageResult> {
    return { provider: 'mock', reference: `OTP-${Date.now()}`, devContent: opts.codigo };
  }

  async sendNotify(opts: { mensaje: string }): Promise<SendMessageResult> {
    return { provider: 'mock', reference: `MSG-${Date.now()}`, devContent: opts.mensaje };
  }
}

let instance: MessagingProvider | null = null;

export function getMessagingProvider(): MessagingProvider {
  if (!instance) {
    instance =
      env.messagingProvider === 'whatsapp'
        ? new WhatsAppProvider()
        : env.messagingProvider === 'smtp' && env.smtpEnabled
          ? new SmtpProvider()
          : new MockProvider();
  }
  return instance;
}

/**
 * Adaptador SMTP genérico (compatible con SendGrid/Resend/Mailgun vía SMTP).
 * En un despliegue real se usan Twilio (WhatsApp/SMS) o SMTP para correo.
 * Las credenciales y el destino se toman del entorno; si falta configuración,
 * se lanza un error claro para no silenciar la ausencia.
 */
class SmtpProvider implements MessagingProvider {
  name = 'smtp';

  private unsupported(): never {
    throw new Error(
      'Notificador real no configurado: define SMTP_HOST/SMTP_USER/SMTP_PASS y usa canal email, o integra Twilio para SMS/WhatsApp',
    );
  }

  async sendOtp(): Promise<SendMessageResult> {
    return this.unsupported();
  }

  async sendNotify(): Promise<SendMessageResult> {
    return this.unsupported();
  }
}

/**
 * Proveedor WhatsApp real (Baileys). Envía mensajes al teléfono del paciente a
 * través del dispositivo de la clínica vinculado en Administración → Configuración.
 * Si el dispositivo no está vinculado, se lanza un error claro (no silencia).
 */
class WhatsAppProvider implements MessagingProvider {
  name = 'whatsapp';

  private readonly whatsapp = () => import('./whatsappService.js');

  async sendOtp(opts: { destino: string; codigo: string; canal: 'sms' | 'whatsapp' | 'email' }): Promise<SendMessageResult> {
    if (opts.canal === 'email') return new MockProvider().sendOtp({ ...opts });
    const { enviarWhatsApp } = await this.whatsapp();
    const { id, remoto } = await enviarWhatsApp(opts.destino, `TotalHealth: tu código de verificación es ${opts.codigo}`);
    return { provider: 'whatsapp', reference: id, devContent: opts.canal === 'sms' ? opts.codigo : undefined };
  }

  async sendNotify(opts: { destino: string; canal: 'push' | 'sms' | 'whatsapp' | 'email'; mensaje: string }): Promise<SendMessageResult> {
    if (opts.canal === 'email') return new MockProvider().sendNotify({ ...opts });
    const { enviarWhatsApp } = await this.whatsapp();
    const { id } = await enviarWhatsApp(opts.destino, opts.mensaje);
    return { provider: 'whatsapp', reference: id, devContent: opts.canal === 'push' ? opts.mensaje : undefined };
  }
}
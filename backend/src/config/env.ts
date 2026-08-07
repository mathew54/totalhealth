import 'dotenv/config';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  useMock: (process.env.USE_MOCK ?? '') === 'true' || !process.env.SUPABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? 'mock-supabase-jwt-secret',
  portalTokenSecret: process.env.PORTAL_TOKEN_SECRET ?? 'dev-secret',
  portalTokenTtlMin: num(process.env.PORTAL_TOKEN_TTL_MIN, 30),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  otpMaxIntentos: num(process.env.OTC_MAX_INTENTOS, 5),
  // Bloqueo por intentos fallidos de login del backoffice.
  loginMaxIntentos: num(process.env.LOGIN_MAX_INTENTOS, 5),
  loginLockMin: num(process.env.LOGIN_LOCK_MIN, 15),
  // 'mock' (default en desarrollo) o 'pasarela' (proveedor real: pago móvil/transferencias/divisas).
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock',
  // 'mock' (default) o 'smtp' (proveedor real de mensajería: correo/Twilio).
  messagingProvider: process.env.MESSAGING_PROVIDER ?? 'mock',
  smtpEnabled: (process.env.SMTP_ENABLED ?? '') === 'true',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFrom: process.env.SMTP_FROM ?? '',
};

if (env.nodeEnv !== 'test' && !env.useMock) {
  console.warn('[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no definidos. Copia backend/.env.example a backend/.env');
}
if (env.useMock) {
  console.info('[config] Modo MOCK activado (data ficticia en memoria). Desactívalo con USE_MOCK=false y SUPABASE_URL definido.');
}

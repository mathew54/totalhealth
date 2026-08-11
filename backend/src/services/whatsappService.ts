import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export type WhatsAppEstado =
  | { estado: 'idle'; registrado: boolean; telefono: string | null }
  | { estado: 'abriendo'; registrado: boolean; telefono: string | null }
  | { estado: 'conectado'; registrado: boolean; telefono: string | null }
  | { estado: 'reintentando'; registrado: boolean; telefono: string | null; error?: string };

type Listener = { tipo: keyof typeof TIPOS; resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

const TIPOS = { qr: 'qr', open: 'open', connecting: 'connecting', close: 'close' } as const;

let sock: any = null;
let authState: { creds?: { registered?: boolean; me?: { id?: string } } } = {};
let saveCreds: (() => void) | null = null;
let estado: WhatsAppEstado['estado'] = 'idle';
let registrado = false;
let telefonoVinculado: string | null = null;
let ultimoQr: string | null = null;
let ultimoQrAt = 0;
let promesaSesion: Promise<any> | null = null;
let cerradoVoluntariamente = false;
let listenerId = 0;
const listeners = new Map<number, Listener>();

function esperarEvento<T>(tipo: keyof typeof TIPOS, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++listenerId;
    const timer = setTimeout(() => {
      listeners.delete(id);
      reject(new Error(`Sin evento '${tipo}' en ${timeoutMs} ms`));
    }, timeoutMs);
    listeners.set(id, {
      tipo,
      resolve: (v) => {
        clearTimeout(timer);
        listeners.delete(id);
        resolve(v as T);
      },
      reject,
      timer,
    });
  });
}

function emitir(tipo: keyof typeof TIPOS, valor: unknown) {
  for (const [, l] of Array.from(listeners)) {
    if (l.tipo === tipo) l.resolve(valor);
  }
}

function credsDisco(): { existe: boolean; registrado: boolean; me?: string; parcial: boolean } {
  try {
    const p = path.join(env.whatsappSessionDir, 'creds.json');
    if (!existsSync(p)) return { existe: false, registrado: false, parcial: false };
    const creds = JSON.parse(readFileSync(p, 'utf8'));
    const reg = Boolean(creds?.registered);
    const me: string | undefined = creds?.me?.id;
    // Sesión "parcial": tiene identidad (me) pero nunca terminó de registrarse.
    // Baileys intentará LOGIN en vez de emitir QR → hay que borrarla.
    return { existe: true, registrado: reg, me, parcial: !reg && Boolean(me) };
  } catch {
    return { existe: false, registrado: false, parcial: false };
  }
}

/** Lee el estado registrado desde disco sin conectar (para no abrir socket en idle). */
function leerCredsDisco(): { registrado: boolean; telefono: string | null } {
  const c = credsDisco();
  return { registrado: c.registrado, telefono: formatearTelefono(extractTelefono(c.me)) };
}

/** Borra el directorio de sesión si existe una sesión parcial/corrupta. */
async function limpiarSesionParcial(): Promise<void> {
  const c = credsDisco();
  if (c.existe && c.parcial) {
    console.warn('[whatsapp] sesión parcial detectada, reiniciando vinculación…');
    await rm(env.whatsappSessionDir, { recursive: true, force: true }).catch(() => undefined);
    ultimoQr = null;
    ultimoQrAt = 0;
  }
}

/** Normaliza un número a E.164 sin '+' y con código de país (VE por defecto: 58). */
export function normalizarNumeroWhatsApp(destino: string): string {
  let d = (destino ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length >= 11) d = `${env.whatsappPaisCodigo}${d.slice(1)}`;
  if (!d.startsWith(env.whatsappPaisCodigo)) d = `${env.whatsappPaisCodigo}${d}`;
  return d;
}

function extractTelefono(me?: string): string | null {
  if (!me) return null;
  const raw = me.split(':')[0] ?? null;
  if (!raw) return null;
  return raw.replace(/\D/g, '');
}

function formatearTelefono(digits: string | null): string | null {
  if (!digits) return null;
  const pais = env.whatsappPaisCodigo;
  if (digits.startsWith(pais) && digits.length > pais.length) return `+${digits}`;
  return digits;
}

async function crearSocket(): Promise<any> {
  const baileys = (await import('@whiskeysockets/baileys')) as any;
  const { makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;
  const { state, saveCreds: save } = await useMultiFileAuthState(env.whatsappSessionDir);
  authState = state;
  saveCreds = save;
  registrado = Boolean(state.creds?.registered);
  telefonoVinculado = formatearTelefono(extractTelefono(state.creds?.me?.id));

  const socketActual = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['TotalHealth', 'Chrome', '112'],
  });
  sock = socketActual;

  sock.ev.on('creds.update', () => saveCreds?.());

  sock.ev.on('connection.update', (update: any) => {
    // Si el socket global ya fue reemplazado (nueva vinculación/logout),
    // ignora los eventos del socket viejo para no reconectar ni emitir.
    if (sock !== socketActual) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      ultimoQr = qr;
      ultimoQrAt = Date.now();
      emitir('qr', qr);
    }
    if (connection === 'connecting') {
      estado = 'abriendo';
      registrado = Boolean(authState.creds?.registered);
      emitir('connecting', true);
    }
    if (connection === 'open') {
      estado = 'conectado';
      registrado = true;
      telefonoVinculado = formatearTelefono(extractTelefono(authState.creds?.me?.id));
      emitir('open', true);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode;
      if (cerradoVoluntariamente) return;
      if (code === DisconnectReason.loggedOut) {
        estado = 'idle';
        registrado = false;
        telefonoVinculado = null;
        emitir('close', 'loggedOut');
        return;
      }
      // 515 restartRequired, 428 connectionClosed, 408 timedOut → reconectar.
      estado = 'reintentando';
      setTimeout(() => {
        promesaSesion = null;
        void asegurarSesion();
      }, 1000);
      emitir('close', code);
    }
  });

  return sock;
}

async function asegurarSesion(): Promise<any> {
  if (sock && estado !== 'idle' && estado !== 'reintentando') return sock;
  if (promesaSesion) return promesaSesion;
  promesaSesion = crearSocket().finally(() => {
    promesaSesion = null;
  });
  return promesaSesion;
}

/** Estado actual sin abrir conexión si no hace falta. */
export function estadoWhatsApp(): WhatsAppEstado {
  if (sock && (estado === 'abriendo' || estado === 'conectado' || estado === 'reintentando')) {
    return { estado, registrado, telefono: telefonoVinculado } as WhatsAppEstado;
  }
  const disco = leerCredsDisco();
  // Si hay sesión registrada en disco pero el socket aún no abre, lo reportamos
  // como conectado: el dispositivo ya está vinculado y se conectará al enviar.
  if (disco.registrado) return { estado: 'conectado', registrado: true, telefono: disco.telefono };
  return { estado: 'idle', registrado: false, telefono: null };
}

/** Inicia una vinculación limpia (borra sesión parcial previa y cierra socket). */
async function iniciarVinculacion(): Promise<void> {
  if (sock) {
    cerradoVoluntariamente = true;
    try {
      sock.end(undefined);
    } catch {
      // ignorar
    }
    sock = null;
    setTimeout(() => {
      cerradoVoluntariamente = false;
    }, 500);
  }
  promesaSesion = null;
  estado = 'idle';
  registrado = false;
  telefonoVinculado = null;
  await limpiarSesionParcial();
}

/** Inicia la sesión y espera el primer QR (timeout 30 s). Devuelve el string QR. */
export async function obtenerQrWhatsApp(): Promise<string> {
  await iniciarVinculacion();
  if (credsDisco().registrado) throw new Error('El dispositivo ya está vinculado. Usa "Desvincular dispositivo" para cambiar de número.');
  if (ultimoQr && Date.now() - ultimoQrAt < 20_000) return ultimoQr;
  ultimoQr = null;
  // Registra el listener ANTES de crear el socket: Baileys emite 'connecting'
  // y el primer 'qr' durante la creación del socket, no después.
  const esperaQr = esperarEvento<string>('qr', 30_000);
  esperaQr.catch(() => undefined);
  await asegurarSesion();
  return esperaQr;
}

/** Solicita el código de emparejamiento para vincular por número de teléfono. */
export async function solicitarCodigoEmparejamiento(telefono: string): Promise<string> {
  await iniciarVinculacion();
  if (credsDisco().registrado) throw new Error('El dispositivo ya está vinculado. Usa "Desvincular dispositivo" para cambiar de número.');
  const numero = normalizarNumeroWhatsApp(telefono);

  // Registra el listener ANTES de crear el socket: Baileys emite 'connecting'
  // durante la creación del socket (process.nextTick), no después.
  const conectando = esperarEvento('connecting', 20_000);
  conectando.catch(() => undefined);
  await asegurarSesion();
  await conectando;
  // Margen para que el handshake termine y el socket pueda enviar el IQ de pairing.
  await new Promise((r) => setTimeout(r, 1500));
  const codigo: string = await sock.requestPairingCode(numero);
  // WhatsApp pide el código en formato XXXX-XXXX (con guion entre el 4º y 5º carácter).
  if (/^[0-9A-Z]{8}$/.test(codigo)) return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  return codigo;
}

/** Envía un mensaje de texto real. Throws si la sesión no está conectada. */
export async function enviarWhatsApp(destino: string, mensaje: string): Promise<{ id: string; remoto: string }> {
  await asegurarSesion();
  if (estado !== 'conectado') {
    await esperarEvento('open', 15_000).catch(() => {
      throw new Error('WhatsApp no conectado. Vincula el dispositivo en Administración → Configuración.');
    });
  }
  if (estado !== 'conectado') throw new Error('WhatsApp no conectado. Vincula el dispositivo en Administración → Configuración.');
  const numero = normalizarNumeroWhatsApp(destino);
  const res = await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensaje });
  return { id: res?.key?.id ?? 'unknown', remoto: res?.key?.remoteJid ?? `${numero}@s.whatsapp.net` };
}

/** Desvincula el dispositivo y borra la sesión local. */
export async function desconectarWhatsApp(): Promise<void> {
  cerradoVoluntariamente = true;
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ignorar: ya puede estar requiriendo reinicio
    }
    sock = null;
  }
  promesaSesion = null;
  estado = 'idle';
  registrado = false;
  telefonoVinculado = null;
  ultimoQr = null;
  await rm(env.whatsappSessionDir, { recursive: true, force: true }).catch(() => undefined);
  setTimeout(() => {
    cerradoVoluntariamente = false;
  }, 500);
}

/** Devuelve el QR renderizado como data URL PNG (para mostrar en el admin). */
export async function obtenerQrWhatsAppDataUrl(): Promise<string> {
  const qr = await obtenerQrWhatsApp();
  const { default: QRCode } = (await import('qrcode')) as any;
  return QRCode.toDataURL(qr);
}

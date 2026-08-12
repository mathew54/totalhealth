import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { resetMock } from '../src/mock/client.js'
import { normalizarTelefono, telefonoValido, enviarInmediata } from '../src/services/notifier.js'

let server: Server
let base: string

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function login(cedula: string) {
  const r = await api('/api/auth/login', { method: 'POST', body: { cedula, password: 'demo1234' } })
  return r.body.access_token as string
}

beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address()
      base = `http://127.0.0.1:${(addr as { port: number }).port}`
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
})

beforeEach(() => {
  resetMock()
})

const SEC = 'V-33445566' // Ana Gómez (secretaria)
const PAC1 = '20000000-0000-0000-0000-000000000001'

describe('Notificaciones: recordatorios automáticos y mantenimiento', () => {
  it('el rol secretaria accede a la cola y a los jobs', async () => {
    const token = await login(SEC)

    const cola = await api('/api/notificaciones', { token })
    expect(cola.status).toBe(200)
    expect(Array.isArray(cola.body)).toBe(true)

    const job = await api('/api/notificaciones/enviar-pendientes', { method: 'POST', token })
    expect(job.status).toBe(200)
    expect(typeof job.body.enviadas).toBe('number')
  })

  it('genera recordatorios de cada tipo sin duplicar los existentes', async () => {
    const token = await login(SEC)

    const res = await api('/api/notificaciones/generar-recordatorios', { method: 'POST', token })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const resumen = res.body.resumen
    expect(typeof resumen.citas).toBe('number')
    expect(typeof resumen.resultados).toBe('number')
    expect(typeof resumen.turnos).toBe('number')
    expect(typeof resumen.domicilios).toBe('number')

    // Segunda ejecución: no debe duplicar los ya generados.
    const res2 = await api('/api/notificaciones/generar-recordatorios', { method: 'POST', token })
    expect(res2.status).toBe(200)
    for (const key of ['citas', 'resultados', 'turnos', 'domicilios']) {
      expect(res2.body.resumen[key] ?? 0).toBe(0)
    }
  })

  it('limpia solo el historial de notificaciones enviadas', async () => {
    const token = await login(SEC)

    const cola = await api('/api/notificaciones', { token })
    const enviadasAntes = cola.body.filter((n: { estado: string }) => n.estado === 'enviada').length
    expect(enviadasAntes).toBeGreaterThan(0)

    const res = await api('/api/notificaciones/limpiar-enviadas', { method: 'POST', token })
    expect(res.status).toBe(200)
    expect(res.body.eliminadas).toBe(enviadasAntes)

    const cola2 = await api('/api/notificaciones', { token })
    const enviadasDespues = cola2.body.filter((n: { estado: string }) => n.estado === 'enviada').length
    expect(enviadasDespues).toBe(0)
  })

  it('crea una notificación manual en estado pendiente', async () => {
    const token = await login(SEC)

    const res = await api('/api/notificaciones', {
      method: 'POST',
      token,
      body: {
        paciente_id: PAC1,
        telefono: '04141234567',
        canal: 'sms',
        tipo: 'pago',
        mensaje: 'Juan, tienes un pago pendiente de $15.00.',
        programada_para: new Date(Date.now() + 3600_000).toISOString(),
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)

    const cola = await api('/api/notificaciones', { token })
    const creada = cola.body.find((n: { id: string }) => n.id === res.body.id)
    expect(creada).toBeTruthy()
    expect(creada.estado).toBe('pendiente')
    expect(creada.tipo).toBe('pago')
    expect(creada.telefono).toBe('+584141234567')
  })

  it('envía pendientes por lote de IDs y las marca como enviadas', async () => {
    const token = await login(SEC)

    const res = await api('/api/notificaciones', {
      method: 'POST',
      token,
      body: {
        paciente_id: PAC1,
        canal: 'sms',
        tipo: 'turno',
        mensaje: 'Juan, tu turno es el número 9.',
        programada_para: new Date(Date.now() - 60_000).toISOString(),
      },
    })
    expect(res.status).toBe(201)

    const lote = await api('/api/notificaciones/enviar-pendientes', {
      method: 'POST',
      token,
      body: { ids: [res.body.id] },
    })
    expect(lote.status).toBe(200)
    expect(lote.body.enviadas).toBe(1)
    expect(lote.body.fallidas).toBe(0)

    const { data } = await getColaInterna()
    const notif = data.find((n: { id: string }) => n.id === res.body.id)
    expect(notif.estado).toBe('enviada')
    expect(notif.sent_at).toBeTruthy()
  })

  it('marca como fallida una pendiente sin teléfono válido', async () => {
    const token = await login(SEC)

    const res = await api('/api/notificaciones', {
      method: 'POST',
      token,
      body: {
        paciente_id: '20000000-0000-0000-0000-000000000005', // menor sin teléfono
        canal: 'sms',
        tipo: 'cita',
        mensaje: 'Recordatorio de cita de control.',
        programada_para: new Date(Date.now() - 60_000).toISOString(),
      },
    })
    expect(res.status).toBe(201)

    const lote = await api('/api/notificaciones/enviar-pendientes', {
      method: 'POST',
      token,
      body: { ids: [res.body.id] },
    })
    expect(lote.body.enviadas).toBe(0)
    expect(lote.body.fallidas).toBe(1)

    const { data } = await getColaInterna()
    const notif = data.find((n: { id: string }) => n.id === res.body.id)
    expect(notif.estado).toBe('fallida')
    expect(notif.error).toContain('Teléfono')
  })

  it('los resultados se envían de inmediato (no pasan por pendiente)', async () => {
    // Envío directo del servicio (lo que dispara la publicación de un examen).
    const ok = await enviarInmediata({
      pacienteId: PAC1,
      tipo: 'resultado',
      mensaje: 'Juan Pérez, el resultado de Colesterol Total ya está disponible. Consúltalo desde tu portal.',
    })
    expect(ok).toBe(true)

    const { data } = await getColaInterna()
    const resultadoNotif = (data ?? []).find((n: { tipo: string; mensaje: string }) => n.tipo === 'resultado' && String(n.mensaje).includes('Colesterol Total'))
    expect(resultadoNotif).toBeTruthy()
    expect(resultadoNotif.estado).toBe('enviada')
    expect(resultadoNotif.sent_at).toBeTruthy()
    expect((data ?? []).some((n: { estado: string; tipo: string }) => n.estado === 'pendiente' && n.tipo === 'resultado')).toBe(false)
  })
})

describe('normalizarTelefono / telefonoValido', () => {
  it('agrega prefijo +58 a números locales venezolanos', () => {
    expect(normalizarTelefono('04141234567')).toBe('+584141234567')
    expect(normalizarTelefono('+58 414-1234567')).toBe('+584141234567')
    expect(normalizarTelefono('  (0414) 123-45-67 ')).toBe('+584141234567')
  })

  it('valida formato E.164 (prefijo + entre 8 y 15 dígitos)', () => {
    expect(telefonoValido('+584141234567')).toBe(true)
    expect(telefonoValido('04141234567')).toBe(true)
    expect(telefonoValido('+15551234567')).toBe(true)
    expect(telefonoValido('')).toBe(false)
    expect(telefonoValido('abc')).toBe(false)
    expect(telefonoValido('+1')).toBe(false)
  })
})

async function getColaInterna() {
  const mod = await import('../src/config/supabase.js')
  const { data } = await mod.getSupabase().from('notificaciones').select('*')
  return { data }
}

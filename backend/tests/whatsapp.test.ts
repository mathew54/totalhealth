import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { normalizarNumeroWhatsApp } from '../src/services/whatsappService.js'

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
  return api('/api/auth/login', { method: 'POST', body: { cedula, password: 'demo1234' } })
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

const ADMIN = 'V-11222333' // Dr. Luis Contreras (admin)

describe('WhatsApp como método de mensajería', () => {
  let token = ''

  it('requiere sesión de admin', async () => {
    const res = await api('/api/admin/whatsapp')
    expect(res.status).toBe(401)
  })

  it('el estado inicial es idle/sin vincular', async () => {
    token = (await login(ADMIN)).body.access_token
    expect(token).toBeTruthy()
    const res = await api('/api/admin/whatsapp', { token })
    expect(res.status).toBe(200)
    expect(['idle', 'abriendo', 'conectado', 'reintentando']).toContain(res.body.estado)
  })

  it('rechaza números de teléfono inválidos en pairing y test', async () => {
    const bad = await api('/api/admin/whatsapp/pairing', { method: 'POST', token, body: { telefono: 'abc' } })
    expect(bad.status).toBe(400)

    const badTest = await api('/api/admin/whatsapp/test', { method: 'POST', token, body: { destino: 'no-es-tlf', mensaje: 'Hola' } })
    expect(badTest.status).toBe(400)

    const badMsg = await api('/api/admin/whatsapp/test', { method: 'POST', token, body: { destino: '+584244458116', mensaje: '' } })
    expect(badMsg.status).toBe(400)
  })

  it('normaliza teléfonos venezolanos a E.164 sin muestreo de red', () => {
    expect(normalizarNumeroWhatsApp('04244458116')).toBe('584244458116')
    expect(normalizarNumeroWhatsApp('+584244458116')).toBe('584244458116')
    expect(normalizarNumeroWhatsApp('584244458116')).toBe('584244458116')
    expect(normalizarNumeroWhatsApp('04121234567')).toBe('584121234567')
  })
})
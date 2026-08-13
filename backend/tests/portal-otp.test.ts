import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'

let server: Server
let base: string

async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text && text !== '' ? JSON.parse(text) : null }
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
afterAll(() => server?.close())

describe('Portal del paciente: flujo OTP', () => {
  it('genera el código para la cédula V-19021231 y permite verificar con él', async () => {
    const gen = await api('/api/portal/generar-codigo', { method: 'POST', body: { cedula: 'V-19021231' } })
    expect(gen.status).toBe(200)
    expect(gen.body.ok).toBe(true)
    expect(gen.body.dev_codigo).toMatch(/^\d{6}$/)

    const ver = await api('/api/portal/verificar', { method: 'POST', body: { cedula: 'V-19021231', codigo: gen.body.dev_codigo } })
    expect(ver.status).toBe(200)
    expect(ver.body.token).toBeTruthy()
    expect(ver.body.paciente.nombre_completo).toBe('Andrés Salazar Quintana')
  })

  it('no revela la existencia de una cédula desconocida', async () => {
    const gen = await api('/api/portal/generar-codigo', { method: 'POST', body: { cedula: 'V-00000000' } })
    expect(gen.status).toBe(200)
    expect(gen.body.ok).toBe(true)
    expect(gen.body.dev_codigo).toBeUndefined()
  })
})

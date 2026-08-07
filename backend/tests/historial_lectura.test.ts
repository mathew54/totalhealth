import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'

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

const PACIENTE = '20000000-0000-0000-0000-000000000001'
const CUESTIONARIO = '9E100000-0000-0000-0000-000000000001'

describe('Historial: lectura global del cuerpo médico', () => {
  it('un médico sin consultas con el paciente puede listar sus cuestionarios y leer el detalle', async () => {
    // Dra. Ana Suárez (cardióloga) no tiene consultas registradas con el paciente.
    const token = (await login('V-88776655')).body.access_token
    expect(token).toBeTruthy()

    const lista = await api(`/api/historial/pacientes/${PACIENTE}/cuestionarios`, { token })
    expect(lista.status).toBe(200)
    expect(Array.isArray(lista.body)).toBe(true)
    expect(lista.body.length).toBeGreaterThan(0)

    const detalle = await api(`/api/historial/cuestionarios/${CUESTIONARIO}`, { token })
    expect(detalle.status).toBe(200)
    expect(detalle.body.paciente_id).toBe(PACIENTE)
  })

  it('el expediente compartido también es accesible para cualquier médico', async () => {
    const token = (await login('V-88776655')).body.access_token
    const exp = await api(`/api/historial/pacientes/${PACIENTE}`, { token })
    expect(exp.status).toBe(200)
    expect(Array.isArray(exp.body.historial)).toBe(true)
    expect(Array.isArray(exp.body.interconsultas)).toBe(true)
  })

  it('el médico encuentra y abre a cualquier paciente (búsqueda + detalle)', async () => {
    const token = (await login('V-88776655')).body.access_token
    const busqueda = await api('/api/pacientes?q=V-12345678', { token })
    expect(busqueda.status).toBe(200)
    expect(busqueda.body.some((p: { id: string }) => p.id === PACIENTE)).toBe(true)

    const detalle = await api(`/api/pacientes/${PACIENTE}`, { token })
    expect(detalle.status).toBe(200)
    expect(detalle.body.id).toBe(PACIENTE)
  })
})

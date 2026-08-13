import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'

let server: Server
let base: string
async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      resolve()
    })
  })
})
afterAll(() => server?.close())

const PACIENTE = '20000000-0000-0000-0000-000000000003' // Carlos: sin cuestionario en seed

describe('Anamnesis sin cuestionario previo', () => {
  it('crea borrador al primer toggle y permite guardar respuestas (draft completo)', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { cedula: 'V-99888777', password: 'demo1234' } })
    const token = login.body.access_token

    const vacio = await api(`/api/historial/pacientes/${PACIENTE}/cuestionarios`, { token })
    expect(vacio.body.length).toBe(0)

    const def = await api('/api/historial/cuestionarios/definicion', { token })
    // Draft vacío tal y como lo construye respuestasVacias() en el frontend
    const resp: Record<string, unknown> = {}
    for (const mod of def.body.modulos) {
      for (const item of mod.items) resp[item.clave] = { marcado: false, detalle: null }
    }

    const creado = await api(`/api/historial/pacientes/${PACIENTE}/cuestionarios`, { method: 'POST', token })
    expect(creado.status).toBe(201)
    expect(creado.body.estado).toBe('borrador')

    const toggled: Record<string, unknown> = {
      ...resp,
      alergias: { marcado: true, detalle: 'Penicilina' },
      actividad_fisica: { marcado: true, detalle: '3x/semana' },
    }
    const patch = await api(`/api/historial/cuestionarios/${creado.body.id}/respuestas`, {
      method: 'PATCH',
      token,
      body: { respuestas: toggled },
    })
    expect(patch.status).toBe(200)
    expect(patch.body.respuestas.alergias.marcado).toBe(true)
    expect(patch.body.respuestas.actividad_fisica.marcado).toBe(true)
    expect(patch.body.respuestas.alergias.detalle).toBe('Penicilina')
  })
})
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

describe('Histórico de evoluciones SOAP', () => {
  it('devuelve evaluaciones previas con autor, ordenadas por fecha', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { cedula: 'V-99888777', password: 'demo1234' } })
    const token = login.body.access_token

    const res = await api('/api/expediente/evoluciones?paciente_id=20000000-0000-0000-0000-000000000001', { token })
    expect(res.status).toBe(200)
    const lista = res.body
    expect(lista.length).toBeGreaterThanOrEqual(2)

    // Ordenadas por fecha descendente
    const fechas = lista.map((e: { created_at: string }) => new Date(e.created_at).getTime())
    for (let i = 1; i < fechas.length; i++) expect(fechas[i - 1]).toBeGreaterThanOrEqual(fechas[i])

    // Info útil: SOAP + autor + especialidad
    const primera = lista[0]
    expect(primera.medico_nombre).toBeTruthy()
    expect(primera.especialidad_nombre).toBeTruthy()
    expect(typeof primera.subjetivo).toBe('string')
    expect(primera.signos_vitales).toBeDefined()
  })

  it('permite crear una evolución nueva y aparece en el histórico', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { cedula: 'V-99888777', password: 'demo1234' } })
    const token = login.body.access_token

    const antes = await api('/api/expediente/evoluciones?paciente_id=20000000-0000-0000-0000-000000000002', { token })
    expect(antes.body.length).toBeGreaterThanOrEqual(1)

    const crear = await api('/api/expediente/evoluciones', {
      method: 'POST',
      token,
      body: {
        paciente_id: '20000000-0000-0000-0000-000000000002',
        especialidad_id: 'medicina_general',
        subjetivo: 'Referida nueva evaluación.',
        objetivo: 'Examen sin particularidades.',
        evaluacion: 'Mejora del cuadro previo.',
        plan: 'Continuar tratamiento y control en 3 semanas.',
        signos_vitales: { peso_kg: 62, frecuencia_cardiaca: 78 },
      },
    })
    expect(crear.status).toBe(201)

    const despues = await api('/api/expediente/evoluciones?paciente_id=20000000-0000-0000-0000-000000000002', { token })
    expect(despues.body.length).toBe(antes.body.length + 1)
    expect(despues.body[0].medico_nombre).toBeTruthy()
  })
})
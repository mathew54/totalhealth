import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { SEED } from '../src/mock/seed.js'

let server: Server
let base: string

async function api(path: string) {
  const res = await fetch(`${base}${path}`)
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

// La receta activa 2 (paciente 1) está firmada en el seed.
const receta = SEED.recipes.find((r) => r.id === '80000000-0000-0000-0000-000000000002')

describe('Punto 7 — Verificación de receta digital', () => {
  it('rechaza una firma inválida/ausente', async () => {
    const res = await api(`/api/portal/recipes/${receta!.id}/verificar?hash=incorrecto`)
    expect(res.status).toBe(200)
    expect(res.body.valida).toBe(false)
    expect(res.body.auto).toBe('no_coincide')
  })

  it('valida la receta con el hash correcto y devuelve los medicamentos', async () => {
    const res = await api(`/api/portal/recipes/${receta!.id}/verificar?hash=${receta!.firma_hash}`)
    expect(res.status).toBe(200)
    expect(res.body.valida).toBe(true)
    expect(res.body.auto).toBe('coincide')
    expect(res.body.medicamentos.length).toBeGreaterThan(0)
    expect(res.body.medicamentos[0]).toHaveProperty('medicamento')
    expect(res.body.paciente).toBeTruthy()
  })
})

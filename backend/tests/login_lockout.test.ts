import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { resetMock, getMockClient } from '../src/mock/client.js'

const CEDULA = 'V-33445566' // secretaria demo
const PASSWORD = 'demo1234'

let server: Server
let base: string

async function login(cedula: string, password: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cedula, password }),
  })
  const body = await res.json()
  return { status: res.status, body }
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

describe('bloqueo por intentos fallidos de login', () => {
  it('tras N intentos fallidos devuelve 423 con retry_after (incluso con contraseña correcta)', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await login(CEDULA, 'clave-incorrecta')
      expect(r.status).toBe(401)
      expect(r.body.error.code).toBe('AUTH_FAILED')
    }

    // El quinto intento dispara el bloqueo.
    const quinto = await login(CEDULA, 'clave-incorrecta')
    expect(quinto.status).toBe(423)
    expect(quinto.body.error.code).toBe('ACCOUNT_LOCKED')
    expect(quinto.body.error.retry_after).toBeGreaterThan(0)

    // Con la contraseña correcta sigue bloqueado hasta que expire la ventana.
    const correctoBloqueado = await login(CEDULA, PASSWORD)
    expect(correctoBloqueado.status).toBe(423)
    expect(correctoBloqueado.body.error.retry_after).toBeGreaterThan(0)
  })

  it('un login correcto reinicia los contadores', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await login(CEDULA, 'clave-incorrecta')).status).toBe(401)
    }
    const ok = await login(CEDULA, PASSWORD)
    expect(ok.status).toBe(200)
    expect(ok.body.access_token).toBeTruthy()

    // Reiniciado: se necesitan otras 5 fallas para bloquear de nuevo.
    for (let i = 0; i < 4; i++) {
      expect((await login(CEDULA, 'clave-incorrecta')).status).toBe(401)
    }
    expect((await login(CEDULA, 'clave-incorrecta')).status).toBe(423)
  })

  it('un bloqueo vencido permite el login', async () => {
    await getMockClient()
      .from('profiles')
      .update({ login_intentos: 0, bloqueado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq('cedula', CEDULA)

    const ok = await login(CEDULA, PASSWORD)
    expect(ok.status).toBe(200)
    expect(ok.body.access_token).toBeTruthy()
  })

  it('una cédula inexistente responde 401 sin contabilizar nada', async () => {
    const r = await login('V-00000000', 'clave-incorrecta')
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('AUTH_FAILED')

    // El perfil real sigue intacto: 4 fallos no bloquean aún.
    for (let i = 0; i < 4; i++) {
      expect((await login(CEDULA, 'clave-incorrecta')).status).toBe(401)
    }
    const ok = await login(CEDULA, PASSWORD)
    expect(ok.status).toBe(200)
  })
})

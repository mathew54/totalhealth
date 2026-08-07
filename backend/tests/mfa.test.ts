import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { resetMock, mockTables } from '../src/mock/client.js'
import { codigoTotp, generarSecreto, otpauthUri, validarCodigo, base32Decode } from '../src/services/totp.js'

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

beforeEach(() => {
  resetMock()
  delete process.env.FIELD_ENCRYPTION_KEY
})

describe('TOTP (RFC 6238)', () => {
  it('codigoTotp es determinista y genera 6 dígitos', () => {
    const s = generarSecreto()
    expect(codigoTotp(s)).toMatch(/^\d{6}$/)
    expect(codigoTotp(s, 1_700_000_000_000)).toBe(codigoTotp(s, 1_700_000_000_000))
  })

  it('validarCodigo acepta el código correcto y rechaza otros', () => {
    const s = generarSecreto()
    const ahora = Date.now()
    const codigo = codigoTotp(s, ahora)
    expect(validarCodigo(s, codigo, 1, ahora)).toBe(true)
    expect(validarCodigo(s, '000000', 1, ahora)).toBe(false)
    expect(validarCodigo(s, codigoTotp(s, ahora - 30_000), 1, ahora)).toBe(true)
  })

  it('generarSecreto/base32Decode son compatibles (round-trip)', () => {
    const s = generarSecreto()
    expect(base32Decode(s).length).toBe(20)
    expect(s).toMatch(/^[A-Z2-7]+$/)
  })

  it('otpauthUri incluye el secreto y el emisor', () => {
    const uri = otpauthUri('ABCDEFGH', 'admin@totalhealth.local')
    expect(uri).toContain('otpauth://totp/')
    expect(uri).toContain('secret=ABCDEFGH')
    expect(uri).toContain('issuer=TotalHealth')
  })
})

describe('MFA en la API', () => {
  it('flujo completo: setup → verify → login pide 2FA → verify-login entrega sesión', async () => {
    const token = (await login('V-11222333')).body.access_token // admin

    // No puede haber MFA antes de activarlo: /me lo reporta falso.
    const me = await api('/api/auth/me', { token })
    expect(me.body.mfa_activo).toBe(false)

    const setup = await api('/api/auth/mfa/setup', { method: 'POST', token })
    expect(setup.status).toBe(200)
    expect(setup.body.secret).toBeTruthy()
    expect(setup.body.otpauth_url).toContain('otpauth://totp/')
    // El secreto se persiste cifrado solo si hay clave configurada; sin clave, en claro.
    expect(String(mockTables().profiles.find((p) => p.cedula === 'V-11222333')?.mfa_secret)).toBeTruthy()

    const okVerify = await api('/api/auth/mfa/verify', { method: 'POST', token, body: { code: codigoTotp(setup.body.secret) } })
    expect(okVerify.status).toBe(200)
    expect(okVerify.body.activo).toBe(true)

    // Tras activar, /me lo reporta y el login exige el segundo factor.
    expect((await api('/api/auth/me', { token })).body.mfa_activo).toBe(true)
    const loginRes = await login('V-11222333')
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.mfa_required).toBe(true)
    expect(loginRes.body.mfa_token).toBeTruthy()
    expect(loginRes.body.access_token).toBeUndefined()

    const sesion = await api('/api/auth/mfa/verify-login', {
      method: 'POST',
      body: { mfa_token: loginRes.body.mfa_token, code: codigoTotp(setup.body.secret) },
    })
    expect(sesion.status).toBe(200)
    expect(sesion.body.access_token).toBeTruthy()
  })

  it('código MFA incorrecto en verify-login → 401; repetir agota el token → 423', async () => {
    const token = (await login('V-11222333')).body.access_token
    const setup = await api('/api/auth/mfa/setup', { method: 'POST', token })
    await api('/api/auth/mfa/verify', { method: 'POST', token, body: { code: codigoTotp(setup.body.secret) } })

    const loginRes = await login('V-11222333')
    for (let i = 0; i < 4; i++) {
      const r = await api('/api/auth/mfa/verify-login', { method: 'POST', body: { mfa_token: loginRes.body.mfa_token, code: '999999' } })
      expect(r.status).toBe(401)
    }
    const agotado = await api('/api/auth/mfa/verify-login', { method: 'POST', body: { mfa_token: loginRes.body.mfa_token, code: '999999' } })
    expect(agotado.status).toBe(423)
  })

  it('desactivar exige un código válido y restaura el login directo', async () => {
    const token = (await login('V-11222333')).body.access_token
    const setup = await api('/api/auth/mfa/setup', { method: 'POST', token })
    await api('/api/auth/mfa/verify', { method: 'POST', token, body: { code: codigoTotp(setup.body.secret) } })

    const malo = await api('/api/auth/mfa/desactivar', { method: 'POST', token, body: { code: '000000' } })
    expect(malo.status).toBe(401)

    const ok = await api('/api/auth/mfa/desactivar', { method: 'POST', token, body: { code: codigoTotp(setup.body.secret) } })
    expect(ok.status).toBe(200)
    expect(ok.body.activo).toBe(false)

    const loginRes = await login('V-11222333')
    expect(loginRes.body.mfa_required).toBeUndefined()
    expect(loginRes.body.access_token).toBeTruthy()
  })

  it('solo admin/super_root pueden configurar MFA', async () => {
    const token = (await login('V-33445566')).body.access_token // secretaria
    const r = await api('/api/auth/mfa/setup', { method: 'POST', token })
    expect(r.status).toBe(403)
  })

  it('con FIELD_ENCRYPTION_KEY el secreto se guarda cifrado en reposo', async () => {
    process.env.FIELD_ENCRYPTION_KEY = 'clave-mfa-test'
    const token = (await login('V-11222333')).body.access_token
    const setup = await api('/api/auth/mfa/setup', { method: 'POST', token })
    expect(setup.body.secret).toBeTruthy()
    const guardado = String(mockTables().profiles.find((p) => p.cedula === 'V-11222333')?.mfa_secret)
    expect(guardado).toMatch(/^enc:v1:/)
    expect(guardado).not.toContain(setup.body.secret)

    // Y aún así el login con 2FA funciona descifrando el secreto.
    await api('/api/auth/mfa/verify', { method: 'POST', token, body: { code: codigoTotp(setup.body.secret) } })
    const loginRes = await login('V-11222333')
    const sesion = await api('/api/auth/mfa/verify-login', { method: 'POST', body: { mfa_token: loginRes.body.mfa_token, code: codigoTotp(setup.body.secret) } })
    expect(sesion.body.access_token).toBeTruthy()
  })
})

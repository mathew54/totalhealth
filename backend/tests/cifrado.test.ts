import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { resetMock, mockTables } from '../src/mock/client.js'
import { encryptCampo, decryptCampo, cifradoActivo } from '../src/services/cifrado.js'

const CLAVE = 'clave-de-prueba-para-cifrado-en-reposo'

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
  delete process.env.FIELD_ENCRYPTION_KEY
})

describe('cifrado de campos (servicio)', () => {
  it('round-trip con clave (AES-256-GCM), incluidos acentos y emojis', () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    const original = '+58 412-345.678 — María José 🩺'
    const cifrado = encryptCampo(original)
    expect(cifrado).toMatch(/^enc:v1:/)
    expect(cifrado).not.toBe(original)
    expect(decryptCampo(cifrado)).toBe(original)
    expect(cifradoActivo()).toBe(true)
  })

  it('valores nulos o vacíos se devuelven como null', () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    expect(encryptCampo(null)).toBeNull()
    expect(encryptCampo('')).toBeNull()
    expect(decryptCampo(null)).toBeNull()
    expect(decryptCampo('')).toBeNull()
  })

  it('valores en claro legados se devuelven tal cual (sin romper seed/datos previos)', () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    expect(decryptCampo('+584121111111')).toBe('+584121111111')
    expect(decryptCampo('sha256:demo-firma')).toBe('sha256:demo-firma')
  })

  it('sin clave el modo es transparente (dev/mock)', () => {
    expect(cifradoActivo()).toBe(false)
    expect(encryptCampo('+584121111111')).toBe('+584121111111')
    expect(decryptCampo('+584121111111')).toBe('+584121111111')
  })

  it('clave incorrecta no rompe: devuelve el valor tal cual (fail-open)', () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    const cifrado = encryptCampo('+584121111111')
    process.env.FIELD_ENCRYPTION_KEY = 'otra-clave-distinta'
    expect(decryptCampo(cifrado)).toBe(cifrado)
  })
})

describe('cifrado en reposo en la API', () => {
  it('staff: al crear, teléfono y firma se guardan cifrados y se leen descifrados', async () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    const token = await login('V-11222333') // admin

    const creado = await api('/api/admin/staff', {
      method: 'POST',
      token,
      body: {
        email: 'nueva.dra@totalhealth.local',
        password: 'demo1234',
        roles: ['medico'],
        nombre_completo: 'Dra. Nueva Prueba',
        cedula: 'V-11223344',
        telefono: '+584130000000',
        firma_digital: 'sha256:firma-nueva',
      },
    })
    expect(creado.status).toBe(201)
    expect(creado.body.telefono).toBe('+584130000000')
    expect(creado.body.firma_digital).toBe('sha256:firma-nueva')

    // En la base mock el valor está cifrado.
    const guardado = mockTables().profiles.find((p) => p.cedula === 'V-11223344')
    expect(String(guardado?.telefono)).toMatch(/^enc:v1:/)
    expect(String(guardado?.firma_digital)).toMatch(/^enc:v1:/)

    // El listado lo descifra para el cliente.
    const lista = await api('/api/admin/staff', { token })
    const fila = lista.body.find((s: { cedula: string }) => s.cedula === 'V-11223344')
    expect(fila.telefono).toBe('+584130000000')
    expect(fila.firma_digital).toBe('sha256:firma-nueva')
  })

  it('pacientes: al crear se guarda el teléfono cifrado y se lee descifrado', async () => {
    process.env.FIELD_ENCRYPTION_KEY = CLAVE
    const token = await login('V-33445566') // secretaria

    const creado = await api('/api/pacientes', {
      method: 'POST',
      token,
      body: {
        cedula: 'V-55667788',
        nombre_completo: 'Test Cifrado',
        fecha_nacimiento: '1990-01-01',
        telefono: '+584150000099',
        sexo: 'F',
      },
    })
    expect(creado.status).toBe(201)
    expect(creado.body.telefono).toBe('+584150000099')

    const guardado = mockTables().pacientes.find((p) => p.cedula === 'V-55667788')
    expect(String(guardado?.telefono)).toMatch(/^enc:v1:/)

    const busqueda = await api(`/api/pacientes?q=V-55667788`, { token })
    expect(busqueda.body[0].telefono).toBe('+584150000099')
  })

  it('sin clave el flujo guarda los datos en claro (transparente)', async () => {
    const token = await login('V-11222333')
    const creado = await api('/api/admin/staff', {
      method: 'POST',
      token,
      body: {
        email: 'enclaro@totalhealth.local',
        password: 'demo1234',
        roles: ['secretaria'],
        nombre_completo: 'Secretaria En Claro',
        cedula: 'V-66554433',
        telefono: '+584139999999',
      },
    })
    expect(creado.status).toBe(201)
    expect(creado.body.telefono).toBe('+584139999999')
    const guardado = mockTables().profiles.find((p) => p.cedula === 'V-66554433')
    expect(guardado?.telefono).toBe('+584139999999')
  })
})

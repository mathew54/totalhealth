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

const SEC = 'V-33445566' // Ana Gómez (secretaria, caja)
const LAB = 'V-44556677' // Lic. Pedro Rodríguez (laboratorio -> sin acceso a caja)
const PACIENTE = '20000000-0000-0000-0000-000000000001' // Juan Pérez
const EX_GLI = '40000000-0000-0000-0000-000000000002' // Glicemia en ayunas ($10)

async function crearSolicitud(token: string) {
  const s = await api('/api/solicitudes', {
    method: 'POST',
    token,
    body: { paciente_id: PACIENTE, examenes: [EX_GLI] },
  })
  expect(s.status).toBe(201)
  return s.body.id as string
}

describe('Caja por turnos (Fase B)', () => {
  let tokenSec = ''
  let tokenLab = ''
  let turnoId = ''

  it('laboratorio NO accede a caja (403); secretaria sí', async () => {
    tokenSec = (await login(SEC)).body.access_token
    tokenLab = (await login(LAB)).body.access_token
    expect(tokenSec).toBeTruthy()
    expect(tokenLab).toBeTruthy()

    // Laboratorio no pertenece a la autorización de caja (secretaria/admin/super_root).
    const forbb = await api('/api/caja/turno-activo', { token: tokenLab })
    expect(forbb.status).toBe(403)
    const forbb2 = await api('/api/caja/apertura', { method: 'POST', token: tokenLab, body: { monto_inicial: 10 } })
    expect(forbb2.status).toBe(403)

    const vacio = await api('/api/caja/turno-activo', { token: tokenSec })
    expect(vacio.status).toBe(200)
    expect(vacio.body.turno).toBeNull()
  })

  it('secretaria abre un turno y no puede abrir otro mientras esté activo', async () => {
    const a = await api('/api/caja/apertura', { method: 'POST', token: tokenSec, body: { monto_inicial: 50 } })
    expect(a.status).toBe(201)
    expect(a.body.estado).toBe('abierta')
    expect(a.body.monto_inicial).toBe(50)
    turnoId = a.body.id

    const duplicado = await api('/api/caja/apertura', { method: 'POST', token: tokenSec, body: { monto_inicial: 0 } })
    expect(duplicado.status).toBe(409)
  })

  it('el cobro en efectivo queda asociado al turno activo', async () => {
    const solicitudId = await crearSolicitud(tokenSec)
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.pago.turno_id).toBe(turnoId)
    expect(r.body.igtf).toBe(0.35) // $10 * 1.16 = 11.60 -> IGTF 3% = 0.35
  })

  it('cierre con arqueo exacto: esperado = inicial + efectivo cobrado', async () => {
    const c = await api('/api/caja/cierre', {
      method: 'POST',
      token: tokenSec,
      body: { efectivo_usd: 61.95, efectivo_bs: 0 },
    })
    expect(c.status).toBe(200)
    expect(c.body.estado).toBe('cerrada')
    expect(c.body.fecha_cierre).toBeTruthy()
    expect(c.body.efectivo_esperado_usd).toBe(11.95)
    expect(c.body.monto_esperado_caja_usd).toBe(61.95) // 50 inicial + 11.95 cobrado
    expect(c.body.monto_real_caja_usd).toBe(61.95)
    expect(c.body.diferencia_usd).toBe(0)

    const activo = await api('/api/caja/turno-activo', { token: tokenSec })
    expect(activo.body.turno).toBeNull()

    const doble = await api('/api/caja/cierre', { method: 'POST', token: tokenSec, body: { efectivo_usd: 0, efectivo_bs: 0 } })
    expect(doble.status).toBe(409)
  })

  it('el historial registra el cierre y su arqueo', async () => {
    const l = await api('/api/caja/turnos', { token: tokenSec })
    expect(l.status).toBe(200)
    expect(l.body.count).toBe(1)
    expect(l.body.turnos[0].estado).toBe('cerrada')
    expect(l.body.turnos[0].diferencia_usd).toBe(0)
    expect(l.body.turnos[0].efectivo_esperado_usd).toBe(11.95)
  })

  it('arqueo en Bs.: esperado en efectivo Bs. y diferencia en USD base', async () => {
    const a = await api('/api/caja/apertura', { method: 'POST', token: tokenSec, body: { monto_inicial: 0 } })
    expect(a.status).toBe(201)
    const turno2 = a.body.id

    const solicitudId = await crearSolicitud(tokenSec)
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, moneda: 'BS', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.pago.turno_id).toBe(turno2)
    expect(r.body.monto).toBe(8768.44) // $11.6 * tasa 755.9

    // Cuadre exacto: contar el mismo monto en Bs.
    const ok = await api('/api/caja/cierre', {
      method: 'POST',
      token: tokenSec,
      body: { efectivo_usd: 0, efectivo_bs: 8768.44 },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.efectivo_esperado_bs).toBe(8768.44)
    expect(ok.body.monto_esperado_caja_usd).toBe(11.6)
    expect(ok.body.monto_real_caja_usd).toBe(11.6)
    expect(ok.body.diferencia_usd).toBe(0)

    // Diferencia: contar menos de lo esperado (faltante).
    const a2 = await api('/api/caja/apertura', { method: 'POST', token: tokenSec, body: { monto_inicial: 0 } })
    const turno3 = a2.body.id
    const solicitudId3 = await crearSolicitud(tokenSec)
    await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId3, moneda: 'USD', metodo: 'efectivo' },
    })
    const fal = await api('/api/caja/cierre', {
      method: 'POST',
      token: tokenSec,
      body: { efectivo_usd: 10, efectivo_bs: 0 },
    })
    expect(fal.status).toBe(200)
    expect(fal.body.monto_esperado_caja_usd).toBe(11.95)
    expect(fal.body.monto_real_caja_usd).toBe(10)
    expect(fal.body.diferencia_usd).toBe(-1.95)
  })
})

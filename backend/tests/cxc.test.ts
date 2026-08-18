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
const EX_HEMA = '40000000-0000-0000-0000-000000000001' // Hematología ($15)

async function crearSolicitud(token: string, examenes: string[] = [EX_GLI, EX_HEMA]) {
  const s = await api('/api/solicitudes', {
    method: 'POST',
    token,
    body: { paciente_id: PACIENTE, examenes },
  })
  expect(s.status).toBe(201)
  return s.body.id as string
}

describe('Cuentas por cobrar (Fase C)', () => {
  let tokenSec = ''
  let tokenLab = ''

  it('laboratorio NO accede a abonos ni saldos (403); secretaria sí', async () => {
    tokenSec = (await login(SEC)).body.access_token
    tokenLab = (await login(LAB)).body.access_token
    expect(tokenSec).toBeTruthy()
    expect(tokenLab).toBeTruthy()

    const forbb = await api('/api/pagos/saldos', { token: tokenLab })
    expect(forbb.status).toBe(403)
    const forbb2 = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenLab,
      body: { solicitud_id: PACIENTE, monto: 5 },
    })
    expect(forbb2.status).toBe(403)

    const vacio = await api('/api/pagos/saldos', { token: tokenSec })
    expect(vacio.status).toBe(200)
  })

  it('abono parcial USD: reduce el saldo, no cobra la solicitud y genera recibo', async () => {
    const solicitudId = await crearSolicitud(tokenSec)
    // Total: 10 + 15 = 25 (gravado) + IVA 16% = 4.00 -> total facturado 29.00
    const r = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 10, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.pago.tipo).toBe('abono')
    expect(r.body.pago.monto).toBe(10)
    expect(r.body.igtf).toBe(0.3) // 3% de 10
    expect(r.body.saldada).toBe(false)
    expect(r.body.monto_pagado).toBe(10)
    expect(r.body.total_facturado_usd).toBe(29)
    expect(r.body.saldo).toBe(19)
    expect(r.body.factura.numero_control).toBeTruthy()
    expect(r.body.pago.factura_id).toBe(r.body.factura.id)

    // El recibo del abono es descargable (base = abono, sin IVA).
    const f = await api(`/api/pagos/${r.body.pago.id}/factura`, { token: tokenSec })
    expect(f.status).toBe(200)
    expect(f.body.base).toBe(10)
    expect(f.body.iva).toBe(0)
  })

  it('el listado de saldos muestra la solicitud con su pendiente', async () => {
    const saldos = await api('/api/pagos/saldos', { token: tokenSec })
    expect(saldos.status).toBe(200)
    const fila = saldos.body.saldos.find((s: { solicitud_id: string }) => s.solicitud_id && s.parcial)
    expect(fila).toBeTruthy()
    expect(fila.monto_pagado).toBe(10)
    expect(fila.saldo).toBe(19)
    expect(fila.total_usd).toBe(29)
    expect(saldos.body.total_pendiente_usd).toBeGreaterThan(0)
  })

  it('tras un abono no se permite el cobro completo (409)', async () => {
    const solicitudId = await crearSolicitud(tokenSec)
    await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 5, moneda: 'USD' },
    })
    const cobro = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, moneda: 'USD' },
    })
    expect(cobro.status).toBe(409)
  })

  it('el abono no puede exceder el saldo pendiente', async () => {
    const solicitudId = await crearSolicitud(tokenSec, [EX_GLI]) // total facturado 11.60
    const exceso = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 100, moneda: 'USD' },
    })
    expect(exceso.status).toBe(400)

    const ok = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 11.6, moneda: 'USD' },
    })
    expect(ok.status).toBe(201)
    expect(ok.body.saldada).toBe(true)
  })

  it('abono en Bs. convierte a la tasa del día y no aplica IGTF', async () => {
    const solicitudId = await crearSolicitud(tokenSec, [EX_GLI]) // total facturado 11.60
    const r = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 11.6, moneda: 'BS', metodo: 'pago_movil' },
    })
    expect(r.status).toBe(201)
    expect(r.body.moneda).toBe('BS')
    expect(r.body.igtf).toBe(0)
    expect(r.body.saldada).toBe(true)
    expect(r.body.saldo).toBe(0)
    expect(r.body.pago.tasa_usd).toBeGreaterThan(0)
  })

  it('un abono saldante marca la solicitud como cobrada', async () => {
    const solicitudId = await crearSolicitud(tokenSec, [EX_GLI]) // total facturado 11.60
    const p1 = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 5, moneda: 'USD' },
    })
    expect(p1.status).toBe(201)
    expect(p1.body.saldada).toBe(false)
    expect(p1.body.saldo).toBe(6.6)

    const p2 = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 6.6, moneda: 'USD' },
    })
    expect(p2.status).toBe(201)
    expect(p2.body.saldada).toBe(true)
    expect(p2.body.saldo).toBe(0)

    const yaSaldada = await api('/api/pagos/abono', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: solicitudId, monto: 1, moneda: 'USD' },
    })
    expect(yaSaldada.status).toBe(409)
  })
})
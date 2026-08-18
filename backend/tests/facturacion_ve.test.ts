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
const ADMIN = 'V-11222333' // Dr. Luis Contreras (admin)
const PACIENTE = '20000000-0000-0000-0000-000000000001' // Juan Pérez
const EX_GLI = '40000000-0000-0000-0000-000000000002' // Glicemia en ayunas ($10)
const EX_HEM = '40000000-0000-0000-0000-000000000001' // Hematología completa ($15)

describe('Facturación VE (Fase A)', () => {
  let tokenSec = ''
  let tokenAdmin = ''
  let pagoId = ''
  let facturaId = ''
  let numeroControl = ''

  it('cobro en USD: base gravada, IVA e IGTF; se persiste la factura', async () => {
    tokenSec = (await login(SEC)).body.access_token
    tokenAdmin = (await login(ADMIN)).body.access_token
    expect(tokenSec).toBeTruthy()
    expect(tokenAdmin).toBeTruthy()

    const s = await api('/api/solicitudes', {
      method: 'POST',
      token: tokenSec,
      body: { paciente_id: PACIENTE, examenes: [EX_GLI] },
    })
    expect(s.status).toBe(201)

    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: s.body.id, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)

    // $10 gravado + IVA 16% = 11.60; IGTF 3% = 0.35; total a cobrar 11.95.
    expect(r.body.base_gravada).toBe(10)
    expect(r.body.base_exenta).toBe(0)
    expect(r.body.iva).toBe(1.6)
    expect(r.body.monto).toBe(11.6)
    expect(r.body.igtf).toBe(0.35)
    expect(r.body.monto_final).toBe(11.95)
    expect(r.body.monto_usd).toBe(11.6)

    // Retrocompatibilidad: el contrato anterior sigue presente.
    expect(r.body.total).toBe(10)
    expect(r.body.total_usd).toBe(10)
    expect(r.body.descuento).toBe(0)
    expect(r.body.moneda).toBe('USD')

    // Factura persistida con correlativo y número de control.
    expect(r.body.factura).toBeTruthy()
    expect(r.body.factura.numero_control).toMatch(/^\d{6}$/)
    pagoId = r.body.pago.id
    facturaId = r.body.factura.id
    numeroControl = r.body.factura.numero_control
    expect(r.body.pago.factura_id).toBe(facturaId)
  })

  it('GET /pagos/:id/factura devuelve el documento persistido', async () => {
    const r = await api(`/api/pagos/${pagoId}/factura`, { token: tokenSec })
    expect(r.status).toBe(200)
    expect(r.body.factura.control).toBe(numeroControl)
    expect(r.body.factura.serie).toContain('TH-')
    expect(r.body.base_exenta).toBe(0)
    expect(r.body.igtf).toBe(0.35)
    expect(r.body.monto).toBe(11.95)
    expect(r.body.iva_porcentaje).toBe(0.16)
    expect(r.body.monto_texto).toContain('DÓLARES')
  })

  it('libro de facturas lista el documento, permite anularlo y bloquea doble anulación', async () => {
    const l = await api('/api/facturas', { token: tokenSec })
    expect(l.status).toBe(200)
    expect(l.body.count).toBe(1)
    expect(l.body.facturas[0].numero_control).toBe(numeroControl)
    expect(l.body.facturas[0].estatus).toBe('emitida')

    const d = await api(`/api/facturas/${facturaId}`, { token: tokenSec })
    expect(d.status).toBe(200)
    expect(Array.isArray(d.body.lineas)).toBe(true)
    expect(d.body.lineas).toHaveLength(1)

    const a = await api(`/api/facturas/${facturaId}/anular`, {
      method: 'POST',
      token: tokenSec,
      body: { motivo: 'Cobro duplicado' },
    })
    expect(a.status).toBe(200)
    expect(a.body.estatus).toBe('anulada')

    const a2 = await api(`/api/facturas/${facturaId}/anular`, {
      method: 'POST',
      token: tokenSec,
      body: { motivo: 'Intento repetido' },
    })
    expect(a2.status).toBe(400)
  })

  it('examen exento genera base exenta sin IVA', async () => {
    const up = await api(`/api/admin/examenes/${EX_GLI}`, {
      method: 'PUT',
      token: tokenAdmin,
      body: { impuesto: 'exento' },
    })
    expect(up.status).toBe(200)

    const s = await api('/api/solicitudes', {
      method: 'POST',
      token: tokenSec,
      body: { paciente_id: PACIENTE, examenes: [EX_GLI, EX_HEM] },
    })
    expect(s.status).toBe(201)

    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: s.body.id, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.base_gravada).toBe(15)
    expect(r.body.base_exenta).toBe(10)
    expect(r.body.iva).toBe(2.4)
    expect(r.body.monto).toBe(27.4)
    expect(r.body.igtf).toBeCloseTo(0.82, 2)

    // Restaura el tratamiento fiscal para no afectar los siguientes casos.
    await api(`/api/admin/examenes/${EX_GLI}`, {
      method: 'PUT',
      token: tokenAdmin,
      body: { impuesto: 'gravado' },
    })
  })

  it('cobro en Bs.: sin IGTF y conversión con la tasa del día', async () => {
    const s = await api('/api/solicitudes', {
      method: 'POST',
      token: tokenSec,
      body: { paciente_id: PACIENTE, examenes: [EX_GLI] },
    })
    expect(s.status).toBe(201)

    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: s.body.id, moneda: 'BS', metodo: 'pago_movil' },
    })
    expect(r.status).toBe(201)
    expect(r.body.moneda).toBe('BS')
    expect(r.body.igtf).toBe(0)
    expect(r.body.monto_final).toBe(r.body.monto)
    expect(r.body.base_gravada).toBe(7559)
    expect(r.body.iva).toBe(1209.44)
    expect(r.body.monto).toBe(8768.44)
    expect(r.body.monto_usd).toBe(11.6)
    expect(r.body.factura).toBeTruthy()
  })

  it('admin puede configurar IVA/IGTF y el cobro los usa', async () => {
    const c = await api('/api/admin/config', {
      method: 'PUT',
      token: tokenAdmin,
      body: { iva: 0.15, igtf: 0.02 },
    })
    expect(c.status).toBe(200)

    const pub = await api('/api/config', { token: tokenSec })
    expect(pub.body.iva).toBe(0.15)
    expect(pub.body.igtf).toBe(0.02)

    const s = await api('/api/solicitudes', {
      method: 'POST',
      token: tokenSec,
      body: { paciente_id: PACIENTE, examenes: [EX_GLI] },
    })
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: s.body.id, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.iva).toBe(1.5) // 10 * 15%
    expect(r.body.monto).toBe(11.5)
    expect(r.body.igtf).toBe(0.23) // 11.5 * 2%
    expect(r.body.monto_final).toBe(11.73)

    // Restaura las alícuotas por defecto.
    await api('/api/admin/config', {
      method: 'PUT',
      token: tokenAdmin,
      body: { iva: 0.16, igtf: 0.03 },
    })
  })
})

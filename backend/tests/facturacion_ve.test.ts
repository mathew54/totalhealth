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

describe('Caja avanzada: IGTF opcional, retenciones VE y cliente a facturar', () => {
  const MARIA = '20000000-0000-0000-0000-000000000002' // María García

  async function crearSolicitud(token: string, examenes: string[]) {
    const s = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes },
    })
    expect(s.status).toBe(201)
    return s.body.id as string
  }

  it('igtf_aplica=false cobra en divisas sin IGTF', async () => {
    const token = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(token, [EX_GLI])

    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token,
      body: { solicitud_id: sid, moneda: 'USD', metodo: 'efectivo', igtf_aplica: false },
    })
    expect(r.status).toBe(201)
    expect(r.body.monto).toBe(11.6)
    expect(r.body.igtf).toBe(0)
    expect(r.body.monto_final).toBe(11.6)
  })

  it('retenciones de IVA (75%) e ISLR (3%) reducen el efectivo recibido y quedan en la factura', async () => {
    const token = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(token, [EX_GLI])

    // $10 gravado + IVA 16% = 11.60; IGTF 3% = 0.35.
    // Ret. IVA 75% de 1.60 = 1.20; Ret. ISLR 3% de 10 = 0.30 → final 10.45.
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token,
      body: { solicitud_id: sid, moneda: 'USD', metodo: 'efectivo', retencion_iva_aplica: true, retencion_islr_aplica: true },
    })
    expect(r.status).toBe(201)
    expect(r.body.retencion_iva).toBe(1.2)
    expect(r.body.retencion_islr).toBe(0.3)
    expect(r.body.monto_final).toBe(10.45)

    // La factura persistida refleja las retenciones.
    const f = await api(`/api/pagos/${r.body.pago.id}/factura`, { token })
    expect(f.status).toBe(200)
    expect(f.body.retencion_iva).toBe(1.2)
    expect(f.body.retencion_islr).toBe(0.3)
  })

  it('permite facturarle a un cliente distinto del paciente de la orden', async () => {
    const token = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(token, [EX_GLI])

    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token,
      body: { solicitud_id: sid, moneda: 'USD', metodo: 'zelle', paciente_id: MARIA },
    })
    expect(r.status).toBe(201)
    expect(r.body.pago.paciente_id).toBe(MARIA)

    // El documento fiscal va al cliente facturado.
    const f = await api(`/api/facturas/${r.body.factura.id}`, { token })
    expect(f.status).toBe(200)
    expect(f.body.paciente_id).toBe(MARIA)
    expect(f.body.receptor_razon_social).toBe('María García')
  })

  it('caja agrega y quita exámenes; bloqueado tras cobrar o con abonos', async () => {
    const token = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(token, [EX_GLI])

    const agregar = await api(`/api/solicitudes/${sid}/examenes-caja`, {
      method: 'PATCH',
      token,
      body: { examenes: [EX_GLI, EX_HEM] },
    })
    expect(agregar.status).toBe(200)
    expect(agregar.body.total).toBe(25)

    const quitar = await api(`/api/solicitudes/${sid}/examenes-caja`, {
      method: 'PATCH',
      token,
      body: { examenes: [EX_HEM] },
    })
    expect(quitar.status).toBe(200)
    expect(quitar.body.total).toBe(15)

    const cobro = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token,
      body: { solicitud_id: sid, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(cobro.status).toBe(201)

    const trasCobro = await api(`/api/solicitudes/${sid}/examenes-caja`, {
      method: 'PATCH',
      token,
      body: { examenes: [EX_HEM, EX_GLI] },
    })
    expect(trasCobro.status).toBe(409)
  })

  it('abono con retención de ISLR calcula la porción base/IVA proporcional', async () => {
    const token = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(token, [EX_GLI])

    // Total facturado 11.60 (base 10 + IVA 1.60). Abono de $5:
    // porción IVA ≈ 0.69, porción base ≈ 4.31 → ISLR 3% = 0.13; IGTF 3% = 0.15.
    const r = await api('/api/pagos/abono', {
      method: 'POST',
      token,
      body: { solicitud_id: sid, monto: 5, moneda: 'USD', metodo: 'punto', retencion_islr_aplica: true },
    })
    expect(r.status).toBe(201)
    expect(r.body.retencion_iva).toBe(0)
    expect(r.body.retencion_islr).toBe(0.13)
    expect(r.body.monto_final).toBe(5.02)
  })

  it('las retenciones son configurables desde Administración', async () => {
    const tokenAdmin = (await login(ADMIN)).body.access_token
    const c = await api('/api/admin/config', {
      method: 'PUT',
      token: tokenAdmin,
      body: { retencion_iva_pct: 1, retencion_islr_pct: 0.05 },
    })
    expect(c.status).toBe(200)
    expect(c.body.retencion_iva_pct).toBe(1)
    expect(c.body.retencion_islr_pct).toBe(0.05)

    const pub = await api('/api/config', { token: tokenAdmin })
    expect(pub.body.retencion_iva_pct).toBe(1)
    expect(pub.body.retencion_islr_pct).toBe(0.05)

    // Retención de IVA al 100% sobre un cobro nuevo.
    const tokenSec = (await login(SEC)).body.access_token
    const sid = await crearSolicitud(tokenSec, [EX_GLI])
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: tokenSec,
      body: { solicitud_id: sid, moneda: 'USD', metodo: 'efectivo', igtf_aplica: false, retencion_iva_aplica: true },
    })
    expect(r.status).toBe(201)
    expect(r.body.igtf).toBe(0)
    expect(r.body.retencion_iva).toBe(1.6) // 100% de 1.60
    expect(r.body.monto_final).toBe(10)    // 11.60 - 1.60

    // Restaura los porcentajes por defecto.
    await api('/api/admin/config', {
      method: 'PUT',
      token: tokenAdmin,
      body: { retencion_iva_pct: 0.75, retencion_islr_pct: 0.03 },
    })
  })
})

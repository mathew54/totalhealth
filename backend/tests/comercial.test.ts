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
const LAB = 'V-44556677' // Lic. Pedro Rodríguez (laboratorio)
const ADMIN = 'V-11222333' // Administrador
const PACIENTE = '20000000-0000-0000-0000-000000000001' // Juan Pérez
const EX_GLI = '40000000-0000-0000-0000-000000000002' // Glicemia en ayunas ($10)
const EX_HEMA = '40000000-0000-0000-0000-000000000001' // Hematología ($15)
const HOY = new Date().toISOString().slice(0, 10)

async function crearSolicitud(token: string, examenes?: string[], extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = { paciente_id: PACIENTE, ...extra }
  if (examenes && examenes.length) body.examenes = examenes
  const s = await api('/api/solicitudes', {
    method: 'POST',
    token,
    body,
  })
  expect(s.status).toBe(201)
  return s.body.id as string
}

describe('Módulo comercial (Fase D)', () => {
  let sec = ''
  let lab = ''
  let admin = ''

  it('roles: laboratorio lee catálogo pero no escribe (403); secretaria/admin sí', async () => {
    sec = (await login(SEC)).body.access_token
    lab = (await login(LAB)).body.access_token
    admin = (await login(ADMIN)).body.access_token
    expect(sec).toBeTruthy()
    expect(lab).toBeTruthy()
    expect(admin).toBeTruthy()

    const lista = await api('/api/comercial/paquetes', { token: lab })
    expect(lista.status).toBe(200)

    const prohibido = await api('/api/comercial/paquetes', {
      method: 'POST',
      token: lab,
      body: { nombre: 'X', precio: 1, examen_ids: [EX_GLI] },
    })
    expect(prohibido.status).toBe(403)
    const prohibidoSec = await api('/api/comercial/paquetes', {
      method: 'POST',
      token: sec,
      body: { nombre: 'X', precio: 1, examen_ids: [EX_GLI] },
    })
    expect(prohibidoSec.status).toBe(403)
  })

  it('paquete: se crea por admin, la solicitud hereda su precio y el cobro aplica el descuento', async () => {
    const p = await api('/api/comercial/paquetes', {
      method: 'POST',
      token: admin,
      body: { nombre: 'Chequeo básico', descripcion: 'Glicemia + Hematología', precio: 20, examen_ids: [EX_GLI, EX_HEMA] },
    })
    expect(p.status).toBe(201)
    expect(p.body.examenes.length).toBe(2)

    const solicitudId = await crearSolicitud(sec, [], { paquete_id: p.body.id })
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: sec,
      body: { solicitud_id: solicitudId, moneda: 'USD', metodo: 'efectivo' },
    })
    expect(r.status).toBe(201)
    expect(r.body.descuento).toBe(5) // 25 catálogo - 20 paquete
    expect(r.body.monto_usd).toBe(23.2) // 20 + IVA 16%
    expect(r.body.monto_final).toBe(23.9) // + IGTF 3% (0.70)
    expect(r.body.descuento_motivo).toContain('Paquete')
    expect(r.body.pago.paquete_id).toBe(p.body.id)
  })

  it('promoción vigente: aplica el % sobre los exámenes del catálogo', async () => {
    const promo = await api('/api/comercial/promociones', {
      method: 'POST',
      token: admin,
      body: { nombre: 'Promo glicemia', descuento_porcentaje: 20, fecha_inicio: HOY, fecha_fin: HOY, examen_ids: [EX_GLI] },
    })
    expect(promo.status).toBe(201)

    const solicitudId = await crearSolicitud(sec, [EX_GLI])
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: sec,
      body: { solicitud_id: solicitudId, moneda: 'USD' },
    })
    expect(r.status).toBe(201)
    expect(r.body.descuento).toBe(2) // 20% de 10
    expect(r.body.monto_usd).toBe(9.28) // 8 + IVA 16%
    expect(r.body.descuento_motivo).toContain('Promoción')

    // Limpia para no contaminar el resto de tests.
    const desactivada = await api(`/api/comercial/promociones/${promo.body.id}`, { method: 'DELETE', token: admin })
    expect(desactivada.status).toBe(200)
  })

  it('convenio: el % del convenio del paciente se descuenta en el cobro', async () => {
    const conv = await api('/api/comercial/convenios', {
      method: 'POST',
      token: admin,
      body: { nombre: 'Seguros Caracas', rif: 'J-12345678', descuento_porcentaje: 10 },
    })
    expect(conv.status).toBe(201)

    const asig = await api(`/api/pacientes/${PACIENTE}`, {
      method: 'PUT',
      token: admin,
      body: { convenio_id: conv.body.id },
    })
    expect(asig.status).toBe(200)
    expect(asig.body.convenio.nombre).toBe('Seguros Caracas')

    const solicitudId = await crearSolicitud(sec, [EX_GLI, EX_HEMA])
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: sec,
      body: { solicitud_id: solicitudId, moneda: 'USD' },
    })
    expect(r.status).toBe(201)
    expect(r.body.descuento).toBe(2.5) // 10% de 25
    expect(r.body.monto_usd).toBe(26.1) // 22.5 + IVA 3.60
    expect(r.body.convenio_id).toBe(conv.body.id)
    expect(r.body.descuento_motivo).toContain('Convenio')

    // Desvincula el convenio para no contaminar el resto de tests.
    const quitar = await api(`/api/pacientes/${PACIENTE}`, { method: 'PUT', token: admin, body: { convenio_id: null } })
    expect(quitar.status).toBe(200)
  })

  it('prepago: recarga saldo y el cobro usa el fondo antes que la pasarela', async () => {
    const recarga = await api('/api/pagos/prepago', {
      method: 'POST',
      token: sec,
      body: { paciente_id: PACIENTE, monto: 50, moneda: 'USD' },
    })
    expect(recarga.status).toBe(201)
    expect(recarga.body.pago.tipo).toBe('prepago')
    expect(recarga.body.saldo_usd).toBe(50)
    expect(recarga.body.igtf).toBe(1.5) // 3% de 50

    const saldo = await api(`/api/pagos/prepago?paciente_id=${PACIENTE}`, { token: sec })
    expect(saldo.body.tarjeta.saldo_usd).toBe(50)

    const solicitudId = await crearSolicitud(sec, [EX_GLI, EX_HEMA]) // 25 + IVA 4.00 = 29.00
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: sec,
      body: { solicitud_id: solicitudId, moneda: 'USD', usar_prepago: true },
    })
    expect(r.status).toBe(201)
    expect(r.body.prepago_usado_usd).toBe(29) // cubre todo el monto
    expect(r.body.monto).toBe(0) // nada nuevo cobrado
    expect(r.body.igtf).toBe(0) // sin divisa nueva en la pasarela
    expect(r.body.monto_final).toBe(0)

    const saldo2 = await api(`/api/pagos/prepago?paciente_id=${PACIENTE}`, { token: sec })
    expect(saldo2.body.tarjeta.saldo_usd).toBe(21) // 50 - 29
  })

  it('prepago parcial: el resto se cobra por la pasarela con IGTF', async () => {
    // El paciente aún tiene 21 USD en la tarjeta.
    const solicitudId = await crearSolicitud(sec, [EX_GLI]) // 10 + IVA 1.60 = 11.60
    const r = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token: sec,
      body: { solicitud_id: solicitudId, moneda: 'USD', usar_prepago: true },
    })
    expect(r.status).toBe(201)
    expect(r.body.prepago_usado_usd).toBe(11.6)
    expect(r.body.monto).toBe(0)
    expect(r.body.igtf).toBe(0)
  })
})
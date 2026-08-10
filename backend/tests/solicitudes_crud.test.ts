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

const LAB = 'V-44556677' // Lic. Pedro Rodríguez (laboratorio)
const SEC = 'V-33445566' // Ana Gómez (secretaria)
const PACIENTE = '20000000-0000-0000-0000-000000000001'
const SOL_PENDIENTE = '50000000-0000-0000-0000-000000000009'
const SOL_EN_PROCESO = '50000000-0000-0000-0000-000000000010'
const SOL_PACIENTE1 = '50000000-0000-0000-0000-000000000001'

describe('Laboratorio: CRUD de solicitudes', () => {
  let creada = ''

  it('laboratorio puede crear una solicitud', async () => {
    const token = (await login(LAB)).body.access_token
    expect(token).toBeTruthy()

    const res = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: ['40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003'], nota: 'Smoke test' },
    })
    expect(res.status).toBe(201)
    expect(res.body.total).toBe(22)
    creada = res.body.id
  })

  it('la fecha y hora personalizada se guarda y ordena la cola', async () => {
    const token = (await login(LAB)).body.access_token

    const futura = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: ['40000000-0000-0000-0000-000000000001'], fecha: '2030-06-15T09:30:00-04:00', nota: 'Fecha futura' },
    })
    expect(futura.status).toBe(201)
    expect(futura.body.fecha).toBe('2030-06-15T09:30:00-04:00')

    const invalida = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: ['40000000-0000-0000-0000-000000000001'], fecha: 'no-es-una-fecha' },
    })
    expect(invalida.status).toBe(400)

    const lista = await api('/api/solicitudes', { token })
    const orden = lista.body.map((s: { id: string }) => s.id)
    const idxFutura = orden.indexOf(futura.body.id)
    const idxResto = orden.findIndex((id: string) => id !== futura.body.id && id !== creada)
    expect(idxFutura).toBeGreaterThanOrEqual(0)
    expect(idxFutura).toBeLessThan(idxResto)
  })

  it('secretaria puede crear una solicitud', async () => {
    const token = (await login(SEC)).body.access_token
    const res = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: ['40000000-0000-0000-0000-000000000001'] },
    })
    expect(res.status).toBe(201)
  })

  it('la lista oculta solicitudes anuladas por defecto y las muestra con incluir_anuladas', async () => {
    const token = (await login(LAB)).body.access_token

    const base = await api('/api/solicitudes', { token })
    expect(base.status).toBe(200)
    const pendientes = base.body.filter((s: { estado: string }) => s.estado === 'pendiente')
    const creadaId = pendientes.find((s: { nota: string }) => s.nota === 'Smoke test')?.id
    expect(creadaId).toBe(creada)

    await api(`/api/solicitudes/${creada}/anular`, { method: 'POST', token, body: { activa: true } })

    const trasAnular = await api('/api/solicitudes', { token })
    expect(trasAnular.body.some((s: { id: string }) => s.id === creada)).toBe(false)

    const conAnuladas = await api('/api/solicitudes?incluir_anuladas=true', { token })
    const anulada = conAnuladas.body.find((s: { id: string }) => s.id === creada)
    expect(anulada).toBeTruthy()
    expect(anulada.estado).toBe('anulada')
  })

  it('solo se editan solicitudes pendientes', async () => {
    const token = (await login(LAB)).body.access_token

    const ok = await api(`/api/solicitudes/${creada}/anular`, { method: 'POST', token, body: { activa: false } })
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('pendiente')

    const edit = await api(`/api/solicitudes/${creada}`, {
      method: 'PATCH',
      token,
      body: { examenes: ['40000000-0000-0000-0000-000000000004'], nota: 'Editada' },
    })
    expect(edit.status).toBe(200)
    expect(edit.body.total).toBe(8)
    expect(edit.body.lineas.length).toBe(1)
    expect(edit.body.lineas[0].examen).toBe('Uroanálisis')

    const noPendiente = await api(`/api/solicitudes/${SOL_EN_PROCESO}`, {
      method: 'PATCH',
      token,
      body: { examenes: ['40000000-0000-0000-0000-000000000001'] },
    })
    expect(noPendiente.status).toBe(409)
  })

  it('una solicitud anulada no puede cobrarse (secretaria)', async () => {
    const token = (await login(SEC)).body.access_token
    await api(`/api/solicitudes/${creada}/anular`, { method: 'POST', token, body: { activa: true } })

    const cobro = await api('/api/pagos/laboratorio', {
      method: 'POST',
      token,
      body: { solicitud_id: creada, metodo: 'efectivo', moneda: 'USD', descuento: 0, iva: 0, monto: 8 },
    })
    expect(cobro.status).toBe(409)
    expect(cobro.body.error.message).toMatch(/anulada/i)
  })

  it('el portal del paciente excluye solicitudes anuladas', async () => {
    const gen = await api('/api/portal/generar-codigo', { method: 'POST', body: { cedula: 'V-12345678' } })
    expect(gen.body.dev_codigo).toBeTruthy()

    const verif = await api('/api/portal/verificar', { method: 'POST', body: { cedula: 'V-12345678', codigo: gen.body.dev_codigo } })
    expect(verif.status).toBe(200)
    expect(verif.body.token).toBeTruthy()

    const res = await api('/api/portal/mis-resultados', { token: verif.body.token })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some((s: { id: string }) => s.id === creada)).toBe(false)
  })

  it('el historial del paciente incluye resultados_laboratorio para secretaria', async () => {
    const token = (await login(SEC)).body.access_token
    const res = await api(`/api/historial/pacientes/${PACIENTE}`, { token })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.resultados_laboratorio)).toBe(true)
    expect(res.body.resultados_laboratorio.some((s: { id: string }) => s.id === SOL_PACIENTE1)).toBe(true)
    expect(res.body.resultados_laboratorio.some((s: { id: string }) => s.id === creada)).toBe(false)
  })
})

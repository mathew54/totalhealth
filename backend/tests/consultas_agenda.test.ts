import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { resetMock } from '../src/mock/client.js'

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
})

const SEC = 'V-33445566' // Ana Gómez (secretaria)
const MED_A = 'V-99888777' // Dra. María Fernández
const MED_B = 'V-77665544' // Dr. José Ramírez

const CITA_PROGRAMADA = '30000000-0000-0000-0000-000000000005' // Juan Pérez, sin exámenes
const CITA_CON_TURNO = '30000000-0000-0000-0000-000000000008' // Carmen, con turno vinculado
const CITA_COMPLETADA = '30000000-0000-0000-0000-000000000001'
const CITA_CON_EXAMENES = '30000000-0000-0000-0000-000000000002' // tiene solicitudes asociadas

describe('Agenda: editar y eliminar consultas', () => {
  it('la secretaria edita fecha, médico, motivo y notas de una programada', async () => {
    const token = await login(SEC)

    const nuevaFecha = new Date(Date.now() + 3 * 24 * 3600_000).toISOString()
    const res = await api(`/api/consultas/${CITA_PROGRAMADA}`, {
      method: 'PATCH',
      token,
      body: { fecha_hora: nuevaFecha, motivo: 'Control de rutina actualizado', notas: 'Revisar signos vitales' },
    })
    expect(res.status).toBe(200)
    expect(res.body.fecha_hora).toBe(nuevaFecha)
    expect(res.body.motivo).toBe('Control de rutina actualizado')
    expect(res.body.notas).toBe('Revisar signos vitales')
  })

  it('no permite editar una consulta completada', async () => {
    const token = await login(SEC)

    const res = await api(`/api/consultas/${CITA_COMPLETADA}`, {
      method: 'PATCH',
      token,
      body: { motivo: 'Intento de edición' },
    })
    expect(res.status).toBe(400)
  })

  it('un médico no puede editar ni eliminar la consulta de otro médico', async () => {
    const token = await login(MED_B)

    const edit = await api(`/api/consultas/${CITA_PROGRAMADA}`, {
      method: 'PATCH',
      token,
      body: { motivo: 'Intento ajeno' },
    })
    expect(edit.status).toBe(403)

    const del = await api(`/api/consultas/${CITA_PROGRAMADA}`, { method: 'DELETE', token })
    expect(del.status).toBe(403)
  })

  it('el médico edita su propia consulta sin poder reasignar el médico', async () => {
    const token = await login(MED_A)

    const res = await api(`/api/consultas/${CITA_PROGRAMADA}`, {
      method: 'PATCH',
      token,
      body: { medico_id: '10000000-0000-0000-0000-000000000007', motivo: 'Control anual' },
    })
    expect(res.status).toBe(200)
    expect(res.body.motivo).toBe('Control anual')
    // El médico asignado sigue siendo el suyo (el id del body se ignora).
    expect(res.body.medico_id).toBe('10000000-0000-0000-0000-000000000003')
  })

  it('elimina una programada sin exámenes y quita su turno de sala de espera', async () => {
    const token = await login(SEC)

    const del = await api(`/api/consultas/${CITA_CON_TURNO}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.body.ok).toBe(true)

    const detalle = await api(`/api/consultas/${CITA_CON_TURNO}`, { token })
    expect(detalle.status).toBe(404)

    const { data: turnos } = await getTurnosInternos()
    expect(turnos.some((t: { consulta_id: string }) => t.consulta_id === CITA_CON_TURNO)).toBe(false)
  })

  it('no permite eliminar una consulta con exámenes de laboratorio asociados', async () => {
    const token = await login(SEC)

    const del = await api(`/api/consultas/${CITA_CON_EXAMENES}`, { method: 'DELETE', token })
    expect(del.status).toBe(400)
  })

  it('no permite eliminar una consulta completada', async () => {
    const token = await login(SEC)

    const del = await api(`/api/consultas/${CITA_COMPLETADA}`, { method: 'DELETE', token })
    expect(del.status).toBe(400)
  })

  it('devuelve 404 al editar o eliminar una consulta inexistente', async () => {
    const token = await login(SEC)
    const inexistente = '00000000-0000-0000-0000-000000000000'

    const edit = await api(`/api/consultas/${inexistente}`, { method: 'PATCH', token, body: { motivo: 'x' } })
    expect(edit.status).toBe(404)

    const del = await api(`/api/consultas/${inexistente}`, { method: 'DELETE', token })
    expect(del.status).toBe(404)
  })
})

async function getTurnosInternos() {
  const mod = await import('../src/config/supabase.js')
  const { data } = await mod.getSupabase().from('turnos').select('consulta_id')
  return { data }
}
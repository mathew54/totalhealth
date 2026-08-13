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
  return { status: res.status, body: text && text !== '' ? JSON.parse(text) : null }
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

const PACIENTE = '20000000-0000-0000-0000-000000000001' // Juan Pérez
const TUTOR = '20000000-0000-0000-0000-000000000001' // Juan es tutor de Samuel
const MENOR = '20000000-0000-0000-0000-000000000005' // Samuel Pérez
const MARIA = 'V-99888777' // Dra. María Fernández
const SUAREZ = 'V-88776655' // Dra. Ana Suárez

async function tokenDeMaria() {
  return (await login(MARIA)).body.access_token
}

async function tokenDeSuarez() {
  return (await login(SUAREZ)).body.access_token
}

describe('Expediente Clínico Unificado', () => {
  it('crea y lista una evolución SOAP con signos vitales y datos de especialidad', async () => {
    const token = await tokenDeMaria()
    const creada = await api('/api/expediente/evoluciones', {
      method: 'POST',
      token,
      body: {
        paciente_id: PACIENTE,
        especialidad_id: 'medicina_general',
        subjetivo: 'Refiere cefalea ocasional',
        objetivo: 'TA 120/80, FC 72',
        evaluacion: 'Control adecuado',
        plan: 'Continuar manejo, control en 30 días',
        signos_vitales: { peso_kg: 78, talla_cm: 170, presion_sistolica: 120, presion_diastolica: 80 },
        especialidad_data: { motivo: 'Control anual' },
      },
    })
    expect(creada.status).toBe(201)
    expect(creada.body.id).toBeTruthy()
    expect(creada.body.signos_vitales.peso_kg).toBe(78)

    const lista = await api(`/api/expediente/evoluciones?paciente_id=${PACIENTE}`, { token })
    expect(lista.status).toBe(200)
    expect(Array.isArray(lista.body)).toBe(true)
    expect(lista.body.length).toBeGreaterThanOrEqual(1)
    expect(lista.body[0]).toHaveProperty('especialidad_data')
    expect(lista.body[0]).toHaveProperty('created_at')
  })

  it('las notas privadas solo son visibles para su autor', async () => {
    const maria = await tokenDeMaria()
    const suarez = await tokenDeSuarez()

    const creada = await api('/api/expediente/notas', {
      method: 'POST',
      token: maria,
      body: { paciente_id: PACIENTE, contenido: 'Impresión privada de María' },
    })
    expect(creada.status).toBe(201)

    const deMaria = await api(`/api/expediente/notas?paciente_id=${PACIENTE}`, { token: maria })
    expect(deMaria.body.some((n: { contenido: string }) => n.contenido.includes('María'))).toBe(true)

    // La Dra. Suárez no ve la nota de María.
    const deSuarez = await api(`/api/expediente/notas?paciente_id=${PACIENTE}`, { token: suarez })
    expect(deSuarez.body.some((n: { contenido: string }) => n.contenido.includes('María'))).toBe(false)

    // Eliminación solo del autor.
    const del = await api(`/api/expediente/notas/${creada.body.id}`, { method: 'DELETE', token: suarez })
    expect(del.status).toBe(404)
    const delOk = await api(`/api/expediente/notas/${creada.body.id}`, { method: 'DELETE', token: maria })
    expect(delOk.status).toBe(200)
  })

  it('publica un caso compartido anonimizado con nombre del autor y especialidad', async () => {
    const token = await tokenDeMaria()
    const publicada = await api('/api/expediente/casos', {
      method: 'POST',
      token,
      body: {
        titulo: 'Hiperglicemia en paciente joven',
        resumen: 'Caso de difícil control con respuesta parcial al tratamiento inicial.',
        especialidad_id: 'medicina_general',
      },
    })
    expect(publicada.status).toBe(201)
    expect(publicada.body).not.toHaveProperty('paciente_id')

    const feed = await api('/api/expediente/casos', { token })
    expect(Array.isArray(feed.body)).toBe(true)
    const mio = feed.body.find((c: { titulo: string }) => c.titulo === 'Hiperglicemia en paciente joven')
    expect(mio).toHaveProperty('medico_nombre')
    expect(mio.especialidad_nombre).toBe('Medicina General')
  })

  it('genera una orden CPOE vía la tubería de solicitudes y la lista por expediente', async () => {
    const token = await tokenDeMaria()
    const { body: examenes } = await api('/api/examenes', { token })
    const ids = examenes.slice(0, 2).map((e: { id: string }) => e.id)

    // La creación usa el módulo real de laboratorio (solicitudes).
    const orden = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: ids, nota: 'Por control rutinario' },
    })
    expect(orden.status).toBe(201)
    expect(orden.body.estado).toBe('pendiente')
    expect(orden.body.lineas.length).toBe(2)

    // El expediente lee esas órdenes sin duplicar estado.
    const lista = await api(`/api/expediente/ordenes?paciente_id=${PACIENTE}`, { token })
    expect(lista.status).toBe(200)
    expect(Array.isArray(lista.body)).toBe(true)
    const recien = lista.body.find((o: { id: string }) => o.id === orden.body.id)
    expect(recien).toBeTruthy()
    expect(recien.examenes.length).toBe(2)
    expect(recien.examenes[0]).toHaveProperty('nombre')
    expect(recien.examenes[0]).toHaveProperty('tema')
    expect(recien.estado).toBe('pendiente')
  })

  it('lista los menores vinculados a un tutor', async () => {
    const token = await tokenDeMaria()
    const menores = await api(`/api/expediente/menores?tutor_id=${TUTOR}`, { token })
    expect(menores.status).toBe(200)
    expect(Array.isArray(menores.body)).toBe(true)
    expect(menores.body.some((m: { id: string }) => m.id === MENOR)).toBe(true)
    expect(menores.body.every((m: { representante_id: string }) => m.representante_id === TUTOR)).toBe(true)
  })

  it('busca pacientes por teléfono (parcial, descifrado) y por teléfono del representante', async () => {
    const token = await tokenDeMaria()
    // Juan Pérez tiene +584141234567 (V-12345678).
    const porTel = await api('/api/pacientes?q=4141234567', { token })
    expect(porTel.status).toBe(200)
    expect(porTel.body.some((p: { nombre_completo: string }) => p.nombre_completo === 'Juan Pérez')).toBe(true)

    // Maria García es tutora de Valentina (hija) con +584150000001.
    const porTelRep = await api('/api/pacientes?q=584150000001', { token })
    expect(porTelRep.status).toBe(200)
    expect(porTelRep.body.some((p: { nombre_completo: string }) => p.nombre_completo === 'Valentina García')).toBe(true)
  })
})
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

const svg = (texto: string) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#0f172a"/><text x="20" y="40" fill="#fff" font-size="24">${texto}</text></svg>`).toString('base64')

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
const ADMIN = 'V-11222333' // Dr. Luis Contreras (admin)

const PACIENTE = '20000000-0000-0000-0000-000000000001' // Juan Pérez
const ESTUDIO_SEED_RX = '9D000000-0000-0000-0000-000000000001' // RX tórax Juan Pérez
const ESTUDIO_SEED_TC = '9D000000-0000-0000-0000-000000000004' // TC abdomen (2 cortes)
const IMAGEN_SEED_RX = '9C000000-0000-0000-0000-000000000001'

describe('Imágenes: CRUD de estudios', () => {
  it('crea un estudio con varias imágenes (serie) y lo devuelve', async () => {
    const token = await login(SEC)
    const res = await api('/api/imagenes/estudios', {
      method: 'POST',
      token,
      body: {
        paciente_id: PACIENTE,
        tipo: 'tomografia',
        region: 'Abdomen',
        titulo: 'TC abdomen nuevo',
        hallazgos: 'Hallazgo A',
        impresion: 'Impresión B',
        imagenes: [
          { data_url: svg('CORTE 1') },
          { data_url: svg('CORTE 2'), descripcion: 'Corte 2' },
        ],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.titulo).toBe('TC abdomen nuevo')
    expect(res.body.imagenes).toHaveLength(2)
    expect(res.body.imagenes[0].orden).toBe(1)
    expect(res.body.imagenes[1].orden).toBe(2)
    expect(res.body.imagenes[0].estudio_id).toBe(res.body.id)
  })

  it('lista estudios por paciente con portada y conteo de imágenes', async () => {
    const token = await login(SEC)
    const res = await api(`/api/imagenes/estudios?paciente_id=${PACIENTE}`, { token })
    expect(res.status).toBe(200)
    const juan = res.body.filter((e: { paciente_id: string }) => e.paciente_id === PACIENTE)
    expect(juan.length).toBeGreaterThanOrEqual(2)
    const rx = juan.find((e: { id: string }) => e.id === ESTUDIO_SEED_RX)
    expect(rx.imagenes_count).toBe(1)
    expect(rx.portada).toContain('data:image/svg')
    expect(rx.paciente_nombre).toBe('Juan Pérez')
  })

  it('detalle de estudio: devuelve imágenes en orden y registra acceso de auditoría', async () => {
    const token = await login(SEC)
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_TC}`, { token })
    expect(res.status).toBe(200)
    expect(res.body.imagenes).toHaveLength(2)
    expect(res.body.imagenes.map((i: { orden: number }) => i.orden)).toEqual([1, 2])

    const { data: accesos } = await getAccesos()
    expect(accesos.some((a: { estudio_id: string; accion: string }) => a.estudio_id === ESTUDIO_SEED_TC && a.accion === 'ver')).toBe(true)
  })

  it('edita metadata del estudio (titulo, hallazgos, estado)', async () => {
    const token = await login(MED_A)
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_TC}`, {
      method: 'PATCH',
      token,
      body: { titulo: 'TC renovado', hallazgos: 'Nuevo hallazgo', estado: 'leido' },
    })
    expect(res.status).toBe(200)
    expect(res.body.titulo).toBe('TC renovado')
    expect(res.body.hallazgos).toBe('Nuevo hallazgo')
    expect(res.body.estado).toBe('leido')
  })

  it('RBAC: un médico no puede editar el estudio de otro', async () => {
    const token = await login(MED_B) // Dr. Ramírez no creó el RX ni es su medico_id
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}`, {
      method: 'PATCH',
      token,
      body: { hallazgos: 'Intento ajeno' },
    })
    expect(res.status).toBe(403)
  })

  it('RBAC: el médico asignado puede actualizar el informe', async () => {
    const token = await login(MED_A) // María es creadora y medico_id del RX
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}`, {
      method: 'PATCH',
      token,
      body: { impresion: 'Informe revisado por María', estado: 'leido' },
    })
    expect(res.status).toBe(200)
    expect(res.body.impresion).toBe('Informe revisado por María')
  })

  it('agrega imágenes a un estudio existente', async () => {
    const token = await login(MED_A)
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}/imagenes`, {
      method: 'POST',
      token,
      body: { imagenes: [{ data_url: svg('NUEVO'), descripcion: 'Corte adicional' }] },
    })
    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].orden).toBe(2)
    expect(res.body[0].estudio_id).toBe(ESTUDIO_SEED_RX)
  })

  it('elimina un estudio (borra sus imágenes en cascada)', async () => {
    const token = await login(MED_A)
    const del = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.body.ok).toBe(true)

    const detalle = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}`, { token })
    expect(detalle.status).toBe(404)

    const { data: imagenes } = await getImagenes()
    expect(imagenes.some((i: { id: string }) => i.id === IMAGEN_SEED_RX)).toBe(false)
  })

  it('RBAC: no permite eliminar un estudio ajeno', async () => {
    const token = await login(MED_B)
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}`, { method: 'DELETE', token })
    expect(res.status).toBe(403)
  })

  it('edita una imagen individual (descripcion/orden) y valida RBAC', async () => {
    const token = await login(MED_A)
    const ok = await api(`/api/imagenes/${IMAGEN_SEED_RX}`, {
      method: 'PATCH',
      token,
      body: { descripcion: 'Descripción nueva', orden: 5 },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.descripcion).toBe('Descripción nueva')
    expect(ok.body.orden).toBe(5)

    const ajeno = await api(`/api/imagenes/${IMAGEN_SEED_RX}`, {
      method: 'PATCH',
      token: await login(MED_B),
      body: { descripcion: 'Intento ajeno' },
    })
    expect(ajeno.status).toBe(403)
  })

  it('elimina una imagen individual (solo creador/admin)', async () => {
    const token = await login(MED_A) // creadora de la imagen RX seed
    const del = await api(`/api/imagenes/${IMAGEN_SEED_RX}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)

    const noPermiso = await api(`/api/imagenes/${IMAGEN_SEED_RX}`, { method: 'DELETE', token: await login(MED_B) })
    expect(noPermiso.status).toBe(404) // ya no existe
  })

  it('POST /api/imagenes (legacy) sigue creando imagen y auto-estudio', async () => {
    const token = await login(SEC)
    const res = await api('/api/imagenes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, tipo: 'foto', region: 'Piel', data_url: svg('FOTO') },
    })
    expect(res.status).toBe(201)
    expect(res.body.estudio_id).toBeTruthy()
  })

  it('rechaza data URLs inválidas al crear estudio', async () => {
    const token = await login(SEC)
    const res = await api('/api/imagenes/estudios', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, tipo: 'rx', imagenes: [{ data_url: 'not-a-data-url' }] },
    })
    expect(res.status).toBe(400)
  })
})

describe('Imágenes: compartición pública', () => {
  it('genera token de compartición y permite ver el estudio sin autenticación', async () => {
    const token = await login(MED_A)
    const comp = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}/compartir`, {
      method: 'POST',
      token,
      body: { dias: 7 },
    })
    expect(comp.status).toBe(200)
    expect(comp.body.token).toBeTruthy()

    const pub = await api(`/api/imagenes/compartir/${comp.body.token}`)
    expect(pub.status).toBe(200)
    expect(pub.body.estudio.id).toBe(ESTUDIO_SEED_RX)
    expect(pub.body.imagenes).toHaveLength(1)

    const { data: accesos } = await getAccesos()
    expect(accesos.some((a: { estudio_id: string; accion: string }) => a.estudio_id === ESTUDIO_SEED_RX && a.accion === 'compartir')).toBe(true)
  })

  it('devuelve 404 para un token inexistente', async () => {
    const res = await api('/api/imagenes/compartir/token-inventado')
    expect(res.status).toBe(404)
  })

  it('un médico ajeno no puede generar enlace de compartición', async () => {
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}/compartir`, {
      method: 'POST',
      token: await login(MED_B),
      body: { dias: 7 },
    })
    expect(res.status).toBe(403)
  })

  it('registra accesos de exportación', async () => {
    const token = await login(SEC)
    const res = await api(`/api/imagenes/estudios/${ESTUDIO_SEED_RX}/acceso`, {
      method: 'POST',
      token,
      body: { accion: 'exportar' },
    })
    expect(res.status).toBe(200)

    const { data: accesos } = await getAccesos()
    expect(accesos.some((a: { estudio_id: string; accion: string }) => a.estudio_id === ESTUDIO_SEED_RX && a.accion === 'exportar')).toBe(true)
  })
})

async function getAccesos() {
  const mod = await import('../src/config/supabase.js')
  const { data } = await mod.getSupabase().from('imagenes_accesos').select('*')
  return { data }
}

async function getImagenes() {
  const mod = await import('../src/config/supabase.js')
  const { data } = await mod.getSupabase().from('imagenes_clinicas').select('*')
  return { data }
}
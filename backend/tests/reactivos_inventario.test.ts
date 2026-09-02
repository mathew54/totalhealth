import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../src/app.js'
import { getSupabase } from '../src/config/supabase.js'

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

// Reactivos del seed.
const R_GLU = '91000000-0000-0000-0000-000000000001' // Tiras reactivas glucosa (120 uds)
const R_ORI = '91000000-0000-0000-0000-000000000003' // Tiras de orina (lote vencido)
const R_TSH = '91000000-0000-0000-0000-000000000004' // Kit TSH (4 uds, alerta 8)
const R_HEM = '91000000-0000-0000-0000-000000000002' // HemoCue (15 uds, vence 2026-09-01)

describe('Inventario de reactivos (Fase 1)', () => {
  let tokenLab = ''
  let tokenSec = ''
  let reactivoId = ''
  let loteIdA = ''
  let loteIdB = ''

  it('laboratorio puede listar el catálogo con stock utilizable', async () => {
    tokenLab = (await login(LAB)).body.access_token
    tokenSec = (await login(SEC)).body.access_token
    expect(tokenLab).toBeTruthy()

    const res = await api('/api/reactivos', { token: tokenLab })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const glu = res.body.find((r: { id: string }) => r.id === R_GLU)
    expect(glu.cantidad).toBe(120)
    expect(glu.numero_lotes).toBe(1)
    expect(glu.lotes_activos).toBe(1)
    expect(glu.proximo_vencimiento).toBe('2026-12-01')
    expect(glu.unidad).toBe('unidades')

    // Lote vencido NO suma stock utilizable.
    const ori = res.body.find((r: { id: string }) => r.id === R_ORI)
    expect(ori.cantidad).toBe(0)
    expect(ori.lotes_activos).toBe(0)
  })

  it('la secretaria puede consultar pero no mutar', async () => {
    const lista = await api('/api/reactivos', { token: tokenSec })
    expect(lista.status).toBe(200)

    const crea = await api('/api/reactivos', {
      method: 'POST',
      token: tokenSec,
      body: { nombre: 'Bloqueo rol' },
    })
    expect(crea.status).toBe(403)
  })

  it('GET /api/reactivos/:id devuelve el detalle con lotes (FEFO)', async () => {
    const res = await api(`/api/reactivos/${R_GLU}`, { token: tokenLab })
    expect(res.status).toBe(200)
    expect(res.body.nombre).toBe('Tiras reactivas glucosa')
    expect(res.body.lotes.length).toBe(1)
    expect(res.body.lotes[0].lote).toBe('GLU-2026-01')
    expect(res.body.lotes[0].estado).toBe('activo')
  })

  it('POST crea reactivo con lote inicial y kardex de entrada', async () => {
    const res = await api('/api/reactivos', {
      method: 'POST',
      token: tokenLab,
      body: {
        nombre: 'Test Reactivo A',
        lote: 'A-1',
        fecha_vencimiento: '2027-06-01',
        cantidad: 10,
        alerta_minima: 5,
        unidad: 'ml',
        costo_unitario: 2.5,
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.cantidad).toBe(10)
    expect(res.body.lote).toBe('A-1')
    reactivoId = res.body.id

    const movs = await api(`/api/reactivos/movimientos?reactivo_id=${reactivoId}`, { token: tokenLab })
    expect(movs.status).toBe(200)
    expect(movs.body).toHaveLength(1)
    expect(movs.body[0].tipo).toBe('entrada')
    expect(movs.body[0].cantidad).toBe(10)
  })

  it('POST con cantidad 0 crea reactivo sin lote', async () => {
    const res = await api('/api/reactivos', {
      method: 'POST',
      token: tokenLab,
      body: { nombre: 'Test Reactivo Sin Stock' },
    })
    expect(res.status).toBe(201)
    expect(res.body.cantidad).toBe(0)

    const detalle = await api(`/api/reactivos/${res.body.id}`, { token: tokenLab })
    expect(detalle.body.lotes).toHaveLength(0)
  })

  it('POST /:id/lotes registra recepción y recalcula stock + legacy', async () => {
    const res = await api(`/api/reactivos/${reactivoId}/lotes`, {
      method: 'POST',
      token: tokenLab,
      body: { lote: 'B-2', fecha_vencimiento: '2026-11-30', cantidad: 25 },
    })
    expect(res.status).toBe(201)
    expect(res.body.estado).toBe('activo')
    loteIdB = res.body.id

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    const lotes = detalle.body.lotes
    expect(lotes).toHaveLength(2)
    // Lote B vence antes → pasa a ser el campo legacy y aparece primero (FEFO).
    expect(detalle.body.cantidad).toBe(35)
    expect(detalle.body.lote).toBe('B-2')
    expect(lotes[0].lote).toBe('B-2')
    loteIdA = lotes.find((l: { lote: string }) => l.lote === 'A-1').id
  })

  it('POST /lotes/:loteId/salida descuenta y registra movimiento', async () => {
    const res = await api(`/api/reactivos/lotes/${loteIdB}/salida`, {
      method: 'POST',
      token: tokenLab,
      body: { cantidad: 6, motivo: 'Uso en jornada' },
    })
    expect(res.status).toBe(200)
    expect(res.body.salida).toBe(6)
    expect(res.body.disponible).toBe(19)

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    expect(detalle.body.cantidad).toBe(29)

    const movs = await api(`/api/reactivos/movimientos?reactivo_id=${reactivoId}`, { token: tokenLab })
    expect(movs.body[0].tipo).toBe('salida')
    expect(movs.body[0].cantidad).toBe(-6)
    expect(movs.body[0].motivo).toBe('Uso en jornada')
  })

  it('salida insuficiente o de lote vencido es rechazada', async () => {
    const demasiado = await api(`/api/reactivos/lotes/${loteIdB}/salida`, {
      method: 'POST',
      token: tokenLab,
      body: { cantidad: 999 },
    })
    expect(demasiado.status).toBe(400)

    const oriLote = '9F000000-0000-0000-0000-000000000003' // lote ORI vencido
    const vencido = await api(`/api/reactivos/lotes/${oriLote}/salida`, {
      method: 'POST',
      token: tokenLab,
      body: { cantidad: 1 },
    })
    expect(vencido.status).toBe(400)
  })

  it('POST /lotes/:loteId/ajuste corrige stock con delta', async () => {
    const res = await api(`/api/reactivos/lotes/${loteIdB}/ajuste`, {
      method: 'POST',
      token: tokenLab,
      body: { cantidad: 20, motivo: 'Corrección de inventario' },
    })
    expect(res.status).toBe(200)
    expect(res.body.delta).toBe(1)
    expect(res.body.posterior).toBe(20)

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    expect(detalle.body.cantidad).toBe(30)
  })

  it('POST /consumo descuenta FEFO (del lote que expira primero)', async () => {
    // Lotes: A (vence 2027-06-01, 10) y B (vence 2026-11-30, 20).
    const res = await api('/api/reactivos/consumo', {
      method: 'POST',
      token: tokenLab,
      body: { reactivo_id: reactivoId, cantidad: 12, motivo: 'Consumo de laboratorio' },
    })
    expect(res.status).toBe(200)
    expect(res.body.consumido).toBe(12)
    // El consumo debe salir del lote B (vence primero).
    expect(res.body.lotes).toHaveLength(1)
    expect(res.body.lotes[0].loteId).toBe(loteIdB)

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    expect(detalle.body.cantidad).toBe(18)
    const lotes = detalle.body.lotes
    expect(lotes.find((l: { id: string }) => l.id === loteIdB).cantidad).toBe(8)
    expect(lotes.find((l: { id: string }) => l.id === loteIdA).cantidad).toBe(10)
  })

  it('POST /consumo con stock insuficiente falla', async () => {
    const res = await api('/api/reactivos/consumo', {
      method: 'POST',
      token: tokenLab,
      body: { reactivo_id: reactivoId, cantidad: 9999 },
    })
    expect(res.status).toBe(400)
  })

  it('GET /estado detecta vencidos, por vencer y bajo stock', async () => {
    const res = await api('/api/reactivos/estado', { token: tokenLab })
    expect(res.status).toBe(200)

    // Lote ORI está vencido en el seed.
    const vencidos = res.body.vencidos as { lote: string }[]
    expect(vencidos.some((v) => v.lote === 'ORI-2025-11')).toBe(true)

    // HEM vence 2026-09-01 → dentro de 30 días desde hoy.
    const porVencer = res.body.por_vencer as { lote: string }[]
    expect(porVencer.some((v) => v.lote === 'HEM-2026-02')).toBe(true)

    // TSH tiene 4 uds con alerta de 8.
    const bajoStock = res.body.bajo_stock as { id: string }[]
    expect(bajoStock.some((r) => r.id === R_TSH)).toBe(true)

    // ORI quedó con stock 0.
    const agotados = res.body.agotados as { id: string }[]
    expect(agotados.some((r) => r.id === R_ORI)).toBe(true)
  })

  it('POST /revisar-vencimientos marca lotes activos ya vencidos', async () => {
    const creado = await api('/api/reactivos', {
      method: 'POST',
      token: tokenLab,
      body: { nombre: 'Test Vencimiento', cantidad: 0 },
    })
    expect(creado.status).toBe(201)
    const rid = creado.body.id

    // Lote "activo" con vencimiento en el pasado (insert directo, sin pasar
    // por recibirLote que lo marcaría vencido al instante).
    await getSupabase().from('reactivo_lotes').insert({
      clinica_id: '00000000-0000-0000-0000-000000000001',
      reactivo_id: rid,
      lote: 'V-EXP',
      fecha_vencimiento: '2026-01-15',
      cantidad: 10,
      cantidad_inicial: 10,
      estado: 'activo',
      fecha_recepcion: '2026-01-01',
    })

    const res = await api('/api/reactivos/revisar-vencimientos', { method: 'POST', token: tokenLab })
    expect(res.status).toBe(200)
    const marcado = res.body.vencidos.find((v: { reactivo_id: string }) => v.reactivo_id === rid)
    expect(marcado).toBeTruthy()
    expect(marcado.cantidad).toBe(10)

    const detalle = await api(`/api/reactivos/${rid}`, { token: tokenLab })
    expect(detalle.body.cantidad).toBe(0)
    expect(detalle.body.lotes[0].estado).toBe('vencido')

    const movs = await api(`/api/reactivos/movimientos?reactivo_id=${rid}`, { token: tokenLab })
    expect(movs.body.some((m: { tipo: string }) => m.tipo === 'vencido')).toBe(true)
  })

  it('PATCH edita solo el catálogo', async () => {
    const res = await api(`/api/reactivos/${reactivoId}`, {
      method: 'PATCH',
      token: tokenLab,
      body: { alerta_minima: 7, proveedor: 'Distribuidora X' },
    })
    expect(res.status).toBe(200)
    expect(res.body.alerta_minima).toBe(7)

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    expect(detalle.body.proveedor).toBe('Distribuidora X')
    expect(detalle.body.cantidad).toBe(18)
  })

  it('validaciones: nombre corto e ids inválidos', async () => {
    const corto = await api('/api/reactivos', {
      method: 'POST',
      token: tokenLab,
      body: { nombre: 'X' },
    })
    expect(corto.status).toBe(400)

    const badId = await api('/api/reactivos/no-es-uuid/lotes', {
      method: 'POST',
      token: tokenLab,
      body: { lote: 'X', cantidad: 1 },
    })
    expect(badId.status).toBe(400)
  })

  it('DELETE elimina reactivo con sus lotes y movimientos', async () => {
    const res = await api(`/api/reactivos/${reactivoId}`, { method: 'DELETE', token: tokenLab })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const detalle = await api(`/api/reactivos/${reactivoId}`, { token: tokenLab })
    expect(detalle.status).toBe(404)
  })
})

describe('Fase 2: consumo automático al emitir resultados', () => {
  let token = ''
  const R_GLU = '91000000-0000-0000-0000-000000000001' // 120 uds en el seed
  const PACIENTE = '20000000-0000-0000-0000-000000000001'
  const EXAMEN_GLICEMIA = '40000000-0000-0000-0000-000000000002'

  async function crearSolicitud() {
    const creada = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: [EXAMEN_GLICEMIA] },
    })
    expect(creada.status).toBe(201)
    const solicitudId = creada.body.id as string
    const detalleId = creada.body.lineas[0].id as string

    // Completa los checkpoints pre-analíticos para poder emitir resultados.
    const { data: checkpoints } = await getSupabase().from('checkpoints_preanalitica').select('id').eq('activo', true)
    for (const cp of checkpoints ?? []) {
      await getSupabase().from('solicitudes_preanalitica').insert({
        solicitud_id: solicitudId,
        checkpoint_id: cp.id,
        cumplido: true,
        validado_por: null,
      })
    }
    return { solicitudId, detalleId }
  }

  it('descuenta stock FEFO y deja trazabilidad lote → resultado', async () => {
    token = (await login(LAB)).body.access_token
    const { solicitudId, detalleId } = await crearSolicitud()

    const res = await api(`/api/solicitudes/${solicitudId}/resultados`, {
      method: 'POST',
      token,
      body: {
        lineas: [
          {
            solicitud_detalle_id: detalleId,
            valores: { glicemia: '88 mg/dL' },
            reactivos: [{ reactivo_id: R_GLU, cantidad: 2 }],
          },
        ],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.consumo_reactivos.aplicado).toBe(true)
    expect(res.body.consumo_reactivos.consumos).toHaveLength(1)
    expect(res.body.consumo_reactivos.consumos[0].consumido).toBe(2)
    expect(res.body.consumo_reactivos.consumos[0].solicitud_detalle_id).toBe(detalleId)

    // Stock del reactivo GLU: 120 → 118.
    const lista = await api('/api/reactivos', { token })
    const glu = lista.body.find((r: { id: string }) => r.id === R_GLU)
    expect(glu.cantidad).toBe(118)

    // Kardex con trazabilidad: consumo ligado a la línea de la solicitud.
    const movs = await api(`/api/reactivos/movimientos?reactivo_id=${R_GLU}`, { token })
    expect(movs.body[0].tipo).toBe('consumo')
    expect(movs.body[0].cantidad).toBe(-2)
    expect(movs.body[0].motivo).toBe('Consumo por emisión de resultado')
    expect(movs.body[0].solicitud_detalle_id).toBe(detalleId)
  })

  it('stock insuficiente no bloquea la emisión: reporta el error', async () => {
    const { solicitudId, detalleId } = await crearSolicitud()
    const res = await api(`/api/solicitudes/${solicitudId}/resultados`, {
      method: 'POST',
      token,
      body: {
        lineas: [
          {
            solicitud_detalle_id: detalleId,
            valores: { glicemia: '90 mg/dL' },
            reactivos: [{ reactivo_id: R_GLU, cantidad: 99999 }],
          },
        ],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.resultados).toHaveLength(1) // el resultado sí se emitió
    expect(res.body.consumo_reactivos.aplicado).toBe(false)
    expect(res.body.consumo_reactivos.errores[0].error).toMatch(/Stock insuficiente/)
  })

  it('reactivo inexistente se reporta sin bloquear la emisión', async () => {
    const { solicitudId, detalleId } = await crearSolicitud()
    const fake = 'aaaaaaaa-0000-0000-0000-000000000001'
    const res = await api(`/api/solicitudes/${solicitudId}/resultados`, {
      method: 'POST',
      token,
      body: {
        lineas: [
          {
            solicitud_detalle_id: detalleId,
            valores: { glicemia: '92 mg/dL' },
            reactivos: [{ reactivo_id: fake, cantidad: 1 }],
          },
        ],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.consumo_reactivos.aplicado).toBe(false)
    expect(res.body.consumo_reactivos.errores[0].error).toMatch(/Reactivo no encontrado/)
  })

  it('sin reactivos la emisión sigue funcionando (compatibilidad)', async () => {
    const { solicitudId, detalleId } = await crearSolicitud()
    const res = await api(`/api/solicitudes/${solicitudId}/resultados`, {
      method: 'POST',
      token,
      body: { lineas: [{ solicitud_detalle_id: detalleId, valores: { glicemia: '85 mg/dL' } }] },
    })
    expect(res.status).toBe(201)
    // No se bloquea la emisión. Glicemia tiene receta automática de 1 tira en el
    // seed (examenes_reactivos), así que el consumo automático aplica 1 unidad.
    expect(res.body.consumo_reactivos.aplicado).toBe(true)
    expect(res.body.consumo_reactivos.consumos).toHaveLength(1)
    expect(res.body.consumo_reactivos.consumos[0].reactivo_id).toBe(R_GLU)
    expect(res.body.consumo_reactivos.consumos[0].consumido).toBe(1)
  })
})

describe('Fase 3: alertas de inventario y consumo', () => {
  let token = ''
  const R_GLU = '91000000-0000-0000-0000-000000000001'
  const R_TSH = '91000000-0000-0000-0000-000000000004'
  const R_ORI = '91000000-0000-0000-0000-000000000003'
  const PACIENTE = '20000000-0000-0000-0000-000000000001'
  const EXAMEN_GLICEMIA = '40000000-0000-0000-0000-000000000002'

  async function crearSolicitudConPreanalitica() {
    const creada = await api('/api/solicitudes', {
      method: 'POST',
      token,
      body: { paciente_id: PACIENTE, examenes: [EXAMEN_GLICEMIA] },
    })
    const solicitudId = creada.body.id as string
    const detalleId = creada.body.lineas[0].id as string
    const { data: checkpoints } = await getSupabase().from('checkpoints_preanalitica').select('id').eq('activo', true)
    for (const cp of checkpoints ?? []) {
      await getSupabase().from('solicitudes_preanalitica').insert({
        solicitud_id: solicitudId,
        checkpoint_id: cp.id,
        cumplido: true,
        validado_por: null,
      })
    }
    return { solicitudId, detalleId }
  }

  it('GET /alertas lista las alertas del seed sin leer', async () => {
    token = (await login(LAB)).body.access_token
    const res = await api('/api/reactivos/alertas', { token })
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(3)
    expect(res.body.some((a: { tipo: string; reactivo_id: string }) => a.tipo === 'vencido' && a.reactivo_id === R_ORI)).toBe(true)
    expect(res.body.some((a: { tipo: string; reactivo_id: string }) => a.tipo === 'bajo_stock' && a.reactivo_id === R_TSH)).toBe(true)
    expect(res.body.some((a: { tipo: string; reactivo_id: string }) => a.tipo === 'por_vencer' && a.reactivo_id === R_GLU)).toBe(false)
    expect(res.body.every((a: { leida: boolean }) => a.leida === false)).toBe(true)
  })

  it('POST /alertas/leer marca por ids y sin ids marca todas', async () => {
    const lista = await api('/api/reactivos/alertas', { token })
    const vencidoId = lista.body.find((a: { tipo: string }) => a.tipo === 'vencido').id

    const res = await api('/api/reactivos/alertas/leer', { method: 'POST', token, body: { ids: [vencidoId] } })
    expect(res.status).toBe(200)
    expect(res.body.marcadas).toBe(1)

    const despues = await api('/api/reactivos/alertas', { token })
    expect(despues.body.find((a: { id: string }) => a.id === vencidoId).leida).toBe(true)
    expect(despues.body.filter((a: { leida: boolean }) => !a.leida).length).toBeGreaterThan(0)

    const todas = await api('/api/reactivos/alertas/leer', { method: 'POST', token, body: {} })
    expect(todas.body.marcadas).toBeGreaterThan(0)
    const final = await api('/api/reactivos/alertas', { token })
    expect(final.body.every((a: { leida: boolean }) => a.leida === true)).toBe(true)
  })

  it('genera alerta de bajo stock, no duplica y se resuelve al reponer', async () => {
    await api('/api/reactivos/alertas/leer', { method: 'POST', token, body: {} })

    const creado = await api('/api/reactivos', {
      method: 'POST',
      token,
      body: { nombre: 'Test Alertas', cantidad: 3, alerta_minima: 5, lote: 'AL-1' },
    })
    expect(creado.status).toBe(201)
    const rid = creado.body.id

    const a1 = await api('/api/reactivos/alertas', { token })
    expect(a1.body.some((x: { reactivo_id: string; tipo: string }) => x.reactivo_id === rid && x.tipo === 'bajo_stock')).toBe(true)

    const consumido = await api('/api/reactivos/consumo', {
      method: 'POST',
      token,
      body: { reactivo_id: rid, cantidad: 1, motivo: 'test' },
    })
    expect(consumido.status).toBe(200)
    const a2 = await api('/api/reactivos/alertas', { token })
    const dupes = a2.body.filter((x: { reactivo_id: string; tipo: string }) => x.reactivo_id === rid && x.tipo === 'bajo_stock')
    expect(dupes.length).toBe(1)

    await api(`/api/reactivos/${rid}/lotes`, { method: 'POST', token, body: { lote: 'AL-2', cantidad: 20 } })
    const a3 = await api('/api/reactivos/alertas', { token })
    const abiertas = a3.body.filter((x: { reactivo_id: string; leida: boolean }) => x.reactivo_id === rid && !x.leida)
    expect(abiertas.length).toBe(0)
  })

  it('revisar-vencimientos genera alerta de vencido', async () => {
    const creado = await api('/api/reactivos', { method: 'POST', token, body: { nombre: 'Test Vence Alertas', cantidad: 0 } })
    const rid = creado.body.id
    await getSupabase().from('reactivo_lotes').insert({
      clinica_id: '00000000-0000-0000-0000-000000000001',
      reactivo_id: rid,
      lote: 'V-EXP2',
      fecha_vencimiento: '2026-02-01',
      cantidad: 5,
      cantidad_inicial: 5,
      estado: 'activo',
      fecha_recepcion: '2026-01-01',
    })
    const res = await api('/api/reactivos/revisar-vencimientos', { method: 'POST', token })
    expect(res.status).toBe(200)
    const alertas = await api('/api/reactivos/alertas', { token })
    expect(alertas.body.some((x: { reactivo_id: string; tipo: string }) => x.reactivo_id === rid && x.tipo === 'vencido')).toBe(true)
  })

  it('GET /consumo resume consumo por reactivo y por examen', async () => {
    const { solicitudId, detalleId } = await crearSolicitudConPreanalitica()
    const emitir = await api(`/api/solicitudes/${solicitudId}/resultados`, {
      method: 'POST',
      token,
      body: {
        lineas: [
          {
            solicitud_detalle_id: detalleId,
            valores: { resultado: '90' },
            reactivos: [{ reactivo_id: R_GLU, cantidad: 3 }],
          },
        ],
      },
    })
    expect(emitir.status).toBe(201)
    expect(emitir.body.consumo_reactivos.aplicado).toBe(true)

    const consumo = await api('/api/reactivos/consumo?dias=30', { token })
    expect(consumo.status).toBe(200)
    expect(consumo.body.dias).toBe(30)
    const glu = consumo.body.por_reactivo.find((r: { reactivo_id: string }) => r.reactivo_id === R_GLU)
    expect(glu).toBeTruthy()
    expect(glu.consumido).toBeGreaterThanOrEqual(3)
    expect(typeof glu.dias_hasta_agotar).toBe('number')
    expect(glu.sugerido_reponer).toBeGreaterThanOrEqual(0)

    const glicemia = consumo.body.por_examen.find((e: { examen_id: string }) => e.examen_id === EXAMEN_GLICEMIA)
    expect(glicemia).toBeTruthy()
    expect(glicemia.cantidad).toBeGreaterThanOrEqual(3)
  })
})
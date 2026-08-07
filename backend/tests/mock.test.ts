import { describe, it, expect } from 'vitest'
import { getMockClient, mockTables, resetMock } from '../src/mock/client.js'
import { signPortalToken, signShareToken, verifyPortalToken, verifyShareToken } from '../src/utils/jwt.js'
import { verifySupabaseToken } from '../src/utils/jwt.js'

describe('mock supabase', () => {
  it('login devuelve sesión con token verificable', async () => {
    const { data } = await getMockClient().auth.signInWithPassword({
      email: 'admin@totalhealth.local',
      password: 'demo1234',
    })
    const session = data?.session as any
    expect(session).toBeTruthy()
    expect(session.access_token).toBeTruthy()

    const user = verifySupabaseToken(session.access_token)
    expect(user.id).toBeTruthy()
  })

  it('query profiles por id', async () => {
    const { data } = await getMockClient()
      .from('profiles')
      .select('id, role, clinica_id, nombre_completo, activo')
      .eq('id', '10000000-0000-0000-0000-000000000001')
      .single()
    expect(data?.nombre_completo).toBe('Super Root')
  })

  it('lista staff ordenado', async () => {
    const { data } = await getMockClient()
      .from('profiles')
      .select('id, role, nombre_completo, cedula, telefono, activo, created_at')
      .order('created_at', { ascending: false })
    expect(Array.isArray(data)).toBe(true)
    expect((data as any[]).length).toBeGreaterThanOrEqual(5)
  })

  it('token de portal: firma y verificación del paciente', () => {
    const token = signPortalToken('20000000-0000-0000-0000-000000000001')
    const payload = verifyPortalToken(token)
    expect(payload.pid).toBe('20000000-0000-0000-0000-000000000001')
  })

  it('token de compartir resultado: firma y verificación de rid/pid', () => {
    const token = signShareToken(
      '20000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000002',
    )
    const payload = verifyShareToken(token)
    expect(payload.pid).toBe('20000000-0000-0000-0000-000000000001')
    expect(payload.rid).toBe('70000000-0000-0000-0000-000000000002')
  })

  it('mis-pagos del portal devuelve pagos y pendientes del paciente', async () => {
    const token = signPortalToken('20000000-0000-0000-0000-000000000003')
    const pid = verifyPortalToken(token).pid

    const { data: pagos } = await getMockClient()
      .from('pagos')
      .select('id, monto, estado')
      .eq('paciente_id', pid)
      .order('fecha', { ascending: false })
    expect(Array.isArray(pagos)).toBe(true)
    expect((pagos as any[]).length).toBeGreaterThanOrEqual(1)
  })

  it('mockTables expone todas las tablas del seed sin mutar el store', async () => {
    const tablas = mockTables()
    expect(Object.keys(tablas).length).toBeGreaterThanOrEqual(20)
    expect(tablas.profiles.length).toBeGreaterThanOrEqual(5)
    expect(tablas.pacientes.length).toBeGreaterThanOrEqual(4)

    // La copia no debe compartir referencias con el store interno.
    const original = mockTables()
    tablas.pacientes[0].id = 'mutado'
    expect(mockTables().pacientes[0].id).toBe(original.pacientes[0].id)
  })

  it('resetMock restablece el store al seed inicial', async () => {
    const antes = mockTables()
    await getMockClient().from('pacientes').insert({ id: 'zzzz-0000-0000-0000-000000000000', cedula: 'V-99999999', nombre_completo: 'Temporal' })

    resetMock()
    const despues = mockTables()
    expect(despues.pacientes.find((p) => p.id === 'zzzz-0000-0000-0000-000000000000')).toBeUndefined()
    expect(despues.pacientes.length).toBe(antes.pacientes.length)
  })
})
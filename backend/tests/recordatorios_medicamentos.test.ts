import { describe, it, expect, beforeEach } from 'vitest'
import { resetMock } from '../src/mock/client.js'
import { getSupabase } from '../src/config/supabase.js'
import {
  ejecutarRecordatoriosMedicamentos,
  limpiarRecordatoriosMedicamentosVencidos,
} from '../src/jobs/recordatoriosMedicamentos.js'

const RECORDATORIO_ID = '8A000000-0000-0000-0000-000000000001'

async function getColaMedicamentos() {
  const { data } = await getSupabase().from('notificaciones').select('*').eq('tipo', 'medicamento')
  return data ?? []
}

async function crearRecordatorioDemo() {
  const { error } = await getSupabase().from('medicamento_recordatorios').insert({
    id: RECORDATORIO_ID,
    recipe_detalle_id: '81000000-0000-0000-0000-000000000001', // Omeprazol (receta activa)
    paciente_id: '20000000-0000-0000-0000-000000000002', // María García (con teléfono)
    hora: '08:00',
    canal: 'push',
    activo: true,
  })
  expect(error).toBeNull()
}

beforeEach(() => {
  resetMock()
})

describe('Job de recordatorios de medicamentos', () => {
  it('agenda el recordatorio activo para la próxima hora sin duplicar', async () => {
    await crearRecordatorioDemo()

    const primerCiclo = await ejecutarRecordatoriosMedicamentos()
    expect(primerCiclo.agendados).toBe(1)
    expect(primerCiclo.limpiados).toBe(0)

    const cola = await getColaMedicamentos()
    expect(cola.length).toBe(1)
    expect(cola[0].estado).toBe('pendiente')
    expect(cola[0].metadata?.recordatorio_id).toBe(RECORDATORIO_ID)

    // Segunda ejecución: la deduplicación evita re-agendar.
    const segundoCiclo = await ejecutarRecordatoriosMedicamentos()
    expect(segundoCiclo.agendados).toBe(0)
    expect((await getColaMedicamentos()).length).toBe(1)
  })

  it('limpia los recordatorios ya cumplidos para re-agendar el siguiente día', async () => {
    await crearRecordatorioDemo()

    // Simula un recordatorio ya enviado (cumplido) del día anterior.
    const { error } = await getSupabase().from('notificaciones').insert({
      paciente_id: '20000000-0000-0000-0000-000000000002',
      canal: 'push',
      tipo: 'medicamento',
      mensaje: 'María García, recuerda tomar Omeprazol 20 mg.',
      programada_para: new Date(Date.now() - 25 * 3600_000).toISOString(), // ayer
      estado: 'enviada',
      enviada_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
      sent_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
      metadata: { recordatorio_id: RECORDATORIO_ID },
    })
    expect(error).toBeNull()

    const limpiados = await limpiarRecordatoriosMedicamentosVencidos()
    expect(limpiados).toBe(1)
    expect((await getColaMedicamentos()).length).toBe(0)

    // Al limpiar, el nuevo ciclo puede volver a agendar el del día actual.
    const ciclo = await ejecutarRecordatoriosMedicamentos()
    expect(ciclo.agendados).toBe(1)
  })

  it('no borra los recordatorios que quedaron fallidos aún vigentes (reintento manual)', async () => {
    await crearRecordatorioDemo()
    await getSupabase().from('notificaciones').insert({
      paciente_id: '20000000-0000-0000-0000-000000000002',
      canal: 'sms',
      tipo: 'medicamento',
      mensaje: 'María García, recuerda tomar Omeprazol 20 mg.',
      programada_para: new Date(Date.now() + 2 * 3600_000).toISOString(), // aún vigente
      estado: 'fallida',
      error: 'Teléfono inválido o ausente',
      metadata: { recordatorio_id: RECORDATORIO_ID },
    })

    const limpiados = await limpiarRecordatoriosMedicamentosVencidos()
    expect(limpiados).toBe(0)
    expect((await getColaMedicamentos()).some((n) => n.estado === 'fallida')).toBe(true)
  })
})
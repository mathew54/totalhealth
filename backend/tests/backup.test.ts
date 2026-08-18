import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { resetMock, getMockClient } from '../src/mock/client.js'
import {
  crearBackup,
  listarBackups,
  leerBackup,
  restaurarBackup,
  cargarDataInicial,
  nombreArchivoSeguro,
} from '../src/services/backupService.js'
import type { BackupFile } from '../src/services/backupService.js'

// En tests el modo es 'mock' (sin SUPABASE_URL). El directorio de backups queda
// en backend/backups; se limpia al terminar la suite.
const BACKUP_DIR = path.resolve(import.meta.dirname, '../backups')

function limpiarBackups() {
  if (fs.existsSync(BACKUP_DIR)) {
    for (const f of fs.readdirSync(BACKUP_DIR)) fs.unlinkSync(path.join(BACKUP_DIR, f))
  }
}

describe('backups (modo mock)', () => {
  beforeAll(() => limpiarBackups())
  afterAll(() => limpiarBackups())

  it('nombreArchivoSeguro rechaza rutas y acepta JSON', () => {
    expect(nombreArchivoSeguro('backup-mock-2026-08-17.json')).toBe(true)
    expect(nombreArchivoSeguro('../secret.json')).toBe(false)
    expect(nombreArchivoSeguro('a/b.json')).toBe(false)
    expect(nombreArchivoSeguro('backup.txt')).toBe(false)
  })

  it('crearBackup guarda un archivo con formato y resumen', async () => {
    resetMock()
    const resumen = await crearBackup()
    expect(resumen.origen).toBe('mock')
    expect(resumen.total).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(BACKUP_DIR, resumen.archivo))).toBe(true)

    const leido = leerBackup(resumen.archivo)
    expect(leido.formato).toBe('totalhealth-backup-v1')
    expect(leido.data.authUsers?.length).toBeGreaterThanOrEqual(5)
    expect(leido.data.tables.profiles.length).toBeGreaterThanOrEqual(5)
  })

  it('listarBackups devuelve los archivos guardados', async () => {
    const antes = listarBackups().length
    await crearBackup()
    const lista = listarBackups()
    expect(lista.length).toBe(antes + 1)
    expect(lista[0]).toHaveProperty('archivo')
    expect(lista[0]).toHaveProperty('total')
  })

  it('restaurarBackup restaura los datos del respaldo', async () => {
    resetMock()
    // Muta la base mock (inserta un paciente temporal).
    await getMockClient().from('pacientes').insert({ id: 'zzzz-0000-0000-0000-000000000000', cedula: 'V-99999999', nombre_completo: 'Temporal' })

    // Genera un respaldo con ese paciente extra.
    const resumen = await crearBackup()
    const backup = leerBackup(resumen.archivo)
    expect(backup.data.tables.pacientes.some((p) => p.cedula === 'V-99999999')).toBe(true)

    // Restaura el seed limpio (reset) y luego el respaldo mutado.
    await cargarDataInicial()
    const sinTemporal = await getMockClient().from('pacientes').select('id').eq('cedula', 'V-99999999')
    expect(sinTemporal.data).toEqual([])

    await restaurarBackup(leerBackup(resumen.archivo))
    const conTemporal = await getMockClient().from('pacientes').select('id').eq('cedula', 'V-99999999')
    expect(conTemporal.data).toHaveLength(1)
  })

  it('cargarDataInicial restablece al seed y recrea usuarios demo', async () => {
    resetMock()
    await getMockClient().from('pacientes').insert({ id: 'aaaa-0000-0000-0000-000000000000', cedula: 'V-88888888', nombre_completo: 'Borrar' })
    const antes = await getMockClient().from('pacientes').select('id')
    expect(antes.data.length).toBeGreaterThan(0)

    const resumen = await cargarDataInicial()
    expect(resumen.origen).toBe('mock')

    const despues = await getMockClient().from('pacientes').select('id').eq('cedula', 'V-88888888')
    expect(despues.data).toEqual([])

    const { data: login } = await getMockClient().auth.signInWithPassword({
      email: 'admin@totalhealth.local',
      password: 'demo1234',
    })
    expect(login?.session?.access_token).toBeTruthy()
  })

  it('restaurarBackup valida que el origen coincida con el modo', async () => {
    const backup: BackupFile = {
      formato: 'totalhealth-backup-v1',
      creado_at: new Date().toISOString(),
      origen: 'db',
      data: { tables: { pacientes: [] } },
    }
    await expect(restaurarBackup(backup)).rejects.toThrow(/origen/)
  })

  it('listarBackups tolera archivos corruptos sin romper la lista', () => {
    limpiarBackups()
    fs.writeFileSync(path.join(BACKUP_DIR, 'roto.json'), '{no es json')
    const lista = listarBackups()
    expect(lista).toHaveLength(1)
    expect(lista[0].archivo).toBe('roto.json')
  })
})
import { describe, it, expect } from 'vitest'
import { normalizeDocumento, documentoSchema, createPacienteSchema } from '../src/modules/pacientes/pacientes.validators.js'
import { parseNumeroBcv, parseTasasBcv, fechaHoyCaracas } from '../src/services/bcv.js'

describe('tipos de documento de identidad VE', () => {
  it('normaliza los tipos V/E/J/P/C', () => {
    expect(normalizeDocumento('v-12345678')).toBe('V-12345678')
    expect(normalizeDocumento('v12345678')).toBe('V-12345678')
    expect(normalizeDocumento('E 23456789')).toBe('E-23456789')
    expect(normalizeDocumento('j-12345678-0')).toBe('J-12345678-0')
    expect(normalizeDocumento('P-1234567')).toBe('P-1234567')
    expect(normalizeDocumento('c-98765432')).toBe('C-98765432')
  })

  it('el esquema acepta los cinco tipos', () => {
    for (const doc of ['V-12345678', 'E-23456789', 'J-12345678-0', 'P-1234567', 'C-98765432']) {
      expect(documentoSchema.safeParse(doc).success).toBe(true)
    }
  })

  it('el esquema rechaza formatos inválidos', () => {
    expect(documentoSchema.safeParse('X-12345678').success).toBe(false)
    expect(documentoSchema.safeParse('V-123').success).toBe(false)
    expect(documentoSchema.safeParse('V-abcdefgh').success).toBe(false)
  })
})

describe('alta de paciente menor / con hijo', () => {
  it('un adulto requiere cédula', () => {
    const res = createPacienteSchema.safeParse({ nombre_completo: 'Test' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues.some((i) => i.path.includes('cedula'))).toBe(true)
  })

  it('un menor exige representante y no exige cédula', () => {
    const res = createPacienteSchema.safeParse({
      nombre_completo: 'Niño Test',
      es_menor: true,
      representante_id: '20000000-0000-0000-0000-000000000001',
    })
    expect(res.success).toBe(true)
  })

  it('un menor sin representante es rechazado', () => {
    const res = createPacienteSchema.safeParse({ nombre_completo: 'Niño Test', es_menor: true })
    expect(res.success).toBe(false)
  })

  it('acepta el alta de un hijo junto al responsable', () => {
    const res = createPacienteSchema.safeParse({
      cedula: 'V-12345678',
      nombre_completo: 'Papá Test',
      hijo: { nombre_completo: 'Bebé Test', sexo: 'M' },
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.hijo?.nombre_completo).toBe('Bebé Test')
  })
})

describe('scraping BCV', () => {
  it('parsea números con formato venezolano', () => {
    expect(parseNumeroBcv('36,52')).toBe(36.52)
    expect(parseNumeroBcv('36.52')).toBe(36.52)
    expect(parseNumeroBcv('1.234,56')).toBe(1234.56)
    expect(parseNumeroBcv('Bs. 36,52')).toBe(36.52)
    expect(parseNumeroBcv('nada')).toBeNull()
  })

  it('extrae dólar y euro del HTML', () => {
    const html = `
      <html>
        <div id="dolar"><span class="value">Bs. 36,52</span></div>
        <div id="euro"><span class="value">Bs. 39,80</span></div>
      </html>
    `
    const tasas = parseTasasBcv(html)
    expect(tasas.usd).toBeCloseTo(36.52)
    expect(tasas.eur).toBeCloseTo(39.8)
  })

  it('extrae por patrón de texto si no hay ids', () => {
    const html = '<table><tr><td>Dólar</td><td>36,45</td></tr><tr><td>Euro</td><td>39,72</td></tr></table>'
    const tasas = parseTasasBcv(html)
    expect(tasas.usd).toBeCloseTo(36.45)
    expect(tasas.eur).toBeCloseTo(39.72)
  })

  it('fechaHoyCaracas devuelve YYYY-MM-DD', () => {
    expect(fechaHoyCaracas()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

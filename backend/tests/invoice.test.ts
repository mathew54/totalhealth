import { describe, it, expect } from 'vitest'
import { construirFactura, montoTexto, numeroEnLetras } from '../src/services/invoice.js'

describe('facturación electrónica VE', () => {
  it('desglosa base, IVA y monto con IVA 16%', () => {
    const f = construirFactura({
      tipo: 'recibo',
      emisor: { razon_social: 'Clínica Demo', rif: 'J-00000000-0' },
      receptor: { nombre: 'Juan', cedula: 'V-12345678' },
      fecha: '2026-01-01T00:00:00.000Z',
      moneda: 'BS',
      conceptos: [{ descripcion: 'Glicemia', neto: 100 }],
      serie: 'TH-2026',
      control: 'ABCD',
    })
    expect(f.base).toBe(100)
    expect(f.iva).toBe(16)
    expect(f.monto).toBe(116)
  })

  it('suma varias líneas y aplica precio_iva por línea', () => {
    const f = construirFactura({
      tipo: 'factura',
      emisor: { razon_social: 'Cp', rif: 'V-1' },
      receptor: { nombre: 'A', cedula: null },
      fecha: '2026-01-01T00:00:00.000Z',
      moneda: 'BS',
      conceptos: [
        { descripcion: 'A', neto: 10 },
        { descripcion: 'B', neto: 20 },
      ],
      serie: 'TH-2026',
      control: 'CC',
    })
    expect(f.base).toBe(30)
    expect(f.monto).toBe(34.8)
  })

  it('numeroEnLetras genera texto de montos', () => {
    expect(numeroEnLetras(20)).toBe('VEINTE')
    expect(numeroEnLetras(115)).toBe('CIENTO QUINCE')
  })

  it('montoTexto incluye centavos y moneda', () => {
    expect(montoTexto(23.2, 'BS')).toBe('VEINTITRES BOLÍVARES CON 20/100')
    expect(montoTexto(10, 'USD')).toBe('DIEZ DÓLARES CON 00/100')
  })
})
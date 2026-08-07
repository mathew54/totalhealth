import { describe, it, expect, beforeEach } from 'vitest'
import { resetMock } from '../src/mock/client.js'
import { obtenerTasaUsdActiva, obtenerTasasActivas, usdABs, bsAUsd, montoAUsd } from '../src/services/moneda.js'

describe('moneda base USD + equivalencia Bs.', () => {
  beforeEach(() => {
    resetMock()
  })

  it('obtiene la tasa activa del día (USD/EUR) del seed', async () => {
    const { usd, eur, fecha } = await obtenerTasasActivas()
    expect(usd).toBe(755.9)
    expect(eur).toBe(872.84)
    expect(fecha).toBeTruthy()
  })

  it('obtenerTasaUsdActiva devuelve la tasa activa de USD', async () => {
    expect(await obtenerTasaUsdActiva()).toBe(755.9)
  })

  it('usdABs y bsAUsd son inversos con 2 decimales', () => {
    expect(usdABs(10, 755.9)).toBe(7559)
    expect(usdABs(10.5, 755.9)).toBe(7936.95)
    expect(bsAUsd(7559, 755.9)).toBe(10)
    expect(usdABs(10, null)).toBeNull()
  })

  it('montoAUsd mantiene USD y convierte BS con la tasa del pago', async () => {
    expect(await montoAUsd(25, 'USD', 755.9)).toBe(25)
    expect(await montoAUsd(18897.5, 'BS', 755.9)).toBe(25)
    // Sin tasa registrada usa la tasa activa del día.
    expect(await montoAUsd(7559, 'BS', null)).toBe(10)
  })
})

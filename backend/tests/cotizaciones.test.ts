import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseNumeroCotizacion,
  fechaDeISO,
  obtenerTasasDolarApi,
  almacenarTasasDelDia,
} from '../src/services/cotizaciones.js';
import { getSupabase } from '../src/config/supabase.js';
import { parseTasasBcv, parseNumeroBcv, fechaHoyCaracas } from '../src/services/bcv.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cotizaciones - parsing', () => {
  it('parseNumeroCotizacion normaliza nulos y valores válidos', () => {
    expect(parseNumeroCotizacion(null)).toBeNull();
    expect(parseNumeroCotizacion(undefined)).toBeNull();
    expect(parseNumeroCotizacion(0)).toBeNull();
    expect(parseNumeroCotizacion(36.52)).toBe(36.52);
    expect(parseNumeroCotizacion(755.1552)).toBe(755.1552);
  });

  it('fechaDeISO devuelve YYYY-MM-DD en hora de Caracas', () => {
    expect(fechaDeISO('2026-08-05T00:00:00-04:00')).toBe('2026-08-05');
    expect(fechaDeISO(null)).toBeNull();
    expect(fechaDeISO('no-es-fecha')).toBeNull();
  });
});

describe('cotizaciones - parsing BCV', () => {
  it('parseNumeroBcv normaliza formatos venezolanos', () => {
    expect(parseNumeroBcv('755,9001')).toBe(755.9001);
    expect(parseNumeroBcv('1.234,56')).toBe(1234.56);
    expect(parseNumeroBcv('1,234.56')).toBe(1234.56);
    expect(parseNumeroBcv('36,52')).toBe(36.52);
    expect(parseNumeroBcv('abc')).toBeNull();
  });

  it('parseTasasBcv ignora números de layout y toma la tasa correcta', () => {
    // El bloque contiene basura de layout (col-sm-12, col-xs-8) ANTES del valor;
    // el parser debe tomar el valor que sigue a la etiqueta y no el primer número.
    const html = `<div class="view-dolar" id="dolar">
      <div class="col-sm-12">
        <span class="pull-left">Dólar</span>
        <span class="pull-right">Bs&nbsp;755,9001</span>
      </div>
    </div>
    <div id="euro" class="view-euro">
      <div class="col-sm-6">
        <span>Euro</span>
        <span>Bs 872,83784547</span>
      </div>
    </div>`;
    expect(parseTasasBcv(html)).toEqual({ usd: 755.9001, eur: 872.83784547 });
  });

  it('parseTasasBcv devuelve null por moneda sin datos', () => {
    expect(parseTasasBcv('<html><body>sin cotizaciones</body></html>')).toEqual({ usd: null, eur: null });
  });
});

describe('cotizaciones - dolarapi', () => {
  it('obtenerTasasDolarApi extrae el promedio oficial de USD y EUR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { moneda: 'USD', fuente: 'oficial', nombre: 'Dólar', compra: null, venta: null, promedio: 755.1552, fechaActualizacion: '2026-08-05T00:00:00-04:00' },
        { moneda: 'EUR', fuente: 'oficial', nombre: 'Euro', compra: null, venta: null, promedio: 870.04451212, fechaActualizacion: '2026-08-05T00:00:00-04:00' },
      ],
    }));

    const tasas = await obtenerTasasDolarApi();
    expect(tasas.usd).toBeCloseTo(755.1552, 4);
    expect(tasas.eur).toBeCloseTo(870.0445, 3);
    expect(tasas.fecha).toBe('2026-08-05');
    expect(tasas.fuente).toContain('dolarapi');
  });

  it('obtenerTasasDolarApi lanza error si no trae valores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ moneda: 'BRL', promedio: 5 }],
    }));
    await expect(obtenerTasasDolarApi()).rejects.toThrow('no devolvió cotizaciones');
  });
});

describe('cotizaciones - persistencia', () => {
  it('almacenarTasasDelDia guarda o actualiza y notifica si activa', async () => {
    const resultado = await almacenarTasasDelDia(
      { usd: 755.2, eur: 870.1, fecha: '2026-08-05', fuente: 'https://ve.dolarapi.com/v1/cotizaciones' },
      null,
    );
    expect(resultado.ok).toBe(true);
    expect(resultado.monedas.length).toBeGreaterThan(0);

    // Verifica que se registró la fila dolarapi en el mock (base memoria).
    const { data } = await getSupabase()
      .from('tasas_cambio')
      .select('id, moneda, origen, valor, activa')
      .eq('fecha', '2026-08-05')
      .eq('origen', 'dolarapi');
    const filas = data ?? [];
    expect(filas).toHaveLength(2);
    expect(filas.map((r: { moneda: string }) => r.moneda).sort()).toEqual(['EUR', 'USD']);
  });

  it('almacenarTasasDelDia con activar=true reemplaza la tasa activa del día', async () => {
    // El seed mock deja tasas manuales activas para hoy; la acción explícita
    // del admin (botón "Actualizar tasas del día") debe activar la cotización
    // dolarapi recién guardada y desactivar la anterior.
    const hoy = fechaHoyCaracas();
    const { data: manualActiva } = await getSupabase()
      .from('tasas_cambio')
      .select('id')
      .eq('fecha', hoy)
      .eq('moneda', 'USD')
      .eq('activa', true)
      .maybeSingle();
    expect(manualActiva).toBeTruthy();

    const resultado = await almacenarTasasDelDia(
      { usd: 770.1, eur: 890.2, fecha: hoy, fuente: 'https://ve.dolarapi.com/v1/cotizaciones' },
      null,
      true,
    );
    expect(resultado.monedas.find((m: { moneda: string }) => m.moneda === 'USD')?.activa).toBe(true);

    const { data } = await getSupabase()
      .from('tasas_cambio')
      .select('moneda, origen, activa')
      .eq('fecha', hoy)
      .eq('moneda', 'USD');
    const activas = (data ?? []).filter((r: { activa: boolean }) => r.activa);
    expect(activas).toHaveLength(1);
    expect(activas[0].origen).toBe('dolarapi');
  });
});
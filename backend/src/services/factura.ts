// services/factura.ts
// TotalHealth: facturación VE persistida. Genera el correlativo del documento,
// persiste la factura + sus líneas y soporta anulación. No altera el contrato
// de pagos: la factura se asocia vía `pagos.factura_id`.

import { getSupabase } from '../config/supabase.js';
import type { Row } from '../mock/store.js';
import {
  obtenerIgtfPorcentaje,
  obtenerRetencionIvaPct,
  obtenerRetencionIslrPct,
} from './configService.js';

/** Redondeo estándar a 2 decimales para montos. */
export function redondear(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * IGTF (3% por defecto) solo aplica a pagos en moneda extranjera (≠ BS) y solo
 * si el cobro lo incluye (`aplica`, controlado por checkbox en caja). En Bs. el
 * IGTF no se cobra (el aporte lo retiene el banco del pagador).
 */
export async function calcularIgtf(monto: number, moneda: string, aplica = true): Promise<number> {
  if (!aplica || moneda === 'BS') return 0;
  const pct = await obtenerIgtfPorcentaje();
  return redondear(monto * pct);
}

/**
 * Retenciones fiscales VE sobre el documento:
 *  - IVA: % del IVA total que retiene el comprador agente de retención
 *    (Ley del IVA art. 27-28; configurable en Administración).
 *  - ISLR: % sobre la base gravada de servicios (Decreto 1.808 art. 8).
 * Reducen el efectivo recibido pero el crédito documentado permanece completo.
 */
export async function calcularRetenciones(
  baseGravada: number,
  ivaTotal: number,
  opciones: { retencion_iva?: boolean; retencion_islr?: boolean } = {},
): Promise<{ retencion_iva: number; retencion_islr: number }> {
  const retencion_iva = opciones.retencion_iva ? redondear(ivaTotal * (await obtenerRetencionIvaPct())) : 0;
  const retencion_islr = opciones.retencion_islr ? redondear(baseGravada * (await obtenerRetencionIslrPct())) : 0;
  return { retencion_iva, retencion_islr };
}

/** Correlativo del próximo documento: máximo existente + 1, rellenado a 6 dígitos. */
export async function siguienteNumeroFactura(clinicaId: string, serie: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from('facturas')
    .select('numero_factura')
    .eq('clinica_id', clinicaId)
    .eq('serie', serie);
  if (error) throw error;
  let max = 0;
  for (const f of data ?? []) {
    const n = Number.parseInt(String(f.numero_factura), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(6, '0');
}

export interface LineaFactura {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  impuesto: 'gravado' | 'exento' | 'no_sujeto';
  iva_linea: number;
  total_linea: number;
}

export interface DatosFactura {
  clinica_id: string;
  pago_id: string;
  solicitud_id?: string | null;
  consulta_id?: string | null;
  paciente_id: string;
  tipo_documento: 'factura' | 'recibo' | 'nota_credito' | 'nota_debito';
  moneda: string;
  tasa_usd: number | null;
  base_gravada: number;
  base_exenta: number;
  iva: number;
  descuento: number;
  igtf: number;
  retencion_iva?: number;
  retencion_islr?: number;
  total: number;
  receptor_razon_social: string;
  receptor_rif: string | null;
  receptor_direccion: string | null;
  emitida_por: string;
  fecha_emision: string;
  lineas: LineaFactura[];
}

/** Persiste la factura + sus líneas y devuelve la fila insertada. */
export async function persistirFactura(d: DatosFactura): Promise<Row> {
  const anio = new Date(d.fecha_emision).getFullYear();
  const serie = `TH-${anio}`;
  const numero = await siguienteNumeroFactura(d.clinica_id, serie);

  const { data, error } = await getSupabase()
    .from('facturas')
    .insert({
      clinica_id: d.clinica_id,
      pago_id: d.pago_id,
      solicitud_id: d.solicitud_id ?? null,
      consulta_id: d.consulta_id ?? null,
      paciente_id: d.paciente_id,
      tipo_documento: d.tipo_documento,
      serie,
      numero_factura: numero,
      numero_control: numero,
      moneda: d.moneda,
      tasa_usd: d.tasa_usd,
      base_gravada: d.base_gravada,
      base_exenta: d.base_exenta,
      iva: d.iva,
      descuento: d.descuento,
      igtf: d.igtf,
      retencion_iva: d.retencion_iva ?? 0,
      retencion_islr: d.retencion_islr ?? 0,
      total: d.total,
      receptor_razon_social: d.receptor_razon_social,
      receptor_rif: d.receptor_rif,
      receptor_direccion: d.receptor_direccion,
      emitida_por: d.emitida_por,
      fecha_emision: d.fecha_emision,
      estatus: 'emitida',
    })
    .select()
    .single();
  if (error) throw error;

  const { error: lErr } = await getSupabase()
    .from('factura_lineas')
    .insert(d.lineas.map((l) => ({ ...l, factura_id: data.id as string })));
  if (lErr) throw lErr;

  return data;
}

/** Anula una factura emitida (transición emitida -> anulada). */
export async function anularFactura(id: string, motivo: string, anuladaPor: string): Promise<Row> {
  const { data, error } = await getSupabase()
    .from('facturas')
    .update({
      estatus: 'anulada',
      anulada_por: anuladaPor,
      anulada_en: new Date().toISOString(),
      motivo_anulacion: motivo,
    })
    .eq('id', id)
    .eq('estatus', 'emitida')
    .select()
    .single();
  if (error) throw error;
  if (!data) {
    const conflict = new Error('La factura no está emitida o no existe');
    (conflict as { code?: string }).code = 'CONFLICT';
    throw conflict;
  }
  return data;
}
// services/reactivosService.ts
// TotalHealth: inventario de reactivos por LOTES + kardex de movimientos.
//
// Modelo:
//   - reactivos            : catálogo. `cantidad` = stock UTILIZABLE (suma de
//                            lotes en estado 'activo').
//   - reactivo_lotes       : cada recepción es un lote con su vencimiento.
//   - reactivo_movimientos : kardex inmutable. `cantidad` con signo: entrada
//                            (+), salida/consumo/vencido (−), ajuste (delta).
//
// FEFO: al consumir se prioriza el lote activo que expira primero.

import { getSupabase } from '../config/supabase.js';
import { fechaHoyCaracas } from './bcv.js';
import type { Row } from '../mock/store.js';

export type EstadoLote = 'activo' | 'vencido' | 'agotado';
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste' | 'consumo' | 'vencido';

const n = (v: unknown): number => Number(v ?? 0);

const redondear = (x: number): number => Math.round(x * 1000) / 1000;

/** Orden FEFO: vencimiento ascendente, nulos al final, luego por antigüedad. */
function porVencimiento(a: Row, b: Row): number {
  const av = a.fecha_vencimiento as string | null;
  const bv = b.fecha_vencimiento as string | null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (av !== bv) return av < bv ? -1 : 1;
  const ca = a.created_at as string | null;
  const cb = b.created_at as string | null;
  if (ca == null && cb == null) return 0;
  if (ca == null) return 1;
  if (cb == null) return -1;
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

/** Registra una línea del kardex (auditoría inmutable). */
async function registrarMovimiento(m: {
  clinicaId: string | null;
  reactivoId: string;
  loteId: string | null;
  tipo: TipoMovimiento;
  cantidad: number;
  cantidadAnterior: number | null;
  cantidadPosterior: number | null;
  motivo?: string | null;
  usuarioId?: string | null;
  solicitudDetalleId?: string | null;
}): Promise<void> {
  const { error } = await getSupabase().from('reactivo_movimientos').insert({
    clinica_id: m.clinicaId,
    reactivo_id: m.reactivoId,
    lote_id: m.loteId,
    tipo: m.tipo,
    cantidad: m.cantidad,
    cantidad_anterior: m.cantidadAnterior,
    cantidad_posterior: m.cantidadPosterior,
    motivo: m.motivo ?? null,
    usuario_id: m.usuarioId ?? null,
    solicitud_detalle_id: m.solicitudDetalleId ?? null,
    fecha: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Recalcula `reactivos.cantidad` (suma de lotes activos) y sincroniza los
 * campos legacy `lote` / `fecha_vencimiento` con el lote activo que expira
 * primero (FEFO). Se llama tras cualquier cambio de stock.
 */
async function recalcularYLegacy(reactivoId: string): Promise<void> {
  const { data: lotes } = await getSupabase()
    .from('reactivo_lotes')
    .select('id, lote, fecha_vencimiento, cantidad, estado')
    .eq('reactivo_id', reactivoId);
  const filas = lotes ?? [];
  const activos = filas.filter((l) => l.estado === 'activo');
  const total = redondear(activos.reduce((s, l) => s + n(l.cantidad), 0));
  const primero = [...activos].sort(porVencimiento)[0] ?? null;
  const { error } = await getSupabase()
    .from('reactivos')
    .update({
      cantidad: total,
      lote: primero ? (primero.lote as string | null) : null,
      fecha_vencimiento: primero ? (primero.fecha_vencimiento as string | null) : null,
    })
    .eq('id', reactivoId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export async function listarLotes(reactivoId: string): Promise<Row[]> {
  const { data, error } = await getSupabase()
    .from('reactivo_lotes')
    .select('*')
    .eq('reactivo_id', reactivoId);
  if (error) throw error;
  return [...(data ?? [])].sort(porVencimiento);
}

export async function listarReactivos(clinicaId: string | null) {
  let q = getSupabase().from('reactivos').select('*').order('nombre', { ascending: true });
  if (clinicaId) q = q.eq('clinica_id', clinicaId);
  const { data, error } = await q;
  if (error) throw error;
  const reactivos = data ?? [];

  const { data: lotes } = await getSupabase().from('reactivo_lotes').select('*');
  const porReactivo = new Map<string, Row[]>();
  for (const l of lotes ?? []) {
    if (clinicaId && l.clinica_id !== clinicaId) continue;
    const arr = porReactivo.get(l.reactivo_id as string) ?? [];
    arr.push(l);
    porReactivo.set(l.reactivo_id as string, arr);
  }

  return reactivos.map((r) => {
    const ls = porReactivo.get(r.id as string) ?? [];
    const activos = ls.filter((l) => l.estado === 'activo');
    const proximo = activos
      .map((l) => l.fecha_vencimiento as string | null)
      .filter((f): f is string => !!f)
      .sort();
    return {
      ...r,
      numero_lotes: ls.length,
      lotes_activos: activos.length,
      proximo_vencimiento: proximo[0] ?? null,
    };
  });
}

export async function listarMovimientos(opts: { reactivoId?: string | null; limit?: number } = {}): Promise<Row[]> {
  let q = getSupabase().from('reactivo_movimientos').select('*').order('fecha', { ascending: false });
  if (opts.reactivoId) q = q.eq('reactivo_id', opts.reactivoId);
  const limit = opts.limit ?? 100;
  const { data, error } = await q.range(0, Math.max(limit - 1, 0));
  if (error) throw error;
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Catálogo                                                                    */
/* -------------------------------------------------------------------------- */

export async function crearReactivo(
  body: {
    nombre: string;
    proveedor?: string | null;
    alerta_minima?: number | null;
    unidad?: string | null;
    costo_unitario?: number | null;
    lote?: string | null;
    fecha_vencimiento?: string | null;
    cantidad?: number | null;
  },
  usuario: { id: string; clinicaId: string | null },
) {
  const { data, error } = await getSupabase()
    .from('reactivos')
    .insert({
      clinica_id: usuario.clinicaId,
      nombre: body.nombre,
      proveedor: body.proveedor ?? null,
      alerta_minima: body.alerta_minima ?? null,
      unidad: body.unidad ?? 'unidades',
      costo_unitario: body.costo_unitario ?? null,
      cantidad: 0,
    })
    .select()
    .single();
  if (error) throw error;
  const reactivoId = data.id as string;

  if (body.cantidad && body.cantidad > 0) {
    await recibirLote(
      reactivoId,
      {
        lote: body.lote ?? 'LOTE-INICIAL',
        fecha_vencimiento: body.fecha_vencimiento ?? null,
        cantidad: body.cantidad,
        costo_unitario: body.costo_unitario ?? null,
        fecha_recepcion: null,
      },
      usuario.id,
    );
  }
  return data;
}

export async function editarReactivo(
  id: string,
  body: {
    nombre?: string;
    proveedor?: string | null;
    alerta_minima?: number | null;
    unidad?: string | null;
    costo_unitario?: number | null;
  },
) {
  const updates: Row = {};
  if (body.nombre !== undefined) updates.nombre = body.nombre;
  if (body.proveedor !== undefined) updates.proveedor = body.proveedor;
  if (body.alerta_minima !== undefined) updates.alerta_minima = body.alerta_minima;
  if (body.unidad !== undefined) updates.unidad = body.unidad;
  if (body.costo_unitario !== undefined) updates.costo_unitario = body.costo_unitario;

  const { data, error } = await getSupabase()
    .from('reactivos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarReactivo(id: string): Promise<void> {
  await getSupabase().from('reactivo_movimientos').delete().eq('reactivo_id', id);
  await getSupabase().from('reactivo_lotes').delete().eq('reactivo_id', id);
  const { error } = await getSupabase().from('reactivos').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/*  Movimientos (entradas / salidas / ajustes / consumo)                       */
/* -------------------------------------------------------------------------- */

/** Recepción de un nuevo lote (entrada al kardex). */
export async function recibirLote(
  reactivoId: string,
  body: {
    lote: string;
    fecha_vencimiento?: string | null;
    cantidad: number;
    costo_unitario?: number | null;
    fecha_recepcion?: string | null;
  },
  usuarioId: string | null,
) {
  const cantidad = redondear(Number(body.cantidad));
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor a 0');
  }

  const { data: reactivo, error: rErr } = await getSupabase()
    .from('reactivos')
    .select('id, clinica_id')
    .eq('id', reactivoId)
    .maybeSingle();
  if (rErr || !reactivo) throw new Error('Reactivo no encontrado');

  const hoy = fechaHoyCaracas();
  const estado: EstadoLote = body.fecha_vencimiento && body.fecha_vencimiento < hoy ? 'vencido' : 'activo';

  const { data, error } = await getSupabase()
    .from('reactivo_lotes')
    .insert({
      clinica_id: (reactivo.clinica_id as string | null) ?? null,
      reactivo_id: reactivoId,
      lote: body.lote,
      fecha_vencimiento: body.fecha_vencimiento ?? null,
      cantidad,
      cantidad_inicial: cantidad,
      costo_unitario: body.costo_unitario ?? null,
      estado,
      fecha_recepcion: body.fecha_recepcion ?? hoy,
    })
    .select()
    .single();
  if (error) throw error;
  const loteId = data.id as string;

  await registrarMovimiento({
    clinicaId: (reactivo.clinica_id as string | null) ?? null,
    reactivoId,
    loteId,
    tipo: 'entrada',
    cantidad,
    cantidadAnterior: 0,
    cantidadPosterior: cantidad,
    motivo: 'Recepción de lote',
    usuarioId,
  });

  await recalcularYLegacy(reactivoId);
  await generarAlertas((reactivo.clinica_id as string | null) ?? null);
  return data;
}

/** Salida manual desde un lote específico (no FEFO). */
export async function registrarSalida(
  loteId: string,
  cantidad: number,
  motivo: string | null,
  usuarioId: string | null,
) {
  const cant = redondear(Number(cantidad));
  if (!Number.isFinite(cant) || cant <= 0) throw new Error('La cantidad debe ser mayor a 0');

  const { data: lote, error: lErr } = await getSupabase()
    .from('reactivo_lotes')
    .select('id, clinica_id, reactivo_id, cantidad, fecha_vencimiento, estado')
    .eq('id', loteId)
    .maybeSingle();
  if (lErr || !lote) throw new Error('Lote no encontrado');

  const disponible = n(lote.cantidad);
  if (lote.estado !== 'activo') throw new Error('El lote no está utilizable (vencido o agotado)');
  const hoy = fechaHoyCaracas();
  if (lote.fecha_vencimiento && (lote.fecha_vencimiento as string) < hoy) {
    throw new Error('El lote está vencido: no se puede usar');
  }
  if (cant > disponible) throw new Error(`Stock insuficiente en el lote (disponible: ${disponible})`);

  const posterior = redondear(disponible - cant);
  await getSupabase()
    .from('reactivo_lotes')
    .update({ cantidad: posterior, estado: posterior <= 0 ? 'agotado' : 'activo' })
    .eq('id', loteId);

  await registrarMovimiento({
    clinicaId: (lote.clinica_id as string | null) ?? null,
    reactivoId: lote.reactivo_id as string,
    loteId,
    tipo: 'salida',
    cantidad: -cant,
    cantidadAnterior: disponible,
    cantidadPosterior: posterior,
    motivo,
    usuarioId,
  });

  await recalcularYLegacy(lote.reactivo_id as string);
  await generarAlertas((lote.clinica_id as string | null) ?? null);
  return { lote_id: loteId, reactivo_id: lote.reactivo_id, salida: cant, disponible: posterior };
}

/** Ajuste de stock de un lote (corrección de inventario). */
export async function ajustarStock(
  loteId: string,
  nuevaCantidad: number,
  motivo: string | null,
  usuarioId: string | null,
) {
  const nuevo = redondear(Number(nuevaCantidad));
  if (!Number.isFinite(nuevo) || nuevo < 0) throw new Error('La nueva cantidad no es válida');

  const { data: lote, error: lErr } = await getSupabase()
    .from('reactivo_lotes')
    .select('id, clinica_id, reactivo_id, cantidad, fecha_vencimiento, estado')
    .eq('id', loteId)
    .maybeSingle();
  if (lErr || !lote) throw new Error('Lote no encontrado');

  const actual = n(lote.cantidad);
  const delta = redondear(nuevo - actual);

  const hoy = fechaHoyCaracas();
  const vencido = lote.fecha_vencimiento != null && (lote.fecha_vencimiento as string) < hoy;
  const estado: EstadoLote = nuevo <= 0 ? 'agotado' : vencido ? 'vencido' : 'activo';

  await getSupabase()
    .from('reactivo_lotes')
    .update({ cantidad: nuevo, estado })
    .eq('id', loteId);

  await registrarMovimiento({
    clinicaId: (lote.clinica_id as string | null) ?? null,
    reactivoId: lote.reactivo_id as string,
    loteId,
    tipo: 'ajuste',
    cantidad: delta,
    cantidadAnterior: actual,
    cantidadPosterior: nuevo,
    motivo,
    usuarioId,
  });

  await recalcularYLegacy(lote.reactivo_id as string);
  await generarAlertas((lote.clinica_id as string | null) ?? null);
  return { lote_id: loteId, reactivo_id: lote.reactivo_id, anterior: actual, posterior: nuevo, delta };
}

/** Consumo FEFO: descuenta del lote activo que expira primero. */
export async function consumirReactivo(
  reactivoId: string,
  cantidad: number,
  opts: { motivo?: string | null; usuarioId?: string | null; solicitudDetalleId?: string | null } = {},
) {
  const cant = redondear(Number(cantidad));
  if (!Number.isFinite(cant) || cant <= 0) throw new Error('La cantidad a consumir debe ser mayor a 0');

  const { data: reactivo, error: rErr } = await getSupabase()
    .from('reactivos')
    .select('id, clinica_id, cantidad')
    .eq('id', reactivoId)
    .maybeSingle();
  if (rErr || !reactivo) throw new Error('Reactivo no encontrado');

  const { data: lotes } = await getSupabase()
    .from('reactivo_lotes')
    .select('id, clinica_id, reactivo_id, lote, cantidad, fecha_vencimiento, estado, created_at')
    .eq('reactivo_id', reactivoId);
  const activos = (lotes ?? [])
    .filter((l) => l.estado === 'activo' && n(l.cantidad) > 0)
    .sort(porVencimiento);

  const disponible = redondear(activos.reduce((s, l) => s + n(l.cantidad), 0));
  if (disponible < cant) throw new Error(`Stock insuficiente (disponible: ${disponible})`);

  let restante = cant;
  const usados: { loteId: string; cantidad: number }[] = [];
  for (const lote of activos) {
    if (restante <= 0) break;
    const loteDisponible = n(lote.cantidad);
    const tomar = Math.min(loteDisponible, restante);
    const posterior = redondear(loteDisponible - tomar);
    await getSupabase()
      .from('reactivo_lotes')
      .update({ cantidad: posterior, estado: posterior <= 0 ? 'agotado' : 'activo' })
      .eq('id', lote.id as string);

    await registrarMovimiento({
      clinicaId: (lote.clinica_id as string | null) ?? null,
      reactivoId,
      loteId: lote.id as string,
      tipo: 'consumo',
      cantidad: -tomar,
      cantidadAnterior: loteDisponible,
      cantidadPosterior: posterior,
      motivo: opts.motivo ?? null,
      usuarioId: opts.usuarioId ?? null,
      solicitudDetalleId: opts.solicitudDetalleId ?? null,
    });
    usados.push({ loteId: lote.id as string, cantidad: tomar });
    restante = redondear(restante - tomar);
  }

  await recalcularYLegacy(reactivoId);
  await generarAlertas((reactivo.clinica_id as string | null) ?? null);
  return { reactivo_id: reactivoId, consumido: redondear(cant - restante), lotes: usados };
}

/* -------------------------------------------------------------------------- */
/*  Vencimientos y estado                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Marca como 'vencido' los lotes activos cuya fecha ya pasó. Su cantidad sale
 * del stock utilizable (kardex tipo 'vencido'). Devuelve el resumen.
 */
export async function revisarVencimientos(clinicaId?: string | null) {
  const hoy = fechaHoyCaracas();
  let q = getSupabase()
    .from('reactivo_lotes')
    .select('id, clinica_id, reactivo_id, lote, cantidad, fecha_vencimiento, estado')
    .eq('estado', 'activo');
  if (clinicaId) q = q.eq('clinica_id', clinicaId);
  const { data, error } = await q;
  if (error) throw error;

  const vencidos: { reactivo_id: string; lote: string; fecha_vencimiento: string | null; cantidad: number }[] = [];
  for (const lote of data ?? []) {
    const venc = lote.fecha_vencimiento as string | null;
    if (!venc || venc >= hoy) continue;
    const cantidad = n(lote.cantidad);
    if (cantidad <= 0) continue;

    await getSupabase()
      .from('reactivo_lotes')
      .update({ cantidad: 0, estado: 'vencido' })
      .eq('id', lote.id as string);
    await registrarMovimiento({
      clinicaId: (lote.clinica_id as string | null) ?? null,
      reactivoId: lote.reactivo_id as string,
      loteId: lote.id as string,
      tipo: 'vencido',
      cantidad: -cantidad,
      cantidadAnterior: cantidad,
      cantidadPosterior: 0,
      motivo: `Vencimiento el ${venc}`,
      usuarioId: null,
    });
    await recalcularYLegacy(lote.reactivo_id as string);
    vencidos.push({
      reactivo_id: lote.reactivo_id as string,
      lote: lote.lote as string,
      fecha_vencimiento: venc,
      cantidad,
    });
  }
  await generarAlertas(clinicaId ?? null);
  return { vencidos, total: vencidos.length };
}

/** Estado operativo del inventario: vencidos, por vencer, bajo stock, agotados. */
export async function estadoInventario(clinicaId?: string | null) {
  const reactivos = await listarReactivos(clinicaId ?? null);
  const hoy = fechaHoyCaracas();

  const { data: lotes } = await getSupabase().from('reactivo_lotes').select('*');
  const filas = (lotes ?? []).filter((l) => !clinicaId || l.clinica_id === clinicaId);

  const vencidos = filas
    .filter((l) => l.estado === 'vencido')
    .map((l) => ({ ...l, cantidad: n(l.cantidad) }));

  const porVencer = filas
    .filter((l) => {
      if (l.estado !== 'activo' || !l.fecha_vencimiento) return false;
      const venc = l.fecha_vencimiento as string;
      if (venc < hoy) return false;
      const dias = (new Date(venc).getTime() - new Date(hoy).getTime()) / 86_400_000;
      return dias <= 30;
    })
    .map((l) => ({ ...l, cantidad: n(l.cantidad) }));

  const bajoStock = reactivos
    .filter((r) => r.alerta_minima != null && n(r.alerta_minima) > 0 && n(r.cantidad) <= n(r.alerta_minima))
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      cantidad: n(r.cantidad),
      alerta_minima: n(r.alerta_minima),
      unidad: r.unidad,
      proximo_vencimiento: r.proximo_vencimiento,
    }));

  const agotados = reactivos
    .filter((r) => n(r.cantidad) <= 0)
    .map((r) => ({ id: r.id, nombre: r.nombre, cantidad: n(r.cantidad), unidad: r.unidad, lotes_activos: r.lotes_activos }));

  return { vencidos, por_vencer: porVencer, bajo_stock: bajoStock, agotados };
}

/* -------------------------------------------------------------------------- */
/*  Alertas internas (stock bajo / agotados / vencidos / por vencer)           */
/* -------------------------------------------------------------------------- */

export type TipoAlerta = 'bajo_stock' | 'agotado' | 'vencido' | 'por_vencer';

/**
 * Genera alertas de inventario a partir del estado actual. No duplica alertas
 * abiertas (mismo reactivo + tipo sin leer). Las alertas de bajo stock/agotado
 * se resuelven solas cuando el stock vuelve a niveles seguros. Devuelve cuántas
 * creó. Se invoca tras cada movimiento de stock y en el job diario.
 */
export async function generarAlertas(clinicaId?: string | null): Promise<number> {
  const estado = await estadoInventario(clinicaId ?? null);
  const nombres = new Map<string, string>((await listarReactivos(clinicaId ?? null)).map((r) => [r.id as string, r.nombre as string]));

  const candidatos: { reactivoId: string; loteId: string | null; tipo: TipoAlerta; mensaje: string }[] = [];

  for (const v of estado.vencidos) {
    candidatos.push({
      reactivoId: v.reactivo_id as string,
      loteId: v.id as string,
      tipo: 'vencido',
      mensaje: `Lote ${v.lote} vencido (${v.fecha_vencimiento}) con ${v.cantidad} unidades sin usar`,
    });
  }
  for (const p of estado.por_vencer) {
    candidatos.push({
      reactivoId: p.reactivo_id as string,
      loteId: p.id as string,
      tipo: 'por_vencer',
      mensaje: `Lote ${p.lote} vence el ${p.fecha_vencimiento} (próximos 30 días)`,
    });
  }
  for (const b of estado.bajo_stock) {
    candidatos.push({
      reactivoId: b.id,
      loteId: null,
      tipo: 'bajo_stock',
      mensaje: `${nombres.get(b.id) ?? b.nombre}: stock ${b.cantidad} ${b.unidad ?? 'unidades'} ≤ alerta mínima ${b.alerta_minima}`,
    });
  }
  for (const a of estado.agotados) {
    candidatos.push({
      reactivoId: a.id,
      loteId: null,
      tipo: 'agotado',
      mensaje: `${nombres.get(a.id) ?? a.nombre}: agotado`,
    });
  }

  let q = getSupabase().from('alertas_inventario').select('id, reactivo_id, tipo, leida');
  if (clinicaId) q = q.eq('clinica_id', clinicaId);
  const { data: existentes } = await q;
  const abiertas = new Set((existentes ?? [])
    .filter((a) => a.leida === false)
    .map((a) => `${a.reactivo_id}|${a.tipo}`));

  const nuevas = candidatos.filter((c) => !abiertas.has(`${c.reactivoId}|${c.tipo}`));
  for (const c of nuevas) {
    await getSupabase().from('alertas_inventario').insert({
      clinica_id: clinicaId ?? null,
      reactivo_id: c.reactivoId,
      lote_id: c.loteId,
      tipo: c.tipo,
      mensaje: c.mensaje,
      leida: false,
    });
  }

  // Auto-resuelve alertas de bajo stock/agotado de reactivos ya saludables.
  const idsBajoOAgotados = new Set([...estado.bajo_stock, ...estado.agotados].map((r) => r.id as string));
  const aResolver = (existentes ?? []).filter(
    (a) => a.leida === false && (a.tipo === 'bajo_stock' || a.tipo === 'agotado') && !idsBajoOAgotados.has(a.reactivo_id as string),
  );
  if (aResolver.length) {
    await getSupabase()
      .from('alertas_inventario')
      .update({ leida: true })
      .in('id', aResolver.map((a) => a.id));
  }

  return nuevas.length;
}

/** Últimas alertas de inventario (sin leer primero). */
export async function listarAlertas(clinicaId?: string | null) {
  let q = getSupabase().from('alertas_inventario').select('*').order('created_at', { ascending: false });
  if (clinicaId) q = q.eq('clinica_id', clinicaId);
  const { data, error } = await q.range(0, 99);
  if (error) throw error;

  const { data: reactivos } = await getSupabase().from('reactivos').select('id, nombre');
  const nombre = new Map<string, string>((reactivos ?? []).map((r) => [r.id as string, r.nombre as string]));

  return (data ?? []).map((a) => ({
    ...a,
    reactivo_nombre: nombre.get(a.reactivo_id as string) ?? 'Reactivo',
    leida: a.leida === true,
  }));
}

/**
 * Marca alertas como leídas. Si no se envían `ids`, marca todas las no leídas
 * de la clínica. Devuelve cuántas marcó.
 */
export async function marcarAlertasLeidas(ids: string[], clinicaId?: string | null): Promise<number> {
  let q = getSupabase().from('alertas_inventario').update({ leida: true }).eq('leida', false);
  if (ids.length) q = q.in('id', ids);
  else if (clinicaId) q = q.eq('clinica_id', clinicaId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).length;
}

/* -------------------------------------------------------------------------- */
/*  Consumo y reposición                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resumen de consumo (salidas + consumo + vencidos) en los últimos `dias`,
 * desglosado por reactivo y por examen (trazabilidad solicitud → examen).
 * Estima días hasta agotarse y sugiere cuánto reponer.
 */
export async function consumoResumen(opts: { dias?: number; clinicaId?: string | null } = {}) {
  const dias = Math.max(1, Math.floor(opts.dias ?? 30));
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeISO = desde.toISOString();

  let q = getSupabase()
    .from('reactivo_movimientos')
    .select('*')
    .in('tipo', ['salida', 'consumo', 'vencido'])
    .gte('fecha', desdeISO);
  if (opts.clinicaId) q = q.eq('clinica_id', opts.clinicaId);
  const { data: movs } = await q;
  const filas = movs ?? [];

  const reactivos = await listarReactivos(opts.clinicaId ?? null);
  const porReactivo = new Map<string, { reactivo: Row; salidas: number }>();
  for (const r of reactivos) porReactivo.set(r.id as string, { reactivo: r, salidas: 0 });

  const detalleIds = [...new Set(filas.filter((m) => m.solicitud_detalle_id).map((m) => m.solicitud_detalle_id as string))];
  const { data: detalles } = detalleIds.length
    ? await getSupabase().from('solicitudes_detalle').select('id, examen_id').in('id', detalleIds)
    : { data: [] as Row[] };
  const examenPorDetalle = new Map<string, string>((detalles ?? []).map((d) => [d.id as string, d.examen_id as string]));

  const { data: examenes } = await getSupabase().from('examenes_laboratorio').select('id, nombre');
  const nombreExamen = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, e.nombre as string]));

  const porExamen = new Map<string, number>();
  for (const m of filas) {
    const rid = m.reactivo_id as string;
    const entry = porReactivo.get(rid);
    if (entry) entry.salidas += Math.abs(n(m.cantidad));
    const examenId = m.solicitud_detalle_id ? examenPorDetalle.get(m.solicitud_detalle_id as string) : undefined;
    if (examenId) porExamen.set(examenId, (porExamen.get(examenId) ?? 0) + Math.abs(n(m.cantidad)));
  }

  const porReactivoArr = [...porReactivo.values()]
    .map(({ reactivo, salidas }) => {
      const stock = n(reactivo.cantidad);
      const alerta = n(reactivo.alerta_minima);
      const consumoDiario = salidas / dias;
      const diasHastaAgotar = stock > 0 && consumoDiario > 0 ? Math.floor(stock / consumoDiario) : stock <= 0 ? 0 : null;
      const sugeridoReponer = stock <= alerta || salidas > 0
        ? Math.max(0, Math.ceil(alerta + salidas - stock))
        : 0;
      return {
        reactivo_id: reactivo.id,
        nombre: reactivo.nombre,
        unidad: reactivo.unidad ?? 'unidades',
        stock,
        alerta_minima: alerta,
        consumido: Math.round(salidas * 1000) / 1000,
        dias_hasta_agotar: diasHastaAgotar,
        sugerido_reponer: sugeridoReponer,
      };
    })
    .sort((a, b) => b.consumido - a.consumido || (a.nombre as string).localeCompare(b.nombre as string));

  const porExamenArr = [...porExamen.entries()]
    .map(([examenId, cantidad]) => ({
      examen_id: examenId,
      examen: nombreExamen.get(examenId) ?? examenId,
      cantidad: Math.round(cantidad * 1000) / 1000,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return { dias, por_reactivo: porReactivoArr, por_examen: porExamenArr };
}

/* -------------------------------------------------------------------------- */
/*  Receta de insumos por examen (examenes_reactivos)                          */
/* -------------------------------------------------------------------------- */

/**
 * Receta de insumos de un examen: cada fila con el reactivo (nombre + stock
 * utilizable) y la cantidad que el examen consume por resultado.
 */
export async function listarReactivosDeExamen(examenId: string, clinicaId: string | null) {
  const { data, error } = await getSupabase()
    .from('examenes_reactivos')
    .select('id, reactivo_id, cantidad, auto')
    .eq('examen_id', examenId);
  if (error) throw error;
  const filas = data ?? [];

  const { data: reactivos } = await getSupabase()
    .from('reactivos')
    .select('id, nombre, unidad, cantidad, alerta_minima');
  const porId = new Map<string, Row>((reactivos ?? []).map((r) => [r.id as string, r]));

  return filas.map((f) => ({
    id: f.id as string,
    examen_id: examenId,
    reactivo_id: f.reactivo_id as string,
    nombre: (porId.get(f.reactivo_id as string)?.nombre as string) ?? 'Reactivo',
    unidad: (porId.get(f.reactivo_id as string)?.unidad as string) ?? 'unidades',
    stock: n(porId.get(f.reactivo_id as string)?.cantidad),
    alerta_minima: n(porId.get(f.reactivo_id as string)?.alerta_minima),
    cantidad: n(f.cantidad),
    auto: f.auto === true,
  }));
}

/**
 * Costo total de la receta de insumos de un examen (suma cantidad × costo).
 * Se usa para sugerir un precio mínimo de venta en el catálogo (Admin).
 */
export async function costoReactivosDeExamenes(examenIds: string[]): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  if (!examenIds.length) return resultado;
  for (const id of new Set(examenIds)) resultado.set(id, 0);

  const { data, error } = await getSupabase()
    .from('examenes_reactivos')
    .select('examen_id, reactivo_id, cantidad')
    .in('examen_id', [...resultado.keys()]);
  if (error) throw error;
  if (!data?.length) return resultado;

  const { data: reactivos } = await getSupabase()
    .from('reactivos')
    .select('id, costo_unitario');
  const costos = new Map<string, number>((reactivos ?? []).map((r) => [r.id as string, n(r.costo_unitario)]));

  for (const f of data) {
    const eid = f.examen_id as string;
    const costo = costos.get(f.reactivo_id as string) ?? 0;
    resultado.set(eid, n(resultado.get(eid)) + n(f.cantidad) * costo);
  }
  return resultado;
}

/**
 * Guarda la receta completa de un examen (transaccional vía la API): borra las
 * asociaciones que ya no estén y hace upsert de las indicadas.
 */
export async function asignarReactivosAExamen(
  examenId: string,
  clinicaId: string | null,
  items: { reactivo_id: string; cantidad: number; auto?: boolean }[],
) {
  const idsRecibidos = items.map((i) => i.reactivo_id);

  const { data: actuales } = await getSupabase()
    .from('examenes_reactivos')
    .select('id, reactivo_id')
    .eq('examen_id', examenId);

  const aBorrar = (actuales ?? []).filter((a) => !idsRecibidos.includes(a.reactivo_id as string));
  if (aBorrar.length) {
    await getSupabase().from('examenes_reactivos').delete().in('id', aBorrar.map((a) => a.id));
  }

  for (const item of items) {
    const { error } = await getSupabase()
      .from('examenes_reactivos')
      .upsert(
        {
          examen_id: examenId,
          clinica_id: clinicaId,
          reactivo_id: item.reactivo_id,
          cantidad: item.cantidad,
          auto: item.auto ?? true,
        },
        { onConflict: 'examen_id,reactivo_id' },
      );
    if (error) throw error;
  }

  return listarReactivosDeExamen(examenId, clinicaId);
}

/**
 * Consume automáticamente los insumos de la receta de un examen al emitir un
 * resultado. FEFO por lote vía `consumirReactivo`. No bloquea la emisión:
 * devuelve los consumos aplicados y los errores de stock insuficiente.
 */
export async function consumirReactivosDeExamen(
  examenId: string,
  opts: { clinicaId: string | null; usuarioId: string; solicitudDetalleId: string },
) {
  const { data: receta, error } = await getSupabase()
    .from('examenes_reactivos')
    .select('reactivo_id, cantidad')
    .eq('examen_id', examenId)
    .eq('auto', true);
  if (error) throw error;

  const consumos: Array<{ reactivo_id: string; cantidad: number; consumido: number; lotes: Row[] }> = [];
  const errores: Array<{ reactivo_id: string; error: string }> = [];

  for (const r of receta ?? []) {
    try {
      const c = await consumirReactivo(r.reactivo_id as string, n(r.cantidad), {
        motivo: 'Consumo automático por resultado',
        usuarioId: opts.usuarioId,
        solicitudDetalleId: opts.solicitudDetalleId,
      });
      consumos.push({ reactivo_id: r.reactivo_id as string, cantidad: n(r.cantidad), consumido: c.consumido, lotes: c.lotes });
    } catch (err) {
      errores.push({ reactivo_id: r.reactivo_id as string, error: (err as Error).message });
    }
  }

  return { consumos, errores };
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { descargarFacturaPdf } from '../../lib/facturaPdf'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd, usdABs, bsAUsd, formatearBs } from '../../lib/moneda'
import { useConfigStore } from '../../lib/configStore'
import type { FacturaResp } from '../../lib/facturaPdf'

interface Solicitud {
  id: string
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  total: number
  monto_pagado: number
  estado: string
  fecha: string
  paquete_id?: string | null
}
interface Pago {
  id: string
  tipo: string
  monto: number
  moneda: string
  tasa_usd: number | null
  metodo: string | null
  fecha: string
  estado: string
  descuento: number
  provider: string | null
  factura_id?: string | null
  igtf?: number
}

interface ReportePagos {
  total: number
  total_usd: number
  total_bs: number | null
  tasa_usd: number | null
  count: number
  pagos: Pago[]
}

interface SaldoCxc {
  solicitud_id: string
  fecha: string
  estado: string
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  total_usd: number
  monto_pagado: number
  saldo: number
  parcial: boolean
}

interface ReporteSaldos {
  count: number
  total_pendiente_usd: number
  total_pendiente_bs: number | null
  tasa_usd: number | null
  saldos: SaldoCxc[]
}

// Opciones fiscales compartidas por el cobro y el abono desde caja.
export interface OpcionesFiscales {
  paciente_id?: string
  igtf_aplica?: boolean
  retencion_iva_aplica?: boolean
  retencion_islr_aplica?: boolean
}

const METODOS = ['efectivo', 'punto', 'transferencia', 'pago_movil', 'zelle']
const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  punto: 'Punto de venta',
  transferencia: 'Transferencia',
  pago_movil: 'Pago móvil (VE)',
  zelle: 'Zelle (USD)',
}

export default function PagosPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [desde, setDesde] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))

  const { data: pendientes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', 'cobrar'],
    queryFn: async () => {
      const data = (await api.get('/solicitudes', { params: { cobrado: 'false' } })).data as Solicitud[]
      return data.filter((s) => (s.monto_pagado ?? 0) === 0)
    },
  })

  const { data: reporte } = useQuery<ReportePagos>({
    queryKey: ['pagos', desde, hasta],
    queryFn: async () => (await api.get('/pagos', { params: { desde, hasta } })).data,
  })

  const { data: saldos } = useQuery<ReporteSaldos>({
    queryKey: ['pagos', 'saldos'],
    queryFn: async () => (await api.get('/pagos/saldos')).data,
  })

  const [abonarSaldo, setAbonarSaldo] = useState<SaldoCxc | null>(null)

  const abonar = useMutation({
    mutationFn: (payload: {
      solicitud_id: string
      monto: number
      metodo: string
      moneda: string
      observaciones?: string
    } & OpcionesFiscales) => api.post('/pagos/abono', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      setError(null)
      const data = res.data as { pago: Pago; factura?: { id: string; numero_control: string } }
      setUltimoPago(data.pago)
      setUltimaFactura(data.factura ?? null)
      setAbonarSaldo(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const cobrar = useMutation({
    mutationFn: (payload: {
      solicitud_id: string
      metodo: string
      moneda: string
      descuento?: number
      descuento_motivo?: string
      usar_prepago?: boolean
    } & OpcionesFiscales) => api.post('/pagos/laboratorio', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      setError(null)
      const data = res.data as { pago: Pago; factura?: { id: string; numero_control: string } }
      setUltimoPago(data.pago)
      setUltimaFactura(data.factura ?? null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const anular = useMutation({
    mutationFn: ({ factura_id, motivo }: { factura_id: string; motivo: string }) =>
      api.post(`/facturas/${factura_id}/anular`, { motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      setAnularPago(null)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const [ultimoPago, setUltimoPago] = useState<Pago | null>(null)
  const [ultimaFactura, setUltimaFactura] = useState<{ id: string; numero_control: string } | null>(null)
  const [anularPago, setAnularPago] = useState<Pago | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Caja</h1>
        <p className="text-sm text-slate-500">Recepción de pagos, descuentos y facturación</p>
      </div>

      <TurnoCard />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Cuentas por cobrar</h2>
          <div className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            Pendiente total: <PrecioDual usd={saldos?.total_pendiente_usd} tasaUsd={saldos?.tasa_usd} bs={saldos?.total_pendiente_bs} />
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <SaldosTable
            saldos={saldos?.saldos ?? []}
            onAbonar={(s) => setAbonarSaldo(s)}
          />
        </div>
        {abonarSaldo && (
          <AbonarModal
            saldo={abonarSaldo}
            cargando={abonar.isPending}
            onClose={() => setAbonarSaldo(null)}
            onConfirm={(d) => abonar.mutate({ solicitud_id: abonarSaldo.solicitud_id, ...d })}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Cobros pendientes</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No hay solicitudes pendientes de cobro.</p>
          ) : (
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 lg:grid-cols-3 sm:divide-y-0 sm:gap-4 sm:p-4">
              {pendientes.map((s) => (
                <CobroCard
                  key={s.id}
                  solicitud={s}
                  loading={cobrar.isPending}
                  onCobrar={(datos) => cobrar.mutate({ solicitud_id: s.id, ...datos })}
                />
              ))}
            </div>
          )}
        </div>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </section>

      <FacturaModal pagoId={ultimoPago?.id} factura={ultimaFactura} onClose={() => { setUltimoPago(null); setUltimaFactura(null) }} />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tarjetas de prepago</h2>
        <div className="rounded-2xl border border-slate-200 bg-white">
          <PrepagoPanel onRecargado={(pid) => queryClient.invalidateQueries({ queryKey: ['pagos', 'prepago', pid] })} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Reporte de pagos</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} /></Field>
          <Field label="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} /></Field>
          <div className="rounded-lg bg-brand-50 px-4 py-2 text-sm">
            <span className="text-brand-700">Total (USD): <strong><PrecioDual usd={reporte?.total_usd} tasaUsd={reporte?.tasa_usd} bs={reporte?.total_bs} /></strong></span>
            <span className="ml-2 text-brand-600">({reporte?.count ?? 0} pagos)</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <PagosTable
            pagos={reporte?.pagos ?? []}
            onFactura={(id) => { setUltimoPago({ id } as Pago); setUltimaFactura(null) }}
            onAnular={(p) => setAnularPago(p)}
          />
        </div>
        {anularPago && (
          <AnularModal
            cargando={anular.isPending}
            onClose={() => setAnularPago(null)}
            onConfirm={(motivo) => anularPago.factura_id && anular.mutate({ factura_id: anularPago.factura_id, motivo })}
          />
        )}
      </section>
    </div>
  )
}



function CobroCard(props: {
  solicitud: Solicitud
  loading: boolean
  onCobrar: (d: { metodo: string; moneda: string; descuento?: number; descuento_motivo?: string; usar_prepago?: boolean } & OpcionesFiscales) => void
}) {
  const { solicitud, loading, onCobrar } = props
  const [metodo, setMetodo] = useState('efectivo')
  const [moneda, setMoneda] = useState('USD')
  const [descuento, setDescuento] = useState('')
  const [motivo, setMotivo] = useState('')
  const [usarPrepago, setUsarPrepago] = useState(false)
  const [verDetalle, setVerDetalle] = useState(false)
  const [igtfAplica, setIgtfAplica] = useState(true)
  const [retIva, setRetIva] = useState(false)
  const [retIslr, setRetIslr] = useState(false)
  const tasaUsd = useTasaUsd()
  const ivaConfig = useConfigStore((s) => s.iva)
  const igtfConfig = useConfigStore((s) => s.igtf)
  const retIvaPct = useConfigStore((s) => s.retencion_iva_pct)
  const retIslrPct = useConfigStore((s) => s.retencion_islr_pct)

  const pacienteId = solicitud.paciente?.id
  const { data: prepago } = useQuery<{ tarjeta: { id: string; saldo_usd: number } | null }>({
    queryKey: ['pagos', 'prepago', pacienteId],
    queryFn: async () => (await api.get('/pagos/prepago', { params: { paciente_id: pacienteId } })).data,
    enabled: !!pacienteId,
  })
  const saldoPrepago = Number(prepago?.tarjeta?.saldo_usd ?? 0)

  const { data: detalle } = useQuery<{
    lineas: { id: string; examen: string; precio: number; resultado: { id: string; valores: Record<string, unknown> | null; observaciones: string | null } | null }[]
  }>({
    queryKey: ['solicitud', solicitud.id],
    queryFn: async () => (await api.get(`/solicitudes/${solicitud.id}`)).data,
    enabled: verDetalle,
  })

  // El total de la solicitud está en USD (moneda base); el cobro en Bs. se
  // convierte automáticamente con la tasa del día. El IVA sale de app_config.
  const desc = Number(descuento || 0)
  const neto = Math.max(0, solicitud.total - desc)
  const ivaUsd = Number((neto * ivaConfig).toFixed(2))
  const montoUsd = Number((neto + ivaUsd).toFixed(2))
  const enBs = moneda === 'BS'
  const sinTasa = enBs && tasaUsd == null
  const montoMostrar = enBs ? usdABs(montoUsd, tasaUsd) : montoUsd
  const ivaMostrar = enBs ? usdABs(ivaUsd, tasaUsd) : ivaUsd
  // IGTF: solo en cobros en divisas (USD) y opcional vía checkbox. En Bs. lo retiene el banco del pagador.
  const igtfUsd = enBs || !(igtfConfig > 0) || !igtfAplica ? 0 : Number((montoUsd * igtfConfig).toFixed(2))
  // Retenciones fiscales VE: reducen el efectivo recibido del cliente.
  const retIvaUsd = retIva && ivaUsd > 0 ? Number((ivaUsd * retIvaPct).toFixed(2)) : 0
  const retIslrUsd = retIslr && neto > 0 ? Number((neto * retIslrPct).toFixed(2)) : 0
  const montoFinal = Math.max(0, Number((montoUsd + igtfUsd - retIvaUsd - retIslrUsd).toFixed(2)))

  return (
    <div className="flex flex-col p-4 sm:rounded-xl sm:border sm:border-slate-200 sm:gap-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800">{solicitud.paciente?.nombre_completo ?? 'Paciente'}</p>
        <p className="text-xs text-slate-400">{solicitud.paciente?.cedula ?? ''}</p>
      </div>
      <div className="mt-1 text-sm text-slate-600">
        Total <PrecioDual usd={solicitud.total} tasaUsd={tasaUsd} />
        {desc > 0 && <span className="text-emerald-600"> · desc. ${desc.toFixed(2)}</span>}
      </div>
      {solicitud.paquete_id && (
        <p className="text-xs text-brand-600">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium">Paquete comercial</span> · el descuento del combo se aplica en el cobro
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Método">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
            {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
          </select>
        </Field>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputCls}>
            <option value="USD">Dólares (USD)</option>
            <option value="BS">Bolívares (Bs.)</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Descuento (USD)">
          <input type="number" min="0" max={solicitud.total} value={descuento} onChange={(e) => setDescuento(e.target.value)} className={inputCls} placeholder="0.00" />
        </Field>
        <Field label="Motivo">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Motivo / autorización" />
        </Field>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">IVA {Math.round(ivaConfig * 100)}%: {enBs ? formatearBs(ivaMostrar) : `$${ivaUsd.toFixed(2)}`}</span>
        <span className="font-bold text-slate-800">
          Pagar: {sinTasa ? '—' : enBs ? `${formatearBs(montoMostrar)} (≈ $${montoUsd.toFixed(2)})` : `$${montoFinal.toFixed(2)}`}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">IVA {Math.round(ivaConfig * 100)}%: {enBs ? formatearBs(ivaMostrar) : `$${ivaUsd.toFixed(2)}`}</span>
        <span className="font-bold text-slate-800">
          Pagar: {sinTasa ? '—' : enBs ? `${formatearBs(montoMostrar)} (≈ $${montoFinal.toFixed(2)})` : `$${montoFinal.toFixed(2)}`}
        </span>
      </div>

      {/* Opciones fiscales (configurables en Administración → Facturación) */}
      <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={!enBs && igtfConfig > 0 && igtfAplica} disabled={enBs || igtfConfig <= 0} onChange={(e) => setIgtfAplica(e.target.checked)} className="h-4 w-4 accent-purple-600" />
          Cobrar IGTF ({Math.round(igtfConfig * 100)}%){enBs && ' — no aplica en Bs.'}
        </span>
        <span className={igtfUsd > 0 ? 'font-medium text-purple-700' : 'text-slate-400'}>{igtfUsd > 0 ? `+ $${igtfUsd.toFixed(2)}` : '—'}</span>
      </label>
      <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={retIva} onChange={(e) => setRetIva(e.target.checked)} className="h-4 w-4 accent-amber-600" />
          Retención de IVA ({Math.round(retIvaPct * 100)}%)
        </span>
        <span className={retIvaUsd > 0 ? 'font-medium text-amber-700' : 'text-slate-400'}>{retIvaUsd > 0 ? `− $${retIvaUsd.toFixed(2)}` : '—'}</span>
      </label>
      <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={retIslr} onChange={(e) => setRetIslr(e.target.checked)} className="h-4 w-4 accent-amber-600" />
          Retención de ISLR ({Math.round(retIslrPct * 100)}%)
        </span>
        <span className={retIslrUsd > 0 ? 'font-medium text-amber-700' : 'text-slate-400'}>{retIslrUsd > 0 ? `− $${retIslrUsd.toFixed(2)}` : '—'}</span>
      </label>

      {sinTasa && (
        <p className="text-xs text-red-600">Configura la tasa del día en Administración → Tasas para cobrar en Bs.</p>
      )}

      <button
        onClick={() => setVerDetalle((v) => !v)}
        className="mt-2 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        {verDetalle ? 'Ocultar exámenes' : 'Ver exámenes'}
      </button>

      {verDetalle && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          {detalle ? (
            <ul className="space-y-1.5">
              {detalle.lineas.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-slate-700">{l.examen}</span>
                  <span className="text-right text-slate-500">
                    <PrecioDual usd={l.precio} tasaUsd={tasaUsd} />
                    {l.resultado && <span className="block text-emerald-700">Resultado: {l.resultado.valores ? JSON.stringify(l.resultado.valores) : '—'}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Cargando…</p>
          )}
        </div>
      )}

      <label className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="text-slate-700">
          Usar fondo de prepago
          <span className="block text-xs text-slate-400">
            Saldo: {saldoPrepago > 0 ? `$${saldoPrepago.toFixed(2)}` : 'sin saldo'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={usarPrepago}
          disabled={saldoPrepago <= 0}
          onChange={(e) => setUsarPrepago(e.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
      </label>
      {usarPrepago && (
        <p className="text-xs text-slate-500">El fondo cubrirá parte del monto y solo lo restante se cobrará por {METODO_LABEL[metodo] ?? metodo} con su IGTF.</p>
      )}

      <button
        onClick={() => onCobrar({
          metodo,
          moneda,
          descuento: desc > 0 ? desc : undefined,
          descuento_motivo: motivo || undefined,
          usar_prepago: usarPrepago || undefined,
          igtf_aplica: !enBs && igtfConfig > 0 ? igtfAplica : undefined,
          retencion_iva_aplica: retIva || undefined,
          retencion_islr_aplica: retIslr || undefined,
        })}
        disabled={loading || sinTasa}
        className="mt-2 shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Cobrar
      </button>
    </div>
  )
}

interface CajaTurno {
  id: string
  abierta_por: string
  fecha_apertura: string
  monto_inicial: number
  estado: string
  fecha_cierre: string | null
  efectivo_esperado_usd: number
  efectivo_esperado_bs: number
  efectivo_real_usd: number
  efectivo_real_bs: number
  monto_esperado_caja_usd: number
  monto_real_caja_usd: number
  diferencia_usd: number
  tasa_usd: number | null
  observaciones: string | null
}

function TurnoCard() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [montoInicial, setMontoInicial] = useState('')
  const [cerrarTurno, setCerrarTurno] = useState<CajaTurno | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: activo, isLoading } = useQuery<CajaTurno | null>({
    queryKey: ['caja', 'turno-activo'],
    queryFn: async () => (await api.get('/caja/turno-activo')).data?.turno ?? null,
  })

  const { data: historial } = useQuery<{ turnos: CajaTurno[] }>({
    queryKey: ['caja', 'turnos'],
    queryFn: async () => (await api.get('/caja/turnos', { params: { estado: 'cerrada' } })).data,
  })

  const abrir = useMutation({
    mutationFn: (monto: number) => api.post('/caja/apertura', { monto_inicial: monto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const cerrar = useMutation({
    mutationFn: (p: { efectivo_usd: number; efectivo_bs: number; observaciones?: string }) => api.post('/caja/cierre', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const cerrados = historial?.turnos ?? []

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Turno de caja</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {isLoading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : activo ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Abierto</span>
                <span className="ml-2">Desde {new Date(activo.fecha_apertura).toLocaleString()}</span>
              </div>
              <button
                onClick={() => setCerrarTurno(activo)}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Cerrar turno (arqueo)
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Monto inicial en caja: <strong>{formatearBs(usdABs(activo.monto_inicial, tasaUsd) ?? 0)}</strong> (≈ $ {activo.monto_inicial.toFixed(2)})
            </p>
            <p className="text-xs text-slate-500">Los cobros en efectivo quedan asociados a este turno y se concilian al cerrar.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Monto inicial (USD)">
              <input type="number" min={0} step="0.01" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} className={inputCls} placeholder="0.00" />
            </Field>
            <button
              onClick={() => abrir.mutate(Number(montoInicial || 0))}
              disabled={abrir.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {abrir.isPending ? 'Abriendo…' : 'Abrir turno'}
            </button>
          </div>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {cerrados.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Cierre</th>
                <th className="px-4 py-3 text-right">Esperado (USD)</th>
                <th className="px-4 py-3 text-right">Real (USD)</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cerrados.slice(0, 5).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-slate-600">{t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right">$ {t.monto_esperado_caja_usd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">$ {t.monto_real_caja_usd.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${t.diferencia_usd > 0 ? 'text-emerald-600' : t.diferencia_usd < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    {t.diferencia_usd > 0 ? '+' : ''}{t.diferencia_usd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cerrarTurno && (
        <CierreModal
          turno={cerrarTurno}
          cargando={cerrar.isPending}
          onClose={() => setCerrarTurno(null)}
          onConfirm={(p) => cerrar.mutate(p)}
        />
      )}
    </section>
  )
}

function CierreModal({ turno, cargando, onClose, onConfirm }: {
  turno: CajaTurno
  cargando: boolean
  onClose: () => void
  onConfirm: (p: { efectivo_usd: number; efectivo_bs: number; observaciones?: string }) => void
}) {
  const [usd, setUsd] = useState('')
  const [bs, setBs] = useState('')
  const [obs, setObs] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Cierre de turno (arqueo)</h3>
        <p className="mt-1 text-sm text-slate-500">
          Declara el efectivo contado físicamente. Se compara contra el esperado (monto inicial ${turno.monto_inicial.toFixed(2)} + cobros en efectivo del turno) y la diferencia queda registrada.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Efectivo contado en USD ($)">
            <input type="number" min={0} step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} className={inputCls} placeholder="0.00" />
          </Field>
          <Field label="Efectivo contado en Bs.">
            <input type="number" min={0} step="0.01" value={bs} onChange={(e) => setBs(e.target.value)} className={inputCls} placeholder="0,00" />
          </Field>
          <Field label="Observaciones">
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} placeholder="Opcional" />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            disabled={cargando}
            onClick={() => onConfirm({ efectivo_usd: Number(usd || 0), efectivo_bs: Number(bs || 0), observaciones: obs || undefined })}
            className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {cargando ? 'Cerrando…' : 'Cerrar turno'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function SaldosTable({ saldos, onAbonar }: { saldos: SaldoCxc[]; onAbonar: (s: SaldoCxc) => void }) {
  const tasaUsd = useTasaUsd()
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="px-4 py-3">Paciente</th>
          <th className="px-4 py-3">Fecha</th>
          <th className="px-4 py-3">Estado</th>
          <th className="px-4 py-3 text-right">Total (USD)</th>
          <th className="px-4 py-3 text-right">Abonado</th>
          <th className="px-4 py-3 text-right">Saldo</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(saldos ?? []).map((s) => (
          <tr key={s.solicitud_id} className="hover:bg-slate-50">
            <td className="px-4 py-3">
              <p className="font-medium text-slate-800">{s.paciente?.nombre_completo ?? 'Paciente'}</p>
              <p className="text-xs text-slate-400">{s.paciente?.cedula ?? ''}</p>
            </td>
            <td className="px-4 py-3 text-slate-600">{new Date(s.fecha).toLocaleDateString()}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${estadoCls(s.estado)}`}>{s.estado}</span>
              {s.parcial && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">parcial</span>}
            </td>
            <td className="px-4 py-3 text-right"><PrecioDual usd={s.total_usd} tasaUsd={tasaUsd} /></td>
            <td className="px-4 py-3 text-right text-emerald-600">$ {s.monto_pagado.toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-semibold text-slate-800">$ {s.saldo.toFixed(2)}</td>
            <td className="px-4 py-3 text-right">
              <button onClick={() => onAbonar(s)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700">
                Abonar
              </button>
            </td>
          </tr>
        ))}
        {(saldos ?? []).length === 0 && (
          <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">No hay saldos pendientes.</td></tr>
        )}
      </tbody>
    </table>
  )
}

interface PacienteLite {
  id: string
  cedula: string
  nombre_completo: string
}

interface LineaDetalle {
  id: string
  examen_id: string
  examen: string
  precio: number
}

interface DetalleSolicitud {
  id: string
  estado: string
  cobrado: boolean
  total: number
  lineas: LineaDetalle[]
}

interface ExamenCat {
  id: string
  nombre: string
  precio: number
  activo: boolean
}

interface FacturaRow {
  id: string
  serie: string
  numero_factura: string
  numero_control: string
  tipo_documento: string
  total: number
  moneda: string
  estatus: 'emitida' | 'anulada'
  fecha_emision: string
}

function AbonarModal({ saldo, cargando, onClose, onConfirm }: {
  saldo: SaldoCxc
  cargando: boolean
  onClose: () => void
  onConfirm: (d: { monto: number; moneda: string; metodo: string; observaciones?: string } & OpcionesFiscales) => void
}) {
  const queryClient = useQueryClient()
  const tasaUsd = useTasaUsd()
  const ivaConfig = useConfigStore((s) => s.iva)
  const igtfConfig = useConfigStore((s) => s.igtf)
  const retIvaPct = useConfigStore((s) => s.retencion_iva_pct)
  const retIslrPct = useConfigStore((s) => s.retencion_islr_pct)

  // ----- Pago -----
  const [monto, setMonto] = useState(saldo.saldo > 0 ? saldo.saldo.toFixed(2) : '')
  const [moneda, setMoneda] = useState('USD')
  const [metodo, setMetodo] = useState('efectivo')
  const [obs, setObs] = useState('')
  const [igtfAplica, setIgtfAplica] = useState(true)
  const [retIva, setRetIva] = useState(false)
  const [retIslr, setRetIslr] = useState(false)

  // ----- Cliente a facturar -----
  const [cliente, setCliente] = useState<PacienteLite | null>(saldo.paciente)
  const [editandoCliente, setEditandoCliente] = useState(false)
  const [clienteQ, setClienteQ] = useState('')
  const { data: pacientesEncontrados = [] } = useQuery<PacienteLite[]>({
    queryKey: ['pacientes', 'facturar', clienteQ],
    queryFn: async () => (await api.get('/pacientes', { params: { q: clienteQ } })).data,
    enabled: editandoCliente,
  })

  // ----- Exámenes de la orden -----
  const [nuevoExamenId, setNuevoExamenId] = useState('')
  const [errorExamenes, setErrorExamenes] = useState<string | null>(null)
  const { data: detalle } = useQuery<DetalleSolicitud>({
    queryKey: ['solicitud', saldo.solicitud_id],
    queryFn: async () => (await api.get(`/solicitudes/${saldo.solicitud_id}`)).data,
  })
  const { data: catalogo = [] } = useQuery<ExamenCat[]>({
    queryKey: ['examenes'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const actualizarExamenes = useMutation({
    mutationFn: (examenes: string[]) =>
      api.patch(`/solicitudes/${saldo.solicitud_id}/examenes-caja`, { examenes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitud', saldo.solicitud_id] })
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      setErrorExamenes(null)
    },
    onError: (e) => setErrorExamenes(getApiError(e)),
  })

  function agregarExamen() {
    if (!detalle || !nuevoExamenId) return
    actualizarExamenes.mutate([...detalle.lineas.map((l) => l.examen_id), nuevoExamenId])
    setNuevoExamenId('')
  }
  function quitarExamen(examenId: string) {
    if (!detalle) return
    const restantes = detalle.lineas.filter((l) => l.examen_id !== examenId).map((l) => l.examen_id)
    actualizarExamenes.mutate(restantes)
  }

  // ----- Anulación de factura desde el modal -----
  const [facturaAnular, setFacturaAnular] = useState<FacturaRow | null>(null)
  const [motivoAnular, setMotivoAnular] = useState('')
  const { data: facturasAsoc } = useQuery<{ facturas: FacturaRow[] }>({
    queryKey: ['facturas', 'solicitud', saldo.solicitud_id],
    queryFn: async () => (await api.get('/facturas', { params: { solicitud_id: saldo.solicitud_id } })).data,
  })
  const emitidas = (facturasAsoc?.facturas ?? []).filter((f) => f.estatus === 'emitida')

  const anularDeModal = useMutation({
    mutationFn: ({ factura_id, motivo }: { factura_id: string; motivo: string }) =>
      api.post(`/facturas/${factura_id}/anular`, { motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      setFacturaAnular(null)
      setMotivoAnular('')
    },
  })

  // ----- Totales (misma matemática que GET /pagos/saldos) -----
  const sumaLineas = detalle ? Number(detalle.lineas.reduce((acc, l) => acc + Number(l.precio), 0).toFixed(2)) : null
  const baseUsd = sumaLineas ?? saldo.total_usd
  const ivaUsd = Number((baseUsd * ivaConfig).toFixed(2))
  const totalFacturadoUsd = Number((baseUsd + ivaUsd).toFixed(2))
  const saldoVigenteUsd = sumaLineas == null ? saldo.saldo : Math.max(0, Number((totalFacturadoUsd - saldo.monto_pagado).toFixed(2)))

  // Vista previa del recibo: el abono cubre base e IVA proporcionalmente.
  const abono = Number(monto || 0)
  const enBs = moneda === 'BS'
  const ivaShare = totalFacturadoUsd > 0 ? ivaUsd / totalFacturadoUsd : 0
  const ivaDelAbono = Number((abono * ivaShare).toFixed(2))
  const baseDelAbono = Number((abono - ivaDelAbono).toFixed(2))
  const igtfUsd = !enBs && igtfAplica && igtfConfig > 0 ? Number((abono * igtfConfig).toFixed(2)) : 0
  const retIvaUsd = retIva && ivaDelAbono > 0 ? Number((ivaDelAbono * retIvaPct).toFixed(2)) : 0
  const retIslrUsd = retIslr && baseDelAbono > 0 ? Number((baseDelAbono * retIslrPct).toFixed(2)) : 0
  const efectivoUsd = Math.max(0, Number((abono + igtfUsd - retIvaUsd - retIslrUsd).toFixed(2)))
  const mostrarBs = (usd: number) => formatearBs(usdABs(usd, tasaUsd) ?? 0)

  const valido = abono > 0 && abono <= saldoVigenteUsd + 0.005

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Cobro / abono a cuenta</h3>
        <p className="mt-1 text-sm text-slate-500">
          Saldo pendiente <strong>$ {saldoVigenteUsd.toFixed(2)}</strong> de $ {totalFacturadoUsd.toFixed(2)}
          {saldo.parcial && <> · abonado $ {saldo.monto_pagado.toFixed(2)}</>}
          .
        </p>

        {/* Cliente a facturar */}
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Cliente a facturar</p>
          {cliente && !editandoCliente ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">
                {cliente.nombre_completo}
                <span className="ml-1 text-xs text-slate-400">{cliente.cedula}</span>
              </span>
              <div className="flex gap-2">
                {cliente.id !== saldo.paciente?.id && (
                  <button onClick={() => { setCliente(saldo.paciente); }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">
                    Restaurar paciente
                  </button>
                )}
                <button onClick={() => setEditandoCliente(true)} className="rounded-lg border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                  Cambiar cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5">
              <input value={clienteQ} onChange={(e) => setClienteQ(e.target.value)} placeholder="Buscar por cédula o nombre…" className={inputCls} autoFocus />
              <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200">
                {pacientesEncontrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setCliente(p); setEditandoCliente(false); setClienteQ('') }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${cliente?.id === p.id ? 'bg-brand-50' : ''}`}
                  >
                    <span className="font-medium text-slate-800">{p.nombre_completo}</span>
                    <span className="text-xs text-slate-400">{p.cedula}</span>
                  </button>
                ))}
                {editandoCliente && clienteQ.length >= 1 && pacientesEncontrados.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Exámenes de la orden */}
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">Exámenes de la orden</p>
            <span className="text-xs text-slate-500">$ {baseUsd.toFixed(2)}</span>
          </div>
          {detalle ? (
            <>
              <ul className="mt-2 space-y-1">
                {detalle.lineas.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{l.examen}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-slate-500">$ {Number(l.precio).toFixed(2)}</span>
                      {!detalle.cobrado && (
                        <button
                          onClick={() => quitarExamen(l.examen_id)}
                          disabled={actualizarExamenes.isPending}
                          title="Quitar examen"
                          className="rounded px-1.5 py-0.5 text-xs font-bold text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {!detalle.cobrado && (
                <div className="mt-2 flex gap-2">
                  <select value={nuevoExamenId} onChange={(e) => setNuevoExamenId(e.target.value)} className={inputCls}>
                    <option value="">Agregar examen…</option>
                    {catalogo
                      .filter((e) => e.activo !== false && !detalle.lineas.some((l) => l.examen_id === e.id))
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre} ($ {Number(e.precio).toFixed(2)})</option>
                      ))}
                  </select>
                  <button
                    onClick={agregarExamen}
                    disabled={!nuevoExamenId || actualizarExamenes.isPending}
                    className="shrink-0 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                  >
                    Agregar
                  </button>
                </div>
              )}
              {errorExamenes && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorExamenes}</p>}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Cargando exámenes…</p>
          )}
        </div>

        {/* Desglose fiscal */}
        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Base (exámenes)</span><span>$ {baseUsd.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-600"><span>IVA {Math.round(ivaConfig * 100)}%</span><span>$ {ivaUsd.toFixed(2)}</span></div>
          <label className="flex items-center justify-between pt-1 text-slate-700">
            <span className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!enBs && igtfConfig > 0 && igtfAplica} disabled={enBs || igtfConfig <= 0} onChange={(e) => setIgtfAplica(e.target.checked)} className="h-4 w-4 accent-purple-600" />
              Cobrar IGTF ({Math.round(igtfConfig * 100)}%){enBs && ' — no aplica en Bs.'}
            </span>
            <span className={igtfUsd > 0 ? 'text-purple-700' : 'text-slate-400'}>+ $ {igtfUsd.toFixed(2)}</span>
          </label>
          <label className="flex items-center justify-between text-slate-700">
            <span className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={retIva} onChange={(e) => setRetIva(e.target.checked)} className="h-4 w-4 accent-amber-600" />
              Retención de IVA ({Math.round(retIvaPct * 100)}%)
            </span>
            <span className={retIvaUsd > 0 ? 'text-amber-700' : 'text-slate-400'}>− $ {retIvaUsd.toFixed(2)}</span>
          </label>
          <label className="flex items-center justify-between text-slate-700">
            <span className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={retIslr} onChange={(e) => setRetIslr(e.target.checked)} className="h-4 w-4 accent-amber-600" />
              Retención de ISLR ({Math.round(retIslrPct * 100)}%)
            </span>
            <span className={retIslrUsd > 0 ? 'text-amber-700' : 'text-slate-400'}>− $ {retIslrUsd.toFixed(2)}</span>
          </label>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
            <span>Efectivo a recibir</span>
            <span>{enBs ? `${mostrarBs(efectivoUsd)} ≈ $ ${efectivoUsd.toFixed(2)}` : `$ ${efectivoUsd.toFixed(2)}`}</span>
          </div>
        </div>

        {/* Datos del pago */}
        <div className="mt-3 space-y-3">
          <Field label="Monto a abonar (USD)">
            <input type="number" min={0} max={saldoVigenteUsd} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputCls}>
                <option value="USD">Dólares (USD)</option>
                <option value="BS">Bolívares (Bs.)</option>
              </select>
            </Field>
            <Field label="Método">
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
                {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Observaciones">
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} placeholder="Opcional" />
          </Field>
        </div>

        {monto && !valido && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">El abono excede el saldo pendiente.</p>}

        {/* Facturas emitidas asociadas */}
        {emitidas.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Facturas emitidas de esta solicitud</p>
            <ul className="mt-2 space-y-1.5">
              {emitidas.map((f) => (
                <li key={f.id}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700">
                      <strong>{f.tipo_documento === 'factura' ? 'F' : 'R'} {f.serie}-{f.numero_factura}</strong> · control {f.numero_control} · {f.moneda === 'BS' ? mostrarBs(f.total) : `$ ${Number(f.total).toFixed(2)}`}
                    </span>
                    <button onClick={() => { setFacturaAnular(facturaAnular?.id === f.id ? null : f); setMotivoAnular('') }} className={`font-semibold hover:underline ${facturaAnular?.id === f.id ? 'text-slate-400' : 'text-red-600'}`}>
                      {facturaAnular?.id === f.id ? 'Cerrar' : 'Anular'}
                    </button>
                  </div>
                  {facturaAnular?.id === f.id && (
                    <div className="mt-1.5 flex gap-2">
                      <input value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)} placeholder="Motivo de anulación (mín. 5 caracteres)" className={inputCls} autoFocus />
                      <button
                        onClick={() => anularDeModal.mutate({ factura_id: f.id, motivo: motivoAnular })}
                        disabled={anularDeModal.isPending || motivoAnular.trim().length < 5}
                        className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        {anularDeModal.isPending ? 'Anulando…' : 'Confirmar'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {anularDeModal.isError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{getApiError(anularDeModal.error)}</p>}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            disabled={cargando || !valido}
            onClick={() => onConfirm({
              monto: abono,
              moneda,
              metodo,
              observaciones: obs || undefined,
              paciente_id: cliente && cliente.id !== saldo.paciente?.id ? cliente.id : undefined,
              igtf_aplica: !enBs && igtfConfig > 0 ? igtfAplica : undefined,
              retencion_iva_aplica: retIva || undefined,
              retencion_islr_aplica: retIslr || undefined,
            })}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {cargando ? 'Registrando…' : 'Registrar cobro'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function PrepagoPanel({ onRecargado }: { onRecargado: (pacienteId: string) => void }) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [pacienteId, setPacienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [moneda, setMoneda] = useState('USD')
  const [error, setError] = useState<string | null>(null)

  const { data: pacientes = [] } = useQuery<{ id: string; cedula: string; nombre_completo: string }[]>({
    queryKey: ['pacientes', 'prepago', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
  })

  const { data: prepago } = useQuery<{ tarjeta: { id: string; saldo_usd: number } | null }>({
    queryKey: ['pagos', 'prepago', pacienteId],
    queryFn: async () => (await api.get('/pagos/prepago', { params: { paciente_id: pacienteId } })).data,
    enabled: !!pacienteId,
  })
  const saldo = Number(prepago?.tarjeta?.saldo_usd ?? 0)

  const recargar = useMutation({
    mutationFn: (payload: { paciente_id: string; monto: number; metodo: string; moneda: string }) => api.post('/pagos/prepago', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      queryClient.invalidateQueries({ queryKey: ['pagos', 'prepago', pacienteId] })
      setMonto('')
      setError(null)
      onRecargado(pacienteId)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pacienteId) {
      setError('Selecciona un paciente')
      return
    }
    recargar.mutate({ paciente_id: pacienteId, monto: Number(monto), metodo, moneda })
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-slate-500">Recibe dinero por adelantado de un paciente; el saldo se descuenta al cobrar con «Usar fondo de prepago».</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
        <Field label="Paciente *">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPacienteId('') }} placeholder="Buscar por cédula o nombre…" className={inputCls} />
          <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
            {pacientes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPacienteId(p.id); setQ(p.nombre_completo) }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${pacienteId === p.id ? 'bg-brand-50' : ''}`}
              >
                <span className="font-medium text-slate-800">{p.nombre_completo}</span>
                <span className="text-xs text-slate-400">{p.cedula}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Monto *"><input type="number" min="0.01" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00" /></Field>
        <Field label="Método">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
            {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
          </select>
        </Field>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputCls}>
            <option value="USD">Dólares (USD)</option>
            <option value="BS">Bolívares (Bs.)</option>
          </select>
        </Field>
        <div className="sm:col-span-4 flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-slate-600">
            Saldo actual: {pacienteId ? (
              saldo > 0 ? <strong className="text-emerald-600">${saldo.toFixed(2)}</strong> : <span className="text-slate-400">sin tarjeta</span>
            ) : '—'}
          </p>
          <button type="submit" disabled={!monto || Number(monto) <= 0 || recargar.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {recargar.isPending ? 'Recargando…' : 'Recargar'}
          </button>
        </div>
      </form>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function PagosTable({ pagos, onFactura, onAnular }: { pagos: Pago[]; onFactura: (id: string) => void; onAnular: (p: Pago) => void }) {
  const tasaUsd = useTasaUsd()
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="px-4 py-3">Fecha</th>
          <th className="px-4 py-3">Tipo</th>
          <th className="px-4 py-3">Método</th>
          <th className="px-4 py-3">Estado</th>
          <th className="px-4 py-3 text-right">Monto</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(pagos ?? []).map((p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 text-slate-600">{new Date(p.fecha).toLocaleDateString()}</td>
            <td className="px-4 py-3 capitalize">{p.tipo}</td>
            <td className="px-4 py-3 text-slate-500">{METODO_LABEL[p.metodo ?? ''] ?? p.metodo ?? '—'}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoCls(p.estado)}`}>{p.estado}</span>
            </td>
            <td className="px-4 py-3 text-right font-medium">
              {p.moneda === 'USD' ? (
                <PrecioDual usd={p.monto} tasaUsd={p.tasa_usd ?? tasaUsd} />
              ) : (
                <span>{formatearBs(p.monto)}<span className="text-xs opacity-70"> (≈ ${(bsAUsd(p.monto, p.tasa_usd ?? tasaUsd) ?? 0).toFixed(2)})</span></span>
              )}
              {p.igtf != null && p.igtf > 0 && <span className="block text-[10px] text-purple-600">+IGTF $ {p.igtf.toFixed(2)}</span>}
            </td>
            <td className="px-4 py-3 text-right">
              {p.estado !== 'reembolsado' && (
                <div className="flex justify-end gap-3">
                  <button onClick={() => onFactura(p.id)} className="text-xs font-semibold text-brand-600 hover:underline">
                    Factura
                  </button>
                  {p.factura_id && p.estado === 'pagado' && (
                    <button onClick={() => onAnular(p)} className="text-xs font-semibold text-red-600 hover:underline">
                      Anular
                    </button>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
        {(pagos ?? []).length === 0 && (
          <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">Sin pagos en el rango.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function estadoCls(estado: string) {
  return estado === 'pagado' ? 'bg-emerald-100 text-emerald-700'
    : estado === 'pendiente' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-500'
}

function FacturaModal({ pagoId, factura, onClose }: { pagoId?: string; factura: { id: string; numero_control: string } | null; onClose: () => void }) {
  const [descargando, setDescargando] = useState(false)

  const { data, isFetching, error } = useQuery<FacturaResp>({
    queryKey: ['factura', pagoId],
    queryFn: async () => (await api.get(`/pagos/${pagoId}/factura`)).data,
    enabled: Boolean(pagoId),
    retry: false,
  })

  if (!pagoId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Comprobante de pago</h3>
        {factura && (
          <p className="mt-1 text-xs text-slate-500">Factura persistida · N° de control: <strong>{factura.numero_control}</strong></p>
        )}
        {isFetching && <p className="mt-2 text-sm text-slate-500">Generando documento…</p>}
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{getApiError(error)}</p>}
        {data && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p>Serie {data.factura.serie} · N° de control {data.factura.control}</p>
            {data.base_exenta != null && data.base_exenta > 0 && <p>Base exenta de IVA: {data.base_exenta.toFixed(2)}</p>}
            {data.igtf != null && data.igtf > 0 && <p>IGTF incluido: {data.igtf.toFixed(2)}</p>}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={async () => {
              if (!data) return
              setDescargando(true)
              try {
                descargarFacturaPdf(data)
              } finally {
                setDescargando(false)
                onClose()
              }
            }}
            disabled={!data || isFetching || descargando}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {descargando ? 'Descargando…' : 'Descargar recibo (PDF)'}
          </button>
          <button
            onClick={() => data && descargarFacturaPdf(data).finally(() => onClose())}
            disabled={!data || isFetching}
            className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
          >
            Descargar factura completa
          </button>
          <button
            onClick={onClose}
            className="mt-1 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function AnularModal({ cargando, onClose, onConfirm }: { cargando: boolean; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Anular factura</h3>
        <p className="mt-1 text-sm text-slate-500">
          El documento quedará con estatus <strong>anulada</strong>. El correlativo no se reutiliza.
        </p>
        <div className="mt-4">
          <Field label="Motivo de anulación *">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={inputCls}
              placeholder="Ej. cobro duplicado, corrección de datos"
            />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            disabled={cargando || motivo.trim().length < 5}
            onClick={() => onConfirm(motivo)}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {cargando ? 'Anulando…' : 'Anular'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}
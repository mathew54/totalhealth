import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { descargarFacturaPdf } from '../../lib/facturaPdf'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd, usdABs, bsAUsd, formatearBs } from '../../lib/moneda'

interface Solicitud {
  id: string
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  total: number
  estado: string
  fecha: string
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
}

interface ReportePagos {
  total: number
  total_usd: number
  total_bs: number | null
  tasa_usd: number | null
  count: number
  pagos: Pago[]
}

interface FacturaResp {
  factura: {
    serie: string
    control: string
    tipo: string
    emisor: { razon_social: string; rif: string }
    receptor: { nombre: string; cedula: string | null }
    fecha: string
    moneda: string
    lineas: { descripcion: string; cantidad: number; precio: number; precio_iva: number }[]
    base: number
    iva: number
    monto: number
  }
  base: number
  iva: number
  monto: number
  descuento: number
  monto_texto: string
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
    queryFn: async () => (await api.get('/solicitudes', { params: { cobrado: 'false' } })).data,
  })

  const { data: reporte } = useQuery<ReportePagos>({
    queryKey: ['pagos', desde, hasta],
    queryFn: async () => (await api.get('/pagos', { params: { desde, hasta } })).data,
  })

  const cobrar = useMutation({
    mutationFn: (payload: {
      solicitud_id: string
      metodo: string
      moneda: string
      descuento?: number
      descuento_motivo?: string
    }) => api.post('/pagos/laboratorio', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      setError(null)
      setUltimoPago((res.data as { pago: Pago }).pago)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const [ultimoPago, setUltimoPago] = useState<Pago | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Caja</h1>
        <p className="text-sm text-slate-500">Recepción de pagos, descuentos y facturación</p>
      </div>

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

      <FacturaModal pagoId={ultimoPago?.id} onClose={() => setUltimoPago(null)} />

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
            onFactura={(id) => setUltimoPago({ id } as Pago)}
          />
        </div>
      </section>
    </div>
  )
}



function CobroCard(props: {
  solicitud: Solicitud
  loading: boolean
  onCobrar: (d: { metodo: string; moneda: string; descuento?: number; descuento_motivo?: string }) => void
}) {
  const { solicitud, loading, onCobrar } = props
  const [metodo, setMetodo] = useState('efectivo')
  const [moneda, setMoneda] = useState('USD')
  const [descuento, setDescuento] = useState('')
  const [motivo, setMotivo] = useState('')
  const tasaUsd = useTasaUsd()

  // El total de la solicitud está en USD (moneda base); el cobro en Bs. se
  // convierte automáticamente con la tasa del día.
  const desc = Number(descuento || 0)
  const neto = Math.max(0, solicitud.total - desc)
  const ivaUsd = Number((neto * 0.16).toFixed(2))
  const montoUsd = Number((neto + ivaUsd).toFixed(2))
  const enBs = moneda === 'BS'
  const sinTasa = enBs && tasaUsd == null
  const montoMostrar = enBs ? usdABs(montoUsd, tasaUsd) : montoUsd
  const ivaMostrar = enBs ? usdABs(ivaUsd, tasaUsd) : ivaUsd

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
        <span className="text-slate-500">IVA 16%: {enBs ? formatearBs(ivaMostrar) : `$${ivaUsd.toFixed(2)}`}</span>
        <span className="font-bold text-slate-800">
          Pagar: {sinTasa ? '—' : enBs ? `${formatearBs(montoMostrar)} (≈ $${montoUsd.toFixed(2)})` : `$${montoUsd.toFixed(2)}`}
        </span>
      </div>

      {sinTasa && (
        <p className="text-xs text-red-600">Configura la tasa del día en Administración → Tasas para cobrar en Bs.</p>
      )}

      <button
        onClick={() => onCobrar({ metodo, moneda, descuento: desc > 0 ? desc : undefined, descuento_motivo: motivo || undefined })}
        disabled={loading || sinTasa}
        className="mt-2 shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Cobrar
      </button>
    </div>
  )
}

function PagosTable({ pagos, onFactura }: { pagos: Pago[]; onFactura: (id: string) => void }) {
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
            </td>
            <td className="px-4 py-3 text-right">
              {p.estado !== 'reembolsado' && (
                <button onClick={() => onFactura(p.id)} className="text-xs font-semibold text-brand-600 hover:underline">
                  Factura
                </button>
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

function FacturaModal({ pagoId, onClose }: { pagoId?: string; onClose: () => void }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)

  const obtener = async (): Promise<FacturaResp | null> => {
    if (!pagoId) return null
    setCargando(true)
    setError(null)
    try {
      return (await api.get(`/pagos/${pagoId}/factura`)).data as FacturaResp
    } catch (e) {
      setError(getApiError(e))
      return null
    } finally {
      setCargando(false)
    }
  }

  if (!pagoId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Comprobante de pago</h3>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={async () => {
              const f = await obtener()
              if (!f) return
              setDescargando(true)
              try {
                descargarFacturaPdf(f)
              } finally {
                setDescargando(false)
                onClose()
              }
            }}
            disabled={cargando || descargando}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {descargando ? 'Descargando…' : 'Descargar recibo (PDF)'}
          </button>
          <button
            onClick={() => obtener().then((f) => f && descargarFacturaPdf(f)).finally(() => onClose())}
            disabled={cargando}
            className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {cargando ? 'Generando…' : 'Descargar factura completa'}
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

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}
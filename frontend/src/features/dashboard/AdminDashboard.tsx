import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'
import { useTasaUsd } from '../../lib/moneda'
import { EmptyRow, ErrorPanel, LoadingRow, SectionCard, ToggleVistas } from './helpers'
import { useVistaPersistida } from './dashboardUtils'

interface Staff {
  id: string
  role: string
  roles: string[]
  activo: boolean
  nombre_completo: string
}
interface Reporteria {
  total: number
  total_bs: number
  count: number
  tasa_usd: number
}
interface Pago {
  id: string
  tipo: string
  monto: number
  moneda: string
  tasa_usd: number | null
  fecha: string
  estado: string
}
interface ReportePagos {
  total: number
  total_usd: number
  total_bs: number | null
  tasa_usd: number | null
  count: number
  pagos: Pago[]
}
interface Auditoria {
  id: string
  usuario_id: string | null
  accion: string
  tabla: string | null
  detalles: Record<string, unknown> | null
  fecha: string
}

const acciones = [
  { label: 'Gestión de personal', to: '/admin', descripcion: 'Perfiles, roles y especialidades' },
  { label: 'Historial clínico', to: '/historial', descripcion: 'Expedientes y correcciones' },
  { label: 'Reporte de caja', to: '/pagos', descripcion: 'Cobros del día' },
  { label: 'Catálogo de laboratorio', to: '/admin', descripcion: 'Exámenes y parámetros' },
]

/** Ingresos normalizados a USD por día para la tendencia (últimos `dias`). */
function ingresosPorDia(pagos: Pago[], tasaDia: number | null, dias = 7): { dia: string; total: number }[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const mapa = new Map<string, number>()
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    mapa.set(d.toISOString().slice(0, 10), 0)
  }
  for (const p of pagos) {
    if (p.estado !== 'pagado') continue
    const dia = p.fecha.slice(0, 10)
    if (!mapa.has(dia)) continue
    const usd = p.moneda === 'USD' ? p.monto : p.monto / (p.tasa_usd ?? tasaDia ?? 1)
    mapa.set(dia, (mapa.get(dia) ?? 0) + usd)
  }
  return [...mapa.entries()].map(([dia, total]) => ({
    dia: new Date(`${dia}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }),
    total: Number(total.toFixed(2)),
  }))
}

export default function AdminDashboard() {
  const { profile } = useSessionStore()
  const tasaUsd = useTasaUsd()
  const [vista, setVista] = useVistaPersistida<'ejecutiva' | 'operativa'>('th:admin:vista', 'ejecutiva')

  const desde = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  }, [])
  const hasta = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const { data: staff = [], isLoading: cargandoStaff } = useQuery<Staff[]>({
    queryKey: ['admin', 'staff', 'resumen'],
    queryFn: async () => (await api.get('/admin/staff')).data,
  })
  const { data: reporteria } = useQuery<Reporteria>({
    queryKey: ['admin', 'reporteria', 'resumen'],
    queryFn: async () => (await api.get('/admin/reporteria')).data,
  })
  const { data: reportePagos, isLoading: cargandoPagos, isError: errorPagos } = useQuery<ReportePagos>({
    queryKey: ['admin', 'pagos', 'tendencia', desde, hasta],
    queryFn: async () => (await api.get('/pagos', { params: { desde, hasta } })).data,
    refetchInterval: 120_000,
  })
  const { data: auditoria = [], isLoading: cargandoAuditoria } = useQuery<Auditoria[]>({
    queryKey: ['admin', 'auditoria', 'resumen'],
    queryFn: async () => (await api.get('/admin/auditoria', { params: { limit: 15 } })).data,
  })

  const activos = staff.filter((s) => s.activo).length
  const medicos = staff.filter((s) => s.roles.includes('medico')).length
  const lab = staff.filter((s) => s.roles.includes('laboratorio')).length
  const secretarias = staff.filter((s) => s.roles.includes('secretaria')).length
  const inactivos = staff.filter((s) => !s.activo)

  const tendencia = useMemo(() => ingresosPorDia(reportePagos?.pagos ?? [], reportePagos?.tasa_usd ?? tasaUsd, 7), [reportePagos, tasaUsd])
  const reembolsos = (reportePagos?.pagos ?? []).filter((p) => p.estado === 'reembolsado').length

  const personal = useMemo(
    () => [
      { rol: 'Médicos', total: medicos },
      { rol: 'Laboratorio', total: lab },
      { rol: 'Secretaría', total: secretarias },
    ],
    [medicos, lab, secretarias],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard administrativo</h2>
          <p className="text-sm text-slate-500">Gestión institucional, {profile?.nombre_completo}.</p>
        </div>
        <ToggleVistas
          valor={vista}
          onChange={setVista}
          opciones={[
            { id: 'ejecutiva', label: 'Ejecutiva' },
            { id: 'operativa', label: 'Operativa' },
          ]}
        />
      </div>

      {vista === 'ejecutiva' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Ingresos (7 días)" valor={reporteria ? `$${reporteria.total.toFixed(2)}` : '—'} tono="success" hint={reporteria ? `Bs ${reporteria.total_bs.toFixed(2)}` : undefined} />
            <StatCard label="Movimientos (7 días)" valor={reportePagos?.count ?? '—'} hint="Pagos registrados" />
            <StatCard label="Tasa de referencia" valor={reporteria?.tasa_usd ? `Bs ${reporteria.tasa_usd}` : '—'} hint="Del día" />
            <StatCard label="Reembolsos" valor={reembolsos} tono={reembolsos > 0 ? 'warning' : 'default'} hint="En el período" />
          </div>

          <SectionCard titulo="Tendencia de ingresos (7 días)" acciones={<Link to="/pagos" className="text-xs font-medium text-brand-600 hover:underline">Reporte de caja →</Link>}>
            {cargandoPagos ? (
              <LoadingRow mensaje="Calculando tendencia…" />
            ) : errorPagos ? (
              <ErrorPanel mensaje="No se pudo cargar la tendencia de pagos." />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tendencia} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <defs>
                      <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dia" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`} />
                    <Area type="monotone" dataKey="total" name="Ingresos" stroke="#10b981" strokeWidth={2} fill="url(#gradIngresos)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {acciones.map((a) => (
              <Link
                key={a.to + a.label}
                to={a.to}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
              >
                <h3 className="text-sm font-semibold text-brand-700">{a.label}</h3>
                <p className="mt-1 text-xs text-slate-500">{a.descripcion}</p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Personal activo" valor={activos} hint={`${staff.length} registrados`} />
            <StatCard label="Médicos" valor={medicos} hint="Con colegiatura y especialidades" />
            <StatCard label="Laboratorio" valor={lab} hint="Bioanalistas" />
            <StatCard label="Secretaría" valor={secretarias} hint="Recepción" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard titulo="Distribución por rol" sinBorde>
              {cargandoStaff ? (
                <LoadingRow mensaje="Cargando personal…" />
              ) : (
                <div className="space-y-3">
                  {personal.map((p) => {
                    const max = Math.max(...personal.map((x) => x.total), 1)
                    return (
                      <div key={p.rol} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs font-medium text-slate-600">{p.rol}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.total / max) * 100}%` }} />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-800">{p.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard titulo="Personal inactivo" acciones={<Link to="/admin" className="text-xs font-medium text-brand-600 hover:underline">Gestionar →</Link>}>
              {inactivos.length === 0 ? (
                <EmptyRow>Todo el personal está activo.</EmptyRow>
              ) : (
                <ul className="space-y-2">
                  {inactivos.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-700">{s.nombre_completo}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">inactivo</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            titulo="Actividad reciente"
            acciones={<Link to="/admin" className="text-xs font-medium text-brand-600 hover:underline">Administración →</Link>}
          >
            {cargandoAuditoria ? (
              <LoadingRow mensaje="Cargando actividad…" />
            ) : auditoria.length === 0 ? (
              <EmptyRow>Sin actividad registrada.</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {auditoria.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate capitalize text-slate-700">
                      <span className="font-medium">{a.accion.replace(/_/g, ' ')}</span>
                      {a.tabla && <span className="text-slate-400"> · {a.tabla.replace(/_/g, ' ')}</span>}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {new Date(a.fecha).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
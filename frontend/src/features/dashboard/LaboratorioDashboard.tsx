import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'
import EtiquetaQRSolicitud from './widgets/EtiquetaQRSolicitud'
import {
  EmptyRow,
  LoadingRow,
  NivelBadge,
  SectionCard,
  ToggleVistas,
} from './helpers'
import { duracionLegible, tiempoDesde, useVistaPersistida } from './dashboardUtils'
import {
  backlogPorEdad,
  esperaPromedioCola,
  estimarTat,
  solicitudesPorDia,
  solicitudesPorEstado,
  solicitudesRetrasadas,
} from './kpis'

interface Solicitud {
  id: string
  estado: string
  fecha: string
  cobrado: boolean
  total: number
  paciente: { id: string; cedula: string; nombre_completo: string } | null
}
interface Alerta {
  id: string
  paciente_id: string
  paciente_nombre: string | null
  examen_nombre: string | null
  parametro: string
  valor: string | null
  unidad: string | null
  nivel: 'alerta' | 'critico'
  motivo: string
  leida: boolean
  created_at: string
}
interface Domicilio {
  id: string
  estado: string
}

const acciones = [
  { label: 'Cola de laboratorio', to: '/laboratorio', descripcion: 'Solicitudes y carga de resultados' },
  { label: 'Alertas clínicas', to: '/alertas', descripcion: 'Valores críticos sin revisar' },
  { label: 'Tomas a domicilio', to: '/domicilios', descripcion: 'Programación y ruta' },
  { label: 'Pacientes', to: '/pacientes', descripcion: 'Ficha y antecedentes' },
]

/** Bandeja de alertas clínicas priorizada por severidad (crítico > alerta). */
function BandejaAlertas({
  alertas,
  criticas,
  normales,
  onMarcar,
  marcando,
}: {
  alertas: Alerta[]
  criticas: number
  normales: number
  onMarcar: (id: string) => void
  marcando: boolean
}) {
  const vistas = [...alertas]
    .filter((a) => !a.leida)
    .sort((a, b) => Number(b.nivel === 'critico') - Number(a.nivel === 'critico'))
    .slice(0, 5)

  return (
    <SectionCard
      titulo={
        <span className="flex items-center gap-2">
          Alertas clínicas
          {criticas > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{criticas} críticas</span>
          )}
          {normales > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{normales} alertas</span>
          )}
        </span>
      }
      acciones={
        <Link to="/alertas" className="text-xs font-medium text-brand-600 hover:underline">
          Ver todas →
        </Link>
      }
      className={criticas > 0 ? 'border-red-200' : normales > 0 ? 'border-amber-200' : ''}
    >
      {vistas.length === 0 ? (
        <EmptyRow>Sin alertas clínicas pendientes de revisión.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {vistas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <NivelBadge nivel={a.nivel} />
                <span className="truncate text-slate-700">
                  {a.paciente_nombre ?? 'Paciente'} — {a.motivo}
                </span>
                <span className="hidden shrink-0 text-slate-400 sm:inline">{tiempoDesde(a.created_at)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-slate-500 md:inline">
                  {a.examen_nombre} · <strong>{a.parametro}</strong> = {a.valor ?? '—'}
                  {a.unidad ? ` ${a.unidad}` : ''}
                </span>
                <button
                  onClick={() => onMarcar(a.id)}
                  disabled={marcando}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Revisada
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/** Vista de supervisión: KPIs operativos, backlog, TAT y volumen. */
function VistaSupervision({ solicitudes, criticas, enRuta }: { solicitudes: Solicitud[]; criticas: number; enRuta: number }) {
  const activas = useMemo(() => solicitudes.filter((s) => s.estado === 'pendiente' || s.estado === 'en_proceso'), [solicitudes])
  const backlog = useMemo(() => backlogPorEdad(activas), [activas])
  const espera = useMemo(() => esperaPromedioCola(activas), [activas])
  const tat = useMemo(() => estimarTat(activas), [activas])
  const retrasadas = useMemo(() => solicitudesRetrasadas(activas), [activas])
  const porDia = useMemo(() => solicitudesPorDia(solicitudes, 7), [solicitudes])
  const porEstado = useMemo(() => solicitudesPorEstado(solicitudes), [solicitudes])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TAT estimado" valor={duracionLegible(tat)} tono={tat > 4 * 3_600_000 ? 'warning' : 'default'} hint="Cola + tiempo de proceso" />
        <StatCard label="Espera media en cola" valor={duracionLegible(espera)} hint="Pendientes y en proceso" />
        <StatCard label="Solicitudes retrasadas" valor={retrasadas} tono={retrasadas > 0 ? 'danger' : 'success'} hint="Mayores a 4 h sin listar" />
        <StatCard label="Alertas críticas" valor={criticas} tono={criticas > 0 ? 'danger' : 'success'} hint="Sin revisar" />
      </div>

      <SectionCard
        titulo="Backlog por antigüedad"
        acciones={
          <span className="text-xs text-slate-400">
            {activas.length} en cola · {enRuta} domicilios activos
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-2xl font-bold text-slate-800">{backlog.hasta2h}</p>
            <p className="text-xs text-slate-500">≤ 2 h</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-2xl font-bold text-amber-700">{backlog.de2a8h}</p>
            <p className="text-xs text-amber-700">2 – 8 h</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-2xl font-bold text-red-700">{backlog.masDe8h}</p>
            <p className="text-xs text-red-700">&gt; 8 h</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Proyección: con una espera media de {duracionLegible(espera)}, la cola actual se estima despejada en{' '}
          <strong>{duracionLegible(tat)}</strong>.
        </p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard titulo="Solicitudes por día (7 días)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDia} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" stroke="#94a3b8" fontSize={10} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={10} />
                <Tooltip />
                <Bar dataKey="total" name="Solicitudes" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard titulo="Distribución por estado">
          {porEstado.length === 0 ? (
            <EmptyRow>Sin solicitudes en el período.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {porEstado.map((e) => (
                <li key={e.estado} className="flex items-center justify-between gap-2 text-sm">
                  <span className="capitalize text-slate-600">{e.estado}</span>
                  <span className="font-semibold text-slate-800">{e.total}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

export default function LaboratorioDashboard() {
  const queryClient = useQueryClient()
  const { profile } = useSessionStore()
  const [vista, setVista] = useVistaPersistida<'operativo' | 'supervision'>('th:lab:vista', 'operativo')

  const { data: solicitudes = [], isLoading: cargandoSolicitudes } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', 'resumen'],
    queryFn: async () => (await api.get('/solicitudes?limit=200')).data,
    refetchInterval: 30_000,
  })
  const { data: alertas = [], isLoading: cargandoAlertas } = useQuery<Alerta[]>({
    queryKey: ['alertas', 'resumen'],
    queryFn: async () => (await api.get('/alertas?solo_no_leidas=true&limit=100')).data,
    refetchInterval: 30_000,
  })
  const { data: domicilios = [] } = useQuery<Domicilio[]>({
    queryKey: ['domicilios', 'resumen'],
    queryFn: async () => (await api.get('/domicilios')).data,
  })

  const marcarLeida = useMutation({
    mutationFn: (id: string) => api.patch(`/alertas/${id}/leida`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas', 'resumen'] }),
  })

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length
  const enProceso = solicitudes.filter((s) => s.estado === 'en_proceso').length
  const criticas = alertas.filter((a) => a.nivel === 'critico').length
  const normales = alertas.length - criticas
  const enRuta = domicilios.filter((d) => d.estado === 'en_ruta' || d.estado === 'programada').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard de laboratorio</h2>
          <p className="text-sm text-slate-500">Resumen de la operación bioanalítica, {profile?.nombre_completo}.</p>
        </div>
        <ToggleVistas
          valor={vista}
          onChange={setVista}
          opciones={[
            { id: 'operativo', label: 'Operativo' },
            { id: 'supervision', label: 'Supervisión' },
          ]}
        />
      </div>

      {cargandoAlertas ? (
        <SectionCard titulo="Alertas clínicas">
          <LoadingRow mensaje="Revisando alertas…" />
        </SectionCard>
      ) : (
        <BandejaAlertas
          alertas={alertas}
          criticas={criticas}
          normales={normales}
          onMarcar={(id) => marcarLeida.mutate(id)}
          marcando={marcarLeida.isPending}
        />
      )}

      {vista === 'operativo' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Solicitudes pendientes" valor={pendientes} tono={pendientes > 0 ? 'warning' : 'success'} hint="Esperando pre-analítica" />
            <StatCard label="En proceso" valor={enProceso} hint="Análisis en curso" />
            <StatCard label="Alertas críticas" valor={criticas} tono={criticas > 0 ? 'danger' : 'success'} hint="Valores sin revisar" />
            <StatCard label="Tomas a domicilio" valor={enRuta} hint="Programadas / en ruta" />
          </div>

          {cargandoSolicitudes ? (
            <SectionCard titulo="Próximas solicitudes en cola">
              <LoadingRow mensaje="Cargando cola…" />
            </SectionCard>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <EtiquetaQRSolicitud />
              <div className="lg:col-span-2">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Próximas solicitudes en cola</h3>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {pendientes + enProceso === 0 ? (
                    <EmptyRow>Sin solicitudes pendientes ni en proceso.</EmptyRow>
                  ) : (
                    <ul className="space-y-2">
                      {solicitudes
                        .filter((s) => s.estado === 'pendiente' || s.estado === 'en_proceso')
                        .slice(0, 6)
                        .map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-slate-700">{s.paciente?.nombre_completo ?? 'Paciente'}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-slate-400">{tiempoDesde(s.fecha)}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">
                                {s.estado}
                              </span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {acciones.map((a) => (
              <Link
                key={a.to}
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
        <VistaSupervision solicitudes={solicitudes} criticas={criticas} enRuta={enRuta} />
      )}
    </div>
  )
}
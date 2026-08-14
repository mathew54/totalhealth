import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import { categoriasDeEspecialidades, resolverEspecialidad, useCatalogoEspecialidades } from '../../lib/especialidades'
import { WIDGETS_POR_CATEGORIA } from './widgets/registry'
import Widget from './widgets/Widget'
import { PacientePicker, type PacienteMini } from './widgets/PacientePicker'
import { useExpedienteStore } from '../expediente/expedienteStore'
import { EmptyRow, ErrorPanel, LoadingRow, NivelBadge } from './helpers'
import { tiempoDesde } from './dashboardUtils'

interface Consulta {
  id: string
  fecha_hora: string
  estado: string
  motivo: string | null
}

interface Interconsulta {
  id: string
  estado: string
  motivo: string | null
  medico_origen_nombre: string | null
  especialidad_destino_nombre: string | null
  created_at: string
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

/** Estado explícito para widgets aún no disponibles (evita "Próximamente" como promesa). */
function NoDisponible() {
  return (
    <div className="flex h-full min-h-[96px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 text-center text-xs text-slate-400">
      Herramienta no disponible por ahora
    </div>
  )
}

/** Grilla de widgets de una categoría de especialidad (montaje dinámico). */
function WidgetGrid({ categoria, titulo }: { categoria: string; titulo: string }) {
  const defs = WIDGETS_POR_CATEGORIA[categoria] ?? []
  if (defs.length === 0) return null
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((w) =>
          w.componente ? (
            <w.componente key={w.id} />
          ) : (
            <Widget key={w.id} titulo={w.titulo} descripcion={w.descripcion}>
              <NoDisponible />
            </Widget>
          ),
        )}
      </div>
    </section>
  )
}

function AgendaDelDia() {
  const { data: consultas = [], isLoading } = useQuery<Consulta[]>({
    queryKey: ['consultas', 'dashboard'],
    queryFn: async () => (await api.get('/consultas?limit=5')).data,
    refetchInterval: 60_000,
  })
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Agenda del día</h3>
        {consultas.length > 0 && <span className="text-[10px] text-slate-400">{tiempoDesde(new Date().toISOString())}</span>}
      </div>
      {isLoading ? (
        <LoadingRow mensaje="Cargando agenda…" />
      ) : consultas.length === 0 ? (
        <EmptyRow>Sin consultas registradas hoy.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {consultas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-700">{c.motivo ?? 'Consulta'}</span>
              <span className="shrink-0 text-slate-400">
                {new Date(c.fecha_hora).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })} · {c.estado}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BandejaInterconsultas() {
  const { data: interconsultas = [], isLoading } = useQuery<Interconsulta[]>({
    queryKey: ['historial', 'interconsultas', 'dashboard'],
    queryFn: async () => (await api.get('/historial/interconsultas?estado=pendiente')).data,
    refetchInterval: 60_000,
  })
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        Bandeja de interconsultas{' '}
        {interconsultas.length > 0 && (
          <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600" aria-label={`${interconsultas.length} pendientes`}>
            {interconsultas.length}
          </span>
        )}
      </h3>
      {isLoading ? (
        <LoadingRow mensaje="Cargando interconsultas…" />
      ) : interconsultas.length === 0 ? (
        <EmptyRow>Sin interconsultas pendientes.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {interconsultas.slice(0, 4).map((i) => (
            <li key={i.id} className="text-xs">
              <p className="truncate font-medium text-slate-700">{i.motivo ?? 'Interconsulta'}</p>
              <p className="truncate text-slate-400">
                {i.medico_origen_nombre ?? '—'} → {i.especialidad_destino_nombre ?? i.estado}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Capa de señal crítica: alertas clínicas no leídas + interconsultas pendientes. */
function PanelSeñalCritica() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: alertas = [], isLoading: cargandoAlertas } = useQuery<Alerta[]>({
    queryKey: ['alertas', 'dashboard-medico'],
    queryFn: async () => (await api.get('/alertas?solo_no_leidas=true&limit=50')).data,
    refetchInterval: 60_000,
  })
  const { data: interconsultas = [] } = useQuery<Interconsulta[]>({
    queryKey: ['historial', 'interconsultas', 'dashboard-signal'],
    queryFn: async () => (await api.get('/historial/interconsultas?estado=pendiente')).data,
    refetchInterval: 60_000,
  })

  const marcarLeida = useMutation({
    mutationFn: (id: string) => api.patch(`/alertas/${id}/leida`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas', 'dashboard-medico'] }),
  })

  const criticas = alertas.filter((a) => a.nivel === 'critico')
  const normales = alertas.filter((a) => a.nivel === 'alerta')
  const pendientes = interconsultas.length

  const total = criticas.length + normales.length + pendientes
  const items = useMemo(() => {
    const ordenadas = [...alertas].sort(
      (a, b) => Number(b.nivel === 'critico') - Number(a.nivel === 'critico'),
    )
    const alertasVista = ordenadas.slice(0, 4)
    const inter = interconsultas.slice(0, 2)
    return { alertasVista, inter }
  }, [alertas, interconsultas])

  if (cargandoAlertas) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Pendientes de revisión</h3>
        <LoadingRow mensaje="Revisando señales…" />
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        criticas.length > 0 ? 'border-red-200' : normales.length + pendientes > 0 ? 'border-amber-200' : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Pendientes de revisión
          {total > 0 && (
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                criticas.length > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {total}
            </span>
          )}
        </h3>
        {pendientes > 0 && (
          <Link to="/historial" className="text-xs font-medium text-brand-600 hover:underline">
            Ver interconsultas →
          </Link>
        )}
      </div>

      {total === 0 ? (
        <EmptyRow>Sin alertas críticas ni interconsultas pendientes. Todo al día.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {items.alertasVista.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <NivelBadge nivel={a.nivel} />
                <span className="truncate text-slate-700">
                  {a.paciente_nombre ?? 'Paciente'} — {a.motivo}
                </span>
                <span className="hidden shrink-0 text-slate-400 sm:inline">{tiempoDesde(a.created_at)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {a.examen_nombre && <span className="hidden text-slate-400 md:inline">{a.examen_nombre}</span>}
                <button
                  onClick={() => {
                    marcarLeida.mutate(a.id)
                    if (a.paciente_id) {
                      useExpedienteStore.getState().setExpedienteId(a.paciente_id)
                      navigate('/expediente')
                    }
                  }}
                  disabled={marcarLeida.isPending}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Revisar
                </button>
              </div>
            </li>
          ))}
          {items.inter.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-700">
                Interconsulta: {i.motivo ?? 'Sin motivo'} ({i.especialidad_destino_nombre ?? i.estado})
              </span>
              <span className="shrink-0 text-slate-400">{tiempoDesde(i.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Acceso rápido al expediente clínico desde el dashboard. */
function AccesoExpediente() {
  const navigate = useNavigate()
  return (
    <div className="w-full max-w-md">
      <PacientePicker
        value={null}
        onChange={(p: PacienteMini | null) => {
          if (p) {
            useExpedienteStore.getState().setExpedienteId(p.id)
            navigate('/expediente')
          }
        }}
      />
    </div>
  )
}

export default function MedicoDashboard() {
  const { profile, setDashboardVista } = useSessionStore()
  const { data: catalogo, isError: errorCatalogo } = useCatalogoEspecialidades()

  const especialidades = useMemo(() => profile?.especialidades ?? [], [profile])
  const especialidadActiva = profile?.especialidad_activa ?? especialidades[0]
  const vista = profile?.dashboard_config?.vista ?? 'consolidada'
  const unica = especialidades.length <= 1

  const categorias = useMemo(() => categoriasDeEspecialidades(especialidades, catalogo), [especialidades, catalogo])

  const activa = resolverEspecialidad(especialidadActiva, catalogo)
  const activaCategoria = activa.categoria ?? categorias[0]

  const sections = useMemo(() => {
    if (unica || vista === 'activa') {
      return activaCategoria ? [{ categoria: activaCategoria, titulo: catalogo?.categorias.find((c) => c.id === activaCategoria)?.nombre ?? 'Herramientas' }] : []
    }
    return categorias
      .map((c) => ({
        categoria: c,
        titulo: catalogo?.categorias.find((cat) => cat.id === c)?.nombre ?? 'Herramientas',
      }))
      .filter((s) => (WIDGETS_POR_CATEGORIA[s.categoria] ?? []).length > 0)
  }, [unica, vista, activaCategoria, categorias, catalogo])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dashboard médico</h2>
          <p className="text-sm text-slate-500">
            {vista === 'consolidada' && !unica
              ? `Vista consolidada de ${especialidades.length} especialidades`
              : `Especialidad activa: ${activa.nombre}`}
          </p>
        </div>
        <AccesoExpediente />
        {!unica && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {(['activa', 'consolidada'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDashboardVista(v)}
                aria-pressed={vista === v}
                className={`rounded-md px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  vista === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {v === 'activa' ? 'Especialidad activa' : 'Consolidado'}
              </button>
            ))}
          </div>
        )}
      </div>

      <PanelSeñalCritica />

      {errorCatalogo && (
        <ErrorPanel mensaje="No se pudo cargar el catálogo de especialidades. Verifica la conexión." />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AgendaDelDia />
        <BandejaInterconsultas />
      </div>

      <div className="space-y-8">
        {sections.map((s) => (
          <WidgetGrid key={s.categoria} categoria={s.categoria} titulo={s.titulo} />
        ))}
      </div>
    </div>
  )
}
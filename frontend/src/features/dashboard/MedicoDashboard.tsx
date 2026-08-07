import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import { categoriasDeEspecialidades, resolverEspecialidad, useCatalogoEspecialidades } from '../../lib/especialidades'
import { WIDGETS_POR_CATEGORIA } from './widgets/registry'
import Widget from './widgets/Widget'

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

function Proximamente() {
  return (
    <div className="flex h-full min-h-[96px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
      Próximamente
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
              <Proximamente />
            </Widget>
          ),
        )}
      </div>
    </section>
  )
}

function AgendaDelDia() {
  const { data: consultas = [] } = useQuery<Consulta[]>({
    queryKey: ['consultas', 'dashboard'],
    queryFn: async () => (await api.get('/consultas?limit=5')).data,
  })
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Agenda del día</h3>
      {consultas.length === 0 ? (
        <p className="text-xs text-slate-500">Sin consultas registradas hoy.</p>
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
  const { data: interconsultas = [] } = useQuery<Interconsulta[]>({
    queryKey: ['historial', 'interconsultas', 'dashboard'],
    queryFn: async () => (await api.get('/historial/interconsultas?estado=pendiente')).data,
  })
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        Bandeja de interconsultas{' '}
        {interconsultas.length > 0 && (
          <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
            {interconsultas.length}
          </span>
        )}
      </h3>
      {interconsultas.length === 0 ? (
        <p className="text-xs text-slate-500">Sin interconsultas pendientes.</p>
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

export default function MedicoDashboard() {
  const { profile, setDashboardVista } = useSessionStore()
  const { data: catalogo } = useCatalogoEspecialidades()

  const especialidades = profile?.especialidades ?? []
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
        {!unica && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {(['activa', 'consolidada'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDashboardVista(v)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  vista === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {v === 'activa' ? 'Especialidad activa' : 'Consolidado'}
              </button>
            ))}
          </div>
        )}
      </div>

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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import PrintHeader from '../../components/ui/PrintHeader'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'
import type { Paciente } from '../../lib/types'

type Vista = 'dia' | 'semana' | 'mes'

interface TurnoAgenda {
  id: string
  numero: number
  estado: 'esperando' | 'llamado' | 'atendido' | 'saltado' | 'cancelado'
  prioridad: 'normal' | 'prioridad' | 'urgente'
}

interface Consulta {
  id: string
  paciente_id: string
  medico_id: string
  clinica_id: string
  fecha_hora: string
  motivo: string | null
  diagnostico: string | null
  notas: string | null
  estado: string
  origen: string | null
  paciente?: { id: string; cedula: string; nombre_completo: string } | null
  medico?: { id: string; nombre_completo: string; especialidad: string | null; categoria_medica: string | null } | null
  turno?: TurnoAgenda | null
}

interface Medico {
  id: string
  nombre_completo: string
  especialidad: string | null
  categoria_medica: string | null
}

interface Grupo {
  especialidad: string
  medico: Consulta['medico']
  citas: Consulta[]
}

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const TURNO_ESTILO: Record<string, { cls: string; texto: string }> = {
  esperando: { cls: 'bg-blue-100 text-blue-700', texto: 'En cola' },
  llamado: { cls: 'bg-amber-100 text-amber-700', texto: 'Llamado' },
  atendido: { cls: 'bg-green-100 text-green-700', texto: 'Atendido' },
  saltado: { cls: 'bg-slate-200 text-slate-600', texto: 'Saltado' },
  cancelado: { cls: 'bg-red-100 text-red-600', texto: 'Cancelado' },
}

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  nd.setDate(nd.getDate() + n)
  return nd
}

function startOfWeek(d: Date): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return addDays(nd, -((nd.getDay() + 6) % 7))
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function monthGrid(anchor: Date): (string | null)[] {
  const start = startOfWeek(startOfMonth(anchor))
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(start, i)
    return d.getMonth() === anchor.getMonth() ? toKey(d) : null
  })
}

const hoyKey = () => toKey(new Date())

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const diaDe = (iso: string) => iso.slice(0, 10)

function isoADateLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isoATimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const turnoTexto = (t: TurnoAgenda) =>
  `#${t.numero} ${TURNO_ESTILO[t.estado]?.texto ?? t.estado}`

function agrupar(consultas: Consulta[]): Grupo[] {
  const idx = new Map<string, Grupo>()
  for (const c of consultas) {
    const esp = c.medico?.especialidad ?? 'Sin especialidad'
    const mid = c.medico?.id ?? '__sin_medico__'
    const key = `${esp}\u0000${mid}`
    let g = idx.get(key)
    if (!g) {
      g = { especialidad: esp, medico: c.medico ?? null, citas: [] }
      idx.set(key, g)
    }
    g.citas.push(c)
  }
  const grupos = [...idx.values()]
  for (const g of grupos) g.citas.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
  grupos.sort(
    (a, b) =>
      a.especialidad.localeCompare(b.especialidad) ||
      (a.medico?.nombre_completo ?? '~').localeCompare(b.medico?.nombre_completo ?? '~'),
  )
  return grupos
}

function porEspecialidad(grupos: Grupo[]): [string, Grupo[]][] {
  const m = new Map<string, Grupo[]>()
  for (const g of grupos) {
    if (!m.has(g.especialidad)) m.set(g.especialidad, [])
    m.get(g.especialidad)!.push(g)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default function ConsultasPage() {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'

  const [vista, setVista] = useState<Vista>('dia')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [estado, setEstado] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [detalleCita, setDetalleCita] = useState<Consulta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rango = useMemo(() => {
    if (vista === 'dia') {
      const f = toKey(anchor)
      return { fecha: f, desde: f, hasta: f, dias: [f] as string[] }
    }
    if (vista === 'semana') {
      const lunes = startOfWeek(anchor)
      const dias = Array.from({ length: 7 }, (_, i) => toKey(addDays(lunes, i)))
      return { fecha: undefined as string | undefined, desde: dias[0], hasta: dias[6], dias }
    }
    return {
      fecha: undefined as string | undefined,
      desde: toKey(startOfMonth(anchor)),
      hasta: toKey(endOfMonth(anchor)),
      dias: [] as string[],
    }
  }, [vista, anchor])

  const titulo = useMemo(() => {
    if (vista === 'dia')
      return anchor.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    if (vista === 'semana') {
      const l = startOfWeek(anchor)
      const d = addDays(l, 6)
      return `${l.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} – ${d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return anchor.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  }, [vista, anchor])

  const params = rango.fecha
    ? { fecha: rango.fecha, ...(estado && estado !== 'todas' ? { estado } : {}) }
    : { desde: rango.desde, hasta: rango.hasta, ...(estado && estado !== 'todas' ? { estado } : {}) }

  const { data: consultas = [], isLoading } = useQuery<Consulta[]>({
    queryKey: ['consultas', 'agenda', vista, rango.desde, rango.hasta, estado],
    queryFn: async () => (await api.get('/consultas', { params })).data,
    refetchInterval: 15000,
  })

  const { data: medicos = [] } = useQuery<Medico[]>({
    queryKey: ['consultas', 'medicos'],
    queryFn: async () => (await api.get('/consultas/medicos')).data,
    enabled: role !== 'medico',
  })

  const createConsulta = useMutation({
    mutationFn: (payload: unknown) => api.post('/consultas', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      setShowForm(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    createConsulta.mutate({
      paciente_id: fd.get('paciente_id'),
      medico_id: fd.get('medico_id') || undefined,
      fecha_hora: new Date(`${fd.get('fecha')}T${fd.get('hora') || '09:00'}:00`).toISOString(),
      motivo: fd.get('motivo'),
    })
  }

  function navegar(dir: -1 | 1) {
    setAnchor((a) => {
      if (vista === 'dia') return addDays(a, dir)
      if (vista === 'semana') return addDays(a, dir * 7)
      return new Date(a.getFullYear(), a.getMonth() + dir, 1)
    })
  }

  const visibles = useMemo(
    () =>
      consultas.filter((c) => {
        if (estado === 'todas') return true
        if (estado) return c.estado === estado
        return c.estado !== 'completada' && c.estado !== 'cancelada'
      }),
    [consultas, estado],
  )

  const hoy = hoyKey()
  const esHoy = rango.fecha ? rango.fecha === hoy : rango.desde <= hoy && hoy <= rango.hasta

  function abrirCita(c: Consulta) {
    setDetalleCita(c)
    setDetalleId(c.id)
  }

  return (
    <div className="space-y-5">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Agenda</h1>
          <p className="text-sm text-slate-500">
            Pacientes en cola por especialidad y médico · <span className="capitalize">{titulo}</span>
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nueva consulta'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(['dia', 'semana', 'mes'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${
                vista === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navegar(-1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            disabled={esHoy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Hoy
          </button>
          <button
            onClick={() => navegar(1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Siguiente"
          >
            ›
          </button>
        </div>

        <span className="min-w-0 text-sm font-medium capitalize text-slate-600">{titulo}</span>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="todas">Todas</option>
          <option value="">Por atender</option>
          <option value="programada">Programadas</option>
          <option value="en_curso">En curso</option>
          <option value="completada">Completadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>

      {showForm && (
        <PacientePicker key={String(showForm)} onSubmit={handleCreate} medicos={medicos} role={role} error={error} submitting={createConsulta.isPending} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No hay consultas por atender en este rango.</p>
        ) : vista === 'dia' ? (
          <VistaDia consultas={visibles} onAbrir={abrirCita} />
        ) : vista === 'semana' ? (
          <VistaSemana consultas={visibles} dias={rango.dias} onAbrir={abrirCita} />
        ) : (
          <VistaMes
            consultas={visibles}
            anchor={anchor}
            onIrDia={(key) => {
              setAnchor(fromKey(key))
              setVista('dia')
            }}
          />
        )}
      </div>

      {detalleId && (
        <DetalleModal
          consultaId={detalleId}
          initial={detalleCita}
          onClose={() => {
            setDetalleId(null)
            setDetalleCita(null)
          }}
        />
      )}
    </div>
  )
}

function VistaDia({ consultas, onAbrir }: { consultas: Consulta[]; onAbrir: (c: Consulta) => void }) {
  const esp = useMemo(() => porEspecialidad(agrupar(consultas)), [consultas])
  if (esp.length === 0) return <EmptyAgenda />
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {esp.map(([especialidad, grupos]) => (
        <section key={especialidad}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{especialidad}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map((g) => (
              <div key={g.medico?.id ?? '__sin__'} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{g.medico?.nombre_completo ?? 'Por asignar'}</p>
                    <p className="text-xs text-slate-500">
                      {g.citas.length} {g.citas.length === 1 ? 'cita' : 'citas'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {g.citas.map((c) => (
                    <CitaRow key={c.id} c={c} onAbrir={() => onAbrir(c)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CitaRow({ c, onAbrir }: { c: Consulta; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand-700">{horaDe(c.fecha_hora)}</span>
        <TurnoBadge turno={c.turno ?? null} />
      </div>
      <p className="mt-1 truncate text-sm font-medium text-slate-800">{c.paciente?.nombre_completo ?? 'Paciente'}</p>
      <p className="truncate text-xs text-slate-400">
        {c.paciente?.cedula ?? ''}
        {c.motivo ? ` · ${c.motivo}` : ''}
      </p>
    </button>
  )
}

function VistaSemana({ consultas, dias, onAbrir }: { consultas: Consulta[]; dias: string[]; onAbrir: (c: Consulta) => void }) {
  const esp = useMemo(() => porEspecialidad(agrupar(consultas)), [consultas])
  if (esp.length === 0) return <EmptyAgenda />
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {esp.map(([especialidad, grupos]) => (
        <section key={especialidad}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{especialidad}</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-px bg-slate-100">
                <div className="bg-white p-2 text-xs font-semibold text-slate-400">Médico</div>
                {dias.map((d) => (
                  <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-slate-600">
                    {fromKey(d).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' })}
                  </div>
                ))}
                {grupos.map((g) => (
                  <Fragment key={g.medico?.id ?? '__sin__'}>
                    <div className="bg-white p-2 text-sm font-semibold text-slate-700">
                      {g.medico?.nombre_completo ?? 'Por asignar'}
                    </div>
                    {dias.map((d) => (
                      <div key={d} className="min-h-[72px] space-y-1 bg-white p-1.5">
                        {g.citas
                          .filter((c) => diaDe(c.fecha_hora) === d)
                          .map((c) => (
                            <CitaMini key={c.id} c={c} onAbrir={() => onAbrir(c)} />
                          ))}
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

function CitaMini({ c, onAbrir }: { c: Consulta; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      title={`${horaDe(c.fecha_hora)} · ${c.paciente?.nombre_completo ?? 'Paciente'}`}
      className="block w-full rounded-md border border-slate-200 px-1.5 py-1 text-left transition hover:border-brand-400 hover:bg-brand-50/40"
    >
      <p className="text-[11px] font-semibold text-brand-700">{horaDe(c.fecha_hora)}</p>
      <p className="truncate text-[11px] text-slate-700">{c.paciente?.nombre_completo ?? 'Paciente'}</p>
      {c.turno && <p className="text-[10px] text-slate-400">{turnoTexto(c.turno)}</p>}
    </button>
  )
}

function VistaMes({ consultas, anchor, onIrDia }: { consultas: Consulta[]; anchor: Date; onIrDia: (key: string) => void }) {
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const porDia = useMemo(() => {
    const m = new Map<string, { total: number; porEsp: Map<string, number> }>()
    for (const c of consultas) {
      const key = diaDe(c.fecha_hora)
      if (!m.has(key)) m.set(key, { total: 0, porEsp: new Map() })
      const cell = m.get(key)!
      cell.total++
      const esp = c.medico?.especialidad ?? 'Sin esp.'
      cell.porEsp.set(esp, (cell.porEsp.get(esp) ?? 0) + 1)
    }
    return m
  }, [consultas])
  const hoy = hoyKey()

  return (
    <div className="p-4 sm:p-6">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {DIAS.map((d) => (
          <div key={d} className="bg-slate-50 p-2 text-center text-xs font-semibold uppercase text-slate-500">
            {d}
          </div>
        ))}
        {grid.map((key, i) => {
          if (!key) return <div key={`v${i}`} className="min-h-[96px] bg-slate-50/60 p-2" />
          const cell = porDia.get(key)
          const esHoy = key === hoy
          return (
            <button
              key={key}
              onClick={() => onIrDia(key)}
              className="flex min-h-[96px] flex-col items-stretch gap-1 bg-white p-2 text-left transition hover:bg-brand-50/40"
            >
              <span
                className={`text-xs font-semibold ${
                  esHoy ? 'flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white' : 'text-slate-600'
                }`}
              >
                {Number(key.slice(8))}
              </span>
              {cell &&
                [...cell.porEsp.entries()].slice(0, 2).map(([esp, n]) => (
                  <span key={esp} className="truncate rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                    {esp} · {n}
                  </span>
                ))}
              {cell && cell.total > 2 && (
                <span className="text-[10px] text-slate-400">+{cell.total - 2} más</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyAgenda() {
  return (
    <p className="p-6 text-center text-sm text-slate-400">No hay consultas que mostrar en este rango.</p>
  )
}

function TurnoBadge({ turno }: { turno: TurnoAgenda | null }) {
  if (!turno) return null
  const e = TURNO_ESTILO[turno.estado] ?? TURNO_ESTILO.esperando
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.cls}`}>{turnoTexto(turno)}</span>
}

function PacientePicker({ onSubmit, medicos, role, error, submitting }: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  medicos: Medico[]
  role: string
  error: string | null
  submitting: boolean
}) {
  const [q, setQ] = useState('')
  const { data: pacientes = [], isLoading } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'picker', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
  })
  const [selectedId, setSelectedId] = useState('')
  const [especialidad, setEspecialidad] = useState('')

  const especialidades = [...new Set(medicos.map((m) => m.especialidad).filter(Boolean) as string[])].sort()
  const filtrados = especialidad ? medicos.filter((m) => m.especialidad === especialidad) : medicos

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Buscar paciente *</label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cédula o nombre…"
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        {isLoading ? (
          <p className="text-xs text-slate-500">Buscando…</p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {pacientes.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="radio" name="paciente_id" value={p.id} onChange={() => setSelectedId(p.id)} required />
                <span className="font-medium">{p.nombre_completo}</span>
                <span className="text-xs text-slate-400">{p.cedula}</span>
              </label>
            ))}
            {pacientes.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Escribe para buscar…</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {role !== 'medico' && (
          <>
            <Field label="Especialidad *">
              <select
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                required
                className={inputCls}
              >
                <option value="" disabled>Elegir…</option>
                {especialidades.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Médico *">
              <select name="medico_id" required disabled={!especialidad} defaultValue="" className={inputCls}>
                <option value="" disabled>
                  {especialidad ? (filtrados.length ? 'Elegir…' : 'Sin médicos en esa especialidad') : 'Primero elige la especialidad'}
                </option>
                {filtrados.filter((m) => m.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre_completo}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Fecha *"><input name="fecha" type="date" required defaultValue={toKey(new Date())} className={inputCls} /></Field>
        <Field label="Hora"><input name="hora" type="time" defaultValue="09:00" className={inputCls} /></Field>
        <Field label="Motivo"><input name="motivo" className={inputCls} /></Field>
      </div>

      <div>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || !selectedId} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Agendando…' : 'Agendar consulta'}
        </button>
      </div>
    </form>
  )
}

function DetalleModal({ consultaId, initial, onClose }: { consultaId: string; initial: Consulta | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [showSolicitud, setShowSolicitud] = useState(false)
  const [editando, setEditando] = useState(false)
  const [edFecha, setEdFecha] = useState('')
  const [edHora, setEdHora] = useState('')
  const [edMedicoId, setEdMedicoId] = useState('')
  const [edMotivo, setEdMotivo] = useState('')
  const [edNotas, setEdNotas] = useState('')

  const { data: consulta, isLoading } = useQuery<Consulta & { paciente: Paciente }>({
    queryKey: ['consulta', consultaId],
    queryFn: async () => (await api.get(`/consultas/${consultaId}`)).data,
  })

  const { data: historial } = useQuery<{ consultas: Consulta[] }>({
    queryKey: ['consulta', consultaId, 'historial'],
    queryFn: async () => (await api.get(`/consultas/${consultaId}/historial`)).data,
  })

  const { data: medicos = [] } = useQuery<Medico[]>({
    queryKey: ['consultas', 'medicos'],
    queryFn: async () => (await api.get('/consultas/medicos')).data,
    enabled: profile?.role !== 'medico',
  })

  const base = useMemo(() => (initial ? { ...initial, ...(consulta ?? {}) } : consulta ?? initial), [consulta, initial])

  const setDiagnostico = useMutation({
    mutationFn: (payload: unknown) => api.patch(`/consultas/${consultaId}/diagnostico`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      queryClient.invalidateQueries({ queryKey: ['consulta', consultaId] })
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  const editarConsulta = useMutation({
    mutationFn: (payload: unknown) => api.patch(`/consultas/${consultaId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      queryClient.invalidateQueries({ queryKey: ['consulta', consultaId] })
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      setEditando(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  const eliminarConsulta = useMutation({
    mutationFn: () => api.delete(`/consultas/${consultaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleDiag(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setDiagnostico.mutate({ diagnostico: fd.get('diagnostico'), notas: fd.get('notas') || undefined })
  }

  const esMedicoAutor = profile?.role === 'medico' && base?.medico_id === profile.id
  const puedeSala = profile?.role === 'secretaria' || profile?.role === 'admin' || profile?.role === 'super_root'
  const puedeGestionar = esMedicoAutor || puedeSala

  function irSalaEspera() {
    onClose()
    navigate(`/turnos${base ? `?consulta=${encodeURIComponent(base.id)}` : ''}`)
  }

  function iniciarEdicion() {
    setEdFecha(isoADateLocal(base?.fecha_hora))
    setEdHora(isoATimeLocal(base?.fecha_hora))
    setEdMedicoId(base?.medico_id ?? '')
    setEdMotivo(base?.motivo ?? '')
    setEdNotas(base?.notas ?? '')
    setEditando(true)
    setError(null)
  }

  function guardarEdicion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    editarConsulta.mutate({
      ...(profile?.role !== 'medico' ? { medico_id: edMedicoId || undefined } : {}),
      fecha_hora: new Date(`${edFecha}T${edHora || '09:00'}:00`).toISOString(),
      motivo: edMotivo || undefined,
      notas: edNotas || undefined,
    })
  }

  function confirmarEliminar() {
    if (!window.confirm('¿Eliminar esta cita? Se quitará también su turno de sala de espera y los recordatorios pendientes. Esta acción no se puede deshacer.')) return
    eliminarConsulta.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{base?.paciente?.nombre_completo ?? '…'}</h3>
            <p className="text-sm text-slate-500">{base?.paciente?.cedula}</p>
          </div>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        {isLoading && !base ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : base ? (
          <>
            <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{new Date(base.fecha_hora).toLocaleString()}</span>
                <EstadoBadge estado={base.estado} />
                {base.turno && <TurnoBadge turno={base.turno} />}
              </div>
              {base.medico && (
                <p className="mt-1 text-slate-600">
                  <span className="font-medium text-slate-800">{base.medico.nombre_completo}</span>
                  {base.medico.especialidad && <span className="text-slate-400"> · {base.medico.especialidad}</span>}
                </p>
              )}
              <p className="mt-1 text-slate-700">{base.motivo ?? 'Sin motivo'}</p>
            </div>

            {editando ? (
              <form onSubmit={guardarEdicion} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-700">Editar cita</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha *">
                    <input type="date" value={edFecha} onChange={(e) => setEdFecha(e.target.value)} required className={inputCls} />
                  </Field>
                  <Field label="Hora *">
                    <input type="time" value={edHora} onChange={(e) => setEdHora(e.target.value)} className={inputCls} />
                  </Field>
                  {profile?.role !== 'medico' && (
                    <Field label="Médico">
                      <select value={edMedicoId} onChange={(e) => setEdMedicoId(e.target.value)} className={inputCls}>
                        <option value="">Sin asignar</option>
                        {medicos.map((m) => (
                          <option key={m.id} value={m.id}>{m.nombre_completo}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Motivo">
                    <input value={edMotivo} onChange={(e) => setEdMotivo(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Notas">
                  <textarea value={edNotas} onChange={(e) => setEdNotas(e.target.value)} rows={2} className={inputCls} />
                </Field>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={!edFecha || editarConsulta.isPending}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {editarConsulta.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(false)
                      setError(null)
                    }}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                {puedeGestionar && base.estado !== 'completada' && (
                  <div className="mt-3 space-y-2">
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={iniciarEdicion}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                      >
                        Editar cita
                      </button>
                      <button
                        onClick={confirmarEliminar}
                        disabled={eliminarConsulta.isPending}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                      >
                        {eliminarConsulta.isPending ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                )}

                {puedeSala && (
                  <button
                    onClick={irSalaEspera}
                    className="mt-3 w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Ir a la sala de espera
                  </button>
                )}

                {esMedicoAutor && base.estado !== 'cancelada' && (
                  <button
                    onClick={() => setShowSolicitud(true)}
                    className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Solicitar exámenes de laboratorio
                  </button>
                )}

                {puedeGestionar && (
                  <button
                    onClick={() => {
                      onClose()
                      navigate(`/imagenes?paciente_id=${encodeURIComponent(base.paciente_id)}&consulta_id=${encodeURIComponent(base.id)}`)
                    }}
                    className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Adjuntar imágenes
                  </button>
                )}

                <div className="mt-4">
                  <h4 className="mb-1 text-sm font-semibold text-slate-700">Diagnóstico</h4>
                  {base.diagnostico ? (
                    <p className="rounded-lg bg-green-50 p-3 text-sm text-slate-700">{base.diagnostico}</p>
                  ) : esMedicoAutor ? (
                    <form onSubmit={handleDiag} className="space-y-2">
                      <textarea name="diagnostico" required placeholder="Diagnóstico…" rows={2} className={inputCls} />
                      <textarea name="notas" placeholder="Notas (opcional)" rows={2} className={inputCls} />
                      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                      <button type="submit" disabled={setDiagnostico.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                        {setDiagnostico.isPending ? 'Guardando…' : 'Registrar diagnóstico y cerrar'}
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs text-slate-400">Pendiente.</p>
                  )}
                </div>
              </>
            )}

            <div className="mt-4">
              <h4 className="mb-1 text-sm font-semibold text-slate-700">Historial del paciente</h4>
              <div className="space-y-2">
                {(historial?.consultas ?? []).slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <span className="text-slate-400">{new Date(c.fecha_hora).toLocaleDateString()}</span>
                    {' — '}{c.motivo ?? 'Sin motivo'} {c.diagnostico && <span className="text-brand-600">· {c.diagnostico}</span>}
                  </div>
                ))}
                {(historial?.consultas ?? []).length === 0 && <p className="text-xs text-slate-400">Sin consultas previas.</p>}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No se pudo cargar la consulta.</p>
        )}
      </div>

      {showSolicitud && base && (
        <SolicitarExamenes
          consultaId={base.id}
          pacienteId={base.paciente_id}
          onClose={() => setShowSolicitud(false)}
        />
      )}
    </div>
  )
}

function SolicitarExamenes({ consultaId, pacienteId, onClose }: { consultaId: string; pacienteId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: examenes = [] } = useQuery<{ id: string; nombre: string; precio: number; categoria: string | null }[]>({
    queryKey: ['examenes'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const crear = useMutation({
    mutationFn: () => api.post('/solicitudes', { consulta_id: consultaId, paciente_id: pacienteId, examenes: [...selected] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      onClose()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const total = examenes.filter((e) => selected.has(e.id)).reduce((acc, e) => acc + e.precio, 0)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h3 className="text-lg font-bold text-slate-800">Solicitar exámenes</h3>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="mt-4 space-y-2">
          {examenes.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{e.nombre}</p>
                <p className="text-xs text-slate-400">{e.categoria ?? 'General'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600"><PrecioDual usd={e.precio} tasaUsd={tasaUsd} /></span>
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-brand-600" />
              </div>
            </label>
          ))}
          {examenes.length === 0 && <p className="text-sm text-slate-500">Catálogo vacío.</p>}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">Total: <PrecioDual usd={total} tasaUsd={tasaUsd} /></span>
          <button
            onClick={() => crear.mutate()}
            disabled={selected.size === 0 || crear.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    programada: 'bg-blue-100 text-blue-700',
    en_curso: 'bg-amber-100 text-amber-700',
    completada: 'bg-green-100 text-green-700',
    cancelada: 'bg-slate-200 text-slate-600',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[estado] ?? 'bg-slate-200 text-slate-600'}`}>{estado.replace('_', ' ')}</span>
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

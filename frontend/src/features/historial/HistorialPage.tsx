import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import CuestionarioExpediente from './CuestionarioExpediente'
import ResumenAnamnesis from './ResumenAnamnesis'

interface Paciente {
  id: string
  cedula: string | null
  nombre_completo: string
  fecha_nacimiento?: string | null
  sexo?: string | null
}

interface Categoria {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
}

interface Especialidad {
  id: string
  categoria: string
  nombre: string
}

interface Correccion {
  id: string
  tipo: 'fe_errata' | 'adenda'
  contenido: Record<string, unknown>
  medico_nombre: string | null
  firma: string
  created_at: string
}

interface Registro {
  id: string
  tipo: string
  titulo: string
  contenido: Record<string, unknown>
  categoria_origen_nombre: string | null
  medico_id: string
  medico_nombre: string | null
  firma: string
  correcciones: Correccion[]
  created_at: string
}

interface AlertaCritica {
  id: string
  tipo: string
  descripcion: string
  severidad: 'alta' | 'media'
  activa: boolean
  created_at: string
}

interface Interconsulta {
  id: string
  estado: 'enviada' | 'aceptada' | 'completada' | 'cancelada'
  motivo: string
  hipotesis: string | null
  respuesta: string | null
  medico_origen_nombre: string | null
  medico_destino_nombre: string | null
  medico_responde_nombre: string | null
  categoria_destino_nombre: string | null
  especialidad_destino_nombre: string | null
  created_at: string
}

interface Expediente {
  paciente: Paciente
  alertas_criticas: AlertaCritica[]
  historial: Registro[]
  interconsultas: Interconsulta[]
}

const TIPOS = ['evolucion', 'procedimiento', 'interconsulta', 'resultado', 'otro']
const TIPO_LABEL: Record<string, string> = {
  evolucion: 'Evolución',
  procedimiento: 'Procedimiento',
  interconsulta: 'Interconsulta',
  resultado: 'Resultado',
  otro: 'Otro',
}

function contenidoTexto(contenido: Record<string, unknown>): string {
  if (typeof contenido?.texto === 'string') return contenido.texto
  const keys = Object.keys(contenido ?? {})
  if (keys.length === 0) return ''
  return keys.map((k) => `${k}: ${String(contenido[k] ?? '')}`).join('\n')
}

export default function HistorialPage() {
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'
  const esPersonalMedico = ['medico', 'admin', 'super_root'].includes(role)

  const [q, setQ] = useState('')
  const [pacienteId, setPacienteId] = useState<string | null>(null)

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'historial', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
    enabled: esPersonalMedico,
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Historial Médico Digital</h1>
        <p className="text-sm text-slate-500">
          Expediente clínico compartido, notas privadas e interconsultas entre especialidades.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Buscar paciente por cédula o nombre</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="V-12345678 o nombre…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
          {pacientes.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Escribe para buscar…</p>}
          {pacientes.map((p) => (
            <button
              key={p.id}
              onClick={() => setPacienteId(p.id)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${pacienteId === p.id ? 'bg-brand-50' : ''}`}
            >
              <span className="font-medium text-slate-800">{p.nombre_completo}</span>
              <span className="text-xs text-slate-400">{p.cedula ?? 'Menor de edad'}</span>
            </button>
          ))}
        </div>
      </div>

      {pacienteId ? (
        <ExpedienteView key={pacienteId} pacienteId={pacienteId} />
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Selecciona un paciente para abrir su expediente digital.
        </p>
      )}
    </div>
  )
}

function ExpedienteView({ pacienteId }: { pacienteId: string }) {
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'
  const esPersonalMedico = ['medico', 'admin', 'super_root'].includes(role)
  const esAdmin = role === 'admin' || role === 'super_root'

  const [tab, setTab] = useState<'compartido' | 'privadas' | 'interconsultas' | 'cuestionario'>('compartido')

  const { data: expediente, isLoading } = useQuery<Expediente>({
    queryKey: ['historial', 'expediente', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}`)).data,
    enabled: esPersonalMedico,
  })

  return (
    <div className="space-y-4">
      <BannerAlertas pacienteId={pacienteId} alertas={expediente?.alertas_criticas ?? []} esAdmin={esAdmin} />

      <ResumenAnamnesis pacienteId={pacienteId} />

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-base font-bold text-slate-800">{expediente?.paciente?.nombre_completo ?? 'Cargando…'}</p>
          <p className="text-sm text-slate-500">
            {expediente?.paciente?.cedula ?? 'Menor de edad'}
            {expediente?.paciente?.fecha_nacimiento ? ` · ${expediente.paciente.fecha_nacimiento}` : ''}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['compartido', 'privadas', 'interconsultas', 'cuestionario'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'compartido' ? 'Compartido' : t === 'privadas' ? 'Notas privadas' : t === 'interconsultas' ? 'Interconsultas' : 'Cuestionario'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="p-6 text-sm text-slate-500">Cargando expediente…</p>
      ) : tab === 'compartido' ? (
        <HistorialCompartido pacienteId={pacienteId} registros={expediente?.historial ?? []} role={role} />
      ) : tab === 'privadas' ? (
        <NotasPrivadas pacienteId={pacienteId} role={role} />
      ) : tab === 'interconsultas' ? (
        <InterconsultasView pacienteId={pacienteId} interconsultas={expediente?.interconsultas ?? []} role={role} />
      ) : (
        <CuestionarioExpediente pacienteId={pacienteId} />
      )}
    </div>
  )
}

function BannerAlertas({ pacienteId, alertas, esAdmin }: { pacienteId: string; alertas: AlertaCritica[]; esAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const desactivar = useMutation({
    mutationFn: (id: string) => api.patch(`/historial/alertas/${id}`, { activa: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['historial', 'expediente', pacienteId] }),
    onError: (err) => setError(getApiError(err)),
  })

  const crear = useMutation({
    mutationFn: (payload: unknown) => api.post(`/historial/pacientes/${pacienteId}/alertas`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'expediente', pacienteId] })
      setOpen(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    crear.mutate({ tipo: fd.get('tipo'), descripcion: fd.get('descripcion'), severidad: fd.get('severidad') })
  }

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">⚠</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-red-700">Alertas críticas del paciente</h2>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          + Nueva alerta
        </button>
      </div>
      {alertas.length === 0 ? (
        <p className="mt-2 text-xs text-red-500">Sin alertas críticas activas.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {alertas.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
              <span className="text-red-800">
                <span className="font-bold">{a.tipo.replace('_', ' ')}</span> — {a.descripcion}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.severidad === 'alta' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-900'}`}>{a.severidad}</span>
                {esAdmin && (
                  <button onClick={() => desactivar.mutate(a.id)} className="text-xs text-slate-400 hover:text-slate-600" title="Desactivar alerta">
                    ✓
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs text-red-700">{error}</p>}

      {open && (
        <form onSubmit={handleCrear} className="mt-3 grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
          <Field label="Tipo *">
            <select name="tipo" required defaultValue="" className={inputCls}>
              <option value="" disabled>Elegir…</option>
              <option value="alergia">Alergia</option>
              <option value="enfermedad_cronica">Enfermedad crónica</option>
              <option value="medicamento_critico">Medicamento crítico</option>
            </select>
          </Field>
          <Field label="Severidad">
            <select name="severidad" className={inputCls}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
            </select>
          </Field>
          <Field label="Descripción *">
            <input name="descripcion" required placeholder="Ej. Alergia a penicilina…" className={inputCls} />
          </Field>
          <div className="sm:col-span-3">
            <button type="submit" disabled={crear.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {crear.isPending ? 'Guardando…' : 'Registrar alerta'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function HistorialCompartido({ pacienteId, registros, role }: { pacienteId: string; registros: Registro[]; role: string }) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const esAutor = profile?.role === 'medico'
  const [showNuevo, setShowNuevo] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Registro | null>(null)
  const [error, setError] = useState<string | null>(null)

  const crear = useMutation({
    mutationFn: (payload: unknown) => api.post('/historial', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'expediente', pacienteId] })
      setShowNuevo(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleNuevo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const titulo = String(fd.get('titulo') ?? '')
    const tipo = String(fd.get('tipo') ?? 'evolucion')
    const texto = String(fd.get('contenido') ?? '')
    crear.mutate({ paciente_id: pacienteId, tipo, titulo, contenido: { texto } })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNuevo((v) => !v)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {showNuevo ? 'Cancelar' : '+ Nuevo registro'}
        </button>
      </div>

      {showNuevo && (
        <form onSubmit={handleNuevo} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo *">
              <select name="tipo" className={inputCls}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Título *">
              <input name="titulo" required placeholder="Ej. Control de glicemia" className={inputCls} />
            </Field>
          </div>
          <Field label="Contenido">
            <textarea name="contenido" rows={3} placeholder="Subjetivo / objetivo / plan…" className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div>
            <button type="submit" disabled={crear.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {crear.isPending ? 'Guardando…' : 'Registrar (inmutable)'}
            </button>
          </div>
        </form>
      )}

      {registros.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene registros en el historial compartido.
        </p>
      ) : (
        <div className="space-y-3">
          {registros.map((r) => (
            <RegistroCard
              key={r.id}
              registro={r}
              canCorregir={esAutor || role === 'admin' || role === 'super_root'}
              onCorregir={() => setCorrigiendo(r)}
            />
          ))}
        </div>
      )}

      {corrigiendo && (
        <CorreccionModal
          registro={corrigiendo}
          onClose={() => setCorrigiendo(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['historial', 'expediente', pacienteId] })}
        />
      )}
    </div>
  )
}

function RegistroCard({ registro, canCorregir, onCorregir }: { registro: Registro; canCorregir: boolean; onCorregir: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600">{TIPO_LABEL[registro.tipo] ?? registro.tipo}</span>
          <h3 className="text-sm font-bold text-slate-800">{registro.titulo}</h3>
        </div>
        <span className="text-xs text-slate-400">{new Date(registro.created_at).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {registro.medico_nombre ?? 'Médico'}
        {registro.categoria_origen_nombre ? ` · ${registro.categoria_origen_nombre}` : ''}
      </p>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{contenidoTexto(registro.contenido)}</pre>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-slate-300" title="Firma digital del registro">firma · {registro.firma.slice(0, 12)}…</span>
        {canCorregir && (
          <button onClick={onCorregir} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Corregir (Adenda / Fe de Erratas)
          </button>
        )}
      </div>

      {registro.correcciones.length > 0 && (
        <div className="mt-2 space-y-1">
          {registro.correcciones.map((c) => (
            <div key={c.id} className="relative overflow-hidden rounded-lg border border-amber-300 bg-amber-50 p-2">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-18deg] text-2xl font-black uppercase tracking-widest text-amber-200/70">
                  {c.tipo === 'fe_errata' ? 'Fe de Erratas' : 'Adenda'}
                </span>
              </div>
              <p className="relative text-xs font-semibold uppercase text-amber-700">{c.tipo.replace('_', ' ')}</p>
              <p className="relative whitespace-pre-wrap text-xs text-slate-700">{contenidoTexto(c.contenido)}</p>
              <p className="relative mt-1 text-[10px] text-slate-400">
                {c.medico_nombre ?? 'Médico'} · {new Date(c.created_at).toLocaleString()} · firma {c.firma.slice(0, 10)}…
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CorreccionModal({ registro, onClose, onSaved }: { registro: Registro; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const corregir = useMutation({
    mutationFn: (payload: unknown) => api.post(`/historial/${registro.id}/correcciones`, payload),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    corregir.mutate({ tipo: fd.get('tipo'), contenido: { texto: fd.get('contenido') } })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h3 className="text-lg font-bold text-slate-800">Corregir registro</h3>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {registro.titulo} — la corrección queda vinculada con marca de agua. El registro original no se modifica.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <Field label="Tipo de corrección *">
            <select name="tipo" required defaultValue="" className={inputCls}>
              <option value="" disabled>Elegir…</option>
              <option value="fe_errata">Fe de Erratas</option>
              <option value="adenda">Adenda</option>
            </select>
          </Field>
          <Field label="Contenido *">
            <textarea name="contenido" required rows={4} placeholder="Corrección o adición…" className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={corregir.isPending} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {corregir.isPending ? 'Guardando…' : 'Registrar corrección'}
          </button>
        </form>
      </div>
    </div>
  )
}

function NotasPrivadas({ pacienteId, role }: { pacienteId: string; role: string }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: notas = [] } = useQuery<{ id: string; contenido: string; created_at: string; updated_at: string }[]>({
    queryKey: ['historial', 'notas', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}/notas`)).data,
  })

  const crear = useMutation({
    mutationFn: (payload: unknown) => api.post(`/historial/pacientes/${pacienteId}/notas`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'notas', pacienteId] })
      setShowForm(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, contenido }: { id: string; contenido: string }) => api.patch(`/historial/notas/${id}`, { contenido }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'notas', pacienteId] })
      setEditandoId(null)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    crear.mutate({ contenido: fd.get('contenido') })
  }

  function handleEditar(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    actualizar.mutate({ id, contenido: String(fd.get('contenido') ?? '') })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">
          Solo <b>tú</b> puedes ver estas notas. El historial compartido es aparte.
        </p>
        <button onClick={() => setShowForm((v) => !v)} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {showForm ? 'Cancelar' : '+ Nueva nota privada'}
        </button>
        {showForm && (
          <form onSubmit={handleCrear} className="mt-3 space-y-2">
            <textarea name="contenido" required rows={3} placeholder="Nota solo visible para ti…" className={inputCls} />
            <button type="submit" disabled={crear.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {crear.isPending ? 'Guardando…' : 'Guardar nota'}
            </button>
          </form>
        )}
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>

      {notas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No tienes notas privadas para este paciente.</p>
      ) : (
        <div className="space-y-2">
          {notas.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
              {editandoId === n.id ? (
                <form onSubmit={(e) => handleEditar(e, n.id)} className="space-y-2">
                  <textarea name="contenido" defaultValue={n.contenido} rows={3} className={inputCls} />
                  <button type="submit" disabled={actualizar.isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Guardar
                  </button>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{n.contenido}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{new Date(n.updated_at).toLocaleString()}</span>
                    <button onClick={() => setEditandoId(n.id)} className="text-xs text-brand-600 hover:text-brand-700">Editar</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {role !== 'medico' && role !== 'admin' && role !== 'super_root' && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">Tu rol no puede gestionar notas del historial.</p>
      )}
    </div>
  )
}

function InterconsultasView({ pacienteId, interconsultas, role }: { pacienteId: string; interconsultas: Interconsulta[]; role: string }) {
  const queryClient = useQueryClient()
  const esPersonalMedico = ['medico', 'admin', 'super_root'].includes(role)
  const [showDerivar, setShowDerivar] = useState(false)
  const [responderId, setResponderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: catalogo } = useQuery<{ categorias: Categoria[]; especialidades: Especialidad[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get('/historial/especialidades')).data,
    enabled: esPersonalMedico,
  })

  const { data: bandeja = [] } = useQuery<Interconsulta[]>({
    queryKey: ['historial', 'interconsultas', 'bandeja'],
    queryFn: async () => (await api.get('/historial/interconsultas')).data,
    enabled: esPersonalMedico,
  })

  const derivar = useMutation({
    mutationFn: (payload: unknown) => api.post('/historial/interconsultas', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'expediente', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['historial', 'interconsultas'] })
      setShowDerivar(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleDerivar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    derivar.mutate({
      paciente_id: pacienteId,
      categoria_destino: fd.get('categoria_destino'),
      especialidad_destino: fd.get('especialidad_destino') || undefined,
      motivo: fd.get('motivo'),
      hipotesis: fd.get('hipotesis') || undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowDerivar((v) => !v)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {showDerivar ? 'Cancelar' : '+ Derivar a especialidad'}
        </button>
      </div>

      {showDerivar && (
        <form onSubmit={handleDerivar} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría destino *">
              <select name="categoria_destino" required defaultValue="" onChange={() => {}} className={inputCls}>
                <option value="" disabled>Elegir…</option>
                {(catalogo?.categorias ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Especialidad destino">
              <select name="especialidad_destino" className={inputCls}>
                <option value="">— Sin especificar —</option>
                {(catalogo?.especialidades ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Motivo *">
            <input name="motivo" required placeholder="Motivo de la derivación…" className={inputCls} />
          </Field>
          <Field label="Hipótesis inicial">
            <textarea name="hipotesis" rows={2} placeholder="Hipótesis diagnóstica para el especialista…" className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div>
            <button type="submit" disabled={derivar.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {derivar.isPending ? 'Enviando…' : 'Enviar interconsulta'}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-800">Interconsultas del paciente</h3>
        {interconsultas.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Sin interconsultas registradas.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {interconsultas.map((i) => (
              <InterconsultaCard key={i.id} ic={i} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-800">Bandeja de especialidad</h3>
        <p className="text-xs text-slate-500">Interconsultas dirigidas a tu categoría o las que originaste.</p>
        {bandeja.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Sin interconsultas pendientes para ti.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {bandeja.map((i) => (
              <div key={i.id} className="rounded-lg border border-slate-200 p-3">
                <InterconsultaCard ic={i} />
                {(i.estado === 'enviada' || i.estado === 'aceptada') && esPersonalMedico && (
                  <button onClick={() => setResponderId(i.id)} className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    Responder
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {responderId && <ResponderModal id={responderId} onClose={() => setResponderId(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ['historial', 'interconsultas'] })} />}
    </div>
  )
}

function InterconsultaCard({ ic }: { ic: Interconsulta }) {
  const estadoStyles: Record<string, string> = {
    enviada: 'bg-blue-100 text-blue-700',
    aceptada: 'bg-amber-100 text-amber-700',
    completada: 'bg-green-100 text-green-700',
    cancelada: 'bg-slate-200 text-slate-600',
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoStyles[ic.estado] ?? 'bg-slate-200 text-slate-600'}`}>{ic.estado}</span>
        <span className="text-[10px] text-slate-400">{new Date(ic.created_at).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-800">{ic.motivo}</p>
      <p className="text-xs text-slate-500">
        → {ic.categoria_destino_nombre ?? '…'}
        {ic.especialidad_destino_nombre ? ` (${ic.especialidad_destino_nombre})` : ''} · de {ic.medico_origen_nombre ?? 'Médico'}
      </p>
      {ic.hipotesis && <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">Hipótesis: {ic.hipotesis}</p>}
      {ic.respuesta && <p className="mt-1 rounded bg-green-50 p-2 text-xs text-slate-700">Respuesta: {ic.respuesta} {ic.medico_responde_nombre ? `— ${ic.medico_responde_nombre}` : ''}</p>}
    </div>
  )
}

function ResponderModal({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const responder = useMutation({
    mutationFn: (payload: unknown) => api.patch(`/historial/interconsultas/${id}`, payload),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    responder.mutate({ estado: 'completada', respuesta: fd.get('respuesta') })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h3 className="text-lg font-bold text-slate-800">Responder interconsulta</h3>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <Field label="Respuesta del especialista *">
            <textarea name="respuesta" required rows={4} placeholder="Evaluación, hallazgos y recomendaciones…" className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={responder.isPending} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {responder.isPending ? 'Enviando…' : 'Completar con respuesta'}
          </button>
        </form>
      </div>
    </div>
  )
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

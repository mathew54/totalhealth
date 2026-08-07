import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

type TipoDocumento = 'V' | 'E' | 'J' | 'P' | 'C'

const TIPOS_DOCUMENTO: { value: TipoDocumento; label: string }[] = [
  { value: 'V', label: 'V — Venezolano' },
  { value: 'E', label: 'E — Extranjero' },
  { value: 'J', label: 'J — Jurídico / RIF' },
  { value: 'P', label: 'P — Pasaporte' },
  { value: 'C', label: 'C — Cédula extranjero' },
]

interface Paciente {
  id: string
  cedula: string | null
  tipo_documento: string | null
  nombre_completo: string
  telefono: string | null
  email: string | null
  sexo: 'M' | 'F' | null
  fecha_nacimiento: string | null
  es_menor: boolean
  representante_id: string | null
  parentesco_representante: string | null
  fecha_consentimiento: string | null
  historial?: { total_consultas: number }
}

export default function PacientesPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Paciente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('V')
  const [esMenor, setEsMenor] = useState(false)
  const [conHijo, setConHijo] = useState(false)
  const [editando, setEditando] = useState<Paciente | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<Paciente | null>(null)

  const { data: pacientes = [], isLoading } = useQuery<Paciente[]>({
    queryKey: ['pacientes', search],
    queryFn: async () => (await api.get('/pacientes', { params: { q: search } })).data,
  })

  const createPaciente = useMutation({
    mutationFn: (payload: unknown) => api.post('/pacientes', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      setShowForm(false)
      setEsMenor(false)
      setConHijo(false)
      setError(null)
      const nombre = res.data?.hijo ? `${res.data.nombre_completo} (+ hijo ${res.data.hijo.nombre_completo})` : res.data?.nombre_completo
      setMensaje(nombre ? `Paciente "${nombre}" creado.` : 'Paciente creado.')
    },
    onError: (err) => setError(getApiError(err)),
  })

  const [mensaje, setMensaje] = useState<string | null>(null)

  const deletePaciente = useMutation({
    mutationFn: (id: string) => api.delete(`/pacientes/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      setConfirmarEliminar(null)
      setSelected(null)
      setMensaje(res.data?.mensaje ?? 'Paciente eliminado.')
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleEditado(actualizado: Paciente) {
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    queryClient.invalidateQueries({ queryKey: ['paciente', actualizado.id] })
    setSelected(actualizado)
    setMensaje(`Paciente "${actualizado.nombre_completo}" actualizado.`)
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    setSearch(query.trim())
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const cedulaNum = String(fd.get('cedula_num') ?? '').trim()
    const payload: Record<string, unknown> = {
      nombre_completo: fd.get('nombre_completo'),
      tipo_documento: esMenor ? undefined : tipoDoc,
      telefono: fd.get('telefono'),
      email: fd.get('email') || undefined,
      sexo: fd.get('sexo') || undefined,
      fecha_nacimiento: fd.get('fecha_nacimiento') ? new Date(String(fd.get('fecha_nacimiento'))).toISOString() : undefined,
      es_menor: esMenor,
    }
    if (esMenor) {
      payload.representante_id = fd.get('representante_id')
      payload.parentesco_representante = fd.get('parentesco_representante') || 'hijo'
    } else if (cedulaNum) {
      payload.cedula = `${tipoDoc}-${cedulaNum}`
    }

    if (conHijo) {
      payload.hijo = {
        nombre_completo: fd.get('hijo_nombre'),
        telefono: fd.get('hijo_telefono') || undefined,
        sexo: fd.get('hijo_sexo') || undefined,
        fecha_nacimiento: fd.get('hijo_fecha_nacimiento') ? new Date(String(fd.get('hijo_fecha_nacimiento'))).toISOString() : undefined,
      }
    }

    createPaciente.mutate(payload)
  }

  return (
    <div className="space-y-5">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-500">Búsqueda por documento o nombre (incluye menores por su representante)</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nuevo paciente'}
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="V-12345678 o nombre…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Buscar
        </button>
      </form>

      {showForm && (
        <form onSubmit={handleCreate} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={esMenor} onChange={(e) => setEsMenor(e.target.checked)} className="h-4 w-4 rounded" />
              Es menor de edad (sin cédula propia)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={conHijo} onChange={(e) => setConHijo(e.target.checked)} className="h-4 w-4 rounded" disabled={esMenor} />
              Agregar un hijo en el alta
            </label>
          </div>

          {esMenor ? (
            <>
              <Field label="Representante (padre/madre) *">
                <select name="representante_id" required className={inputCls}>
                  <option value="">Selecciona un paciente adulto…</option>
                  {pacientes.filter((p) => !p.es_menor && p.cedula).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre_completo} — {p.cedula}</option>
                  ))}
                </select>
              </Field>
              <Field label="Parentesco">
                <select name="parentesco_representante" defaultValue="hijo" className={inputCls}>
                  <option value="hijo">Hijo</option>
                  <option value="hija">Hija</option>
                  <option value="sobrino">Sobrino</option>
                  <option value="nieto">Nieto</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Tipo de documento">
                <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDocumento)} className={inputCls}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label={`Número de documento *`}>
                <input name="cedula_num" required pattern="\d[\d-]*" placeholder={tipoDoc === 'J' ? '12345678-0' : '12345678'} className={inputCls} />
              </Field>
            </>
          )}

          <Field label="Nombre completo *"><input name="nombre_completo" required minLength={3} className={inputCls} /></Field>
          <Field label="Teléfono"><input name="telefono" className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
          <Field label="Sexo">
            <select name="sexo" className={inputCls} defaultValue="">
              <option value="">—</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </Field>
          <Field label="Fecha de nacimiento"><input name="fecha_nacimiento" type="date" className={inputCls} /></Field>

          {conHijo && !esMenor && (
            <div className="sm:col-span-2 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Datos del hijo (menor sin cédula)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo del hijo *"><input name="hijo_nombre" required minLength={3} className={inputCls} /></Field>
                <Field label="Fecha de nacimiento"><input name="hijo_fecha_nacimiento" type="date" className={inputCls} /></Field>
                <Field label="Sexo">
                  <select name="hijo_sexo" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </Field>
                <Field label="Teléfono"><input name="hijo_telefono" className={inputCls} /></Field>
              </div>
              <p className="mt-3 text-xs text-slate-500">El hijo quedará vinculado automáticamente como dependiente del responsable (se muestra en el portal, tab Familia).</p>
            </div>
          )}

          <div className="sm:col-span-2">
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {mensaje && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}
            <button type="submit" disabled={createPaciente.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {createPaciente.isPending ? 'Guardando…' : 'Guardar paciente'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando…</p>
        ) : pacientes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin resultados.</p>
        ) : (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 lg:grid-cols-3 sm:divide-y-0 sm:gap-4 sm:p-4">
            {pacientes.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="text-left p-4 sm:rounded-xl sm:border sm:border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="font-medium text-slate-800">{p.nombre_completo}</p>
                <p className="text-xs text-slate-500">
                  {p.cedula ?? 'Menor (sin cédula)'}
                  {p.es_menor && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Menor</span>}
                </p>
                {p.historial && <p className="mt-1 text-xs text-brand-600">{p.historial.total_consultas} consultas</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <FichaModal
          paciente={selected}
          onClose={() => setSelected(null)}
          onEditar={() => { setError(null); setEditando(selected) }}
          onEliminar={() => { setError(null); setConfirmarEliminar(selected) }}
        />
      )}

      {editando && (
        <EditarPacienteModal
          paciente={editando}
          onClose={() => setEditando(null)}
          onSaved={handleEditado}
        />
      )}

      {confirmarEliminar && (
        <ConfirmarEliminarModal
          paciente={confirmarEliminar}
          onClose={() => setConfirmarEliminar(null)}
          onConfirm={() => deletePaciente.mutate(confirmarEliminar.id)}
          isPending={deletePaciente.isPending}
          error={error}
        />
      )}
    </div>
  )
}

function FichaModal({ paciente, onClose, onEditar, onEliminar }: { paciente: Paciente; onClose: () => void; onEditar: () => void; onEliminar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['paciente', paciente.id],
    queryFn: async () => (await api.get(`/pacientes/${paciente.id}`)).data,
  })
  const historial = data?.historial
  const representante = data?.representante

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{paciente.nombre_completo}</h3>
            <p className="text-sm text-slate-500">{paciente.cedula ?? 'Menor de edad (sin cédula)'}</p>
            {paciente.es_menor && (
              <p className="mt-1 text-xs text-amber-700">
                Menor — representado por {representante?.nombre_completo ?? '—'}
                {representante?.cedula ? ` (${representante.cedula})` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {paciente.telefono && <Info label="Teléfono" value={paciente.telefono} />}
          {paciente.email && <Info label="Email" value={paciente.email} />}
          {paciente.fecha_nacimiento && <Info label="Nacimiento" value={new Date(paciente.fecha_nacimiento).toLocaleDateString()} />}
          {paciente.sexo && <Info label="Sexo" value={paciente.sexo === 'M' ? 'Masculino' : 'Femenino'} />}
          {paciente.tipo_documento && <Info label="Tipo de documento" value={paciente.tipo_documento} />}
        </div>

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Historial clínico</h4>
          {isLoading ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : (
            <div className="space-y-2">
              {(historial?.consultas ?? []).map((c: ConsultaShort) => (
                <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{new Date(c.fecha_hora).toLocaleString()}</span>
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{c.motivo ?? 'Sin motivo'}</p>
                  {c.diagnostico && <p className="mt-1 text-xs text-slate-500">{c.diagnostico}</p>}
                </div>
              ))}
              {(historial?.recipes ?? []).length > 0 && (
                <p className="text-xs text-brand-600">{historial.recipes.length} receta(s) emitida(s)</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <button
            onClick={onEditar}
            className="flex-1 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Editar
          </button>
          <button
            onClick={onEliminar}
            className="flex-1 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConsultaShort {
  id: string
  fecha_hora: string
  motivo: string | null
  diagnostico: string | null
  estado: string
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  )
}

function EditarPacienteModal({ paciente, onClose, onSaved }: { paciente: Paciente; onClose: () => void; onSaved: (p: Paciente) => void }) {
  const [error, setError] = useState<string | null>(null)
  const partes = (paciente.cedula ?? '').split('-')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>((paciente.tipo_documento as TipoDocumento) ?? (partes[0] as TipoDocumento) ?? 'V')
  const [cedulaNum, setCedulaNum] = useState(partes.length > 1 ? partes.slice(1).join('-') : '')

  const guardar = useMutation({
    mutationFn: (payload: unknown) => api.put(`/pacientes/${paciente.id}`, payload),
    onSuccess: (res) => {
      onSaved(res.data as Paciente)
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload: Record<string, unknown> = {
      nombre_completo: fd.get('nombre_completo'),
      telefono: fd.get('telefono'),
      email: fd.get('email') || '',
      sexo: fd.get('sexo') || undefined,
      fecha_nacimiento: fd.get('fecha_nacimiento') ? new Date(String(fd.get('fecha_nacimiento'))).toISOString() : null,
    }
    if (!paciente.es_menor) {
      payload.tipo_documento = tipoDoc
      payload.cedula = `${tipoDoc}-${cedulaNum}`
    }
    guardar.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Editar paciente</h3>
            <p className="text-sm text-slate-500">{paciente.cedula ?? 'Menor de edad (sin cédula)'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {paciente.es_menor ? (
            <Field label="Representante (no editable aquí)">
              <input value={paciente.parentesco_representante ? `Menor — ${paciente.parentesco_representante}` : 'Menor de edad'} disabled className={inputCls} />
            </Field>
          ) : (
            <>
              <Field label="Tipo de documento">
                <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDocumento)} className={inputCls}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label={`Número de documento *`}>
                <input required pattern="\d[\d-]*" value={cedulaNum} onChange={(e) => setCedulaNum(e.target.value)} placeholder={tipoDoc === 'J' ? '12345678-0' : '12345678'} className={inputCls} />
              </Field>
            </>
          )}

          <Field label="Nombre completo *">
            <input name="nombre_completo" required minLength={3} defaultValue={paciente.nombre_completo} className={inputCls} />
          </Field>
          <Field label="Teléfono"><input name="telefono" defaultValue={paciente.telefono ?? ''} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={paciente.email ?? ''} className={inputCls} /></Field>
          <Field label="Sexo">
            <select name="sexo" defaultValue={paciente.sexo ?? ''} className={inputCls}>
              <option value="">—</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </Field>
          <Field label="Fecha de nacimiento">
            <input name="fecha_nacimiento" type="date" defaultValue={paciente.fecha_nacimiento ? new Date(paciente.fecha_nacimiento).toISOString().slice(0, 10) : ''} className={inputCls} />
          </Field>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardar.isPending} className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmarEliminarModal({ paciente, onClose, onConfirm, isPending, error }: { paciente: Paciente; onClose: () => void; onConfirm: () => void; isPending: boolean; error: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">Eliminar paciente</h3>
        <p className="mt-2 text-sm text-slate-600">
          ¿Eliminar a <span className="font-semibold">{paciente.nombre_completo}</span>? El historial clínico se conserva para auditoría, pero el paciente dejará de aparecer en las búsquedas.
        </p>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={isPending} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

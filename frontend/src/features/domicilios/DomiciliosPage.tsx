import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

interface Domicilio {
  id: string
  paciente_id: string
  solicitud_id: string | null
  direccion: string
  telefono: string | null
  fecha_visita: string | null
  estado: 'solicitada' | 'programada' | 'en_ruta' | 'tomada' | 'completada' | 'cancelada'
  ubicacion?: string | { lat: number; lng: number } | null
  notas: string | null
  created_at: string
}

interface Paciente {
  id: string
  cedula: string
  nombre_completo: string
}

const ESTADOS: { value: Domicilio['estado']; label: string; ops: Domicilio['estado'][] }[] = [
  { value: 'solicitada', label: 'Solicitada', ops: ['programada', 'cancelada'] },
  { value: 'programada', label: 'Programada', ops: ['en_ruta', 'cancelada'] },
  { value: 'en_ruta', label: 'En ruta', ops: ['tomada', 'cancelada'] },
  { value: 'tomada', label: 'Tomada', ops: ['completada'] },
  { value: 'completada', label: 'Completada', ops: [] },
  { value: 'cancelada', label: 'Cancelada', ops: [] },
]

const estadoLabel = (e: string) => ESTADOS.find((x) => x.value === e)?.label ?? e

export default function DomiciliosPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Domicilio['estado'] | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [pacienteId, setPacienteId] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [notas, setNotas] = useState('')

  const { data: domicilios = [], isLoading } = useQuery<Domicilio[]>({
    queryKey: ['domicilios', filtro],
    queryFn: async () => (await api.get('/domicilios', { params: filtro ? { estado: filtro } : {} })).data,
  })

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'domicilios'],
    queryFn: async () => (await api.get('/pacientes')).data,
  })

  const crear = useMutation({
    mutationFn: (payload: { paciente_id: string; direccion: string; telefono?: string; notas?: string }) => api.post('/domicilios', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domicilios'] })
      setShowForm(false)
      setPacienteId(''); setDireccion(''); setTelefono(''); setNotas('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { estado?: string; ubicacion?: string } }) => api.patch(`/domicilios/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['domicilios'] }),
    onError: (e) => setError(getApiError(e)),
  })

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Muestras a domicilio</h1>
          <p className="text-sm text-slate-500">Programación y rastreo de visitas</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nueva solicitud'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paciente *">
              <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className={inputCls}>
                <option value="">Selecciona…</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_completo} · {p.cedula}</option>
                ))}
              </select>
            </Field>
            <Field label="Dirección *">
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} placeholder="Av. …" />
            </Field>
            <Field label="Teléfono">
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} placeholder="+58…" />
            </Field>
            <Field label="Notas">
              <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} placeholder="Referencias…" />
            </Field>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            onClick={() => pacienteId && direccion && crear.mutate({ paciente_id: pacienteId, direccion, telefono: telefono || undefined, notas: notas || undefined })}
            disabled={!pacienteId || !direccion || crear.isPending}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Guardando…' : 'Programar visita'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFiltro('')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filtro === '' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>Todas</button>
        {ESTADOS.map((e) => (
          <button
            key={e.value}
            onClick={() => setFiltro(e.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${filtro === e.value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando…</p>
        ) : domicilios.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin solicitudes.</p>
        ) : (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 lg:grid-cols-3 sm:divide-y-0 sm:gap-4 sm:p-4">
            {domicilios.map((d) => {
              const ops = ESTADOS.find((x) => x.value === d.estado)?.ops ?? []
              return (
                <div key={d.id} className="flex flex-col gap-3 p-4 sm:rounded-xl sm:border sm:border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm">
                      <p className="font-medium text-slate-800">{pacienteNombre(pacientes, d.paciente_id)}</p>
                      <p className="text-xs text-slate-500">{d.direccion}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${estadoCls(d.estado)}`}>{estadoLabel(d.estado)}</span>
                  </div>

                  {d.fecha_visita && (
                    <p className="text-xs text-slate-500">Visita: {new Date(d.fecha_visita).toLocaleString()}</p>
                  )}
                  {d.ubicacion && (
                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">📍 {formatearUbicacion(d.ubicacion)}</p>
                  )}
                  {d.notas && <p className="text-xs text-slate-400">{d.notas}</p>}

                  {ops.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2">
                      {ops.map((op) => (
                        <button
                          key={op}
                          onClick={() => actualizar.mutate({ id: d.id, body: { estado: op } })}
                          className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                          disabled={actualizar.isPending}
                        >
                          {estadoLabel(op)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function pacienteNombre(pacientes: Paciente[], id: string | null) {
  return pacientes.find((p) => p.id === id)?.nombre_completo ?? 'Paciente'
}

function formatearUbicacion(ubicacion: Domicilio['ubicacion']): string {
  if (!ubicacion) return ''
  if (typeof ubicacion === 'string') return ubicacion
  const { lat, lng } = ubicacion
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function estadoCls(estado: string) {
  return estado === 'completada' ? 'bg-emerald-100 text-emerald-700'
    : estado === 'cancelada' ? 'bg-slate-200 text-slate-600'
    : estado === 'en_ruta' ? 'bg-blue-100 text-blue-700'
    : estado === 'tomada' ? 'bg-violet-100 text-violet-700'
    : estado === 'programada' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}
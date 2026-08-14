import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import type { ExpedienteCompleto, RegistroHistorial } from './types'
import { TIPO_LABEL, contenidoTexto } from '../../lib/historial'

const TIPOS = ['evolucion', 'procedimiento', 'interconsulta', 'resultado', 'otro']

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
}

/**
 * Historial clínico compartido del expediente: registros inmutables firmados,
 * con correcciones (Fe de Erratas / Adenda). Aquí se hace el alta de registros
 * y su corrección, sin duplicar la pantalla del Historial.
 */
export default function PanelHistorial({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'
  const puedeCorregir = role === 'medico' || role === 'admin' || role === 'super_root'

  const [showNuevo, setShowNuevo] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<RegistroHistorial | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: expediente, isLoading } = useQuery<ExpedienteCompleto>({
    queryKey: ['expediente', 'completo', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}`)).data,
  })

  const registros: RegistroHistorial[] = expediente?.historial ?? []

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ['expediente', 'completo', pacienteId] })

  const crear = useMutation({
    mutationFn: (payload: unknown) => api.post('/historial', payload),
    onSuccess: () => {
      invalidar()
      setShowNuevo(false)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function handleNuevo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    crear.mutate({
      paciente_id: pacienteId,
      tipo: String(fd.get('tipo') ?? 'evolucion'),
      titulo: String(fd.get('titulo') ?? ''),
      contenido: { texto: String(fd.get('contenido') ?? '') },
    })
  }

  if (isLoading) return <p className="py-4 text-center text-sm text-slate-500">Cargando historial…</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Registros clínicos firmados e inmutables. Los cambios posteriores se registran como
          corrección (Fe de Erratas o Adenda) sin modificar el original.
        </p>
        {puedeCorregir && (
          <button
            type="button"
            onClick={() => setShowNuevo((v) => !v)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {showNuevo ? 'Cancelar' : '+ Nuevo registro'}
          </button>
        )}
      </div>

      {showNuevo && (
        <form onSubmit={handleNuevo} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Tipo *</span>
              <select name="tipo" defaultValue="evolucion" className={inputCls}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Título *</span>
              <input name="titulo" required placeholder="Ej. Control de glicemia" className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Contenido</span>
            <textarea name="contenido" rows={3} placeholder="Subjetivo / objetivo / plan…" className={inputCls} />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={crear.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
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
              canCorregir={puedeCorregir}
              onCorregir={() => setCorrigiendo(r)}
            />
          ))}
        </div>
      )}

      {corrigiendo && (
        <CorreccionModal
          registro={corrigiendo}
          onClose={() => setCorrigiendo(null)}
          onSaved={invalidar}
        />
      )}
    </div>
  )
}

function RegistroCard({
  registro,
  canCorregir,
  onCorregir,
}: {
  registro: RegistroHistorial
  canCorregir: boolean
  onCorregir: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
            {TIPO_LABEL[registro.tipo] ?? registro.tipo}
          </span>
          <span className="text-sm font-semibold text-slate-800">{registro.titulo}</span>
        </div>
        <span className="text-xs text-slate-400">{new Date(registro.created_at).toLocaleString('es-VE')}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {registro.medico_nombre ?? 'Médico'}
        {registro.categoria_origen_nombre ? ` · ${registro.categoria_origen_nombre}` : ''}
      </p>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        {contenidoTexto(registro.contenido)}
      </pre>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] text-slate-300" title="Firma digital del registro">
          firma · {registro.firma.slice(0, 12)}…
        </p>
        {canCorregir && (
          <button
            type="button"
            onClick={onCorregir}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
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
              <p className="relative text-[10px] font-semibold uppercase text-amber-700">{c.tipo.replace('_', ' ')}</p>
              <p className="relative whitespace-pre-wrap text-xs text-slate-700">{contenidoTexto(c.contenido)}</p>
              <p className="relative mt-1 text-[10px] text-slate-400">
                {c.medico_nombre ?? 'Médico'} · {new Date(c.created_at).toLocaleString('es-VE')} · firma{' '}
                {c.firma.slice(0, 10)}…
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CorreccionModal({
  registro,
  onClose,
  onSaved,
}: {
  registro: RegistroHistorial
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const corregir = useMutation({
    mutationFn: (payload: unknown) => api.post(`/historial/${registro.id}/correcciones`, payload),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (e) => setError(getApiError(e)),
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
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Tipo de corrección *</span>
            <select name="tipo" required defaultValue="" className={inputCls}>
              <option value="" disabled>Elegir…</option>
              <option value="fe_errata">Fe de Erratas</option>
              <option value="adenda">Adenda</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Contenido *</span>
            <textarea name="contenido" required rows={4} placeholder="Corrección o adición…" className={inputCls} />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={corregir.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {corregir.isPending ? 'Guardando…' : 'Registrar corrección'}
          </button>
        </form>
      </div>
    </div>
  )
}
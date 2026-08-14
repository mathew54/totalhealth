import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import type { Interconsulta } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
}

/** Interconsultas: deriva a otro especialista y responde/cancela desde aquí. */
export default function PanelInterconsultas({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const [showForm, setShowForm] = useState(false)
  const [respondiendo, setRespondiendo] = useState<Interconsulta | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: catalogo } = useQuery<{ categorias: { id: string; nombre: string }[]; especialidades: { id: string; nombre: string }[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get('/historial/especialidades')).data,
  })

  const { data: lista = [] } = useQuery<Interconsulta[]>({
    queryKey: ['expediente', 'interconsultas', pacienteId],
    queryFn: async () => (await api.get('/historial/interconsultas', { params: { paciente_id: pacienteId } })).data,
  })

  const esPersonalMedico =
    profile?.role === 'medico' || profile?.role === 'admin' || profile?.role === 'super_root'

  const { data: bandeja = [] } = useQuery<Interconsulta[]>({
    queryKey: ['historial', 'interconsultas', 'bandeja'],
    queryFn: async () => (await api.get('/historial/interconsultas')).data,
    enabled: esPersonalMedico,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['expediente', 'interconsultas', pacienteId] })
    queryClient.invalidateQueries({ queryKey: ['historial', 'interconsultas'] })
  }

  const enviar = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/historial/interconsultas', payload),
    onSuccess: () => {
      invalidar()
      setShowForm(false)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/historial/interconsultas/${id}`, patch),
    onSuccess: () => {
      invalidar()
      setRespondiendo(null)
      setRespuesta('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    enviar.mutate({
      paciente_id: pacienteId,
      categoria_destino: fd.get('categoria_destino'),
      especialidad_destino: fd.get('especialidad_destino') || undefined,
      motivo: fd.get('motivo'),
      hipotesis: fd.get('hipotesis') || undefined,
    })
  }

  const esDestino = (i: Interconsulta) =>
    profile?.role === 'medico' && i.medico_destino_nombre === profile.nombre_completo

  const estadoBadge: Record<string, string> = {
    enviada: 'bg-sky-100 text-sky-700',
    aceptada: 'bg-amber-100 text-amber-700',
    completada: 'bg-emerald-100 text-emerald-700',
    cancelada: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Derivar a especialidad'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Categoría destino *</span>
              <select name="categoria_destino" required defaultValue="" className={inputCls}>
                <option value="" disabled>Elegir…</option>
                {(catalogo?.categorias ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Especialidad destino</span>
              <select name="especialidad_destino" className={inputCls}>
                <option value="">— Sin especificar —</option>
                {(catalogo?.especialidades ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Motivo de interconsulta *</span>
            <textarea name="motivo" required rows={3} className={inputCls} placeholder="Motivo por el que se solicita la valoración (mín. 5 caracteres)" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Hipótesis diagnóstica</span>
            <textarea name="hipotesis" rows={2} className={inputCls} placeholder="Opcional" />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={enviar.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {enviar.isPending ? 'Enviando…' : 'Enviar interconsulta'}
          </button>
        </form>
      )}

      {respondiendo && (
        <form
          className="grid gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            actualizar.mutate({ id: respondiendo.id, patch: { estado: 'completada', respuesta } })
          }}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">Responder interconsulta</h4>
            <button type="button" onClick={() => setRespondiendo(null)} className="text-xs text-slate-400 hover:text-slate-600">
              Cerrar
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Respuesta clínica *</span>
            <textarea
              name="respuesta"
              rows={4}
              required
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              className={inputCls}
              placeholder="Diagnóstico, recomendaciones y conducta a seguir…"
            />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => actualizar.mutate({ id: respondiendo.id, patch: { estado: 'cancelada' } })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar interconsulta
            </button>
            <button
              type="submit"
              disabled={actualizar.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {actualizar.isPending ? 'Enviando…' : 'Completar y responder'}
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Sin interconsultas para este paciente.
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map((i) => (
            <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {i.categoria_destino_nombre ?? i.especialidad_destino_nombre ?? 'Especialidad'}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${estadoBadge[i.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                  {i.estado}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{i.motivo}</p>
              {i.hipotesis && <p className="mt-0.5 text-xs italic text-slate-500">Hipótesis: {i.hipotesis}</p>}
              {i.respuesta && (
                <p className="mt-1 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                  <span className="font-semibold">Respuesta:</span> {i.respuesta}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">
                  {i.medico_origen_nombre ?? 'Yo'} → {i.medico_destino_nombre ?? 'bandeja de la especialidad'}
                  {i.medico_responde_nombre ? ` · respondió ${i.medico_responde_nombre}` : ''}
                </p>
                {esDestino(i) && (i.estado === 'enviada' || i.estado === 'aceptada') && (
                  <div className="flex gap-2">
                    {i.estado === 'enviada' && (
                      <button
                        type="button"
                        onClick={() =>
                          actualizar.mutate({
                            id: i.id,
                            patch: { estado: 'aceptada' },
                          })
                        }
                        className="rounded-lg border border-brand-600 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        Aceptar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRespondiendo(i)
                        setRespuesta(i.respuesta ?? '')
                      }}
                      className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Responder
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {esPersonalMedico && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-800">Bandeja de especialidad</h3>
          <p className="text-xs text-slate-500">Interconsultas dirigidas a tu categoría o las que originaste.</p>
          {bandeja.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">Sin interconsultas pendientes para ti.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {bandeja.map((i) => (
                <div key={i.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      {i.categoria_destino_nombre ?? i.especialidad_destino_nombre ?? 'Especialidad'}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${estadoBadge[i.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                      {i.estado}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{i.motivo}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    de {i.medico_origen_nombre ?? 'Médico'} · {new Date(i.created_at).toLocaleString('es-VE')}
                  </p>
                  {(i.estado === 'enviada' || i.estado === 'aceptada') && (
                    <div className="mt-2 flex gap-2">
                      {i.estado === 'enviada' && (
                        <button
                          type="button"
                          onClick={() => actualizar.mutate({ id: i.id, patch: { estado: 'aceptada' } })}
                          className="rounded-lg border border-brand-600 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          Aceptar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRespondiendo(i)
                          setRespuesta(i.respuesta ?? '')
                        }}
                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Responder
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
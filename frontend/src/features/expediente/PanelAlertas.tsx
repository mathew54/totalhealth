import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import type { AlertaCritica } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
}

/**
 * Banner de alertas críticas del paciente (reutiliza el endpoint del módulo de
 * historial). Lectura siempre visible; el alta se hace aquí mismo para el rol
 * médico sin duplicar la pantalla del Historial.
 */
export default function PanelAlertas({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const puedeCrear = profile?.role === 'medico' || profile?.role === 'admin' || profile?.role === 'super_root'
  const puedeDesactivar = profile?.role === 'admin' || profile?.role === 'super_root'
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: alertas = [] } = useQuery<AlertaCritica[]>({
    queryKey: ['expediente', 'alertas', pacienteId],
    queryFn: async () => {
      const { data } = await api.get(`/historial/pacientes/${pacienteId}`)
      return (data?.alertas_criticas ?? []) as AlertaCritica[]
    },
  })

  const crear = useMutation({
    mutationFn: (payload: unknown) => api.post(`/historial/pacientes/${pacienteId}/alertas`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'alertas', pacienteId] })
      setOpen(false)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const desactivar = useMutation({
    mutationFn: (id: string) => api.patch(`/historial/alertas/${id}`, { activa: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expediente', 'alertas', pacienteId] }),
    onError: (e) => setError(getApiError(e)),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    crear.mutate({
      tipo: fd.get('tipo'),
      severidad: fd.get('severidad') || 'alta',
      descripcion: fd.get('descripcion'),
    })
  }

  if (alertas.length === 0 && !open) return null

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">⚠</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-red-700">Alertas críticas del paciente</h2>
        </div>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {open ? 'Cancelar' : '+ Nueva alerta'}
          </button>
        )}
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
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.severidad === 'alta' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-900'}`}>
                  {a.severidad}
                </span>
                {puedeDesactivar && (
                  <button
                    type="button"
                    onClick={() => desactivar.mutate(a.id)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                    title="Desactivar alerta"
                  >
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
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Tipo *</span>
            <select name="tipo" required defaultValue="" className={inputCls}>
              <option value="" disabled>Elegir…</option>
              <option value="alergia">Alergia</option>
              <option value="enfermedad_cronica">Enfermedad crónica</option>
              <option value="medicamento_critico">Medicamento crítico</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Severidad</span>
            <select name="severidad" className={inputCls}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Descripción *</span>
            <input name="descripcion" required placeholder="Ej. Alergia a penicilina…" className={inputCls} />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={crear.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {crear.isPending ? 'Guardando…' : 'Registrar alerta'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

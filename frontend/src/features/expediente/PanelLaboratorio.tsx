import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ExpedienteCompleto, ResultadoLaboratorio } from './types'

const ESTADO_STYLE: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  listo: 'bg-emerald-100 text-emerald-700',
  entregado: 'bg-slate-100 text-slate-500',
  anulada: 'bg-red-100 text-red-600',
}

interface Props {
  pacienteId: string
}

/**
 * Resultados de laboratorio del paciente (reutiliza el endpoint del módulo de
 * historial). Complementa las órdenes del CPOE: aquí se leen los resultados.
 */
export default function PanelLaboratorio({ pacienteId }: Props) {
  const { data: expediente, isLoading } = useQuery<ExpedienteCompleto>({
    queryKey: ['expediente', 'completo', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}`)).data,
  })

  const resultados: ResultadoLaboratorio[] = expediente?.resultados_laboratorio ?? []

  if (isLoading) return <p className="py-4 text-center text-sm text-slate-500">Cargando laboratorio…</p>

  if (resultados.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
        El paciente no tiene exámenes de laboratorio registrados.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {resultados.map((s) => (
        <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">Solicitud de exámenes</p>
              <p className="text-xs text-slate-400">{new Date(s.fecha).toLocaleString('es-VE')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_STYLE[s.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                {s.estado.replace('_', ' ')}
              </span>
              {s.cobrado && <span className="text-[11px] text-emerald-600">pagada</span>}
            </div>
          </div>

          <div className="mt-2 space-y-1.5">
            {s.lineas.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-100 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{l.examen}</span>
                  {l.resultado?.procesado_at && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(l.resultado.procesado_at).toLocaleString('es-VE')}
                    </span>
                  )}
                </div>
                {l.resultado ? (
                  <p className="mt-0.5 text-xs text-slate-700">
                    {l.resultado.valores
                      ? Object.entries(l.resultado.valores)
                          .filter(([, v]) => v !== null && v !== '')
                          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
                          .join(' · ')
                      : 'Resultado registrado'}
                    {l.resultado.observaciones && <span className="text-slate-500"> — {l.resultado.observaciones}</span>}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">Sin resultado aún.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

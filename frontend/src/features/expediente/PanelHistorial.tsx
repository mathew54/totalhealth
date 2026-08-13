import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ExpedienteCompleto, RegistroHistorial } from './types'

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

interface Props {
  pacienteId: string
}

/**
 * Historial clínico compartido: registros inmutables con firma digital y sus
 * correcciones (Fe de Erratas / Adenda). Reutiliza el endpoint del módulo de
 * historial; aquí es solo lectura para no duplicar el alta.
 */
export default function PanelHistorial({ pacienteId }: Props) {
  const { data: expediente, isLoading } = useQuery<ExpedienteCompleto>({
    queryKey: ['expediente', 'completo', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}`)).data,
  })

  const registros: RegistroHistorial[] = expediente?.historial ?? []

  if (isLoading) return <p className="py-4 text-center text-sm text-slate-500">Cargando historial…</p>

  if (registros.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
        El paciente no tiene registros en el historial compartido.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Registros clínicos firmados e inmutables. Los cambios posteriores se registran como corrección
        (Fe de Erratas o Adenda) sin modificar el original.
      </p>
      {registros.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                {TIPO_LABEL[r.tipo] ?? r.tipo}
              </span>
              <span className="text-sm font-semibold text-slate-800">{r.titulo}</span>
            </div>
            <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString('es-VE')}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {r.medico_nombre ?? 'Médico'}
            {r.categoria_origen_nombre ? ` · ${r.categoria_origen_nombre}` : ''}
          </p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {contenidoTexto(r.contenido)}
          </pre>
          <p className="mt-1 font-mono text-[10px] text-slate-300" title="Firma digital del registro">
            firma · {r.firma.slice(0, 12)}…
          </p>

          {r.correcciones.length > 0 && (
            <div className="mt-2 space-y-1">
              {r.correcciones.map((c) => (
                <div key={c.id} className="relative overflow-hidden rounded-lg border border-amber-300 bg-amber-50 p-2">
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rotate-[-18deg] text-2xl font-black uppercase tracking-widest text-amber-200/70">
                      {c.tipo === 'fe_errata' ? 'Fe de Erratas' : 'Adenda'}
                    </span>
                  </div>
                  <p className="relative text-[10px] font-semibold uppercase text-amber-700">{c.tipo.replace('_', ' ')}</p>
                  <p className="relative whitespace-pre-wrap text-xs text-slate-700">{contenidoTexto(c.contenido)}</p>
                  <p className="relative mt-1 text-[10px] text-slate-400">
                    {c.medico_nombre ?? 'Médico'} · {new Date(c.created_at).toLocaleString('es-VE')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

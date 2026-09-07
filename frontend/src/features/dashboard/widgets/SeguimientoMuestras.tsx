import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'

interface Solicitud {
  id: string
  numero?: string | null
  fecha: string
  estado: string
  paciente: { nombre_completo: string } | null
  detalle: { id: string; examen: { nombre: string } | null; estado_muestra: string }[]
}

interface Tracking {
  actual: string
  estados: {
    id: string
    estado: string
    notas: string | null
    usuario_id: string | null
    usuario_nombre: string | null
    created_at: string
  }[]
}

const ESTADOS = ['pendiente', 'recibida', 'en_analisis', 'completada']

const ESTADO_ESTILO: Record<string, { cls: string; desc: string }> = {
  pendiente: { cls: 'bg-slate-100 text-slate-600', desc: 'Pendiente' },
  recibida: { cls: 'bg-sky-100 text-sky-700', desc: 'Muestra recibida' },
  en_analisis: { cls: 'bg-amber-100 text-amber-700', desc: 'En análisis' },
  completada: { cls: 'bg-emerald-100 text-emerald-700', desc: 'Resultado listo' },
}

/** Seguimiento de muestras en tiempo real: estados del flujo pre/clínico por línea. */
export function SeguimientoMuestras() {
  const qc = useQueryClient()
  const { data: solicitudes = [] } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', 'tracking'],
    queryFn: async () => (await api.get('/solicitudes?limit=50')).data,
  })

  const avance = useMutation({
    mutationFn: async ({ detalleId, estado }: { detalleId: string; estado: string }) =>
      (await api.put(`/atencion/solicitudes/${detalleId}/estado`, { estado })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes'] })
    },
  })

  const flujo: { id: string; numero: string; paciente: string | null; muestras: { id: string; examen: string; estado: string }[] }[] =
    solicitudes
      .filter((s) => s.estado === 'en_proceso' || s.estado === 'pendiente' || s.estado === 'completado')
      .map((s) => ({
        id: s.id,
        numero: s.numero ?? s.id.slice(0, 8).toUpperCase(),
        paciente: s.paciente?.nombre_completo ?? null,
        muestras: (s.detalle ?? []).filter((d) => d.examen).map((d) => ({ id: d.id, examen: d.examen!.nombre, estado: d.estado_muestra ?? 'pendiente' })),
      }))

  function siguiente(actual: string): string | null {
    const i = ESTADOS.indexOf(actual)
    return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-slate-800">Seguimiento de muestras</h3>
      <p className="mb-3 text-xs text-slate-500">Recepción → análisis → completado. Pulsa un examen para ver su timeline.</p>

      {flujo.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Sin muestras en flujo.</p>}

      <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">
        {flujo.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">{s.numero} · {s.paciente ?? 'Paciente'}</p>
            <ul className="mt-2 space-y-1.5">
              {s.muestras.map((m) => (
                <MuestraRow key={m.id} detalleId={m.id} examen={m.examen} estado={m.estado} avanzar={() => {
                  const sig = siguiente(m.estado)
                  if (sig) avance.mutate({ detalleId: m.id, estado: sig })
                }} avanzando={avance.isPending} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function MuestraRow({ detalleId, examen, estado, avanzar, avanzando }: {
  detalleId: string
  examen: string
  estado: string
  avanzar: () => void
  avanzando: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const sig = ESTADOS[ESTADOS.indexOf(estado) + 1]

  const { data: tracking, isLoading } = useQuery<Tracking>({
    queryKey: ['solicitudes', 'tracking', detalleId],
    queryFn: async () => (await api.get(`/atencion/solicitudes/${detalleId}/tracking`)).data,
    enabled: abierto,
  })

  const e = ESTADO_ESTILO[estado] ?? ESTADO_ESTILO.pendiente
  const estados = tracking?.estados ?? []

  return (
    <li className="rounded-lg border border-slate-100">
      <div className="flex items-center justify-between gap-2 py-1.5 pl-2 pr-1.5 text-sm">
        <button onClick={() => setAbierto((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`text-[10px] font-semibold ${abierto ? 'text-slate-400' : 'text-slate-300'}`}>{abierto ? '▾' : '▸'}</span>
          <span className="truncate text-slate-600">{examen}</span>
        </button>
        <span className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] capitalize ${e.cls}`}>{e.desc}</span>
          {sig && (
            <button
              onClick={avanzar}
              disabled={avanzando}
              className="rounded border border-brand-300 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            >
              {sig === 'recibida' ? 'Recibir' : sig === 'en_analisis' ? 'Analizar' : 'Completar'}
            </button>
          )}
        </span>
      </div>

      {abierto && (
        <div className="border-t border-slate-100 px-4 py-3">
          {isLoading ? (
            <p className="text-xs text-slate-400">Cargando historial…</p>
          ) : estados.length === 0 ? (
            <p className="text-xs text-slate-400">Sin movimientos registrados todavía.</p>
          ) : (
            <ol className="space-y-0">
              {estados.map((m, i) => {
                const me = ESTADO_ESTILO[m.estado] ?? ESTADO_ESTILO.pendiente
                const ultimo = i === estados.length - 1
                return (
                  <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="flex flex-col items-center">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ultimo && m.estado === tracking?.actual ? 'bg-emerald-500 ring-2 ring-emerald-200' : me.cls.includes('slate') ? 'bg-slate-300' : 'bg-amber-400'}`} />
                      {i < estados.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700">{me.desc}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(m.created_at).toLocaleString('es-VE')}
                        {m.usuario_nombre ? ` · ${m.usuario_nombre}` : ''}
                      </p>
                      {m.notas && <p className="mt-0.5 rounded bg-slate-50 px-2 py-1 text-[11px] italic text-slate-500">“{m.notas}”</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { Cuestionario, Definicion } from '../cuestionario/CuestionarioModal'

interface ItemResumen {
  etiqueta: string
  detalle: string
}

interface ModuloResumen {
  nombre: string
  items: ItemResumen[]
}

/**
 * Resumen de la anamnesis del paciente: muestra los puntos MARCADOS del último
 * cuestionario consolidado (y el borrador más reciente si no hay consolidado).
 * Se muestra junto al expediente para leer toda la información en una ventana.
 */
export default function ResumenAnamnesis({ pacienteId }: { pacienteId: string }) {
  const [open, setOpen] = useState(true)

  const { data: def } = useQuery<Definicion>({
    queryKey: ['cuestionarios', 'definicion'],
    queryFn: async () => (await api.get('/historial/cuestionarios/definicion')).data,
    staleTime: Infinity,
  })

  const { data: lista = [] } = useQuery<Cuestionario[]>({
    queryKey: ['cuestionarios', 'expediente', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}/cuestionarios`)).data,
  })

  if (!def) return null

  const activo =
    lista.find((c) => c.estado === 'consolidado') ?? lista.find((c) => c.estado === 'borrador')
  if (!activo) return null

  const porClave = new Map<string, { etiqueta: string; modulo: string }>()
  for (const m of def.modulos) {
    for (const item of m.items) porClave.set(item.clave, { etiqueta: item.etiqueta, modulo: m.nombre })
  }

  const modulos: ModuloResumen[] = def.modulos
    .map((m) => ({
      nombre: m.nombre,
      items: m.items
        .filter((item) => {
          const r = activo.respuestas?.[item.clave] as { marcado?: boolean; detalle?: string | null } | undefined
          return r?.marcado === true
        })
        .map((item) => {
          const r = activo.respuestas?.[item.clave] as { detalle?: string | null } | undefined
          return { etiqueta: item.etiqueta, detalle: r?.detalle ?? '' }
        }),
    }))
    .filter((m) => m.items.length > 0)

  const observaciones = String(activo.respuestas?.observaciones ?? '').trim()
  const marcados = modulos.reduce((n, m) => n + m.items.length, 0)

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">Anamnesis</span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Cuestionario de historial médico</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {marcados} {marcados === 1 ? 'marcado' : 'marcados'}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${activo.estado === 'consolidado' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>
            {activo.estado}
          </span>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3">
          {modulos.length === 0 && !observaciones ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Sin puntos marcados en el cuestionario.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {modulos.map((m) => (
                <div key={m.nombre} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{m.nombre}</p>
                  <ul className="mt-2 space-y-1.5">
                    {m.items.map((it) => (
                      <li key={it.etiqueta} className="text-sm">
                        <span className="font-semibold text-slate-800">{it.etiqueta}</span>
                        {it.detalle && <span className="text-slate-600"> — {it.detalle}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {observaciones && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Otros / Observaciones Adicionales</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{observaciones}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

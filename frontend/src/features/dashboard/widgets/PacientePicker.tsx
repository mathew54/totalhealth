import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'

export interface PacienteMini {
  id: string
  cedula: string | null
  nombre_completo: string
  telefono?: string | null
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

/** Búsqueda de pacientes reutilizable (para widgets con contexto de paciente). */
export function PacientePicker({ value, onChange }: { value: PacienteMini | null; onChange: (p: PacienteMini | null) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const { data: resultados = [], isLoading } = useQuery<PacienteMini[]>({
    queryKey: ['pacientes', 'buscar', q],
    queryFn: async () =>
      q.trim().length >= 2 ? (await api.get(`/pacientes?q=${encodeURIComponent(q.trim())}&limit=8`)).data : [],
    enabled: q.trim().length >= 2,
  })

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-800">{value.nombre_completo}</p>
          <p className="text-xs text-brand-600">{value.cedula ?? ''}</p>
        </div>
        <button onClick={() => onChange(null)} className="shrink-0 text-brand-500 hover:text-brand-700" title="Cambiar paciente">✕</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar paciente por cédula o nombre…"
        className={inputCls}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {isLoading ? (
            <p className="px-3 py-2 text-xs text-slate-500">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias.</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => { onChange(p); setOpen(false); setQ('') }}
                className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="font-medium">{p.nombre_completo}</span>
                <span className="ml-2 text-xs text-slate-400">{p.cedula ?? ''}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

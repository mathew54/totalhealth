// Buscador de pacientes ÚNICO y reutilizable: autocomplete con debounce
// (300 ms), cierre al hacer clic fuera y modo "chip" del seleccionado.
// Lo usan el expediente (BuscadorPacientes) y los widgets del dashboard
// (PacientePicker).

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Paciente } from '../../lib/types'

export interface BuscadorPacientesProps {
  value?: Paciente | null
  onChange: (p: Paciente | null) => void
  /** Modo chip: muestra la tarjeta del paciente seleccionado en vez del input. */
  mostrarSeleccionado?: boolean
  placeholder?: string
  minChars?: number
  limit?: number
  className?: string
}

export default function BuscadorPacientes({
  value,
  onChange,
  mostrarSeleccionado = false,
  placeholder = 'Buscar paciente por nombre, cédula o teléfono…',
  minChars = 2,
  limit = 10,
  className,
}: BuscadorPacientesProps) {
  const [termino, setTermino] = useState('')
  const [abierto, setAbierto] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const { data: resultados = [], isFetching } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'buscar', termino, limit],
    enabled: termino.trim().length >= minChars,
    queryFn: async () => {
      const { data } = await api.get<Paciente[]>('/pacientes', { params: { q: termino.trim(), limit } })
      return data
    },
  })

  // Debounce 300 ms: abre el menú solo cuando dejas de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      if (termino.trim().length >= minChars) setAbierto(true)
    }, 300)
    return () => clearTimeout(t)
  }, [termino, minChars])

  // Cierra al hacer clic fuera.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function elegir(p: Paciente) {
    onChange(p)
    setTermino(p.nombre_completo)
    setAbierto(false)
  }

  // Modo chip: paciente ya elegido, se muestra la tarjeta con opción de cambiar.
  if (mostrarSeleccionado && value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-800">{value.nombre_completo}</p>
          <p className="text-xs text-brand-600">{value.cedula ?? ''}</p>
        </div>
        <button
          onClick={() => onChange(null)}
          className="shrink-0 text-brand-500 hover:text-brand-700"
          title="Cambiar paciente"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          onFocus={() => termino.trim().length >= minChars && setAbierto(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
        />
        {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>}
      </div>

      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {!isFetching && resultados.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">Sin resultados para “{termino}”.</li>
          )}
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => elegir(p)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{p.nombre_completo}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {[p.cedula, p.es_menor ? 'Menor' : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
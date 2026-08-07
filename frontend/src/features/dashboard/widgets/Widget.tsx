import type { ReactNode } from 'react'

interface WidgetProps {
  titulo: string
  descripcion?: string
  children?: ReactNode
}

/** Tarjeta base para los widgets del dashboard médico. */
export default function Widget({ titulo, descripcion, children }: WidgetProps) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        {descripcion && <p className="text-xs text-slate-500">{descripcion}</p>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

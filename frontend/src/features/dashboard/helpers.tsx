import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Componentes de estado (loading / vacío / error) consistentes        */
/* ------------------------------------------------------------------ */

const claseBase =
  'rounded-xl border border-slate-200 bg-white p-4 shadow-sm'

export function SectionCard({
  titulo,
  children,
  acciones,
  className = '',
  sinBorde = false,
}: {
  titulo?: ReactNode
  children: ReactNode
  acciones?: ReactNode
  className?: string
  sinBorde?: boolean
}) {
  return (
    <section className={`${sinBorde ? '' : claseBase} ${className}`}>
      {(titulo || acciones) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>}
          {acciones && <div className="flex items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function LoadingRow({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <p className="animate-pulse rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500" role="status">
      {mensaje}
    </p>
  )
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
      {children}
    </p>
  )
}

export function ErrorPanel({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
    >
      {mensaje}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Semántica de severidad (rojo = crítico, ámbar = alerta)             */
/* ------------------------------------------------------------------ */

export function NivelBadge({ nivel }: { nivel: 'critico' | 'alerta' | string }) {
  const critico = nivel === 'critico'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        critico ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {critico ? 'Crítico' : 'Alerta'}
    </span>
  )
}

/** Control segmentado para alternar vistas (activa/consolidada, operativo/supervisión…). */
export function ToggleVistas<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { id: T; label: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Vista del dashboard"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm"
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-brand-500 ${
            valor === o.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  valor: ReactNode
  tono?: 'default' | 'success' | 'warning' | 'danger'
  hint?: string
}

const tonos: Record<NonNullable<StatCardProps['tono']>, string> = {
  default: 'text-slate-800',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-red-600',
}

export default function StatCard({ label, valor, tono = 'default', hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tonos[tono]}`}>{valor}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

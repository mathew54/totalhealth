import { useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/rbac'

export default function PlaceholderPage() {
  const { pathname } = useLocation()
  const item = NAV_ITEMS.find((i) => pathname.startsWith(i.path))

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-slate-700">
        Módulo «{item?.label ?? pathname}»
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        En construcción. Se implementará en el siguiente milestone (M2+).
      </p>
    </div>
  )
}

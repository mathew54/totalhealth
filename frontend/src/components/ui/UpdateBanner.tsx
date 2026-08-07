import { useServiceWorkerUpdate } from '../../lib/useServiceWorkerUpdate'

/**
 * Aviso flotante cuando hay una nueva versión instalable del app.
 * Solo aparece en producción (el hook lo garantiza).
 */
export default function UpdateBanner() {
  const { updateReady, aplicarUpdate } = useServiceWorkerUpdate()
  if (!updateReady) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800">Nueva versión disponible</p>
        <p className="text-xs text-slate-500">Recarga para aplicar la actualización más reciente.</p>
      </div>
      <button
        onClick={aplicarUpdate}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Actualizar
      </button>
    </div>
  )
}
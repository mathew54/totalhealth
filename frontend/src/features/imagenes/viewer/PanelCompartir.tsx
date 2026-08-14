import { useState } from 'react'
import type { EstudioImagen } from '../types'

export function PanelCompartir({
  estudio,
  onGenerar,
  token,
  expira,
  generando,
}: {
  estudio: EstudioImagen
  onGenerar: () => void
  token: string | null
  expira: string | null
  generando: boolean
}) {
  const [copiado, setCopiado] = useState(false)
  const link = token ? `${location.origin}${location.pathname}#/imagenes/compartir/${token}` : null

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      window.prompt('Copia el enlace:', link)
    }
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-white">Compartir estudio</h3>
      <p className="text-xs text-slate-400">
        Genera un enlace seguro para ver este estudio ({estudio.titulo ?? 'sin título'}). El enlace expira
        automáticamente a los 7 días y cualquiera con él puede ver las imágenes (sin datos de acceso).
      </p>

      {!link ? (
        <button
          onClick={onGenerar}
          disabled={generando}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {generando ? 'Generando…' : 'Generar enlace de compartición'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2">
            <p className="break-all text-xs text-slate-200">{link}</p>
            {expira && <p className="mt-1 text-[10px] text-slate-500">Expira: {new Date(expira).toLocaleString()}</p>}
          </div>
          <button onClick={copiar} className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600">
            {copiado ? '¡Copiado!' : 'Copiar enlace'}
          </button>
          <button
            onClick={onGenerar}
            disabled={generando}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            Regenerar enlace
          </button>
        </div>
      )}
    </div>
  )
}
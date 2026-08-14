import { useState } from 'react'

export function PanelSubir({
  onSubir,
  subiendo,
  onCancelar,
  error,
}: {
  onSubir: (imagenes: { data_url: string; descripcion: string | null }[]) => void
  subiendo: boolean
  onCancelar: () => void
  error: string | null
}) {
  const [archivos, setArchivos] = useState<{ data_url: string; descripcion: string | null }[]>([])

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const leidos: { data_url: string; descripcion: string | null }[] = []
    let pendiente = files.length
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        leidos.push({ data_url: String(reader.result), descripcion: null })
        pendiente -= 1
        if (pendiente === 0) setArchivos((prev) => [...prev, ...leidos])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-white">Agregar imágenes a la serie</h3>
      <p className="text-xs text-slate-400">Puedes seleccionar varias imágenes a la vez. Se agregarán al final de la serie.</p>

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={onFiles}
        className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-600"
      />

      {archivos.length > 0 && (
        <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
          {archivos.map((a, i) => (
            <div key={i} className="relative overflow-hidden rounded-lg border border-slate-700">
              <img src={a.data_url} alt={`Imagen ${i + 1}`} className="h-14 w-full object-cover" />
              <button
                onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-200">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => onSubir(archivos)}
          disabled={archivos.length === 0 || subiendo}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {subiendo ? 'Subiendo…' : `Subir ${archivos.length} imagen(es)`}
        </button>
        <button onClick={onCancelar} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
          Cancelar
        </button>
      </div>
    </div>
  )
}
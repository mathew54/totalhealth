import { useState } from 'react'
import { ESTADO_LABELS, TIPO_LABELS, type EstudioImagen } from '../types'

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-brand-500'

export function PanelEditar({
  estudio,
  onGuardar,
  onCancelar,
  error,
  guardando,
}: {
  estudio: EstudioImagen
  onGuardar: (payload: Record<string, unknown>) => void
  onCancelar: () => void
  error: string | null
  guardando: boolean
}) {
  const [titulo, setTitulo] = useState(estudio.titulo ?? '')
  const [region, setRegion] = useState(estudio.region ?? '')
  const [hallazgos, setHallazgos] = useState(estudio.hallazgos ?? '')
  const [impresion, setImpresion] = useState(estudio.impresion ?? '')
  const [tipo, setTipo] = useState(estudio.tipo)
  const [estado, setEstado] = useState(estudio.estado)
  const [retencion, setRetencion] = useState(estudio.retencion_hasta ?? '')

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-white">Editar estudio</h3>

      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-400">Título</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Placa de tórax AP" className={inputCls} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-400">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            {Object.entries(TIPO_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-400">Región</span>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Tórax" className={inputCls} />
        </label>
      </div>

      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-400">Hallazgos</span>
        <textarea value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} rows={3} className={inputCls} />
      </label>

      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-400">Impresión</span>
        <textarea value={impresion} onChange={(e) => setImpresion(e.target.value)} rows={3} className={inputCls} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-400">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as 'pendiente' | 'leido')} className={inputCls}>
            {Object.entries(ESTADO_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-400">Retención</span>
          <input type="date" value={retencion} onChange={(e) => setRetencion(e.target.value)} className={inputCls} />
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-200">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => onGuardar({ titulo: titulo || null, region: region || null, hallazgos: hallazgos || null, impresion: impresion || null, tipo, estado, retencion_hasta: retencion || null })}
          disabled={guardando}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button onClick={onCancelar} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
          Cancelar
        </button>
      </div>
    </div>
  )
}
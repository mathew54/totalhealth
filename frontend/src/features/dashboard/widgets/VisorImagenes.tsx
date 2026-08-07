import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import Widget from './Widget'
import { PacientePicker, type PacienteMini } from './PacientePicker'

interface Imagen {
  id: string
  url: string
  tipo: string
  region: string | null
  descripcion: string | null
  created_at: string
  paciente_nombre: string | null
}

const TIPO_LABEL: Record<string, string> = {
  rx: 'Rx', ecografia: 'Ecografía', tomografia: 'TC', resonancia: 'RM', foto: 'Foto', otro: 'Otro',
}

/** Visor de imágenes clínicas del paciente con zoom y desplazamiento. */
export function VisorImagenes() {
  const [paciente, setPaciente] = useState<PacienteMini | null>(null)
  const [abierta, setAbierta] = useState<Imagen | null>(null)
  const [zoom, setZoom] = useState(1)
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [pos, setPos] = useState({ tx: 0, ty: 0 })

  const { data: imagenes = [], isLoading } = useQuery<Imagen[]>({
    queryKey: ['imagenes', paciente?.id],
    queryFn: async () => (await api.get(`/imagenes?paciente_id=${paciente!.id}`)).data,
    enabled: !!paciente,
  })

  function abrir(img: Imagen) {
    setAbierta(img)
    setZoom(1)
    setPos({ tx: 0, ty: 0 })
  }

  return (
    <Widget titulo="Visor de imágenes" descripcion="Imágenes clínicas del paciente (Rx, eco, TC, RM)">
      {!paciente ? (
        <PacientePicker value={null} onChange={setPaciente} />
      ) : (
        <div className="space-y-2">
          <PacientePicker value={paciente} onChange={(p) => { setPaciente(p); setAbierta(null) }} />
          {isLoading ? (
            <p className="py-4 text-center text-xs text-slate-500">Cargando…</p>
          ) : imagenes.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">Sin imágenes para este paciente.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {imagenes.map((img) => (
                <button key={img.id} onClick={() => abrir(img)} className="group relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={img.url} alt={img.descripcion ?? 'Imagen clínica'} className="h-20 w-full object-cover transition group-hover:scale-105" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium uppercase text-white">
                    {TIPO_LABEL[img.tipo] ?? img.tipo}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {abierta && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90"
          onClick={() => setAbierta(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <div className="text-sm">
              <span className="font-semibold">{TIPO_LABEL[abierta.tipo] ?? abierta.tipo}</span>
              {abierta.region && <span className="ml-2 text-slate-300">{abierta.region}</span>}
              {abierta.descripcion && <p className="text-xs text-slate-400">{abierta.descripcion}</p>}
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20">−</button>
              <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))} className="rounded bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20">+</button>
              <button onClick={() => { setZoom(1); setPos({ tx: 0, ty: 0 }) }} className="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">Ajustar</button>
              <button onClick={() => setAbierta(null)} className="ml-2 text-xl hover:text-slate-300">×</button>
            </div>
          </div>
          <div
            className="flex flex-1 cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
            onPointerDown={(e) => { arrastre.current = { x: e.clientX, y: e.clientY, tx: pos.tx, ty: pos.ty }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
            onPointerMove={(e) => {
              if (!arrastre.current) return
              const dx = e.clientX - arrastre.current.x
              const dy = e.clientY - arrastre.current.y
              setPos({ tx: arrastre.current.tx + dx, ty: arrastre.current.ty + dy })
            }}
            onPointerUp={() => { arrastre.current = null }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={abierta.url}
              alt={abierta.descripcion ?? 'Imagen clínica'}
              draggable={false}
              style={{ transform: `translate(${pos.tx}px, ${pos.ty}px) scale(${zoom})`, transition: arrastre.current ? 'none' : 'transform 80ms' }}
              className="max-h-[calc(100vh-90px)] max-w-full select-none"
            />
          </div>
        </div>
      )}
    </Widget>
  )
}

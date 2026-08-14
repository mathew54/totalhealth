import { useCallback, useMemo, useRef, useState } from 'react'
import { PRESETS_VENTANA, TIPO_LABELS_CORTOS, type EstudioImagen, type ImagenClinica } from '../types'

interface Punto { x: number; y: number }

interface Anotacion {
  id: string
  tipo: 'distancia' | 'angulo' | 'flecha' | 'texto'
  a: Punto
  b: Punto
  texto?: string
}

type Herramienta = 'mover' | 'distancia' | 'angulo' | 'flecha' | 'texto' | 'borrar'

const HERRAMIENTAS: { id: Herramienta; label: string }[] = [
  { id: 'mover', label: 'Mover' },
  { id: 'distancia', label: 'Distancia' },
  { id: 'angulo', label: 'Ángulo' },
  { id: 'flecha', label: 'Flecha' },
  { id: 'texto', label: 'Texto' },
  { id: 'borrar', label: 'Borrar' },
]

function anguloEntre(a: Punto, b: Punto, c: Punto): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y)
  const bc = Math.hypot(c.x - b.x, c.y - b.y)
  const ac = Math.hypot(c.x - a.x, c.y - a.y)
  if (ab === 0 || bc === 0) return 0
  const cos = (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)
  return Math.round((Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI)
}

export function CanvasPane({
  estudio,
  imagenes,
  pacienteNombre,
  registrarAcceso,
  puedeEditar = false,
  onEliminarImagen,
}: {
  estudio: EstudioImagen
  imagenes: ImagenClinica[]
  pacienteNombre: string
  registrarAcceso: (accion: string) => void
  puedeEditar?: boolean
  onEliminarImagen?: (img: ImagenClinica) => void
}) {
  const [indice, setIndice] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ tx: 0, ty: 0 })
  const [rot, setRot] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [invertir, setInvertir] = useState(false)
  const [brillo, setBrillo] = useState(1)
  const [contraste, setContraste] = useState(1)
  const [herramienta, setHerramienta] = useState<Herramienta>('mover')
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([])
  const [enDibujo, setEnDibujo] = useState<Anotacion | null>(null)
  const [dibujando, setDibujando] = useState(false)
  const [anotar, setAnotar] = useState(true)
  const [natural, setNatural] = useState({ w: 600, h: 400 })
  const svgRef = useRef<SVGSVGElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const img = imagenes[Math.min(indice, Math.max(0, imagenes.length - 1))]
  const preset = PRESETS_VENTANA[estudio.tipo] ?? PRESETS_VENTANA.otro

  const filtro = useMemo(() => {
    const parts = [`brightness(${brillo})`, `contrast(${contraste})`]
    if (invertir) parts.push('invert(1)')
    return parts.join(' ')
  }, [brillo, contraste, invertir])

  const transforme = useMemo(() => {
    const t = []
    if (flipH) t.push('scaleX(-1)')
    if (flipV) t.push('scaleY(-1)')
    if (rot) t.push(`rotate(${rot}deg)`)
    return t.join(' ')
  }, [flipH, flipV, rot])

  function coordenadaSvg(e: React.PointerEvent): Punto {
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const escala = svg.viewBox.baseVal.width / rect.width
    return { x: (e.clientX - rect.left) * escala, y: (e.clientY - rect.top) * escala }
  }

  const iniciarDibujo = useCallback(
    (e: React.PointerEvent) => {
      if (herramienta === 'mover') {
        arrastre.current = { x: e.clientX, y: e.clientY, tx: pos.tx, ty: pos.ty }
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        return
      }
      if (herramienta === 'borrar') return
      const p = coordenadaSvg(e)
      if (herramienta === 'texto') {
        const texto = window.prompt('Texto de la anotación:')
        if (texto) {
          setAnotaciones((prev) => [...prev, { id: crypto.randomUUID(), tipo: 'texto', a: p, b: p, texto }])
        }
        return
      }
      setDibujando(true)
      setEnDibujo({ id: crypto.randomUUID(), tipo: herramienta as 'distancia' | 'angulo' | 'flecha', a: p, b: p })
    },
    [herramienta, pos],
  )

  const moverDibujo = useCallback(
    (e: React.PointerEvent) => {
      if (arrastre.current) {
        const dx = e.clientX - arrastre.current.x
        const dy = e.clientY - arrastre.current.y
        setPos({ tx: arrastre.current.tx + dx, ty: arrastre.current.ty + dy })
        return
      }
      if (dibujando && enDibujo) {
        setEnDibujo((d) => (d ? { ...d, b: coordenadaSvg(e) } : d))
      }
    },
    [dibujando, enDibujo],
  )

  const soltarDibujo = useCallback(
    (e: React.PointerEvent) => {
      if (arrastre.current) {
        arrastre.current = null
        return
      }
      if (dibujando && enDibujo) {
        setAnotaciones((prev) => [...prev, enDibujo])
        setEnDibujo(null)
        setDibujando(false)
      } else if (herramienta === 'borrar' && imgRef.current) {
        const p = coordenadaSvg(e)
        setAnotaciones((prev) => prev.filter((a) => Math.hypot(a.a.x - p.x, a.a.y - p.y) > 12 && Math.hypot(a.b.x - p.x, a.b.y - p.y) > 12))
      }
    },
    [dibujando, enDibujo, herramienta],
  )

  const exportarImagen = useCallback(
    (anonima: boolean) => {
      if (!img) return
      const im = new Image()
      im.onload = () => {
        const escala = 2
        const canvas = document.createElement('canvas')
        canvas.width = im.naturalWidth * escala
        canvas.height = im.naturalHeight * escala
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height)
        if (!anonima) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          ctx.fillRect(0, canvas.height - 48 * escala, canvas.width, 48 * escala)
          ctx.fillStyle = '#ffffff'
          ctx.font = `${16 * escala}px sans-serif`
          ctx.fillText(`${pacienteNombre} · ${new Date(estudio.fecha_estudio).toLocaleDateString()}`, 12 * escala, canvas.height - 16 * escala)
          ctx.fillStyle = '#94a3b8'
          ctx.fillText(`${TIPO_LABELS_CORTOS[estudio.tipo] ?? estudio.tipo}${estudio.region ? ` · ${estudio.region}` : ''}`, 12 * escala, canvas.height - 34 * escala)
        }
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `imagen_${anonima ? 'anonima' : estudio.titulo?.toLowerCase().replace(/\s+/g, '_') || 'estudio'}_${Date.now()}.png`
        a.click()
      }
      im.src = img.url
      registrarAcceso('exportar')
    },
    [img, estudio, pacienteNombre, registrarAcceso],
  )

  const exportarInforme = useCallback(() => {
    const w = window.open('', '_blank')
    if (!w) return
    const imgs = imagenes.map((i) => `<figure style="margin:8px 0"><img src="${i.url}" style="max-width:100%;border:1px solid #ddd;border-radius:8px"/><figcaption style="font-size:12px;color:#555">Corte ${i.orden}${i.descripcion ? ` — ${i.descripcion}` : ''}</figcaption></figure>`).join('')
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de estudio</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:24px auto;color:#111">
<h1>${estudio.titulo ?? 'Estudio de imagen'}</h1>
<p style="color:#555"><strong>Paciente:</strong> ${pacienteNombre} · <strong>Fecha:</strong> ${new Date(estudio.fecha_estudio).toLocaleString()} · <strong>Tipo:</strong> ${TIPO_LABELS_CORTOS[estudio.tipo] ?? estudio.tipo}${estudio.region ? ` · <strong>Región:</strong> ${estudio.region}` : ''}</p>
${estudio.hallazgos ? `<h2>Hallazgos</h2><p>${estudio.hallazgos}</p>` : ''}
${estudio.impresion ? `<h2>Impresión</h2><p>${estudio.impresion}</p>` : ''}
<h2>Imágenes (${imagenes.length})</h2>${imgs}
<p style="color:#aaa;font-size:11px;margin-top:24px">Generado por TotalHealth · ${new Date().toLocaleString()}</p>
</body></html>`)
    w.document.close()
    w.print()
    registrarAcceso('exportar')
  }, [imagenes, estudio, pacienteNombre, registrarAcceso])

  const aplicarPreset = useCallback((p: { brillo: number; contraste: number }) => {
    setBrillo(p.brillo)
    setContraste(p.contraste)
  }, [])

  if (!img) {
    return (
      <div className="flex items-center justify-center bg-slate-950 p-6 text-xs text-slate-500">
        Sin imágenes en este estudio.
      </div>
    )
  }

  const paso = 0.25

  return (
    <div className="flex flex-col overflow-hidden">
      <div
        className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `translate(${pos.tx}px, ${pos.ty}px) scale(${zoom})` }}
        >
          <div style={{ transform: transforme }} className="relative">
            <img
              ref={imgRef}
              src={img.url}
              alt={`Corte ${img.orden}`}
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget
                setNatural({ w: el.naturalWidth || 600, h: el.naturalHeight || 400 })
              }}
              style={{ filter: filtro, maxHeight: 'calc(100vh - 240px)', maxWidth: '100%' }}
              className="select-none"
            />
            {anotar && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${natural.w} ${natural.h}`}
                className="absolute inset-0 h-full w-full"
                onPointerDown={iniciarDibujo}
                onPointerMove={moverDibujo}
                onPointerUp={soltarDibujo}
              >
                <g stroke="#f43f5e" strokeWidth="2" fill="none" pointerEvents="none">
                  {anotaciones.map((a) => (
                    <AnotacionSvg key={a.id} an={a} />
                  ))}
                  {enDibujo && <AnotacionSvg an={enDibujo} />}
                </g>
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={herramienta}
            onChange={(e) => setHerramienta(e.target.value as Herramienta)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
          >
            {HERRAMIENTAS.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={anotar} onChange={(e) => setAnotar(e.target.checked)} className="accent-brand-500" />
            Anotar
          </label>
          <button onClick={() => setAnotaciones([])} className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">
            Limpiar
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Zoom</span>
            <button onClick={() => setZoom((z) => Math.max(0.5, +(z - paso).toFixed(2)))} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700">−</button>
            <span className="w-10 text-center text-slate-300">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(5, +(z + paso).toFixed(2)))} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700">+</button>
            <button onClick={() => { setZoom(1); setPos({ tx: 0, ty: 0 }) }} className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700">Ajustar</button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">Rotar</span>
            <button onClick={() => setRot((r) => (r + 90) % 360)} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700">90°</button>
            <button onClick={() => setFlipH((f) => !f)} className={`rounded px-2 py-0.5 ${flipH ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>↔</button>
            <button onClick={() => setFlipV((f) => !f)} className={`rounded px-2 py-0.5 ${flipV ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>↕</button>
            <button onClick={() => setInvertir((v) => !v)} className={`rounded px-2 py-0.5 ${invertir ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>Invertir</button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">Ventana</span>
            <input type="range" min="0.4" max="2" step="0.05" value={brillo} onChange={(e) => setBrillo(Number(e.target.value))} className="w-20 accent-brand-500" title="Brillo" />
            <input type="range" min="0.4" max="2.4" step="0.05" value={contraste} onChange={(e) => setContraste(Number(e.target.value))} className="w-20 accent-brand-500" title="Contraste" />
            <button onClick={() => aplicarPreset(preset)} className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700">Preset</button>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => exportarImagen(false)} className="rounded bg-brand-700 px-2 py-0.5 text-white hover:bg-brand-600">Descargar</button>
            <button onClick={() => exportarImagen(true)} title="Sin datos del paciente" className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700">Anónima</button>
            <button onClick={exportarInforme} className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700">Informe</button>
          </div>
        </div>

        {imagenes.length > 1 && (
          <div className="mt-2 flex items-center gap-1 overflow-x-auto">
            {imagenes.map((im, i) => (
              <div key={im.id} className="relative shrink-0">
                <button
                  onClick={() => setIndice(i)}
                  className={`overflow-hidden rounded border ${i === indice ? 'border-brand-500' : 'border-slate-700'}`}
                >
                  <img src={im.url} alt={`Corte ${im.orden}`} className="h-10 w-14 object-cover" />
                </button>
                {puedeEditar && onEliminarImagen && (
                  <button
                    onClick={() => onEliminarImagen(im)}
                    title="Eliminar imagen"
                    className="absolute -right-1 -top-1 rounded-full bg-red-700 px-1 text-[9px] text-white hover:bg-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AnotacionSvg({ an }: { an: Anotacion }) {
  if (an.tipo === 'distancia') {
    const d = Math.round(Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y))
    return (
      <g>
        <line x1={an.a.x} y1={an.a.y} x2={an.b.x} y2={an.b.y} />
        <circle cx={an.a.x} cy={an.a.y} r="4" fill="#f43f5e" />
        <circle cx={an.b.x} cy={an.b.y} r="4" fill="#f43f5e" />
        <text x={(an.a.x + an.b.x) / 2} y={(an.a.y + an.b.y) / 2 - 6} fill="#fff" stroke="#000" strokeWidth="0.5" fontSize="14">{d}px</text>
      </g>
    )
  }
  if (an.tipo === 'angulo') {
    const c = an.b
    const d = Math.round(anguloEntre(an.a, c, an.b))
    return (
      <g>
        <line x1={an.a.x} y1={an.a.y} x2={c.x} y2={c.y} />
        <line x1={c.x} y1={c.y} x2={an.a.x * 2 - c.x} y2={an.a.y * 2 - c.y} strokeDasharray="4 4" opacity="0.5" />
        <circle cx={c.x} cy={c.y} r="4" fill="#f43f5e" />
        <text x={c.x + 8} y={c.y - 8} fill="#fff" stroke="#000" strokeWidth="0.5" fontSize="14">{d}°</text>
      </g>
    )
  }
  if (an.tipo === 'flecha') {
    const ang = Math.atan2(an.b.y - an.a.y, an.b.x - an.a.x)
    const largo = 12
    const punta = (da: number) => ({
      x: an.b.x - largo * Math.cos(ang + da),
      y: an.b.y - largo * Math.sin(ang + da),
    })
    const p1 = punta(Math.PI / 6)
    const p2 = punta(-Math.PI / 6)
    return (
      <g>
        <line x1={an.a.x} y1={an.a.y} x2={an.b.x} y2={an.b.y} />
        <line x1={an.b.x} y1={an.b.y} x2={p1.x} y2={p1.y} />
        <line x1={an.b.x} y1={an.b.y} x2={p2.x} y2={p2.y} />
        <circle cx={an.a.x} cy={an.a.y} r="4" fill="#f43f5e" />
      </g>
    )
  }
  return (
    <text x={an.a.x} y={an.a.y} fill="#f43f5e" fontSize="18" stroke="#000" strokeWidth="0.6">
      {an.texto ?? ''}
    </text>
  )
}
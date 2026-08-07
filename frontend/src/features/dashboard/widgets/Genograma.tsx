import { useMemo, useState, type ReactElement } from 'react'
import Widget from './Widget'

interface Persona {
  id: string
  nombre: string
  sexo: 'M' | 'F'
  condiciones: string[]
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

const SLOT = 150
const Y0 = 46, Y1 = 140, Y2 = 234
const R = 12

interface Nodo { p: Persona; x: number; y: number }

function construirNodos(proband: Persona, personas: Persona[], parejas: [string, string][], hijos: [string, string][]): { nodos: Nodo[]; lineas: ReactElement[]; ancho: number } {
  const porId = new Map(personas.map((p) => [p.id, p]))
  const parejaDe = (id: string): string | undefined => {
    const f = parejas.find(([a, b]) => a === id || b === id)
    return f ? (f[0] === id ? f[1] : f[0]) : undefined
  }
  const hijosDe = (id: string): Persona[] =>
    personas.filter((p) => p.id !== id && hijos.some(([padre, hijo]) => padre === id && hijo === p.id))

  const root = porId.get(proband.id)!
  const rootPareja = parejaDe(root.id) ? porId.get(parejaDe(root.id)!)! : null
  const childIds = [...new Set([...hijosDe(root.id), ...(rootPareja ? hijosDe(rootPareja.id) : [])].map((p) => p.id))]
  const nHijos = childIds.length

  const nodos: Nodo[] = []
  const lineas: ReactElement[] = []

  // Generación 0: pareja índice (centrada)
  const cx0 = (nHijos * SLOT) / 2
  const y0 = Y0
  const addNodo = (p: Persona, x: number, y: number) => nodos.push({ p, x, y })
  if (rootPareja) {
    // orden: mujer a la izquierda por convención genograma
    const izq = rootPareja.sexo === 'F' ? rootPareja : root
    const der = izq === root ? rootPareja : root
    addNodo(izq, cx0 - R - 8, y0)
    addNodo(der, cx0 + R + 8, y0)
    lineas.push(<line key="p0" x1={cx0 - R} y1={y0} x2={cx0 + R} y2={y0} stroke="#475569" strokeWidth={1.5} />)
  } else {
    addNodo(root, cx0, y0)
  }

  // Generación 1: hijos de la pareja índice
  const hijosNodos: Nodo[] = []
  childIds.forEach((cid, i) => {
    const hijo = porId.get(cid)!
    const parejaHijo = parejaDe(cid) ? porId.get(parejaDe(cid)!)! : null
    const cx = i * SLOT + SLOT / 2
    if (parejaHijo) {
      const izq = parejaHijo.sexo === 'F' ? parejaHijo : hijo
      const der = izq === hijo ? parejaHijo : hijo
      addNodo(izq, cx - R - 8, Y1)
      addNodo(der, cx + R + 8, Y1)
      lineas.push(<line key={`ph-${cid}`} x1={cx - R} y1={Y1} x2={cx + R} y2={Y1} stroke="#475569" strokeWidth={1.5} />)
      hijosNodos.push({ p: hijo, x: cx + R + 8, y: Y1 })
    } else {
      addNodo(hijo, cx, Y1)
      hijosNodos.push({ p: hijo, x: cx, y: Y1 })
    }

    // Generación 2: nietos del hijo
    const nietos = [...new Set([...hijosDe(hijo.id), ...(parejaHijo ? hijosDe(parejaHijo.id) : [])].map((p) => p.id))]
    const nNietos = nietos.length
    nietos.forEach((gid, j) => {
      const nieto = porId.get(gid)!
      const gx = cx + (nNietos > 1 ? ((j + 0.5) - nNietos / 2) * 60 : 0)
      addNodo(nieto, gx, Y2)
      lineas.push(<line key={`gn-${gid}`} x1={gx} y1={Y2 - R} x2={gx} y2={Y1 + R} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />)
    })
  })

  // Línea padre→hijos (gen 0 a gen 1): bajada del centro de la pareja índice y reparto
  if (nHijos > 0) {
    const cxPadre = rootPareja ? cx0 : cx0
    lineas.push(<line key="c0" x1={cxPadre} y1={y0 + R} x2={cxPadre} y2={Y1 - R} stroke="#94a3b8" strokeWidth={1} />)
    if (nHijos > 1) {
      const x0h = hijosNodos[0].x
      const x1h = hijosNodos[nHijos - 1].x
      lineas.push(<line key="b0" x1={x0h} y1={Y1 - R} x2={x1h} y2={Y1 - R} stroke="#94a3b8" strokeWidth={1} />)
    }
    for (const hn of hijosNodos) {
      lineas.push(<line key={`v0-${hn.p.id}`} x1={hn.x} y1={Y1 - R} x2={hn.x} y2={Y1 - R} stroke="#94a3b8" strokeWidth={0} />)
    }
  }

  const ancho = Math.max(cx0 * 2 + 60, nHijos * SLOT + 60)
  void Y2
  return { nodos, lineas, ancho }
}

interface LayoutResult extends ReturnType<typeof construirNodos> {
  ancho: number
}

/** Genograma familiar: árbol de 3 generaciones anotable (client-side). */
export function Genograma() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [parejas, setParejas] = useState<[string, string][]>([])
  const [hijos, setHijos] = useState<[string, string][]>([])

  const [nombre, setNombre] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F'>('F')
  const [condiciones, setCondiciones] = useState('')
  const [vinculo, setVinculo] = useState<'proband' | 'pareja' | 'hijo'>('proband')
  const [seleccionado, setSeleccionado] = useState('')

  const root = personas[0]

  const layout = useMemo<LayoutResult | null>(() => {
    if (!root) return null
    return construirNodos(root, personas, parejas, hijos) as LayoutResult
  }, [root, personas, parejas, hijos])

  function agregar() {
    if (!nombre.trim()) return
    if (personas.length === 0) {
      setPersonas([{ id: crypto.randomUUID(), nombre: nombre.trim(), sexo, condiciones: condiciones.split(',').map((c) => c.trim()).filter(Boolean) }])
    } else {
      const nueva: Persona = { id: crypto.randomUUID(), nombre: nombre.trim(), sexo, condiciones: condiciones.split(',').map((c) => c.trim()).filter(Boolean) }
      setPersonas((ps) => [...ps, nueva])
      if (vinculo === 'pareja' && seleccionado) {
        setParejas((p) => [...p, [seleccionado, nueva.id]])
      } else if (vinculo === 'hijo' && seleccionado) {
        setHijos((h) => [...h, [seleccionado, nueva.id]])
      }
    }
    setNombre('')
    setCondiciones('')
  }

  function reiniciar() {
    setPersonas([]); setParejas([]); setHijos([])
  }

  return (
    <Widget titulo="Genograma familiar" descripcion="Árbol de 3 generaciones con condiciones">
      <div className="space-y-2">
        {personas.length === 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del paciente índice" className={inputCls} />
              <div className="flex gap-1">
                {(['F', 'M'] as const).map((s) => (
                  <button key={s} onClick={() => setSexo(s)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${sexo === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>{s === 'F' ? 'Mujer' : 'Hombre'}</button>
                ))}
              </div>
            </div>
            <input value={condiciones} onChange={(e) => setCondiciones(e.target.value)} placeholder="Condiciones (separadas por coma): HTA, DM2…" className={inputCls} />
            <button onClick={agregar} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Crear probando</button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={inputCls} />
              <div className="flex gap-1">
                {(['F', 'M'] as const).map((s) => (
                  <button key={s} onClick={() => setSexo(s)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${sexo === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>{s === 'F' ? 'Mujer' : 'Hombre'}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <select value={vinculo} onChange={(e) => setVinculo(e.target.value as typeof vinculo)} className={inputCls}>
                <option value="pareja">Pareja de…</option>
                <option value="hijo">Hijo(a) de…</option>
              </select>
              <select value={seleccionado} onChange={(e) => setSeleccionado(e.target.value)} className={inputCls}>
                <option value="">— seleccione —</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.sexo === 'M' ? '(H)' : '(M)'}</option>)}
              </select>
            </div>
            <input value={condiciones} onChange={(e) => setCondiciones(e.target.value)} placeholder="Condiciones: HTA, DM2…" className={inputCls} />
            <button onClick={agregar} disabled={!nombre.trim() || !seleccionado} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              Agregar miembro
            </button>

            {layout && (
              <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
                <svg width={Math.max(layout.ancho, 320)} height={270} viewBox={`0 0 ${Math.max(layout.ancho, 320)} 270`}>
                  {layout.lineas}
                  {layout.nodos.map(({ p, x, y }) => (
                    <g key={p.id} transform={`translate(${x} ${y})`}>
                      {p.condiciones.length > 0 && <circle r={R + 3} fill="none" stroke="#ef4444" strokeWidth={1.5} />}
                      {p.sexo === 'F'
                        ? <circle r={R} fill="#fda4af" stroke="#be123c" strokeWidth={1.5} />
                        : <rect x={-R} y={-R} width={R * 2} height={R * 2} fill="#93c5fd" stroke="#1d4ed8" strokeWidth={1.5} />}
                      <text y={R + 10} textAnchor="middle" fontSize={8} fill="#334155">{p.nombre}</text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400">Mujer ○ · Hombre □ · Anillo rojo = condición relevante. Herramienta de planificación local.</p>
              <button onClick={reiniciar} className="text-xs text-slate-400 hover:text-red-600">Reiniciar</button>
            </div>
          </>
        )}
      </div>
    </Widget>
  )
}

import { useMemo, useState } from 'react'
import { Line, LineChart, CartesianGrid, ReferenceDot, Tooltip, XAxis, YAxis } from 'recharts'
import Widget from './Widget'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Punto {
  edad: number
  P3: number
  P15: number
  P50: number
  P85: number
  P97: number
}

// Referencia: WHO Child Growth Standards (2006), peso por edad 0–60 meses.
const PESO: Record<'M' | 'F', [number, number, number, number, number, number][]> = {
  M: [
    [0, 2.5, 2.9, 3.3, 3.9, 4.3], [1, 3.4, 3.9, 4.5, 5.1, 5.7], [2, 4.4, 4.9, 5.6, 6.3, 7.0],
    [3, 5.0, 5.7, 6.4, 7.2, 7.9], [4, 5.6, 6.2, 7.0, 7.9, 8.7], [5, 6.0, 6.7, 7.5, 8.4, 9.3],
    [6, 6.4, 7.1, 7.9, 8.9, 9.8], [9, 7.1, 8.0, 8.9, 10.0, 11.0], [12, 7.7, 8.6, 9.6, 10.8, 12.0],
    [18, 8.8, 9.8, 10.9, 12.3, 13.7], [24, 9.7, 10.9, 12.2, 13.7, 15.3], [36, 11.3, 12.7, 14.3, 16.2, 18.3],
    [48, 12.9, 14.5, 16.3, 18.5, 20.9], [60, 14.6, 16.4, 18.3, 20.9, 23.9],
  ],
  F: [
    [0, 2.4, 2.8, 3.2, 3.7, 4.2], [1, 3.2, 3.6, 4.2, 4.8, 5.5], [2, 4.0, 4.5, 5.1, 5.9, 6.6],
    [3, 4.5, 5.2, 5.8, 6.6, 7.4], [4, 5.0, 5.7, 6.4, 7.3, 8.2], [5, 5.4, 6.1, 6.9, 7.8, 8.8],
    [6, 5.7, 6.5, 7.3, 8.3, 9.3], [9, 6.6, 7.4, 8.2, 9.3, 10.4], [12, 7.0, 8.0, 8.9, 10.1, 11.5],
    [18, 8.2, 9.2, 10.2, 11.6, 13.0], [24, 9.0, 10.2, 11.5, 13.1, 14.9], [36, 10.8, 12.1, 13.9, 16.0, 18.6],
    [48, 12.4, 13.9, 16.1, 18.6, 21.8], [60, 14.0, 15.8, 18.2, 21.3, 25.0],
  ],
}

// Referencia WHO 2006, longitud/talla por edad (P3 / P50 / P97), 0–60 meses.
const TALLA: Record<'M' | 'F', [number, number, number, number][]> = {
  M: [
    [0, 46.3, 49.9, 53.4], [6, 63.3, 67.6, 71.9], [12, 71.0, 75.7, 80.5], [18, 77.5, 82.3, 87.4],
    [24, 81.0, 87.1, 93.2], [36, 88.7, 96.1, 103.5], [48, 96.4, 103.3, 110.2], [60, 102.4, 110.0, 117.7],
  ],
  F: [
    [0, 45.4, 49.1, 52.9], [6, 61.2, 65.7, 70.3], [12, 69.2, 74.0, 79.2], [18, 76.0, 80.7, 85.7],
    [24, 79.4, 85.7, 92.2], [36, 87.4, 95.1, 103.0], [48, 95.4, 102.7, 110.1], [60, 101.8, 109.4, 117.1],
  ],
}

function interpolar(rows: number[][], edad: number, idx: number): number {
  if (edad <= rows[0][0]) return rows[0][idx]
  for (let i = 1; i < rows.length; i++) {
    if (edad <= rows[i][0]) {
      const [a, b] = [rows[i - 1][0], rows[i][0]]
      const t = (edad - a) / (b - a)
      return rows[i - 1][idx] + (rows[i][idx] - rows[i - 1][idx]) * t
    }
  }
  return rows[rows.length - 1][idx]
}

function curva(sexo: 'M' | 'F', medida: 'peso' | 'talla'): Punto[] {
  // peso: [edad, P3, P15, P50, P85, P97] · talla: P15/P85 se igualan a P50
  const rows = medida === 'peso'
    ? PESO[sexo]
    : TALLA[sexo].map(([e, p3, p50, p97]) => [e, p3, p50, p50, p50, p97])
  const edades = rows.map((r) => r[0])
  return edades.map((e) => ({
    edad: e,
    P3: interpolar(rows, e, 1),
    P15: interpolar(rows, e, 2),
    P50: interpolar(rows, e, 3),
    P85: interpolar(rows, e, 4),
    P97: interpolar(rows, e, 5),
  }))
}

/** Curvas de crecimiento OMS/CDC: percentiles por edad, sexo y medida. */
export function CurvasCrecimiento() {
  const [sexo, setSexo] = useState<'M' | 'F'>('M')
  const [medida, setMedida] = useState<'peso' | 'talla'>('peso')
  const [edad, setEdad] = useState('')
  const [valor, setValor] = useState('')

  const datos = useMemo(() => curva(sexo, medida), [sexo, medida])

  const clasificacion = useMemo(() => {
    const e = parseFloat(edad)
    const v = parseFloat(valor)
    if (!e || !v || e < 0 || e > 60) return null
    const filas = medida === 'peso' ? PESO[sexo] : TALLA[sexo]
    const p3 = interpolar(filas, e, 1)
    const p50 = interpolar(filas, e, medida === 'peso' ? 3 : 2)
    const p97 = interpolar(filas, e, medida === 'peso' ? 5 : 3)
    const p15 = medida === 'peso' ? interpolar(filas, e, 2) : p50
    const p85 = medida === 'peso' ? interpolar(filas, e, 4) : p50
    let banda = ''
    let color = 'text-slate-600'
    if (medida === 'peso') {
      if (v < p3) { banda = '< P3 (riesgo de desnutrición)'; color = 'text-red-600' }
      else if (v < p15) { banda = 'P3–P15'; color = 'text-amber-600' }
      else if (v < p85) { banda = 'P15–P85 (adecuado)'; color = 'text-emerald-600' }
      else if (v < p97) { banda = 'P85–P97'; color = 'text-amber-600' }
      else { banda = '≥ P97 (riesgo de exceso)'; color = 'text-red-600' }
    } else {
      if (v < p3) { banda = '< P3'; color = 'text-red-600' }
      else if (v < p97) { banda = 'P3–P97 (adecuado)'; color = 'text-emerald-600' }
      else { banda = '≥ P97'; color = 'text-red-600' }
    }
    return { banda, color, p3, p50, p97 }
  }, [sexo, medida, edad, valor])

  const punto = useMemo(() => {
    const e = parseFloat(edad)
    const v = parseFloat(valor)
    if (!e || !v || e < 0 || e > 60) return null
    return { edad: e, valor: v }
  }, [edad, valor])

  const COLORS = { P3: '#cbd5e1', P15: '#94a3b8', P50: '#0ea5e9', P85: '#94a3b8', P97: '#cbd5e1' }

  return (
    <Widget titulo="Curvas de crecimiento" descripcion="Percentiles OMS (0–60 meses)">
      <div className="mb-2 flex gap-2">
        {(['M', 'F'] as const).map((s) => (
          <button key={s} onClick={() => setSexo(s)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${sexo === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>
            {s === 'M' ? 'Niño' : 'Niña'}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-2">
        {([['peso', 'Peso (kg)'], ['talla', 'Talla (cm)']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setMedida(val)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${medida === val ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-600">
          Edad (meses)
          <input type="number" value={edad} onChange={(e) => setEdad(e.target.value)} min="0" max="60" className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Valor
          <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} min="0" step="0.1" className={`${inputCls} mt-1`} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <LineChart width={520} height={200} data={datos} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="edad" type="number" domain={[0, 60]} tickCount={6} stroke="#94a3b8" fontSize={10} />
          <YAxis domain={['auto', 'auto']} stroke="#94a3b8" fontSize={10} />
          <Tooltip />
          {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[k]} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          ))}
          {punto && <ReferenceDot x={punto.edad} y={punto.valor} r={4} fill="#ef4444" stroke="#fff" />}
        </LineChart>
      </div>
      {clasificacion && (
        <div className="rounded-lg bg-slate-50 p-3 text-center text-sm">
          Percentil: <span className={`font-semibold ${clasificacion.color}`}>{clasificacion.banda}</span>
          <p className="mt-1 text-[10px] text-slate-400">P50 ≈ {clasificacion.p50.toFixed(1)} · P3 ≈ {clasificacion.p3.toFixed(1)} · P97 ≈ {clasificacion.p97.toFixed(1)}</p>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Referencia: WHO Child Growth Standards (2006), interpolación lineal entre edades de la tabla. Cribado; interpretar con el gráfico oficial.</p>
    </Widget>
  )
}

import { useMemo, useState } from 'react'
import Widget from './Widget'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

function Campo({ label, value, onChange, type = 'number', step, min }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  step?: string
  min?: string
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} mt-1`}
      />
    </label>
  )
}

/** IMC: peso (kg) / talla (m)² con clasificación OMS. */
export function CalculoIMC() {
  const [peso, setPeso] = useState('')
  const [talla, setTalla] = useState('')
  const imc = useMemo(() => {
    const p = parseFloat(peso)
    const t = parseFloat(talla)
    if (!p || !t || p <= 0 || t <= 0) return null
    return p / (t * t)
  }, [peso, talla])

  const clasificacion = useMemo(() => {
    if (imc === null) return null
    if (imc < 18.5) return { label: 'Bajo peso', color: 'text-sky-600' }
    if (imc < 25) return { label: 'Peso normal', color: 'text-emerald-600' }
    if (imc < 30) return { label: 'Sobrepeso', color: 'text-amber-600' }
    if (imc < 35) return { label: 'Obesidad grado I', color: 'text-orange-600' }
    if (imc < 40) return { label: 'Obesidad grado II', color: 'text-red-500' }
    return { label: 'Obesidad grado III', color: 'text-red-700' }
  }, [imc])

  return (
    <Widget titulo="Cálculo de IMC" descripcion="Clasificación OMS">
      <div className="space-y-3">
        <Campo label="Peso (kg)" value={peso} onChange={setPeso} step="0.1" min="0" />
        <Campo label="Talla (m)" value={talla} onChange={setTalla} step="0.01" min="0" />
        {imc !== null && (
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{imc.toFixed(1)} kg/m²</p>
            {clasificacion && <p className={`text-sm font-medium ${clasificacion.color}`}>{clasificacion.label}</p>}
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Dosis pediátrica: mg/kg/día repartida en tomas. */
export function CalculoDosisPediatrica() {
  const [peso, setPeso] = useState('')
  const [dosisKg, setDosisKg] = useState('')
  const [tomas, setTomas] = useState('2')

  const resultado = useMemo(() => {
    const p = parseFloat(peso)
    const d = parseFloat(dosisKg)
    const t = parseInt(tomas, 10)
    if (!p || !d || !t || p <= 0 || d <= 0 || t <= 0) return null
    const total = p * d
    return { total, porToma: total / t }
  }, [peso, dosisKg, tomas])

  return (
    <Widget titulo="Dosis pediátrica" descripcion="Dosis = mg/kg/día ÷ tomas">
      <div className="space-y-3">
        <Campo label="Peso (kg)" value={peso} onChange={setPeso} step="0.1" min="0" />
        <Campo label="Dosis (mg/kg/día)" value={dosisKg} onChange={setDosisKg} step="0.1" min="0" />
        <Campo label="Tomas al día" value={tomas} onChange={setTomas} min="1" />
        {resultado && (
          <div className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-700">
            <p>Total diario: <strong>{resultado.total.toFixed(1)} mg</strong></p>
            <p>Por toma: <strong>{resultado.porToma.toFixed(1)} mg</strong> (cada {Math.round(24 / parseInt(tomas, 10))} h)</p>
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Gestograma: semanas de gestación y fecha probable de parto (Naegele). */
export function Gestograma() {
  const [fur, setFur] = useState('')
  const fpp = useMemo(() => {
    if (!fur) return null
    const d = new Date(fur + 'T12:00:00')
    if (isNaN(d.getTime())) return null
    const fpp = new Date(d)
    fpp.setDate(fpp.getDate() + 280)
    return fpp
  }, [fur])

  const semanas = useMemo(() => {
    if (!fur) return null
    const furDate = new Date(fur + 'T12:00:00')
    if (isNaN(furDate.getTime())) return null
    const hoy = new Date()
    const dias = Math.floor((hoy.getTime() - furDate.getTime()) / 86400000)
    if (dias < 0) return 0
    return Math.floor(dias / 7)
  }, [fur])

  return (
    <Widget titulo="Gestograma" descripcion="Regla de Naegele (FUR)">
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">
          Fecha última regla (FUR)
          <input type="date" value={fur} onChange={(e) => setFur(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        {fur && fpp && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p>Semanas de gestación: <strong>{semanas} sem</strong></p>
            <p>FPP: <strong>{fpp.toLocaleDateString('es-VE')}</strong></p>
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Escala de Glasgow: respuesta ocular, verbal y motora. */
export function EscalaGlasgow() {
  const ocularOptions = ['1 — No abre', '2 — Al dolor', '3 — Al habla', '4 — Espontánea']
  const verbalOptions = ['1 — Ninguna', '2 — Sonidos', '3 — Palabras', '4 — Confusa/desorientada', '5 — Orientada']
  const motoraOptions = ['1 — Ninguna', '2 — Extensión', '3 — Flexión anómala', '4 — Retirada al dolor', '5 — Localiza dolor', '6 — Obedece órdenes']

  const [ocular, setOcular] = useState(0)
  const [verbal, setVerbal] = useState(0)
  const [motora, setMotora] = useState(0)

  const total = ocular + verbal + motora
  const interpretacion = total >= 13 ? { label: 'Lesión leve', color: 'text-emerald-600' }
    : total >= 9 ? { label: 'Lesión moderada', color: 'text-amber-600' }
    : { label: 'Lesión grave (≤8: coma)', color: 'text-red-600' }

  const Select = ({ label, options, value, onChange }: { label: string; options: string[]; value: number; onChange: (v: number) => void }) => (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className={`${inputCls} mt-1`}>
        <option value={0}>Seleccione…</option>
        {options.map((o, i) => (
          <option key={o} value={i + 1}>{o}</option>
        ))}
      </select>
    </label>
  )

  return (
    <Widget titulo="Escala de Glasgow" descripcion="Evaluación del nivel de conciencia">
      <div className="space-y-3">
        <Select label="Apertura ocular" options={ocularOptions} value={ocular} onChange={setOcular} />
        <Select label="Respuesta verbal" options={verbalOptions} value={verbal} onChange={setVerbal} />
        <Select label="Respuesta motora" options={motoraOptions} value={motora} onChange={setMotora} />
        {total > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{total}/15</p>
            <p className={`text-sm font-medium ${interpretacion.color}`}>{interpretacion.label}</p>
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Clearance de creatinina por Cockcroft-Gault. */
export function CalculoFiltradoGlomerular() {
  const [edad, setEdad] = useState('')
  const [peso, setPeso] = useState('')
  const [creatinina, setCreatinina] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F'>('M')

  const valor = useMemo(() => {
    const e = parseFloat(edad)
    const p = parseFloat(peso)
    const c = parseFloat(creatinina)
    if (!e || !p || !c || e <= 0 || p <= 0 || c <= 0) return null
    const raw = ((140 - e) * p) / (72 * c)
    return sexo === 'M' ? raw : raw * 0.85
  }, [edad, peso, creatinina, sexo])

  return (
    <Widget titulo="Filtrado glomerular" descripcion="Cockcroft-Gault (ml/min)">
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['M', 'F'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSexo(s)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                sexo === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
              }`}
            >
              {s === 'M' ? 'Masculino' : 'Femenino'}
            </button>
          ))}
        </div>
        <Campo label="Edad (años)" value={edad} onChange={setEdad} min="0" />
        <Campo label="Peso (kg)" value={peso} onChange={setPeso} step="0.1" min="0" />
        <Campo label="Creatinina sérica (mg/dl)" value={creatinina} onChange={setCreatinina} step="0.1" min="0" />
        {valor !== null && (
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{valor.toFixed(1)}</p>
            <p className="text-xs text-slate-500">ml/min</p>
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Lista de verificación quirúrgica OMS. */
export function ChecklistOMS() {
  const items = [
    'Identidad, sitio y procedimiento confirmados',
    'Consentimiento informado firmado',
    'Alergias conocidas declaradas',
    'Riesgo de vía aérea y aspiraciones evaluado',
    'Riesgo de pérdida sanguínea ≥ 500 ml evaluado',
    'Antibiótico profiláctico administrado (si aplica)',
    'Equipo quirúrgico completo y presente',
    'Estudios e imágenes disponibles y visibles',
    'Recuento de instrumental, gasas y agujas completo',
  ]
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const count = Object.values(marcados).filter(Boolean).length

  return (
    <Widget titulo="Checklist OMS" descripcion="Verificación quirúrgica segura">
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const id = `oms-${i}`
          return (
            <li key={id}>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={!!marcados[id]}
                  onChange={(e) => setMarcados((m) => ({ ...m, [id]: e.target.checked }))}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                />
                {item}
              </label>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        {count}/{items.length} verificados
      </p>
    </Widget>
  )
}

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
      <input type={type} value={value} min={min} step={step} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-1`} />
    </label>
  )
}

function Resultado({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-700">{children}</div>
}

function Toques({ items, marcas, onToggle }: { items: string[]; marcas: Record<string, boolean>; onToggle: (id: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const id = `t-${i}`
        return (
          <li key={id}>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={!!marcas[id]} onChange={() => onToggle(id)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-brand-600" />
              {item}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/** Riesgo cardiovascular: conteo de factores de riesgo (clasificación cualitativa). */
export function RiesgoCardiovascular() {
  const items = [
    'Tabaquismo actual',
    'Hipertensión arterial (≥140/90 o en tratamiento)',
    'Diabetes mellitus',
    'Dislipidemia (LDL alto o en tratamiento)',
    'Obesidad (IMC ≥ 30)',
    'Sedentarismo',
    'Historia familiar de enfermedad CV prematura',
    'Edad de riesgo (hombre ≥ 45 / mujer ≥ 55)',
    'Sexo masculino',
  ]
  const [marcas, setMarcas] = useState<Record<string, boolean>>({})
  const total = Object.values(marcas).filter(Boolean).length

  const nivel = total < 2 ? { label: 'Riesgo bajo', color: 'text-emerald-600' }
    : total <= 3 ? { label: 'Riesgo moderado', color: 'text-amber-600' }
    : { label: 'Riesgo alto', color: 'text-red-600' }

  return (
    <Widget titulo="Riesgo cardiovascular" descripcion="Conteo de factores de riesgo (clasificación cualitativa)">
      <Toques items={items} marcas={marcas} onToggle={(id) => setMarcas((m) => ({ ...m, [id]: !m[id] }))} />
      <div className="mt-3">
        <Resultado>
          <strong>{total} de 9 factores</strong> · <span className={`font-medium ${nivel.color}`}>{nivel.label}</span>
        </Resultado>
        <p className="mt-1 text-[10px] text-slate-400">Aproximación educativa; no sustituye un score validado (Framingham/SCORE) ni el criterio médico.</p>
      </div>
    </Widget>
  )
}

/** Índice de Barthel: valoración funcional para adultos mayores. */
export function ValoracionGeriatrica() {
  const items: { label: string; opciones: [string, number][] }[] = [
    { label: 'Comer', opciones: [['Dependiente', 0], ['Necesita ayuda', 5], ['Independiente', 10]] },
    { label: 'Trasladarse cama-sillón', opciones: [['Dependiente', 0], ['Ayuda importante', 5], ['Ayuda leve', 10], ['Independiente', 15]] },
    { label: 'Aseo personal', opciones: [['Dependiente', 0], ['Independiente', 5]] },
    { label: 'Uso del retrete', opciones: [['Dependiente', 0], ['Necesita ayuda', 5], ['Independiente', 10]] },
    { label: 'Bañarse', opciones: [['Dependiente', 0], ['Independiente', 5]] },
    { label: 'Deambular', opciones: [['Incapaz', 0], ['Silla de ruedas', 5], ['Con ayuda', 10], ['Independiente', 15]] },
    { label: 'Subir y bajar escaleras', opciones: [['Incapaz', 0], ['Con ayuda', 5], ['Independiente', 10]] },
    { label: 'Vestirse', opciones: [['Dependiente', 0], ['Necesita ayuda', 5], ['Independiente', 10]] },
    { label: 'Control de heces', opciones: [['Incontinente', 0], ['Accidental', 5], ['Continente', 10]] },
    { label: 'Control de orina', opciones: [['Incontinente', 0], ['Accidental', 5], ['Continente', 10]] },
  ]
  const [vals, setVals] = useState<number[]>(items.map(() => 0))
  const total = vals.reduce((a, b) => a + b, 0)
  const clasificacion = total <= 20 ? 'Dependencia total' : total <= 60 ? 'Dependencia severa' : total <= 90 ? 'Dependencia moderada' : total <= 99 ? 'Dependencia leve' : 'Independiente'

  return (
    <Widget titulo="Valoración geriátrica" descripcion="Índice de Barthel (0–100)">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <label key={item.label} className="block text-xs font-medium text-slate-600">
            {item.label}
            <select value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Number(e.target.value) : x)))} className={`${inputCls} mt-0.5`}>
              <option value={0}>—</option>
              {item.opciones.map(([label, valor]) => (
                <option key={label} value={valor}>{label} ({valor})</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Resultado>
        <strong>{total}/100</strong> · <span className="font-medium text-slate-600">{clasificacion}</span>
      </Resultado>
    </Widget>
  )
}

/** Detector de polifarmacia (≥5 fármacos) sobre las clases habituales. */
export function DetectorPolifarmacia() {
  const items = [
    'Antihipertensivos', 'Antidiabéticos / insulina', 'AINEs', 'Opioides', 'Benzodiacepinas',
    'Antidepresivos / ISRS', 'Anticoagulantes', 'Antiagregantes', 'Corticoides sistémicos',
    'Antihistamínicos', 'Inhibidores de bomba de protones', 'Estatinas',
  ]
  const [marcas, setMarcas] = useState<Record<string, boolean>>({})
  const total = Object.values(marcas).filter(Boolean).length

  return (
    <Widget titulo="Detector de polifarmacia" descripcion="Clases farmacológicas en uso">
      <Toques items={items} marcas={marcas} onToggle={(id) => setMarcas((m) => ({ ...m, [id]: !m[id] }))} />
      <div className="mt-3">
        <Resultado>
          <strong>{total}</strong> clases activas
          {total >= 10 ? ' · ⚠ Polifarmacia extrema' : total >= 5 ? ' · ⚠ Polifarmacia' : ''}
        </Resultado>
        {total >= 5 && <p className="mt-1 text-[10px] text-amber-600">Revisar prescripción, interacciones y adherencia (criterio Beers/STOPP).</p>}
      </div>
    </Widget>
  )
}

/** Carnet de vacunación: esquema básico de Venezuela por edad. */
export function CarnetVacunacion() {
  const grupos: { titulo: string; items: string[] }[] = [
    { titulo: 'Recién nacido', items: ['BCG', 'Hepatitis B (1ª dosis)'] },
    { titulo: '2 meses', items: ['Pentavalente 1', 'Polio 1', 'Rotavirus 1', 'Neumococo 1'] },
    { titulo: '4 meses', items: ['Pentavalente 2', 'Polio 2', 'Rotavirus 2', 'Neumococo 2'] },
    { titulo: '6 meses', items: ['Pentavalente 3', 'Polio 3', 'Influenza 1'] },
    { titulo: '12 meses', items: ['SRP 1', 'Fiebre amarilla (zonas endémicas)'] },
    { titulo: '18 meses', items: ['Refuerzo DPT', 'SRP 2'] },
    { titulo: '5 años', items: ['Refuerzo DPT'] },
    { titulo: '10–14 años', items: ['VPH', 'Td (tétanos-difteria)'] },
  ]
  const [marcas, setMarcas] = useState<Record<string, boolean>>({})
  const total = grupos.reduce((a, g) => a + g.items.length, 0)
  const aplicadas = Object.values(marcas).filter(Boolean).length

  return (
    <Widget titulo="Carnet de vacunación" descripcion="Esquema básico (Venezuela) — marcar aplicadas">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {grupos.map((g) => (
          <div key={g.titulo} className="rounded-lg border border-slate-100 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.titulo}</p>
            <Toques items={g.items} marcas={marcas} onToggle={(id) => setMarcas((m) => ({ ...m, [id]: !m[id] }))} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Resultado>
          <strong>{aplicadas}/{total}</strong> dosis aplicadas ({total ? Math.round((aplicadas / total) * 100) : 0}%)
        </Resultado>
      </div>
    </Widget>
  )
}

/** Control prenatal: altura uterina vs. semanas de gestación (regla de ±2 cm, 20–34 sem). */
export function ControlPrenatal() {
  const [eg, setEg] = useState('')
  const [au, setAu] = useState('')

  const interpretacion = useMemo(() => {
    const semanas = parseFloat(eg)
    const altura = parseFloat(au)
    if (!semanas || !altura) return null
    if (semanas < 20 || semanas > 34) {
      return { label: 'Regla válida entre 20 y 34 semanas', color: 'text-slate-500' }
    }
    const dif = altura - semanas
    if (Math.abs(dif) <= 2) return { label: 'Altura uterina adecuada para la EG', color: 'text-emerald-600' }
    return { label: dif > 0 ? 'Altura uterina por encima de lo esperado' : 'Altura uterina por debajo de lo esperado', color: 'text-amber-600' }
  }, [eg, au])

  return (
    <Widget titulo="Control prenatal" descripcion="Altura uterina vs. semanas de gestación">
      <div className="space-y-3">
        <Campo label="Semanas de gestación" value={eg} onChange={setEg} min="0" />
        <Campo label="Altura uterina (cm)" value={au} onChange={setAu} step="0.1" min="0" />
        {interpretacion && (
          <Resultado>
            <span className={`font-medium ${interpretacion.color}`}>{interpretacion.label}</span>
          </Resultado>
        )}
        <p className="text-[10px] text-slate-400">Regla práctica: AU (cm) ≈ EG (semanas) ± 2 cm, entre la semana 20 y 34.</p>
      </div>
    </Widget>
  )
}

/** Calculadora de infusiones: mcg/kg/min y goteo IV. */
export function CalculadoraInfusiones() {
  const [peso, setPeso] = useState('')
  const [dosis, setDosis] = useState('')
  const [conc, setConc] = useState('')
  const [factor, setFactor] = useState('20')

  const mlH = useMemo(() => {
    const p = parseFloat(peso)
    const d = parseFloat(dosis)
    const c = parseFloat(conc)
    if (!p || !d || !c || p <= 0 || d <= 0 || c <= 0) return null
    return (d * 60 * p) / (1000 * c)
  }, [peso, dosis, conc])

  const gotasMin = useMemo(() => {
    const f = parseFloat(factor)
    if (mlH === null || !f) return null
    return (mlH * f) / 60
  }, [mlH, factor])

  return (
    <Widget titulo="Calculadora de infusiones" descripcion="mcg/kg/min y goteo IV">
      <div className="space-y-3">
        <Campo label="Peso (kg)" value={peso} onChange={setPeso} step="0.1" min="0" />
        <Campo label="Dosis (mcg/kg/min)" value={dosis} onChange={setDosis} step="0.1" min="0" />
        <Campo label="Concentración (mg/ml)" value={conc} onChange={setConc} step="0.01" min="0" />
        <Campo label="Factor de goteo (gotas/ml)" value={factor} onChange={setFactor} min="1" />
        {mlH !== null && (
          <div className="space-y-1">
            <Resultado><strong>{mlH.toFixed(1)} ml/h</strong></Resultado>
            {gotasMin !== null && <Resultado>{gotasMin.toFixed(1)} gotas/min</Resultado>}
          </div>
        )}
      </div>
    </Widget>
  )
}

/** Densidad de PSA e interpretación de PSA libre/total. */
export function PSADensidad() {
  const [psa, setPsa] = useState('')
  const [volumen, setVolumen] = useState('')
  const [libre, setLibre] = useState('')

  const densidad = useMemo(() => {
    const p = parseFloat(psa)
    const v = parseFloat(volumen)
    if (!p || !v || p <= 0 || v <= 0) return null
    return p / v
  }, [psa, volumen])

  const ratioLibre = useMemo(() => {
    const p = parseFloat(psa)
    const l = parseFloat(libre)
    if (!p || !l || p <= 0 || l <= 0) return null
    return l / p
  }, [psa, libre])

  return (
    <Widget titulo="Interpretación de PSA" descripcion="Densidad y PSA libre/total">
      <div className="space-y-3">
        <Campo label="PSA total (ng/ml)" value={psa} onChange={setPsa} step="0.01" min="0" />
        <Campo label="Volumen prostático (cm³)" value={volumen} onChange={setVolumen} step="0.1" min="0" />
        <Campo label="PSA libre (ng/ml)" value={libre} onChange={setLibre} step="0.01" min="0" />
        {densidad !== null && (
          <Resultado>
            Densidad: <strong>{densidad.toFixed(2)}</strong> ng/ml/cm³
            {densidad >= 0.15 ? ' · <span className="text-amber-600">sugiere biopsia (≥0.15)</span>' : ' · dentro de lo habitual (<0.15)'}
          </Resultado>
        )}
        {ratioLibre !== null && (
          <Resultado>
            Ratio libre/total: <strong>{(ratioLibre * 100).toFixed(1)}%</strong>
            {ratioLibre < 0.25 ? ' · riesgo intermedio' : ' · sugiere etiología benigna'}
          </Resultado>
        )}
      </div>
    </Widget>
  )
}

/** Escala SOFA: falla orgánica en pacientes críticos. */
export function EscalaSOFA() {
  const sistemas: { label: string; opciones: [string, number][] }[] = [
    { label: 'Respiración — PaO2/FiO2', opciones: [['≥400', 0], ['<400', 1], ['<300', 2], ['<200 (con soporte)', 3], ['<100 (con soporte)', 4]] },
    { label: 'Coagulación — plaquetas ×10³/µL', opciones: [['≥150', 0], ['<150', 1], ['<100', 2], ['<50', 3], ['<20', 4]] },
    { label: 'Hígado — bilirrubina (mg/dl)', opciones: [['<1.2', 0], ['1.2–1.9', 1], ['2.0–5.9', 2], ['6.0–11.9', 3], ['≥12', 4]] },
    { label: 'Cardiovascular — PAM/presores', opciones: [['PAM ≥ 70', 0], ['PAM < 70', 1], ['Dopamina ≤ 5 o dobutamina', 2], ['Dopamina > 5 o NE ≤ 0.1', 3], ['Dopamina > 15 o NE > 0.1', 4]] },
    { label: 'Neurológico — Glasgow', opciones: [['15', 0], ['13–14', 1], ['10–12', 2], ['6–9', 3], ['<6', 4]] },
    { label: 'Renal — creatinina (mg/dl)/uro', opciones: [['<1.2', 0], ['1.2–1.9', 1], ['2.0–3.4', 2], ['3.5–4.9 o uro < 500', 3], ['≥5.0 o uro < 200', 4]] },
  ]
  const [vals, setVals] = useState<number[]>(sistemas.map(() => 0))
  const total = vals.reduce((a, b) => a + b, 0)

  return (
    <Widget titulo="Escala SOFA" descripcion="Falla orgánica en críticos (0–24)">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {sistemas.map((s, i) => (
          <label key={s.label} className="block text-xs font-medium text-slate-600">
            {s.label}
            <select value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Number(e.target.value) : x)))} className={`${inputCls} mt-0.5`}>
              <option value={0}>—</option>
              {s.opciones.map(([label, valor]) => (
                <option key={label} value={valor}>{label} ({valor})</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3">
        <Resultado>
          SOFA: <strong>{total}/24</strong> · <span className={total >= 2 ? 'font-medium text-red-600' : 'font-medium text-emerald-600'}>{total >= 2 ? 'Riesgo de mortalidad elevado (≥2)' : 'Bajo'}</span>
        </Resultado>
      </div>
    </Widget>
  )
}

/** Diario miccional: frecuencia, volumen y nocturia. */
export function DiarioMiccional() {
  const [micciones, setMicciones] = useState('')
  const [volumenTotal, setVolumenTotal] = useState('')
  const [nocturia, setNocturia] = useState('')

  const resumen = useMemo(() => {
    const n = parseInt(micciones, 10)
    const v = parseFloat(volumenTotal)
    const no = parseFloat(nocturia)
    if (!n || !v) return null
    return { n, promedio: v / n, nocturia: no ?? 0 }
  }, [micciones, volumenTotal, nocturia])

  return (
    <Widget titulo="Diario miccional" descripcion="Registro de 24 horas">
      <div className="space-y-3">
        <Campo label="N.º de micciones (24 h)" value={micciones} onChange={setMicciones} min="0" />
        <Campo label="Volumen total (ml)" value={volumenTotal} onChange={setVolumenTotal} min="0" />
        <Campo label="Episodios nocturnos (nocturia)" value={nocturia} onChange={setNocturia} min="0" />
        {resumen && (
          <Resultado>
            <strong>{resumen.n}</strong> micciones · promedio <strong>{resumen.promedio.toFixed(0)} ml</strong>
            {resumen.nocturia >= 2 ? ' · ⚠ nocturia' : ''}
          </Resultado>
        )}
      </div>
    </Widget>
  )
}

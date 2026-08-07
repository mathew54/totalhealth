import { useMemo, useState } from 'react'
import Widget from './Widget'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

function Campo({ label, value, onChange, type = 'text', step, min, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  step?: string
  min?: string
  placeholder?: string
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input type={type} value={value} min={min} step={step} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-1`} />
    </label>
  )
}

function Resultado({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{children}</div>
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

/** PHQ-9: cribado de depresión. */
export function PHQ9() {
  const items = [
    'Poco interés o placer en hacer cosas',
    'Sentirse decaído(a), deprimido(a) o sin esperanza',
    'Problemas para dormir o dormir demasiado',
    'Cansancio o poca energía',
    'Mal apetito o comer en exceso',
    'Sentirse mal con usted mismo(a) o fracasado(a)',
    'Dificultad para concentrarse',
    'Moverse o hablar tan lento, o tan inquieto, que otros lo notan',
    'Pensamientos de que estaría mejor muerto(a) o autolesionarse',
  ]
  const opciones = [['Nada', 0], ['Varios días', 1], ['Más de la mitad de los días', 2], ['Casi todos los días', 3]]
  const [vals, setVals] = useState<number[]>(items.map(() => 0))
  const total = vals.reduce((a, b) => a + b, 0)
  const nivel = total <= 4 ? 'Depresión mínima' : total <= 9 ? 'Depresión leve' : total <= 14 ? 'Depresión moderada' : total <= 19 ? 'Moderadamente grave' : 'Depresión grave'

  return (
    <Widget titulo="Escala PHQ-9" descripcion="Cribado de depresión (últimas 2 semanas)">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <div key={item} className="rounded-lg border border-slate-100 p-2">
            <p className="mb-1 text-xs text-slate-700">{i + 1}. {item}</p>
            <select value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Number(e.target.value) : x)))} className={`${inputCls} text-xs`}>
              {opciones.map(([label, valor]) => (
                <option key={label} value={valor}>{label} ({valor})</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Resultado>
          Puntaje: <strong>{total}/27</strong> · <span className={`font-medium ${total >= 10 ? 'text-red-600' : 'text-slate-600'}`}>{nivel}</span>
          {total >= 10 && <span className="block text-[10px] text-amber-600">≥10: cribado positivo — evaluar riesgo de autolesión.</span>}
        </Resultado>
      </div>
    </Widget>
  )
}

/** Reporte operatorio estructurado. */
export function ReporteOperatorio() {
  const [dxPre, setDxPre] = useState('')
  const [procedimiento, setProcedimiento] = useState('')
  const [dxPost, setDxPost] = useState('')
  const [hallazgos, setHallazgos] = useState('')
  const [sangrado, setSangrado] = useState('')
  const [complicaciones, setComplicaciones] = useState('')
  const [copiado, setCopiado] = useState(false)

  const texto = useMemo(() => {
    const p = [dxPre, procedimiento, dxPost, hallazgos, sangrado, complicaciones].filter(Boolean).join(' · ')
    if (!p) return ''
    return `Reporte operatorio\nDiagnóstico preoperatorio: ${dxPre || '—'}\nProcedimiento: ${procedimiento || '—'}\nDiagnóstico postoperatorio: ${dxPost || '—'}\nHallazgos: ${hallazgos || '—'}\nSangrado: ${sangrado || '—'}\nComplicaciones: ${complicaciones || '—'}`
  }, [dxPre, procedimiento, dxPost, hallazgos, sangrado, complicaciones])

  return (
    <Widget titulo="Reporte operatorio" descripcion="Plantilla estructurada de quirófano">
      <div className="space-y-2">
        <Campo label="Diagnóstico preoperatorio" value={dxPre} onChange={setDxPre} />
        <Campo label="Procedimiento realizado" value={procedimiento} onChange={setProcedimiento} />
        <Campo label="Diagnóstico postoperatorio" value={dxPost} onChange={setDxPost} />
        <Campo label="Hallazgos" value={hallazgos} onChange={setHallazgos} />
        <Campo label="Sangrado estimado (ml)" value={sangrado} onChange={setSangrado} type="number" min="0" />
        <Campo label="Complicaciones" value={complicaciones} onChange={setComplicaciones} />
        {texto && (
          <>
            <Resultado><pre className="whitespace-pre-wrap font-mono text-xs">{texto}</pre></Resultado>
            <button onClick={async () => setCopiado(await copiar(texto))} className="w-full rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
              {copiado ? '✓ Copiado' : 'Copiar reporte'}
            </button>
          </>
        )}
      </div>
    </Widget>
  )
}

/** Plantilla de informe BI-RADS (mamografía) generador. */
export function PlantillaBIRADS() {
  const hallazgos = [
    'Masa', 'Asimetría focal', 'Microcalcificaciones agrupadas', 'Distorsión de la arquitectura',
    'Engrosamiento cutáneo', 'Retracción del pezón', 'Adenopatía axilar',
  ]
  const categorias = [
    ['0 — Estudio incompleto (requiere evaluación adicional)', '0'],
    ['1 — Negativo', '1'],
    ['2 — Benigno', '2'],
    ['3 — Probablemente benigno (control 6 meses)', '3'],
    ['4A — Sospecha baja', '4A'],
    ['4B — Sospecha intermedia', '4B'],
    ['4C — Sospecha alta', '4C'],
    ['5 — Altamente sugestivo de malignidad', '5'],
    ['6 — Malignidad confirmada por biopsia', '6'],
  ]
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [categoria, setCategoria] = useState('')
  const [impresion, setImpresion] = useState('')

  const texto = useMemo(() => {
    const base = seleccion.length || categoria || impresion
    if (!base) return ''
    return `Informe de mamografía — BI-RADS\nHallazgos: ${seleccion.length ? seleccion.join(', ') : '—'}\nCategoría BI-RADS: ${categoria || '—'}\nImpresión / recomendación: ${impresion || '—'}`
  }, [seleccion, categoria, impresion])

  return (
    <Widget titulo="Plantilla BI-RADS" descripcion="Informe estructurado de mamografía">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {hallazgos.map((h) => (
            <button
              key={h}
              onClick={() => setSeleccion((s) => (s.includes(h) ? s.filter((x) => x !== h) : [...s, h]))}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${seleccion.includes(h) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
            >
              {h}
            </button>
          ))}
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Categoría BI-RADS
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">— Seleccione —</option>
            {categorias.map(([label, val]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </label>
        <Campo label="Impresión / recomendación" value={impresion} onChange={setImpresion} />
        {texto && (
          <>
            <Resultado><pre className="whitespace-pre-wrap font-mono text-xs">{texto}</pre></Resultado>
            <button onClick={() => void copiar(texto)} className="w-full rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Copiar informe</button>
          </>
        )}
      </div>
    </Widget>
  )
}

/** Dictado por voz con la Web Speech API del navegador. */
export function DictadoVoz() {
  const reconocimiento: any = useMemo(() => {
    if (typeof window === 'undefined') return null
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR()
    r.lang = 'es-VE'
    r.interimResults = true
    return r
  }, [])

  const [escuchando, setEscuchando] = useState(false)
  const [texto, setTexto] = useState('')

  if (!reconocimiento) {
    return (
      <Widget titulo="Dictado por voz" descripcion="Transcripción de informes">
        <p className="text-xs text-slate-500">Este navegador no soporta la Web Speech API (prueba Chrome/Edge).</p>
      </Widget>
    )
  }

  function toggle() {
    if (escuchando) {
      reconocimiento.stop()
      setEscuchando(false)
      return
    }
    setTexto('')
    reconocimiento.onresult = (e: any) => {
      let t = ''
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript
      setTexto(t)
    }
    reconocimiento.onend = () => setEscuchando(false)
    reconocimiento.onerror = () => setEscuchando(false)
    reconocimiento.start()
    setEscuchando(true)
  }

  return (
    <Widget titulo="Dictado por voz" descripcion="Transcripción en español (navegador)">
      <div className="space-y-2">
        <button onClick={toggle} className={`w-full rounded-lg px-3 py-2 text-sm font-semibold text-white ${escuchando ? 'bg-red-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
          {escuchando ? '● Detener dictado' : '🎙 Iniciar dictado'}
        </button>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder="Hable o escriba…" className={`${inputCls} resize-y font-mono`} />
        {texto && (
          <button onClick={() => void copiar(texto)} className="w-full rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Copiar texto</button>
        )}
      </div>
    </Widget>
  )
}

/** Lienzo anatómico: regiones anotables con notas breves. */
export function LienzoAnatomico() {
  const regiones = ['Cabeza/Cuello', 'Tórax', 'Abdomen', 'Pelvis', 'Miembro superior izq.', 'Miembro superior der.', 'Miembro inferior izq.', 'Miembro inferior der.', 'Dorso/Columna']
  const [regionSel, setRegionSel] = useState('')
  const [nota, setNota] = useState('')
  const [notas, setNotas] = useState<{ region: string; texto: string }[]>([])

  function agregar() {
    if (!regionSel || !nota.trim()) return
    setNotas((n) => [...n, { region: regionSel, texto: nota.trim() }])
    setNota('')
  }

  return (
    <Widget titulo="Lienzo anatómico" descripcion="Anotaciones sobre esquema corporal">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {regiones.map((r) => (
            <button
              key={r}
              onClick={() => setRegionSel(r)}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${regionSel === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota sobre la región…" className={inputCls} />
          <button onClick={agregar} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">+</button>
        </div>
        {notas.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
            {notas.map((n, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                <span><strong className="text-brand-700">{n.region}:</strong> {n.texto}</span>
                <button onClick={() => setNotas((l) => l.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  )
}

/** Hoja anestésica: registro estructurado. */
export function HojaAnestesica() {
  const asas = ['ASA I', 'ASA II', 'ASA III', 'ASA IV', 'ASA V', 'ASA VI']
  const tecnicas = ['General', 'Regional espinal', 'Regional epidural', 'Bloqueo periférico', 'Sedación', 'Local + sedación']
  const [paciente, setPaciente] = useState('')
  const [peso, setPeso] = useState('')
  const [asa, setAsa] = useState('')
  const [tecnica, setTecnica] = useState('')
  const [monitoreo, setMonitoreo] = useState('')
  const [eventos, setEventos] = useState('')

  const completo = paciente || peso || asa || tecnica || monitoreo || eventos

  return (
    <Widget titulo="Hoja anestésica" descripcion="Registro transanestésico">
      <div className="space-y-2">
        <Campo label="Paciente" value={paciente} onChange={setPaciente} />
        <Campo label="Peso (kg)" value={peso} onChange={setPeso} type="number" min="0" step="0.1" />
        <div className="flex flex-wrap gap-1">
          {asas.map((a) => (
            <button key={a} onClick={() => setAsa(a)} className={`rounded-full border px-2 py-0.5 text-[10px] ${asa === a ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>{a}</button>
          ))}
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Técnica
          <select value={tecnica} onChange={(e) => setTecnica(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">—</option>
            {tecnicas.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <Campo label="Monitoreo invasivo" value={monitoreo} onChange={setMonitoreo} placeholder="PIC, vía arterial, etc." />
        <Campo label="Eventos / incidencias" value={eventos} onChange={setEventos} />
        {completo && (
          <Resultado>
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {`Paciente: ${paciente || '—'} · Peso: ${peso || '—'} kg · ASA: ${asa || '—'}\nTécnica: ${tecnica || '—'} · Monitoreo: ${monitoreo || '—'}\nEventos: ${eventos || '—'}`}
            </pre>
          </Resultado>
        )}
      </div>
    </Widget>
  )
}

/** Plan de rehabilitación: rutinas por patología. */
export function PlanRehabilitacion() {
  const rutinas: Record<string, string[]> = {
    Lumbalgia: ['Puente de glúteos — 3×10', 'Gato-camello — 2×15', 'Plancha abdominal — 30 s × 3', 'Estiramiento isquiotibial — 30 s × 3'],
    'Artrosis de rodilla': ['Cuádriceps isométrico — 3×15', 'Elevación de pierna recta — 3×10', 'Sentadilla asistida — 3×10', 'Bicicleta estática — 10 min'],
    'Post ACV': ['Movilización pasiva — 10 min', 'Bipedestación asistida — 3×5 min', 'Marcha asistida — 10 min', 'Transferencias cama-silla — 3×'],
    'Síndrome túnel carpiano': ['Estiramiento de flexores — 30 s × 3', 'Deslizamiento de tendones — 2×10', 'Fortalecimiento de pinza — 3×12', 'Férula nocturna'],
    'Rehabilitación cardíaca': ['Calentamiento — 5 min', 'Caminata — 20 min (zona 40-60% FC máx)', 'Fortalecimiento ligero — 3×10', 'Enfriamiento — 5 min'],
  }
  const [patologia, setPatologia] = useState('Lumbalgia')

  return (
    <Widget titulo="Plan de rehabilitación" descripcion="Rutinas referenciales por patología">
      <label className="block text-xs font-medium text-slate-600">
        Patología
        <select value={patologia} onChange={(e) => setPatologia(e.target.value)} className={`${inputCls} mt-1`}>
          {Object.keys(rutinas).map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <ul className="mt-3 space-y-1.5">
        {(rutinas[patologia] ?? []).map((r) => (
          <li key={r} className="rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-700">{r}</li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-slate-400">Referencial; ajustar según tolerancia y criterio del fisiatra.</p>
    </Widget>
  )
}

/** Certificados de salud: generador de textos con fechas. */
export function CertificadosSalud() {
  const tipos = [
    ['reposo', 'Reposo médico'],
    ['aptitud', 'Certificado de aptitud'],
    ['constancia', 'Constancia de atención'],
  ]
  const [tipo, setTipo] = useState('reposo')
  const [paciente, setPaciente] = useState('')
  const [dias, setDias] = useState('3')
  const [nota, setNota] = useState('')
  const hoy = new Date().toLocaleDateString('es-VE')
  const [copiado, setCopiado] = useState(false)

  const texto = useMemo(() => {
    if (!paciente) return ''
    const fin = new Date()
    fin.setDate(fin.getDate() + (parseInt(dias, 10) || 0))
    if (tipo === 'reposo') {
      return `CERTIFICADO MÉDICO — REPOSO\nEl (la) médico(a) deja constancia de que el (la) paciente ${paciente} se encuentra bajo reposo médico por ${dias} día(s), desde ${hoy} hasta ${fin.toLocaleDateString('es-VE')}.\n${nota ? `Observaciones: ${nota}\n` : ''}Fecha de emisión: ${hoy}`
    }
    if (tipo === 'aptitud') {
      return `CERTIFICADO DE APTITUD\nSe hace constar que el (la) ciudadano(a) ${paciente} es APTO(A) para realizar las actividades requeridas, habiendo sido evaluado(a) el día de hoy.\n${nota ? `Observaciones: ${nota}\n` : ''}Fecha de emisión: ${hoy}`
    }
    return `CONSTANCIA DE ATENCIÓN\nSe deja constancia de que el (la) paciente ${paciente} recibió atención médica el día ${hoy}.\n${nota ? `Motivo: ${nota}\n` : ''}Fecha de emisión: ${hoy}`
  }, [tipo, paciente, dias, nota, hoy])

  return (
    <Widget titulo="Certificados de salud" descripcion="Reposo, aptitud y constancias">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {tipos.map(([val, label]) => (
            <button key={val} onClick={() => setTipo(val)} className={`rounded-full border px-2 py-0.5 text-[10px] ${tipo === val ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>{label}</button>
          ))}
        </div>
        <Campo label="Paciente" value={paciente} onChange={setPaciente} />
        {tipo === 'reposo' && <Campo label="Días de reposo" value={dias} onChange={setDias} type="number" min="1" />}
        <Campo label="Observaciones / motivo" value={nota} onChange={setNota} />
        {texto && (
          <>
            <Resultado><pre className="whitespace-pre-wrap font-mono text-xs">{texto}</pre></Resultado>
            <button onClick={async () => setCopiado(await copiar(texto))} className="w-full rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
              {copiado ? '✓ Copiado' : 'Copiar certificado'}
            </button>
          </>
        )}
      </div>
    </Widget>
  )
}

/** Cadena de custodia: registro con hash SHA-256 de integridad. */
export function CadenaCustodia() {
  const [muestra, setMuestra] = useState('')
  const [recolector, setRecolector] = useState('')
  const [lugar, setLugar] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [hash, setHash] = useState('')
  const [error, setError] = useState('')

  async function calcularHash() {
    const payload = JSON.stringify({ muestra, recolector, lugar, observaciones, fecha: new Date().toISOString() })
    try {
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
      setHash(Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join(''))
      setError('')
    } catch {
      setError('Cifrado no disponible en este contexto.')
    }
  }

  return (
    <Widget titulo="Cadena de custodia" descripcion="Registro con hash de integridad">
      <div className="space-y-2">
        <Campo label="Muestra / objeto" value={muestra} onChange={setMuestra} />
        <Campo label="Recolector" value={recolector} onChange={setRecolector} />
        <Campo label="Lugar / sitio" value={lugar} onChange={setLugar} />
        <Campo label="Observaciones" value={observaciones} onChange={setObservaciones} />
        <button onClick={() => void calcularHash()} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Generar hash SHA-256</button>
        {hash && (
          <Resultado>
            <p className="mb-1 text-[10px] uppercase text-slate-400">Hash de integridad</p>
            <code className="break-all text-[10px]">{hash}</code>
          </Resultado>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Widget>
  )
}

/** Esquemas terapéuticos: referencia rápida de protocolos habituales. */
export function EsquemasTerapeuticos() {
  const esquemas: Record<string, string[]> = {
    'Hipertensión arterial': ['Escalera terapéutica: IECA/ARA-II → + diurético tiazídico → + CCB → + espironolactona/betabloqueante', 'Objetivo: <130/80 (o <140/90 según riesgo)'],
    'Diabetes tipo 2': ['Metformina 1ª línea (titular según tolerancia)', 'Asociar iDPP-4 / iSGLT2 / arGLP-1 o insulina según perfil', 'Meta HbA1c: <7% (individualizar)'],
    'Celulitis / infección de piel': ['Amoxicilina-ácido clavulánico 875/125 mg c/8 h × 7–10 días', 'Alternativa: cefalexina 500 mg c/6 h'],
    'Neumonía comunitaria': ['Amoxicilina 1 g c/8 h o azitromicina 500 mg día 1, luego 250 mg', 'Considerar macrólido si atípicos'],
    'EPOC exacerbación': ['Broncodilatador de acción corta (SABA) + corticosteroide oral 5 días', 'Antibiótico si purulencia o ventilación mecánica'],
    'Dolor agudo': ['Escalera OMS: paracetamol/ibuprofeno → tramadol → opioide mayor', 'Asociar manejo no farmacológico'],
  }
  const [seleccion, setSeleccion] = useState('Hipertensión arterial')

  return (
    <Widget titulo="Esquemas terapéuticos" descripcion="Referencia rápida de protocolos">
      <label className="block text-xs font-medium text-slate-600">
        Patología
        <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className={`${inputCls} mt-1`}>
          {Object.keys(esquemas).map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <ul className="mt-3 space-y-1.5">
        {(esquemas[seleccion] ?? []).map((r) => (
          <li key={r} className="rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-700">{r}</li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-slate-400">Referencial y simplificado; no sustituye guías vigentes ni el criterio médico.</p>
    </Widget>
  )
}

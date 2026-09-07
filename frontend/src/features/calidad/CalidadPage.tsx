import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface Control {
  id: string
  examen_id?: string | null
  parametro: string
  nombre: string
  lote?: string | null
  media: number
  desviacion_estandar: number
  unidad?: string | null
  activo: boolean
  ultima_medicion?: { valor: number; fecha: string } | null
}

interface Medicion {
  id: string
  valor: number
  fecha: string
  notas?: string | null
}

export default function CalidadPage() {
  const qc = useQueryClient()
  const { data: controles = [] } = useQuery<Control[]>({
    queryKey: ['calidad'],
    queryFn: async () => (await api.get('/calidad')).data,
  })

  const [form, setForm] = useState({ parametro: '', nombre: '', media: 100, desviacion_estandar: 1, unidad: '' })
  const [msg, setMsg] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [nuevoValor, setNuevoValor] = useState('')

  const { data: mediciones = [] } = useQuery<Medicion[]>({
    queryKey: ['calidad', 'mediciones', detalleId],
    enabled: Boolean(detalleId),
    queryFn: async () => (await api.get(`/calidad/${detalleId}/mediciones`)).data,
  })

  const create = useMutation({
    mutationFn: async () => (await api.post('/calidad', { ...form, media: Number(form.media), desviacion_estandar: Number(form.desviacion_estandar) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad'] }); setForm({ parametro: '', nombre: '', media: 100, desviacion_estandar: 1, unidad: '' }); setMsg('Control creado.') },
    onError: (e: unknown) => setMsg((e as Error)?.message ?? 'Error al crear.'),
  })

  const registrar = useMutation({
    mutationFn: async () => { if (!detalleId) return; const { data } = await api.post(`/calidad/${detalleId}/mediciones`, { valor: Number(nuevoValor) }); return data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calidad'] }); qc.invalidateQueries({ queryKey: ['calidad', 'mediciones', detalleId] }); setNuevoValor('') },
  })

  function estadoLevey(c: Control): 'ok' | 'advertencia' | 'alerta' {
    if (!c.ultima_medicion) return 'ok'
    const z = (c.ultima_medicion.valor - c.media) / c.desviacion_estandar
    if (Math.abs(z) >= 3) return 'alerta'
    if (Math.abs(z) >= 2) return 'advertencia'
    return 'ok'
  }

  const color = (e: string) => (e === 'alerta' ? 'text-red-600' : e === 'advertencia' ? 'text-amber-600' : 'text-emerald-600')

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Control de Calidad</h1>
        <p className="text-xs text-slate-500">Controles internos y gráfico de Levey-Jennings por parámetro.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Nuevo control</h2>
          <div className="space-y-2">
            <input placeholder="Parámetro (ej. Glucosa)" value={form.parametro} onChange={(e) => setForm({ ...form, parametro: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Nombre del control" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Media" value={form.media} onChange={(e) => setForm({ ...form, media: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="number" step="0.01" placeholder="Desv. estándar" value={form.desviacion_estandar} onChange={(e) => setForm({ ...form, desviacion_estandar: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <input placeholder="Unidad" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={() => create.mutate()} disabled={!form.nombre || !form.parametro || create.isPending} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              Crear control
            </button>
            {msg && <p className="text-xs text-slate-400">{msg}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Controles ({controles.length})</h2>
          <div className="space-y-2">
            {controles.filter((c) => c.activo).map((c) => (
              <div key={c.id} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 hover:border-brand-300" onClick={() => setDetalleId(c.id)}>
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                  <p className="text-xs text-slate-400">{c.parametro} · Media {c.media} ± {c.desviacion_estandar} {c.unidad ?? ''}</p>
                </div>
                {c.ultima_medicion && (
                  <span className={`text-sm font-bold ${color(estadoLevey(c))}`}>
                    {c.ultima_medicion.valor} {c.unidad ?? ''} · {estadoLevey(c)}
                  </span>
                )}
                {!c.ultima_medicion && <span className="text-xs text-slate-400">Sin mediciones</span>}
              </div>
            ))}
            {controles.filter((c) => c.activo).length === 0 && <p className="py-6 text-center text-sm text-slate-400">Sin controles registrados.</p>}
          </div>
        </div>
      </div>

      {detalleId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Gráfico de Levey-Jennings</h2>
            <button onClick={() => setDetalleId(null)} className="text-sm text-slate-400 hover:text-slate-600">Cerrar ×</button>
          </div>
          <div className="mb-3 flex gap-2">
            <input type="number" step="0.01" placeholder="Nuevo valor medido" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={() => registrar.mutate()} disabled={nuevoValor === '' || registrar.isPending} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              Registrar medición
            </button>
          </div>
          {mediciones.length === 0 && <p className="text-sm text-slate-400">Sin mediciones registradas todavía.</p>}
          {mediciones.length > 0 && (
            <ul className="space-y-1 text-sm">
              {mediciones.map((m) => (
                <li key={m.id} className="flex justify-between border-b py-1 text-slate-700 last:border-0">
                  <span>{new Date(m.fecha).toLocaleString('es-VE')}</span>
                  <span className="font-semibold">{m.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

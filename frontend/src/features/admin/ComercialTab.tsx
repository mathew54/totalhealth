import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'

interface Examen { id: string; nombre: string; precio: number; activo: boolean; costo_reactivos: number }
interface Paquete {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  activo: boolean
  examenes: { examen_id: string; nombre: string }[]
}
interface Convenio {
  id: string
  nombre: string
  rif: string | null
  descuento_porcentaje: number
  activo: boolean
}
interface Promocion {
  id: string
  nombre: string
  descuento_porcentaje: number
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
  examenes: { examen_id: string; nombre: string }[]
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}

function Errtag({ children }: { children: string | null }) {
  return children ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null
}

export default function ComercialTab() {
  const [seccion, setSeccion] = useState<'paquetes' | 'convenios' | 'promociones'>('paquetes')
  const tabs = [
    { id: 'paquetes' as const, label: 'Paquetes' },
    { id: 'convenios' as const, label: 'Convenios' },
    { id: 'promociones' as const, label: 'Promociones' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSeccion(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${seccion === t.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {seccion === 'paquetes' && <PaquetesSection />}
      {seccion === 'convenios' && <ConveniosSection />}
      {seccion === 'promociones' && <PromocionesSection />}
    </div>
  )
}

/** Checkbox multi-examen compartido. */
function ExamenSelector({ ids, onToggle }: { ids: string[]; onToggle: (id: string) => void }) {
  const { data: examenes = [] } = useQuery<Examen[]>({
    queryKey: ['examenes', 'admin'],
    queryFn: async () => (await api.get('/admin/examenes')).data,
  })
  return (
    <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      {(examenes ?? []).filter((ex) => ex.activo).map((ex) => (
        <label key={ex.id} className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={ids.includes(ex.id)} onChange={() => onToggle(ex.id)} className="accent-brand-600" />
          {ex.nombre}
        </label>
      ))}
    </div>
  )
}

// ------------------------- Paquetes -------------------------
function PaquetesSection() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [examenesSel, setExamenesSel] = useState<string[]>([])
  const tasaUsd = useTasaUsd()

  const { data: paquetes = [], isLoading } = useQuery<Paquete[]>({
    queryKey: ['comercial', 'paquetes'],
    queryFn: async () => (await api.get('/comercial/paquetes')).data,
  })

  const { data: allExamenes = [] } = useQuery<Examen[]>({
    queryKey: ['examenes', 'admin'],
    queryFn: async () => (await api.get('/admin/examenes')).data,
  })
  const costoMap = useMemo(() => new Map(allExamenes.map((e) => [e.id, e.costo_reactivos])), [allExamenes])
  const costoSugerido = examenesSel.reduce((sum, id) => sum + (costoMap.get(id) ?? 0), 0)

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/comercial/paquetes', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'paquetes'] })
      setExamenesSel([])
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })
  const update = useMutation({
    mutationFn: ({ id, p }: { id: string; p: unknown }) => api.put(`/comercial/paquetes/${id}`, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comercial', 'paquetes'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/paquetes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'paquetes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
    },
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (examenesSel.length === 0) {
      setError('Selecciona al menos un examen')
      return
    }
    const fd = new FormData(e.currentTarget)
    add.mutate({
      nombre: fd.get('nombre'),
      descripcion: fd.get('descripcion') || undefined,
      precio: Number(fd.get('precio')),
      examen_ids: examenesSel,
    })
    e.currentTarget.reset()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <Field label="Nombre *"><input name="nombre" required className={inputCls} /></Field>
        <Field label="Precio promocional (USD) *"><input name="precio" type="number" min={0.01} step="0.01" required className={inputCls} /></Field>
        <Field label="Descripción"><input name="descripcion" className={inputCls} /></Field>
        <div className="flex items-end">
          <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Crear paquete</button>
        </div>
        <div className="sm:col-span-4">
          <Field label={`Exámenes incluidos (${examenesSel.length})`}>
            <ExamenSelector ids={examenesSel} onToggle={(id) => setExamenesSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} />
          </Field>
          {examenesSel.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Costo de reactivos: <span className="font-medium text-slate-700">${costoSugerido.toFixed(2)}</span>
              {costoSugerido > 0 && <span className="ml-1 text-amber-600">(precio mínimo sugerido)</span>}
            </p>
          )}
        </div>
      </form>

      <Errtag>{error}</Errtag>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : paquetes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin paquetes. Crea combos con precio promocional.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Paquete</th><th className="px-4 py-3">Exámenes</th><th className="px-4 py-3">Precio</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paquetes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input defaultValue={p.nombre} onBlur={(e) => e.target.value !== p.nombre && update.mutate({ id: p.id, p: { nombre: e.target.value } })} className="w-40 rounded border border-transparent px-2 py-1 hover:border-slate-300 focus:border-brand-500" />
                      {p.descripcion && <p className="text-xs text-slate-400">{p.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.examenes.map((ex) => (
                          <span key={ex.examen_id} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">{ex.nombre}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={0.01} step="0.01" defaultValue={p.precio} onBlur={(e) => Number(e.target.value) !== p.precio && update.mutate({ id: p.id, p: { precio: Number(e.target.value) } })} className="w-24 rounded border border-slate-300 px-2 py-1" />
                      <span className="block text-xs text-slate-400"><PrecioDual usd={p.precio} tasaUsd={tasaUsd} /></span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => deactivate.mutate(p.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------- Convenios -------------------------
function ConveniosSection() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: convenios = [], isLoading } = useQuery<Convenio[]>({
    queryKey: ['comercial', 'convenios'],
    queryFn: async () => (await api.get('/comercial/convenios')).data,
  })

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/comercial/convenios', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'convenios'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })
  const update = useMutation({
    mutationFn: ({ id, p }: { id: string; p: unknown }) => api.put(`/comercial/convenios/${id}`, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comercial', 'convenios'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/convenios/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comercial', 'convenios'] }),
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    add.mutate({ nombre: fd.get('nombre'), rif: fd.get('rif') || null, descuento_porcentaje: Number(fd.get('descuento_porcentaje')) })
    e.currentTarget.reset()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <Field label="Nombre *"><input name="nombre" required className={inputCls} /></Field>
        <Field label="R.I.F."><input name="rif" className={inputCls} placeholder="J-00000000-0" /></Field>
        <Field label="Descuento (%) *"><input name="descuento_porcentaje" type="number" min={0} max={100} step="0.01" required className={inputCls} /></Field>
        <div className="flex items-end">
          <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Crear convenio</button>
        </div>
      </form>

      <Errtag>{error}</Errtag>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : convenios.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin convenios. Crea aseguradoras/empresas con descuento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Convenio</th><th className="px-4 py-3">R.I.F.</th><th className="px-4 py-3">Descuento</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {convenios.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input defaultValue={c.nombre} onBlur={(e) => e.target.value !== c.nombre && update.mutate({ id: c.id, p: { nombre: e.target.value } })} className="w-44 rounded border border-transparent px-2 py-1 hover:border-slate-300 focus:border-brand-500" />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.rif ?? '—'}</td>
                    <td className="px-4 py-3">
                      <input type="number" min={0} max={100} step="0.01" defaultValue={c.descuento_porcentaje} onBlur={(e) => Number(e.target.value) !== c.descuento_porcentaje && update.mutate({ id: c.id, p: { descuento_porcentaje: Number(e.target.value) } })} className="w-20 rounded border border-slate-300 px-2 py-1" />
                      <span>%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => deactivate.mutate(c.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------- Promociones -------------------------
function PromocionesSection() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [examenesSel, setExamenesSel] = useState<string[]>([])
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: promos = [], isLoading } = useQuery<Promocion[]>({
    queryKey: ['comercial', 'promociones'],
    queryFn: async () => (await api.get('/comercial/promociones')).data,
  })

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/comercial/promociones', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'promociones'] })
      setExamenesSel([])
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })
  const update = useMutation({
    mutationFn: ({ id, p }: { id: string; p: unknown }) => api.put(`/comercial/promociones/${id}`, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comercial', 'promociones'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/comercial/promociones/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comercial', 'promociones'] }),
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (examenesSel.length === 0) {
      setError('Selecciona al menos un examen')
      return
    }
    const fd = new FormData(e.currentTarget)
    add.mutate({
      nombre: fd.get('nombre'),
      descuento_porcentaje: Number(fd.get('descuento_porcentaje')),
      fecha_inicio: fd.get('fecha_inicio'),
      fecha_fin: fd.get('fecha_fin'),
      examen_ids: examenesSel,
    })
    e.currentTarget.reset()
  }

  const vigente = (p: Promocion) => p.activo && p.fecha_inicio <= hoy && p.fecha_fin >= hoy

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <Field label="Nombre *"><input name="nombre" required className={inputCls} /></Field>
        <Field label="Descuento (%) *"><input name="descuento_porcentaje" type="number" min={0.01} max={100} step="0.01" required className={inputCls} /></Field>
        <Field label="Inicio *"><input name="fecha_inicio" type="date" defaultValue={hoy} required className={inputCls} /></Field>
        <Field label="Fin *"><input name="fecha_fin" type="date" defaultValue={hoy} required className={inputCls} /></Field>
        <div className="flex items-end">
          <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Crear promoción</button>
        </div>
        <div className="sm:col-span-4">
          <Field label={`Exámenes con descuento (${examenesSel.length})`}>
            <ExamenSelector ids={examenesSel} onToggle={(id) => setExamenesSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} />
          </Field>
        </div>
      </form>

      <Errtag>{error}</Errtag>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : promos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin promociones. Crea ofertas por vigencia.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Promoción</th><th className="px-4 py-3">Descuento</th><th className="px-4 py-3">Vigencia</th><th className="px-4 py-3">Exámenes</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input defaultValue={p.nombre} onBlur={(e) => e.target.value !== p.nombre && update.mutate({ id: p.id, p: { nombre: e.target.value } })} className="w-40 rounded border border-transparent px-2 py-1 hover:border-slate-300 focus:border-brand-500" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={0.01} max={100} step="0.01" defaultValue={p.descuento_porcentaje} onBlur={(e) => Number(e.target.value) !== p.descuento_porcentaje && update.mutate({ id: p.id, p: { descuento_porcentaje: Number(e.target.value) } })} className="w-20 rounded border border-slate-300 px-2 py-1" />
                      <span>%</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {p.fecha_inicio} → {p.fecha_fin}
                      {vigente(p) && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">vigente</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.examenes.map((ex) => (
                          <span key={ex.examen_id} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">{ex.nombre}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{p.activo ? 'Activa' : 'Inactiva'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => deactivate.mutate(p.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
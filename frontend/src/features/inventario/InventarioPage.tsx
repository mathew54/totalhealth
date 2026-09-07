import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ReactNode } from 'react'

interface ItemInventario {
  id: string
  nombre: string
  categoria: string
  unidad?: string | null
  cantidad: number
  alerta_minima?: number | null
  costo_unitario?: number | null
  proveedor?: string | null
  ubicacion?: string | null
  activo: boolean
}

const CATEGORIAS = ['papeleria', 'insumos', 'equipos', 'limpieza', 'otro']

function Mensaje({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-400">{children}</p>
}

export default function InventarioPage() {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery<ItemInventario[]>({
    queryKey: ['inventario'],
    queryFn: async () => (await api.get('/inventario')).data,
  })

  const [form, setForm] = useState({ nombre: '', categoria: 'otro', unidad: '', cantidad: 0, alerta_minima: 0, costo_unitario: 0, proveedor: '', ubicacion: '' })
  const [msg, setMsg] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/inventario', {
        ...form,
        cantidad: Number(form.cantidad),
        alerta_minima: Number(form.alerta_minima) || null,
        costo_unitario: Number(form.costo_unitario) || null,
      })
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventario'] }); setForm({ nombre: '', categoria: 'otro', unidad: '', cantidad: 0, alerta_minima: 0, costo_unitario: 0, proveedor: '', ubicacion: '' }); setMsg('Ítem agregado.') },
    onError: (e: unknown) => setMsg((e as Error)?.message ?? 'Error al crear.'),
  })

  const movimiento = useMutation({
    mutationFn: async ({ item, tipo }: { item: ItemInventario; tipo: 'entrada' | 'salida' }) => {
      const { data } = await api.post('/inventario/movimiento', { item_id: item.id, tipo, cantidad: 1, motivo: tipo === 'entrada' ? 'Reposición' : 'Consumo' })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventario'] }),
  })

  const bajosStock = items.filter((i) => i.activo && i.alerta_minima != null && i.cantidad <= i.alerta_minima)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Inventario General</h1>
        <p className="text-xs text-slate-500">Control de insumos, papelería y equipos de la clínica.</p>
      </header>

      {bajosStock.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ {bajosStock.length} ítem(s) por debajo del mínimo: {bajosStock.map((b) => b.nombre).join(', ')}.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Nuevo ítem</h2>
          <div className="space-y-2">
            <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Cantidad" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input placeholder="Unidad (ej. caja)" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Alerta mín." value={form.alerta_minima} onChange={(e) => setForm({ ...form, alerta_minima: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="number" placeholder="Costo unit." value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <input placeholder="Proveedor" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Ubicación" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={() => create.mutate()} disabled={!form.nombre || create.isPending} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              Agregar
            </button>
            {msg && <Mensaje>{msg}</Mensaje>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Stock ({items.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-2">Ítem</th>
                  <th className="py-2 pr-2">Cat.</th>
                  <th className="py-2 pr-2 text-right">Cant.</th>
                  <th className="py-2 pr-2 text-right">Mín.</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.filter((i) => i.activo).map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <p className="font-medium text-slate-800">{i.nombre}</p>
                      <p className="text-xs text-slate-400">{i.proveedor ?? '—'} · {i.ubicacion ?? '—'}</p>
                    </td>
                    <td className="py-2 pr-2 capitalize text-slate-500">{i.categoria}</td>
                    <td className={`py-2 pr-2 text-right font-semibold ${i.alerta_minima != null && i.cantidad <= i.alerta_minima ? 'text-red-600' : 'text-slate-700'}`}>{i.cantidad} {i.unidad ?? ''}</td>
                    <td className="py-2 pr-2 text-right text-slate-400">{i.alerta_minima ?? '—'}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => movimiento.mutate({ item: i, tipo: 'entrada' })} disabled={movimiento.isPending} title="Entrada +1" className="rounded border border-brand-300 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">+1</button>
                        <button onClick={() => movimiento.mutate({ item: i, tipo: 'salida' })} disabled={movimiento.isPending || i.cantidad <= 0} title="Salida −1" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">−1</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.filter((i) => i.activo).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">Sin ítems registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

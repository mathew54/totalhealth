import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface Alergia {
  id: string
  paciente_id: string
  tipo: string
  nombre: string
  reaccion?: string | null
  severidad?: string | null
  activo: boolean
}

interface TatItem {
  nombre: string
  categoria: string
  total: number
  promedio_min: number
}

const SEVERIDAD = ['leve', 'moderada', 'grave']

export default function AtencionPage() {
  const qc = useQueryClient()
  const [pacienteId, setPacienteId] = useState('')

  const { data: alergias = [] } = useQuery<Alergia[]>({
    queryKey: ['atencion', 'alergias', pacienteId],
    enabled: Boolean(pacienteId),
    queryFn: async () => (await api.get(`/atencion/pacientes/${pacienteId}/alergias`)).data,
  })

  const { data: tat } = useQuery<TatItem[]>({
    queryKey: ['atencion', 'tat'],
    queryFn: async () => (await api.get('/atencion/tat')).data?.por_examen ?? [],
  })

  const [form, setForm] = useState({ nombre: '', tipo: 'medicamento', reaccion: '', severidad: 'moderada' })

  const alta = useMutation({
    mutationFn: async () => {
      if (!pacienteId) return
      const { data } = await api.post('/atencion/alergias', { ...form, paciente_id: pacienteId, reaccion: form.reaccion || null })
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['atencion', 'alergias', pacienteId] }); setForm({ nombre: '', tipo: 'medicamento', reaccion: '', severidad: 'moderada' }) },
  })

  const baja = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/atencion/alergias/${id}`, { activo: false })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atencion', 'alergias', pacienteId] }),
  })

  const eliminar = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/atencion/alergias/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atencion', 'alergias', pacienteId] }),
  })

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Atención & Seguridad</h1>
        <p className="text-xs text-slate-500">Alergias/contraindicaciones y tiempos de respuesta (TAT) del laboratorio.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Alergias / Contraindicaciones</h2>
          <input
            placeholder="ID del paciente (UUID)"
            value={pacienteId}
            onChange={(e) => setPacienteId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          {pacienteId && (
            <>
              <ul className="mb-4 space-y-1">
                {alergias.filter((a) => a.activo).map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{a.nombre}</span>
                      <span className="ml-2 text-xs capitalize text-slate-400">[{a.tipo}]</span>
                      {a.severidad && <span className={`ml-1 text-xs capitalize ${a.severidad === 'grave' ? 'text-red-600' : a.severidad === 'moderada' ? 'text-amber-600' : 'text-emerald-600'}`}>{a.severidad}</span>}
                      {a.reaccion && <p className="text-xs text-slate-500">{a.reaccion}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => baja.mutate(a.id)} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600">Inactivar</button>
                      <button onClick={() => eliminar.mutate(a.id)} className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600">Eliminar</button>
                    </div>
                  </li>
                ))}
                {alergias.filter((a) => a.activo).length === 0 && <p className="py-2 text-sm text-slate-400">Sin alergias registradas.</p>}
              </ul>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <input placeholder="Alergeno / medicamento" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="medicamento">Fármaco</option>
                    <option value="alimento">Alimento</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input placeholder="Reacción" value={form.reaccion} onChange={(e) => setForm({ ...form, reaccion: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <select value={form.severidad} onChange={(e) => setForm({ ...form, severidad: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    {SEVERIDAD.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={() => alta.mutate()} disabled={!form.nombre || alta.isPending} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                  Registrar alergia
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Turnaround Time del laboratorio</h2>
          <p className="mb-3 text-xs text-slate-500">Promedio de minutos desde la solicitud hasta el resultado, por examen.</p>
          <div className="space-y-1">
            {tat && tat.slice(0, 15).map((t) => (
              <div key={t.nombre} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                <span className="truncate text-slate-700">{t.nombre}</span>
                <span className="font-semibold text-slate-800">{t.promedio_min} min</span>
              </div>
            ))}
            {(!tat || tat.length === 0) && <p className="py-4 text-center text-sm text-slate-400">Sin datos de TAT todavía.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

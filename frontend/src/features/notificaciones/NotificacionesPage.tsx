import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

interface Notificacion {
  id: string
  paciente_id: string
  canal: string
  tipo: 'cita' | 'resultado' | 'domicilio'
  mensaje: string
  programada_para: string | null
  estado: 'pendiente' | 'enviada' | 'fallida'
  enviada_at: string | null
  created_at: string
}

const TIPO_LABEL: Record<string, string> = { cita: 'Cita', resultado: 'Resultado', domicilio: 'Domicilio' }
const CANAL_LABEL: Record<string, string> = { push: 'Push', whatsapp: 'WhatsApp', sms: 'SMS' }

export default function NotificacionesPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: notificaciones = [], isLoading } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones'],
    queryFn: async () => (await api.get('/notificaciones')).data,
  })

  const enviarPendientes = useMutation<{ enviadas: number }>({
    mutationFn: async () => (await api.post('/notificaciones/enviar-pendientes')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificaciones'] }),
    onError: (e) => setError(getApiError(e)),
  })

  const pendientes = notificaciones.filter((n) => n.estado === 'pendiente')
  const enviadas = notificaciones.filter((n) => n.estado === 'enviada')

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Recordatorios</h1>
          <p className="text-sm text-slate-500">Notificaciones de citas, resultados y domicilio</p>
        </div>
        <button
          onClick={() => enviarPendientes.mutate()}
          disabled={enviarPendientes.isPending || pendientes.length === 0}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {enviarPendientes.isPending ? 'Enviando…' : `Enviar pendientes (${pendientes.length})`}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {enviarPendientes.isSuccess && enviarPendientes.data.enviadas > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{enviarPendientes.data.enviadas} recordatorio(s) enviado(s).</p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Pendientes ({pendientes.length})</h2>
        <div className="space-y-2">
          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin recordatorios pendientes.</p>
          ) : (
            pendientes.map((n) => <NotifCard key={n.id} n={n} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Enviadas ({enviadas.length})</h2>
        <div className="space-y-2">
          {enviadas.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin historial.</p>
          ) : (
            enviadas.map((n) => <NotifCard key={n.id} n={n} />)
          )}
        </div>
      </section>
    </div>
  )
}

function NotifCard({ n }: { n: Notificacion }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{TIPO_LABEL[n.tipo] ?? n.tipo}</span>
        <span className="text-slate-400">{CANAL_LABEL[n.canal] ?? n.canal}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${n.estado === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {n.estado}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{n.mensaje}</p>
      <p className="mt-1 text-xs text-slate-400">
        {n.estado === 'enviada'
          ? `Enviada ${n.enviada_at ? new Date(n.enviada_at).toLocaleString() : ''}`
          : `Programada ${n.programada_para ? new Date(n.programada_para).toLocaleString() : ''}`}
      </p>
    </div>
  )
}
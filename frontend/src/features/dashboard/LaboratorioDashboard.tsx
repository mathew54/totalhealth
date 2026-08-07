import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'
import EtiquetaQRSolicitud from './widgets/EtiquetaQRSolicitud'

interface Solicitud {
  id: string
  estado: string
  paciente: { nombre_completo: string } | null
}
interface Alerta {
  id: string
  parametro: string
  valor: number | string
  paciente_id: string | null
}
interface Domicilio {
  id: string
  estado: string
}

const acciones = [
  { label: 'Cola de laboratorio', to: '/laboratorio', descripcion: 'Solicitudes y carga de resultados' },
  { label: 'Alertas clínicas', to: '/alertas', descripcion: 'Valores críticos sin revisar' },
  { label: 'Tomas a domicilio', to: '/domicilios', descripcion: 'Programación y ruta' },
  { label: 'Pacientes', to: '/pacientes', descripcion: 'Ficha y antecedentes' },
]

export default function LaboratorioDashboard() {
  const { profile } = useSessionStore()

  const { data: solicitudes = [] } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', 'resumen'],
    queryFn: async () => (await api.get('/solicitudes?limit=200')).data,
  })
  const { data: alertas = [] } = useQuery<Alerta[]>({
    queryKey: ['alertas', 'resumen'],
    queryFn: async () => (await api.get('/alertas?solo_no_leidas=true')).data,
  })
  const { data: domicilios = [] } = useQuery<Domicilio[]>({
    queryKey: ['domicilios', 'resumen'],
    queryFn: async () => (await api.get('/domicilios')).data,
  })

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length
  const enProceso = solicitudes.filter((s) => s.estado === 'en_proceso').length
  const enRuta = domicilios.filter((d) => d.estado === 'en_ruta' || d.estado === 'programada').length
  const criticas = alertas.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Dashboard de laboratorio</h2>
        <p className="text-sm text-slate-500">Resumen de la operación bioanalítica, {profile?.nombre_completo}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Solicitudes pendientes" valor={pendientes} tono={pendientes > 0 ? 'warning' : 'success'} hint="Esperando pre-analítica" />
        <StatCard label="En proceso" valor={enProceso} hint="Análisis en curso" />
        <StatCard label="Alertas críticas" valor={criticas} tono={criticas > 0 ? 'danger' : 'success'} hint="Valores sin revisar" />
        <StatCard label="Tomas a domicilio" valor={enRuta} hint="Programadas / en ruta" />
      </div>

      {criticas > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Hay <strong>{criticas}</strong> alerta(s) clínica(s) pendiente(s) de revisión. Revise la bandeja de alertas.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <EtiquetaQRSolicitud />
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Próximas solicitudes en cola</h3>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {pendientes + enProceso === 0 ? (
              <p className="text-xs text-slate-500">Sin solicitudes pendientes ni en proceso.</p>
            ) : (
              <ul className="space-y-2">
                {solicitudes
                  .filter((s) => s.estado === 'pendiente' || s.estado === 'en_proceso')
                  .slice(0, 6)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-700">{s.paciente?.nombre_completo ?? 'Paciente'}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">
                        {s.estado}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {acciones.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
          >
            <h3 className="text-sm font-semibold text-brand-700">{a.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{a.descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

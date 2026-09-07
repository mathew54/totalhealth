import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { jsPDF } from 'jspdf'
import { api } from '../../../lib/api'
import { generarQrDataUrl } from '../../../lib/qr'

interface Solicitud {
  id: string
  fecha: string
  estado: string
  paciente: { nombre_completo: string } | null
}

/** Etiqueta QR pre-analítica: selecciona una solicitud y genera etiqueta imprimible.
 *  Layout minimalista y elegante: detalles de la muestra a la izquierda, QR a la derecha. */
export default function EtiquetaQRSolicitud() {
  const { data: solicitudes = [] } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', 'etiquetas'],
    queryFn: async () => (await api.get('/solicitudes?limit=100')).data,
  })

  const enCola = useMemo(() => solicitudes.filter((s) => s.estado === 'pendiente' || s.estado === 'en_proceso'), [solicitudes])
  const [solicitudId, setSolicitudId] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState('')

  const solicitud = enCola.find((s) => s.id === solicitudId)
  const codigo = solicitud ? solicitud.id.slice(0, 8).toUpperCase() : ''

  async function generar() {
    if (!solicitud) return
    setError('')
    try {
      const payload = `TOTALHEALTH|SOLICITUD|${solicitud.id}|${solicitud.paciente?.nombre_completo ?? 'Paciente'}`
      const url = await generarQrDataUrl(payload, { width: 300 })
      setQr(url)
    } catch {
      setError('No se pudo generar el QR.')
    }
  }

  function imprimir() {
    if (!qr || !solicitud) return
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [80, 40] })
    // Encabezado de marca
    doc.setFillColor(31, 41, 55)
    doc.rect(0, 0, 80, 40, 'F')
    doc.setFillColor(139, 92, 246)
    doc.rect(0, 0, 3, 40, 'F')

    // Columna izquierda: detalles
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.text('TotalHealth · Solicitud', 8, 7)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(codigo, 8, 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(`Paciente: ${solicitud.paciente?.nombre_completo ?? 'Paciente'}`, 8, 18)
    doc.text(`Fecha: ${new Date(solicitud.fecha).toLocaleDateString('es-VE')}`, 8, 22)
    doc.text(`Estado: ${solicitud.estado}`, 8, 26)

    // Columna derecha: QR
    if (qr) {
      doc.addImage(qr, 'PNG', 44, 3, 30, 30)
      doc.setFontSize(5)
      doc.text('Verificar autenticidad', 48, 36)
    }
    doc.autoPrint()
    doc.save(`etiqueta-${codigo}.pdf`)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Etiqueta QR de solicitud</h3>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">
          Solicitud en cola ({enCola.length})
          <select value={solicitudId} onChange={(e) => { setSolicitudId(e.target.value); setQr(null) }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
            <option value="">— Seleccione —</option>
            {enCola.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8).toUpperCase()} · {s.paciente?.nombre_completo ?? 'Paciente'} · {s.estado}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void generar()}
          disabled={!solicitud}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Generar etiqueta
        </button>

        {qr && (
          <div className="mt-4 overflow-hidden rounded-xl bg-slate-900 text-white shadow-md">
            {/* Vista previa de la etiqueta: detalles izquierda + QR derecha */}
            <div className="flex items-stretch">
              <div className="w-1 bg-brand-500" />
              <div className="flex-1 space-y-1 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">TotalHealth · Solicitud</p>
                <p className="text-xl font-bold tracking-widest text-white">{codigo}</p>
                <div className="space-y-0.5 pt-2 text-xs text-slate-300">
                  <p><span className="text-slate-500">Paciente:</span> {solicitud?.paciente?.nombre_completo ?? '—'}</p>
                  <p><span className="text-slate-500">Fecha:</span> {solicitud ? new Date(solicitud.fecha).toLocaleDateString('es-VE') : '—'}</p>
                  <p><span className="text-slate-500">Estado:</span> {solicitud?.estado ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 border-l border-white/10 p-4">
                <img src={qr} alt="Código QR" className="h-24 w-24 bg-white p-1" />
                <span className="text-[9px] text-slate-400">Verificar</span>
              </div>
            </div>
          </div>
        )}

        {qr && !error && (
          <button onClick={imprimir} className="w-full rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            Imprimir etiqueta PDF
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { api } from '../../../lib/api'

interface Solicitud {
  id: string
  fecha: string
  estado: string
  paciente: { nombre_completo: string } | null
}

/** Etiqueta QR pre-analítica: selecciona una solicitud y genera etiqueta imprimible. */
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

  async function generar() {
    if (!solicitud) return
    setError('')
    try {
      const payload = `TOTALHEALTH|SOLICITUD|${solicitud.id}|${solicitud.paciente?.nombre_completo ?? 'Paciente'}`
      const url = await QRCode.toDataURL(payload, { width: 420, margin: 1, errorCorrectionLevel: 'M' })
      setQr(url)
    } catch {
      setError('No se pudo generar el QR.')
    }
  }

  function imprimir() {
    if (!qr || !solicitud) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [60, 40] })
    const codigo = solicitud.id.slice(0, 8).toUpperCase()
    doc.setFontSize(8)
    doc.text(`TotalHealth · Solicitud ${codigo}`, 5, 5)
    doc.setFontSize(6)
    doc.text(solicitud.paciente?.nombre_completo ?? 'Paciente', 5, 9)
    doc.text(new Date(solicitud.fecha).toLocaleDateString('es-VE'), 5, 12)
    doc.addImage(qr, 'PNG', 5, 14, 30, 20)
    doc.text('Escanear para verificar', 5, 37)
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
          <>
            <div className="flex justify-center rounded-lg bg-white p-2">
              <img src={qr} alt="Código QR de la solicitud" className="h-28 w-28" />
            </div>
            <button onClick={imprimir} className="w-full rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Imprimir etiqueta PDF
            </button>
          </>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jsPDF } from 'jspdf'
import { api, getApiError } from '../../lib/api'
import { useConfigStore } from '../../lib/configStore'
import type { ExamenCatalogo, OrdenLaboratorio } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
  nombrePaciente: string
  cedulaPaciente: string | null
}

/** Orden de exámenes de laboratorio (CPOE): multiselect + paquetes + PDF firmado. */
export default function PanelOrdenes({ pacienteId, nombrePaciente, cedulaPaciente }: Props) {
  const queryClient = useQueryClient()
  const config = useConfigStore((s) => s)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: catalogo = [] } = useQuery<ExamenCatalogo[]>({
    queryKey: ['examenes', 'solicitud'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const { data: ordenes = [] } = useQuery<OrdenLaboratorio[]>({
    queryKey: ['expediente', 'ordenes', pacienteId],
    queryFn: async () => (await api.get(`/expediente/ordenes?paciente_id=${pacienteId}`)).data,
  })

  // Exámenes agrupados por tema (Perfil 20, Hematología, …).
  const porTema = useMemo(() => {
    const grupos = new Map<string, ExamenCatalogo[]>()
    for (const ex of catalogo) {
      const tema = ex.categoria || 'Otros'
      grupos.set(tema, [...(grupos.get(tema) ?? []), ex])
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [catalogo])

  // Paquetes rápidos (order panels): los 2 primeros exámenes de cada tema.
  const paquetes = useMemo(() => porTema.slice(0, 4), [porTema])

  const guardar = useMutation({
    mutationFn: async () => {
      // Crea la orden en la tubería real de laboratorio (solicitudes).
      const { data } = await api.post<OrdenLaboratorio>('/solicitudes', {
        paciente_id: pacienteId,
        examenes: seleccion,
        nota,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'ordenes', pacienteId] })
      setSeleccion([])
      setNota('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function toggle(id: string) {
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  /** Selecciona/desmarca todos los exámenes de un tema (paquete rápido). */
  function togglePaquete(examenes: ExamenCatalogo[]) {
    const ids = examenes.map((e) => e.id)
    const todosMarcados = ids.every((id) => seleccion.includes(id))
    setSeleccion((s) => (todosMarcados ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]))
  }

  const itemsSeleccionados = catalogo.filter((c) => seleccion.includes(c.id))
  const total = itemsSeleccionados.reduce((acc, c) => acc + Number(c.precio ?? 0), 0)

  /** Genera y descarga la orden médica digital firmada en PDF. */
  function descargarPdf(orden: OrdenLaboratorio) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const margin = 16
    const width = 210 - margin * 2
    let y = 18

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(config.razon_social || 'TotalHealth', margin, y)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110)
    if (config.rif) doc.text(`R.I.F. ${config.rif}`, margin, y + 5)

    y += 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(139, 92, 246)
    doc.text('ORDEN MÉDICA DE EXÁMENES DE LABORATORIO', margin, y)
    doc.setTextColor(40)

    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Paciente: ${nombrePaciente}`, margin, y)
    y += 5
    doc.text(`Cédula: ${cedulaPaciente ?? '—'}`, margin, y)
    y += 5
    doc.text(`Fecha: ${new Date(orden.created_at).toLocaleString('es-VE')}`, margin, y)
    y += 5
    doc.text(`N° de orden: ${orden.id.slice(0, 8).toUpperCase()}`, margin, y)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.text('Exámenes solicitados:', margin, y)
    doc.setFont('helvetica', 'normal')
    for (const ex of orden.examenes) {
      y += 5
      doc.text(`• ${ex.nombre} (${ex.tema})`, margin + 3, y)
      if (ex.precio != null) {
        doc.text(`Bs. ${Number(ex.precio).toFixed(2)}`, margin + width - 20, y)
      }
    }
    if (orden.examenes.some((e) => e.precio != null)) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.text(
        `Total: Bs. ${orden.examenes.reduce((a, e) => a + Number(e.precio ?? 0), 0).toFixed(2)}`,
        margin + width - 40,
        y,
      )
    }

    if (orden.nota) {
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.text(`Indicaciones: ${orden.nota}`, margin, y)
    }

    y += 18
    doc.setDrawColor(120)
    doc.line(margin, y, margin + 60, y)
    doc.setFontSize(9)
    doc.text('Firma del médico', margin, y + 5)

    doc.save(`orden-${orden.id.slice(0, 8)}.pdf`)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Nueva orden de laboratorio (CPOE)</h3>
        <p className="mb-3 text-[11px] text-slate-500">Paciente: {nombrePaciente}</p>

        {/* Paquetes rápidos */}
        {paquetes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {paquetes.map(([tema, examenes]) => {
              const marcado = examenes.every((e) => seleccion.includes(e.id))
              return (
                <button
                  key={tema}
                  type="button"
                  onClick={() => togglePaquete(examenes)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                    marcado
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tema} {marcado ? '✓' : '+ Paquete'}
                </button>
              )
            })}
          </div>
        )}

        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {porTema.map(([tema, examenes]) => (
            <div key={tema}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tema}</p>
              <div className="grid gap-1.5">
                {examenes.map((ex) => (
                  <label key={ex.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={seleccion.includes(ex.id)}
                      onChange={() => toggle(ex.id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="flex-1 text-sm text-slate-700">{ex.nombre}</span>
                    {ex.precio != null && <span className="text-[11px] text-slate-400">Bs. {Number(ex.precio).toFixed(2)}</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Indicaciones para el laboratorio (opcional)"
          className={`${inputCls} mt-3`}
        />

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {itemsSeleccionados.length} examen(es) · Total Bs. {total.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || seleccion.length === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {guardar.isPending ? 'Enviando…' : 'Firmar y enviar al laboratorio'}
          </button>
        </div>
      </div>

      {ordenes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Órdenes enviadas</h3>
          {ordenes.map((o) => (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">{o.examenes.map((e) => e.nombre).join(', ')}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                  o.estado === 'listo' || o.estado === 'entregado'
                    ? 'bg-emerald-100 text-emerald-700'
                    : o.estado === 'en_proceso'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-sky-100 text-sky-700'
                }`}>
                  {o.estado}
                </span>
              </div>
              {o.nota && <p className="mt-1 text-[11px] italic text-slate-500">{o.nota}</p>}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{new Date(o.created_at).toLocaleString('es-VE')}</span>
                <button
                  type="button"
                  onClick={() => descargarPdf(o)}
                  className="rounded-lg border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
                >
                  📄 Descargar PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
import { jsPDF } from 'jspdf'
import { capitalizar, dibujarCabeceraMarca, type Branding } from './pdf'

interface CorreccionPdf {
  tipo: 'fe_errata' | 'adenda'
  contenido: Record<string, unknown>
  medico_nombre: string | null
  firma: string
  created_at: string
}

interface RegistroPdf {
  tipo: string
  titulo: string
  contenido: Record<string, unknown>
  medico_nombre: string | null
  categoria_origen_nombre: string | null
  firma: string
  correcciones: CorreccionPdf[]
  created_at: string
}

interface ResultadoLineaPdf {
  examen: string
  resultado: {
    valores: Record<string, unknown> | null
    observaciones: string | null
    procesado_at: string | null
  } | null
}

interface ResultadoPdf {
  fecha: string
  estado: string
  cobrado: boolean
  lineas: ResultadoLineaPdf[]
}

interface InterconsultaPdf {
  motivo: string
  hipotesis: string | null
  respuesta: string | null
  medico_origen_nombre: string | null
  medico_destino_nombre: string | null
  medico_responde_nombre: string | null
  categoria_destino_nombre: string | null
  especialidad_destino_nombre: string | null
  estado: string
  created_at: string
}

interface EvolucionPdf {
  subjetivo: string
  objetivo: string
  evaluacion: string
  plan: string
  signos_vitales: Record<string, number | null>
  especialidad_nombre?: string | null
  created_at: string
}

interface AlertaPdf {
  tipo: string
  descripcion: string
  severidad: 'alta' | 'media'
  activa: boolean
  created_at: string
}

export interface DatosExpedientePdf {
  paciente: {
    nombre_completo: string
    cedula: string | null
    telefono?: string | null
    fecha_nacimiento?: string | null
    sexo?: string | null
  }
  alertas: AlertaPdf[]
  anamnesis: { nombre: string; items: { etiqueta: string; detalle: string }[] }[]
  observaciones: string
  historial: RegistroPdf[]
  evoluciones: EvolucionPdf[]
  interconsultas: InterconsultaPdf[]
  resultados: ResultadoPdf[]
  branding?: Branding
}

const A4_W = 210
const MARGIN = 16
const CONTENT_W = A4_W - MARGIN * 2
const PAGE_H = 297
const FONT_H = 5

function newPage(doc: jsPDF, _y: number): number {
  doc.addPage()
  return MARGIN
}

/** Escribe líneas de texto en el PDF; si se pasa del pie de página, corta la página. */
function escribir(doc: jsPDF, texto: string, x: number, y: number, maxW: number, size = 10): number {
  doc.setFontSize(size)
  const lineas = doc.splitTextToSize(texto, maxW) as string[]
  let yActual = y
  for (const linea of lineas) {
    if (yActual > PAGE_H - MARGIN) {
      yActual = newPage(doc, yActual)
    }
    doc.text(linea, x, yActual)
    yActual += FONT_H + 1
  }
  return yActual
}

function tituloSeccion(doc: jsPDF, y: number, titulo: string): number {
  if (y > PAGE_H - MARGIN - 10) y = newPage(doc, y)
  doc.setDrawColor(180)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y, A4_W - MARGIN, y)
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30)
  doc.text(titulo, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  return y + 6
}

function valoresTexto(valores: Record<string, unknown> | null): string {
  if (!valores) return ''
  const partes: string[] = []
  for (const [k, v] of Object.entries(valores)) {
    if (v === null || v === undefined || v === '') continue
    partes.push(`${capitalizar(k)}: ${String(v)}`)
  }
  return partes.join(' · ')
}

/**
 * Genera y descarga un PDF con el expediente completo del paciente
 * (anamnesis, alertas, historial, evoluciones, interconsultas y resultados de
 * laboratorio) usando jsPDF y la cabecera de marca compartida.
 */
export async function descargarExpedientePdf(datos: DatosExpedientePdf): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  // ---- Cabecera de marca ----
  y = await dibujarCabeceraMarca(doc, datos.branding, MARGIN, y)
  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, A4_W - MARGIN, y)
  y += 6

  // ---- Título + paciente ------------------------------------------------
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30)
  doc.text('Expediente Clínico', MARGIN, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(110)
  doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, A4_W - MARGIN, y, { align: 'right' })
  y += 8

  const p = datos.paciente
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text(p.nombre_completo, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70)
  doc.text(`Cédula: ${p.cedula ?? 'Menor de edad'}`, 120, y)
  y += 5
  const extra = [
    p.fecha_nacimiento ? `F. nacimiento: ${p.fecha_nacimiento}` : null,
    p.sexo ? `Sexo: ${p.sexo}` : null,
    p.telefono ? `Tel: ${p.telefono}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  if (extra) {
    doc.setTextColor(80)
    doc.text(extra, MARGIN, y)
    y += 5
  }
  y += 4

  // ---- Alertas críticas --------------------------------------------------
  if (datos.alertas.length > 0) {
    y = tituloSeccion(doc, y, 'Alertas críticas del paciente')
    for (const a of datos.alertas) {
      if (!a.activa) continue
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(180, 30, 30)
      doc.text(`${a.tipo.replace(/_/g, ' ').toUpperCase()} — ${a.severidad.toUpperCase()}`, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(50)
      y = escribir(doc, a.descripcion, MARGIN + 3, y + 5, CONTENT_W - 3, 9)
      y += 2
    }
  }

  // ---- Anamnesis ----------------------------------------------------------
  if (datos.anamnesis.length > 0 || datos.observaciones) {
    y = tituloSeccion(doc, y, 'Anamnesis (Cuestionario de historial médico)')
    for (const modulo of datos.anamnesis) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(30)
      doc.text(modulo.nombre, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      y += 5
      for (const item of modulo.items) {
        const texto = item.detalle ? `${item.etiqueta} — ${item.detalle}` : item.etiqueta
        y = escribir(doc, `• ${texto}`, MARGIN + 3, y, CONTENT_W - 3, 9)
      }
      y += 1
    }
    if (datos.observaciones) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Otros / Observaciones Adicionales', MARGIN, y)
      doc.setFont('helvetica', 'normal')
      y += 5
      y = escribir(doc, datos.observaciones, MARGIN + 3, y, CONTENT_W - 3, 9)
      y += 1
    }
  }

  // ---- Historial clínico ---------------------------------------------------
  if (datos.historial.length > 0) {
    y = tituloSeccion(doc, y, 'Historial clínico compartido')
    for (const r of datos.historial) {
      if (y > PAGE_H - MARGIN - 30) y = newPage(doc, y)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(40)
      doc.text(`${capitalizar(r.tipo)} · ${r.titulo}`, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(110)
      doc.text(
        `${r.medico_nombre ?? 'Médico'}${r.categoria_origen_nombre ? ` · ${r.categoria_origen_nombre}` : ''} · ${new Date(r.created_at).toLocaleString('es-VE')}`,
        MARGIN,
        y + 4,
      )
      doc.setTextColor(60)
      y += 9
      y = escribir(doc, r.contenido ? String(r.contenido.texto ?? JSON.stringify(r.contenido)) : '—', MARGIN, y, CONTENT_W, 9)
      y += 2
      for (const c of r.correcciones) {
        if (y > PAGE_H - MARGIN - 12) y = newPage(doc, y)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(180, 120, 0)
        doc.text(`[${c.tipo === 'fe_errata' ? 'FE DE ERRATAS' : 'ADENDA'}] ${c.medico_nombre ?? 'Médico'} · ${new Date(c.created_at).toLocaleString('es-VE')}`, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 4
        y = escribir(doc, c.contenido ? String(c.contenido.texto ?? JSON.stringify(c.contenido)) : '—', MARGIN + 3, y, CONTENT_W - 3, 8)
        y += 2
      }
      y += 3
    }
  }

  // ---- Evoluciones SOAP ------------------------------------------------------
  if (datos.evoluciones.length > 0) {
    y = tituloSeccion(doc, y, 'Evoluciones (SOAP)')
    for (const ev of datos.evoluciones) {
      if (y > PAGE_H - MARGIN - 30) y = newPage(doc, y)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(40)
      doc.text(new Date(ev.created_at).toLocaleString('es-VE'), MARGIN, y)
      doc.setFont('helvetica', 'normal')
      y += 5
      const vitales = valoresTexto(ev.signos_vitales ?? {})
      if (vitales) {
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(`Signos vitales: ${vitales}`, MARGIN, y)
        y += 4
      }
      for (const [titulo, contenido] of [
        ['Subjetivo', ev.subjetivo],
        ['Objetivo', ev.objetivo],
        ['Evaluación', ev.evaluacion],
        ['Plan', ev.plan],
      ] as const) {
        if (!contenido) continue
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(90)
        doc.text(titulo, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(50)
        y += 4
        y = escribir(doc, contenido, MARGIN + 3, y, CONTENT_W - 3, 8)
      }
      y += 3
    }
  }

  // ---- Interconsultas ----------------------------------------------------------
  if (datos.interconsultas.length > 0) {
    y = tituloSeccion(doc, y, 'Interconsultas')
    for (const ic of datos.interconsultas) {
      if (y > PAGE_H - MARGIN - 30) y = newPage(doc, y)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(40)
      const destino = ic.categoria_destino_nombre ?? ic.especialidad_destino_nombre ?? 'Especialidad'
      doc.text(`→ ${destino} · ${ic.estado}`, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(110)
      doc.text(
        `${ic.medico_origen_nombre ?? 'Médico'} → ${ic.medico_destino_nombre ?? 'bandeja de la especialidad'} · ${new Date(ic.created_at).toLocaleString('es-VE')}`,
        MARGIN,
        y + 4,
      )
      doc.setTextColor(50)
      y += 9
      y = escribir(doc, ic.motivo, MARGIN, y, CONTENT_W, 9)
      if (ic.hipotesis) {
        doc.setFontSize(8)
        doc.setTextColor(90)
        doc.text(`Hipótesis: ${ic.hipotesis}`, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 4
      }
      if (ic.respuesta) {
        doc.setFontSize(8)
        doc.setTextColor(0, 120, 80)
        y = escribir(doc, `Respuesta: ${ic.respuesta}${ic.medico_responde_nombre ? ` — ${ic.medico_responde_nombre}` : ''}`, MARGIN, y, CONTENT_W, 8)
      }
      y += 3
    }
  }

  // ---- Resultados de laboratorio ------------------------------------------------
  if (datos.resultados.length > 0) {
    y = tituloSeccion(doc, y, 'Laboratorio / Resultados')
    for (const s of datos.resultados) {
      if (y > PAGE_H - MARGIN - 30) y = newPage(doc, y)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(40)
      doc.text(
        `Solicitud · ${new Date(s.fecha).toLocaleString('es-VE')} · ${s.estado.replace(/_/g, ' ')}${s.cobrado ? ' · pagada' : ''}`,
        MARGIN,
        y,
      )
      doc.setFont('helvetica', 'normal')
      y += 5
      for (const l of s.lineas) {
        if (y > PAGE_H - MARGIN - 12) y = newPage(doc, y)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(30)
        doc.text(l.examen, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        if (l.resultado) {
          const valores = valoresTexto(l.resultado.valores)
          const obs = l.resultado.observaciones
          const texto = [valores && `Resultado: ${valores}`, obs && `Obs: ${obs}`].filter(Boolean).join(' · ')
          doc.setTextColor(60)
          y = escribir(doc, texto || 'Sin resultado.', MARGIN + 3, y + 4, CONTENT_W - 3, 8)
        } else {
          doc.setTextColor(130)
          y = escribir(doc, 'Sin resultado.', MARGIN + 3, y + 4, CONTENT_W - 3, 8)
        }
      }
      y += 3
    }
  }

  // ---- Pie: firma digital del expediente -------------------------------------
  y = tituloSeccion(doc, y, 'Documento generado')
  doc.setFontSize(8)
  doc.setTextColor(110)
  y = escribir(
    doc,
    `Expediente del paciente ${p.nombre_completo} (${p.cedula ?? 'sin cédula'}). Documento generado automáticamente por el sistema de gestión clínica.`,
    MARGIN,
    y,
    CONTENT_W,
    8,
  )

  const cedula = (p.cedula ?? 'menor').replace(/[^a-z0-9]/gi, '-')
  doc.save(`expediente-${cedula}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
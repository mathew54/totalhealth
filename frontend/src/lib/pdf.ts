import { jsPDF } from 'jspdf'

export interface PacientePdf {
  cedula: string
  nombre_completo: string
}

export interface Branding {
  razon_social?: string
  rif?: string
  direccion?: string | null
  telefono?: string | null
  logo_url?: string
}

export interface ResultadoPdf {
  paciente: PacientePdf
  examen: string
  fecha: string
  valores: Record<string, unknown> | null
  observaciones: string | null
  branding?: Branding
}

export function resumenDeResultado(r: ResultadoPdf): string {
  const partes: string[] = []
  if (r.valores) {
    for (const [k, val] of Object.entries(r.valores)) {
      if (val === null || val === undefined || val === '') continue
      partes.push(`${formatearClave(k)}: ${String(val)}`)
    }
  }
  if (r.observaciones) partes.push(r.observaciones)
  return partes.join(' · ') || 'Sin datos'
}

function formatearClave(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Carga el logo como PNG dataURL para incrustarlo en el PDF (canvas). */
async function loadLogoDataUrl(src: string): Promise<string | null> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return null
    if (/^data:image\/(png|jpe?g)/i.test(src)) return src
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
    })
    const size = Math.min(img.naturalWidth || 64, 96)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Genera y descarga un PDF con el resultado del paciente usando jsPDF.
 * Incluye la cabecera de marca (razón social, RIF y logo) si existe branding.
 */
export async function descargarResultadoPdf(r: ResultadoPdf): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const contentWidth = 210 - margin * 2
  let y = 18

  // ---- Cabecera de marca ----
  const nombre = r.branding?.razon_social || 'TotalHealth'
  const rif = r.branding?.rif || ''
  const direccion = r.branding?.direccion || ''
  const telefono = r.branding?.telefono || ''
  let logo: string | null = null
  if (r.branding?.logo_url) logo = await loadLogoDataUrl(r.branding.logo_url)

  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margin, y, 12, 12)
    } catch {
      logo = null
    }
  }
  const textX = logo ? margin + 16 : margin
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text(nombre, textX, y + 6)
  if (rif) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text(`R.I.F. ${rif}`, textX, y + 11)
  }
  if (direccion || telefono) {
    doc.setFontSize(8)
    doc.setTextColor(120)
    const contacto = [direccion && `Dir: ${direccion}`, telefono && `Tel: ${telefono}`].filter(Boolean).join(' · ')
    doc.text(doc.splitTextToSize(contacto, contentWidth - textX + margin) as string, textX, y + 15)
  }
  y += 16

  y += 2
  doc.line(margin, y, 210 - margin, y)
  y += 8

  // ---- Título + paciente ------------------------------------
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text('Reporte de Resultados', margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70)
  doc.text(`Paciente: ${r.paciente.nombre_completo}`, margin, y)
  doc.text(`Cédula: ${r.paciente.cedula}`, 120, y)
  y += 6
  doc.text(`Examen: ${r.examen}`, margin, y)
  doc.text(`Fecha: ${r.fecha}`, 120, y)
  y += 8

  // ---- Valores -----------------------------------------------
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text('Valores', margin, y)
  doc.setFont('helvetica', 'normal')
  y += 6

  if (r.valores && Object.keys(r.valores).length) {
    for (const [k, val] of Object.entries(r.valores)) {
      if (val === null || val === undefined || val === '') continue
      const lineasValor = doc.splitTextToSize(String(val), contentWidth - 100) as string[]
      doc.setTextColor(70)
      doc.text(formatearClave(k), margin, y)
      doc.setTextColor(50)
      doc.text(lineasValor, 120, y)
      y += lineasValor.length * 5 + 2
    }
  } else {
    doc.setTextColor(110)
    doc.text('Sin valores registrados.', margin, y)
    y += 6
  }

  // ---- Observaciones -------------------------------------------
  if (r.observaciones) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40)
    doc.text('Observaciones', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 6
    doc.setTextColor(60)
    doc.text(doc.splitTextToSize(r.observaciones, contentWidth), margin, y)
  }

  doc.save(`resultado-${r.examen.replace(/[^a-z0-9]/gi, '-')}-${r.fecha}.pdf`)
}

export { formatearClave as capitalizar }
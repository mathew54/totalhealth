import { jsPDF, GState } from 'jspdf'
import { formatearTelefono } from './phone'

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

export interface BioanalistaPdf {
  nombre?: string | null
  titulo?: string | null
  colegiatura?: string | null
  firma_imagen?: string | null
  sello_imagen?: string | null
}

export interface ResultadoPdf {
  paciente: PacientePdf
  examen: string
  fecha: string
  valores: Record<string, unknown> | null
  observaciones: string | null
  branding?: Branding
  // Profesional responsable: firma + sello húmedo + datos de registro.
  bioanalista?: BioanalistaPdf
  procesadoAt?: string
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
 * Dibuja la cabecera de marca del PDF (logo + razón social + RIF + contacto).
 * Devuelve la coordenada `y` actualizada: la línea divisoria va justo ahí.
 * Compartida por todos los PDFs de la app (resultados y facturas).
 */
export async function dibujarCabeceraMarca(
  doc: jsPDF,
  branding: Branding | undefined,
  margin: number,
  y: number,
): Promise<number> {
  const nombre = branding?.razon_social || 'TotalHealth'
  const rif = branding?.rif || ''
  const direccion = branding?.direccion || ''
  const telefono = formatearTelefono(branding?.telefono) || ''
  let logo: string | null = null
  if (branding?.logo_url) logo = await loadLogoDataUrl(branding.logo_url)

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margin, y, 12, 12)
    } catch {
      logo = null
    }
  }
  const textX = logo ? margin + 16 : margin
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text(nombre, textX, y + 6)
  if (rif) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110)
    doc.text(`R.I.F. ${rif}`, textX, y + 11)
  }
  if (direccion || telefono) {
    doc.setFontSize(8)
    doc.setTextColor(110)
    const contacto = [direccion && `Dir: ${direccion}`, telefono && `Tel: ${telefono}`].filter(Boolean).join(' · ')
    doc.text(doc.splitTextToSize(contacto, 210 - margin * 2 - (textX - margin)) as string, textX, y + 15)
  }
  return y + 16
}

/** Carga la imagen en un <img> para conocerle su tamaño natural (proporción). */
async function cargarImagenNat(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null
  try {
    const img = new Image()
    img.src = src
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
    })
    return img
  } catch {
    return null
  }
}

/** Fecha/hora de validación legible (p. ej. "08/09/2026 10:32"). */
function formatearFechaHora(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return (
    `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  ).trim()
}

/**
 * Estampa el sello húmedo como marca de agua (fondo semi-transparente) de todo
 * el reporte. Se dibuja ANTES que la cabecera y el contenido para quedar detrás.
 */
async function dibujarSelloAgua(doc: jsPDF, sello_imagen: string): Promise<void> {
  const img = await cargarImagenNat(sello_imagen)
  if (!img || !img.naturalWidth || !img.naturalHeight) return
  try {
    doc.setGState(new GState({ opacity: 0.1 }))
    doc.addImage(img, 'PNG', 30, 78, 150, 150)
    doc.setGState(new GState({ opacity: 1 }))
  } catch {
    doc.setGState(new GState({ opacity: 1 }))
  }
}

/**
 * Dibuja el bloque de firma del profesional responsable al pie del reporte:
 * imagen de firma, línea, nombre, título y colegiatura + fecha/hora de validación.
 * Devuelve la coordenada `y` final (no vuelve a usarse).
 */
async function dibujarFirmaResponsable(
  doc: jsPDF,
  bioanalista: BioanalistaPdf | undefined,
  margin: number,
  contentWidth: number,
  y: number,
  procesadoAt: string | undefined,
): Promise<number> {
  const nombre = bioanalista?.nombre?.trim() ?? ''
  const colegiatura = (bioanalista?.colegiatura?.trim() ?? '').trim()
  const titulo = (bioanalista?.titulo?.trim() ?? '').trim() || 'Lic. en Bioanálisis'
  const tieneFirma = Boolean(bioanalista?.firma_imagen)

  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, 210 - margin, y)
  y += 8

  const anchoFirma = 65
  const xFirma = margin + (contentWidth - anchoFirma) / 2

  // Imagen de firma sobre la línea.
  let yLinea = y + 5
  if (tieneFirma && bioanalista?.firma_imagen) {
    const img = await cargarImagenNat(bioanalista.firma_imagen)
    if (img && img.naturalWidth && img.naturalHeight) {
      const aspect = img.naturalHeight / img.naturalWidth
      const altoFirma = Math.min(anchoFirma * aspect, 22)
      try {
        doc.addImage(img, 'PNG', xFirma, y, anchoFirma, altoFirma)
        yLinea = y + altoFirma + 3
      } catch {
        yLinea = y + 5
      }
    }
  }

  // Línea + nombres bajo la firma.
  doc.line(xFirma, yLinea, xFirma + anchoFirma, yLinea)
  y = yLinea + 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text(nombre || (tieneFirma ? ' ' : 'Profesional responsable'), xFirma + anchoFirma / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(110)
  const credenciales = [titulo, colegiatura && `Reg. ${colegiatura}`].filter(Boolean).join(' · ')
  doc.text(credenciales || '\u00A0', xFirma + anchoFirma / 2, y, { align: 'center' })

  const validado = formatearFechaHora(procesadoAt)
  if (validado) {
    y += 7
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Validado el ${validado}`, xFirma + anchoFirma / 2, y, { align: 'center' })
  }
  return y
}

/**
 * Genera y descarga un PDF con el resultado del paciente usando jsPDF.
 * Incluye la cabecera de marca (razón social, RIF y logo) si existe branding,
 * y al pie la firma + sello húmedo del bioanalista responsable.
 */
export async function descargarResultadoPdf(r: ResultadoPdf): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const contentWidth = 210 - margin * 2
  let y = 18

  // ---- Sello húmedo como marca de agua (detrás de todo) ----
  if (r.bioanalista?.sello_imagen) await dibujarSelloAgua(doc, r.bioanalista.sello_imagen)

  // ---- Cabecera de marca ----
  y = await dibujarCabeceraMarca(doc, r.branding, margin, y)
  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
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

  // ---- Firma del profesional responsable -------------------------
  if (r.bioanalista) {
    y += 6
    if (y > 235) {
      doc.addPage()
      y = 18
    }
    y = await dibujarFirmaResponsable(doc, r.bioanalista, margin, contentWidth, y, r.procesadoAt)
  }

  doc.save(`resultado-${r.examen.replace(/[^a-z0-9]/gi, '-')}-${r.fecha}.pdf`)
}

export { formatearClave as capitalizar }
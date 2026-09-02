import { jsPDF } from 'jspdf'
import { dibujarCabeceraMarca, type Branding } from './pdf'

export interface FacturaLinea {
  descripcion: string
  cantidad: number
  precio: number
  precio_iva: number
}

/** Respuesta de GET /api/pagos/:id/factura (y datos para el PDF). */
export interface FacturaResp {
  factura: {
    serie: string
    control: string
    tipo: string
    emisor: { razon_social: string; rif: string; direccion?: string | null; telefono?: string | null }
    receptor: { nombre: string; cedula: string | null }
    fecha: string
    moneda: string
    lineas: FacturaLinea[]
    base: number
    iva: number
    monto: number
  }
  base: number
  iva: number
  monto: number
  descuento: number
  monto_texto: string
  moneda?: string
  tasa_usd?: number | null
  monto_usd?: number | null
  base_exenta?: number
  igtf?: number
  retencion_iva?: number
  retencion_islr?: number
  iva_porcentaje?: number
}

export type FacturaPdfData = FacturaResp

function formatearMoneda(moneda: string, n: number): string {
  return `${moneda === 'USD' ? '$' : 'Bs. '}${n.toFixed(2)}`
}

/**
 * Genera y descarga el comprobante/recibo/factura fiscal (VE) en PDF.
 */
export async function descargarFacturaPdf(data: FacturaPdfData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const width = 210 - margin * 2
  const f = data.factura

  let y = 16
  const branding: Branding = {
    razon_social: f.emisor.razon_social,
    rif: f.emisor.rif,
    direccion: f.emisor.direccion,
    telefono: f.emisor.telefono,
  }
  y = await dibujarCabeceraMarca(doc, branding, margin, y)

  // Tributo / control (derecha, dentro de la banda de la cabecera)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(139, 92, 246)
  const titulo = f.tipo === 'factura' ? 'FACTURA' : f.tipo === 'recibo' ? 'RECIBO DE PAGO' : 'COMPROBANTE'
  doc.text(titulo, margin + width - doc.getTextWidth(titulo), y - 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`Serie: ${f.serie}`, margin + width - doc.getTextWidth(`Serie: ${f.serie}`), y - 8)
  doc.text(`N° de control: ${f.control}`, margin + width - doc.getTextWidth(`N° de control: ${f.control}`), y - 4)

  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, 210 - margin, y)
  y += 8

  // Datos
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text('Datos del receptor', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70)
  doc.text(f.receptor.nombre, margin, y)
  doc.text(f.receptor.cedula ? `C.I. ${f.receptor.cedula}` : '', margin + 110, y)
  y += 5
  doc.setTextColor(110)
  doc.text('Fecha: ' + new Date(f.fecha).toLocaleString(), margin, y)
  y += 8

  // Tabla de conceptos
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text('Concepto', margin, y)
  doc.text('Cant.', margin + 120, y)
  doc.text('Precio', margin + 140, y)
  doc.text('Subtotal', 210 - margin - 20, y)
  y += 4
  doc.setDrawColor(200)
  doc.line(margin, y, margin + width, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  const moneda = f.moneda
  const precioCol = margin + 140
  const subCol = 210 - margin - 20
  for (const l of f.lineas) {
    doc.setTextColor(60)
    doc.text(doc.splitTextToSize(l.descripcion, 115)[0] as string, margin, y)
    doc.text(String(l.cantidad), margin + 120, y)
    doc.text(formatearMoneda(moneda, l.precio), precioCol, y, { align: 'right' })
    doc.text(formatearMoneda(moneda, l.precio_iva * l.cantidad), subCol, y, { align: 'right' })
    y += 6
  }

  // Totales
  y += 4
  const totalX = 210 - margin
  const labelX = margin + width - 55
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70)
  const baseExenta = data.base_exenta ?? 0
  const baseGravada = f.base - baseExenta
  doc.text('Base gravada', labelX, y)
  doc.text(formatearMoneda(moneda, baseGravada), totalX, y, { align: 'right' })
  y += 6
  if (baseExenta > 0) {
    doc.text('Base exenta', labelX, y)
    doc.text(formatearMoneda(moneda, baseExenta), totalX, y, { align: 'right' })
    y += 6
  }
  const ivaPct = data.iva_porcentaje ?? (data.base > 0 ? data.iva / data.base : 0)
  doc.text(`IVA (${Math.round(ivaPct * 100)}%)`, labelX, y)
  doc.text(formatearMoneda(moneda, data.iva), totalX, y, { align: 'right' })
  y += 6
  if (data.descuento > 0) {
    doc.setTextColor(214, 40, 40)
    doc.text('Descuento', labelX, y)
    doc.text(`- ${formatearMoneda(moneda, data.descuento)}`, totalX, y, { align: 'right' })
    y += 6
    doc.setTextColor(70)
  }
  const igtf = data.igtf ?? 0
  if (igtf > 0) {
    doc.setTextColor(126, 34, 206)
    doc.text('IGTF', labelX, y)
    doc.text(formatearMoneda(moneda, igtf), totalX, y, { align: 'right' })
    y += 6
    doc.setTextColor(70)
  }
  const retIva = data.retencion_iva ?? 0
  const retIslr = data.retencion_islr ?? 0
  if (retIva > 0 || retIslr > 0) {
    doc.setTextColor(180, 83, 9)
    if (retIva > 0) {
      doc.text('Retención de IVA', labelX, y)
      doc.text(`- ${formatearMoneda(moneda, retIva)}`, totalX, y, { align: 'right' })
      y += 6
    }
    if (retIslr > 0) {
      doc.text('Retención de ISLR', labelX, y)
      doc.text(`- ${formatearMoneda(moneda, retIslr)}`, totalX, y, { align: 'right' })
      y += 6
    }
    const netoCobrado = f.monto - retIva - retIslr
    if (netoCobrado !== f.monto) {
      doc.setFont('helvetica', 'bold')
      doc.text('Efectivo recibido', labelX, y)
      doc.text(formatearMoneda(moneda, netoCobrado), totalX, y, { align: 'right' })
      y += 6
      doc.setFont('helvetica', 'normal')
    }
    doc.setTextColor(70)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(40)
  doc.text('TOTAL', labelX, y)
  doc.text(formatearMoneda(moneda, f.monto), totalX, y, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`Son: ${data.monto_texto}`, margin, y)
  y += 6
  // Equivalencia USD ↔ Bs. con la tasa del día (o la del cobro).
  if (data.monto_usd != null || data.tasa_usd != null) {
    doc.setTextColor(110)
    if (moneda === 'USD' && data.tasa_usd) {
      doc.text(`Equivalente en Bs.: ${formatearMoneda('BS', f.monto * data.tasa_usd)} (tasa del día $ ${data.tasa_usd})`, margin, y)
    } else if (data.monto_usd != null) {
      doc.text(`Base en USD: ${formatearMoneda('USD', data.monto_usd)}${data.tasa_usd ? ` (tasa del día $ ${data.tasa_usd})` : ''}`, margin, y)
    }
    y += 6
  }

  // Pie de firma
  y += 18
  doc.line(margin + 50, y, margin + 120, y)
  doc.text('Firma autorizada', margin + 85, y + 5, { align: 'center' })

  doc.save(`factura-${f.control}.pdf`)
}
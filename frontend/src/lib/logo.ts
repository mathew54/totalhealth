/**
 * Procesamiento del logo de la razón social.
 *
 * Medidas estándar: 512×512 px. Si la imagen subida no cumple, la app la
 * ajusta (re-escala a contener dentro de la medida estándar, sin recortar)
 * y se informa al usuario con las medidas estándar por si prefiere subir una
 * que las cumpla exactamente.
 */

export const LOGO_ESTANDAR = { ancho: 512, alto: 512 } as const

export interface ResultadoLogo {
  dataUrl: string
  ajustada: boolean
  anchoOriginal: number
  altoOriginal: number
  anchoFinal: number
  altoFinal: number
}

export interface LogoProcesado {
  dataUrl: string
  ajustada: boolean
  medidasOriginales: string
  medidasFinales: string
}

function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    img.src = src
  })
}

/** Escala la imagen para caber dentro de la medida estándar (sin deformar ni recortar). */
function dimensionesContenidas(ancho: number, alto: number): { ancho: number; alto: number } {
  const escala = Math.min(LOGO_ESTANDAR.ancho / ancho, LOGO_ESTANDAR.alto / alto, 1)
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  }
}

/**
 * Lee un archivo de imagen local y devuelve un data URL PNG dentro de las
 * medidas estándar (512×512). Si la original ya cumple, no se toca.
 * Si no cumple, se re-escala a contener dentro del estándar sobre un lienzo
 * transparente (fondo PNG), marcando `ajustada = true`.
 */
export async function procesarLogo(file: File): Promise<LogoProcesado> {
  const raw = await leerArchivo(file)
  const img = await cargarImagen(raw)
  const anchoOriginal = img.naturalWidth || 0
  const altoOriginal = img.naturalHeight || 0

  if (anchoOriginal === LOGO_ESTANDAR.ancho && altoOriginal === LOGO_ESTANDAR.alto) {
    return {
      dataUrl: raw,
      ajustada: false,
      medidasOriginales: `${anchoOriginal}×${altoOriginal} px`,
      medidasFinales: `${anchoOriginal}×${altoOriginal} px`,
    }
  }

  const { ancho, alto } = dimensionesContenidas(anchoOriginal, altoOriginal)
  const canvas = document.createElement('canvas')
  canvas.width = LOGO_ESTANDAR.ancho
  canvas.height = LOGO_ESTANDAR.alto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')

  // Fondo transparente (PNG) y logo centrado y contenido.
  ctx.clearRect(0, 0, LOGO_ESTANDAR.ancho, LOGO_ESTANDAR.alto)
  const x = Math.round((LOGO_ESTANDAR.ancho - ancho) / 2)
  const y = Math.round((LOGO_ESTANDAR.alto - alto) / 2)
  ctx.drawImage(img, x, y, ancho, alto)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    ajustada: true,
    medidasOriginales: `${anchoOriginal}×${altoOriginal} px`,
    medidasFinales: `${LOGO_ESTANDAR.ancho}×${LOGO_ESTANDAR.alto} px`,
  }
}

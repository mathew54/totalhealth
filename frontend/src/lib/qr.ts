// Generación de códigos QR (data URL). Única implementación de la librería
// `qrcode`; la usan el portal, la etiqueta pre-analítica y la autenticación.

import QRCode from 'qrcode'

export interface QrOpciones {
  width?: number
  margin?: number
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}

/** Genera un QR como data URL PNG con valores por defecto consistentes. */
export async function generarQrDataUrl(texto: string, opts?: QrOpciones): Promise<string> {
  return QRCode.toDataURL(texto, {
    width: opts?.width ?? 420,
    margin: opts?.margin ?? 1,
    errorCorrectionLevel: opts?.errorCorrectionLevel ?? 'M',
  })
}
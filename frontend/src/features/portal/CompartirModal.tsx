import { useEffect, useState } from 'react'

export default function CompartirModal({ nombre, url, onClose }: { nombre: string; url: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let activo = true
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(url, { width: 420, margin: 2, errorCorrectionLevel: 'M' }).then((u) => {
        if (activo) setQr(u)
      }),
    )
    return () => {
      activo = false
    }
  }, [url])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin permiso de clipboard */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Compartir resultado</h3>
        <p className="mt-1 text-sm text-slate-500">{nombre}</p>
        <p className="mt-2 text-xs text-slate-400">
          El médico externo ve este resultado de forma segura por 1 hora. No se comparte tu historial.
        </p>
        <div className="mt-4 flex justify-center rounded-xl bg-slate-50 p-4">
          {qr ? <img src={qr} alt="Código QR del enlace" className="h-48 w-48" /> : <p className="text-sm text-slate-400">Generando…</p>}
        </div>
        <button
          onClick={copiar}
          className="mt-4 w-full rounded-lg border border-brand-600 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          {copiado ? 'Enlace copiado ✓' : 'Copiar enlace'}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
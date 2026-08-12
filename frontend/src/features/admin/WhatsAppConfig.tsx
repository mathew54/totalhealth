import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, getApiError } from '../../lib/api'
import PhoneInput from '../../components/ui/PhoneInput'
import { formatearTelefono } from '../../lib/phone'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

interface WhatsAppEstado {
  estado: 'idle' | 'abriendo' | 'conectado' | 'reintentando'
  registrado: boolean
  telefono: string | null
}

/** Estado del flujo de vinculación del dispositivo WhatsApp de la clínica. */
export function WhatsAppConfig() {
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [telefono, setTelefono] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testDest, setTestDest] = useState('')
  const [testArchivo, setTestArchivo] = useState<File | null>(null)
  const [testTipo, setTestTipo] = useState<'image' | 'document'>('document')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: estado, refetch: refetchEstado } = useQuery<WhatsAppEstado>({
    queryKey: ['admin', 'whatsapp'],
    queryFn: async () => (await api.get('/admin/whatsapp')).data,
    refetchInterval: (q) => (q.state.data?.estado === 'conectado' ? false : 3000),
  })

  const reset = () => {
    setQr(null)
    setPairing(null)
  }

  const sobreError = (e: unknown) => setError(getApiError(e))

  const generaQr = useMutation({
    mutationFn: () => api.post('/admin/whatsapp/qr'),
    onSuccess: (res) => {
      setQr(res.data.qr as string)
      setPairing(null)
      setError(null)
      setMensaje('Escanea el QR con WhatsApp → Dispositivos vinculados. El QR se actualiza solo mientras vinculas.')
    },
    onError: sobreError,
  })

  const pairingCode = useMutation({
    mutationFn: (tlf: string) => api.post('/admin/whatsapp/pairing', { telefono: tlf }),
    onSuccess: (res) => {
      setPairing(res.data.codigo as string)
      setQr(null)
      setError(null)
      setMensaje('En el teléfono: WhatsApp → Dispositivos vinculados → Vincular con número e introduce el código (con guion).')
    },
    onError: sobreError,
  })

  const prueba = useMutation({
    mutationFn: (p: { destino: string; mensaje: string }) => api.post('/admin/whatsapp/test', p),
    onSuccess: () => {
      setMensaje('Mensaje de prueba enviado correctamente.')
      setError(null)
    },
    onError: sobreError,
  })

  const enviarArchivo = useMutation({
    mutationFn: async (p: { destino: string; mensaje: string; tipo: 'image' | 'document'; nombre: string; mime: string; dataBase64: string }) =>
      api.post('/admin/whatsapp/enviar-archivo', p),
    onSuccess: () => {
      setMensaje('Archivo enviado correctamente.')
      setError(null)
      setTestArchivo(null)
    },
    onError: sobreError,
  })

  const desconecta = useMutation({
    mutationFn: () => api.post('/admin/whatsapp/logout'),
    onSuccess: () => {
      reset()
      setMensaje('Dispositivo WhatsApp desvinculado.')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp'] })
      void refetchEstado()
    },
    onError: sobreError,
  })

  const vinculo = estado?.estado === 'conectado' || estado?.estado === 'abriendo' || estado?.estado === 'reintentando'
  const activo = estado?.estado === 'conectado'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold text-slate-800">WhatsApp Business (dispositivo de la clínica)</h2>
      <p className="text-sm text-slate-500">
        Vincula el número de WhatsApp de tu teléfono para enviar OTP, recordatorios de citas y resultados
        a los pacientes desde este sistema, sin servicios de pago.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <EstadoBadge estado={estado?.estado ?? 'idle'} />
        {estado?.telefono && activo && <span className="text-sm text-slate-600">Dispositivo: <strong>{formatearTelefono(estado.telefono)}</strong></span>}
      </div>

      {!activo && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Opción A — Código QR</h3>
            <p className="mt-1 text-xs text-slate-500">Genera un QR para escanear desde el teléfono.</p>
            {qr ? (
              <div className="mt-3 flex flex-col items-center gap-2">
                <img src={qr} alt="Código QR de WhatsApp" className="h-52 w-52 rounded-lg border border-slate-200" />
                <button
                  type="button"
                  onClick={() => generaQr.mutate()}
                  disabled={generaQr.isPending}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {generaQr.isPending ? 'Generando…' : 'Actualizar QR'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => generaQr.mutate()}
                disabled={generaQr.isPending}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {generaQr.isPending ? 'Generando QR…' : 'Generar QR'}
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Opción B — Código de emparejamiento</h3>
            <p className="mt-1 text-xs text-slate-500">
              Introduce el número del teléfono que usará WhatsApp y genera el código de 8 dígitos.
            </p>
            <div className="mt-3">
              <div className="min-w-0 flex-1">
                <PhoneInput
                  value={telefono}
                  onChange={(p) => setTelefono(p.telefono ?? '')}
                  placeholder="412 4458116"
                  disabled={pairingCode.isPending}
                />
              </div>
              <button
                type="button"
                onClick={() => telefono.trim() && pairingCode.mutate(telefono.trim())}
                disabled={pairingCode.isPending || !telefono.trim()}
                className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pairingCode.isPending ? 'Generando…' : 'Generar código'}
              </button>
            </div>
            {pairing && (
              <div className="mt-3 rounded-lg bg-slate-100 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Código</p>
                <p className="select-all text-3xl font-bold tracking-widest text-slate-800">{pairing}</p>
                <p className="mt-1 text-xs text-slate-500">Ingrésalo en el teléfono y deja la pantalla en “Iniciando sesión”.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {vinculo && (
        <p className="mt-3 text-sm text-amber-700">
          {activo ? 'Dispositivo vinculado y listo para enviar mensajes.' : 'Vinculando… escanea el QR o usa el código de emparejamiento.'}
        </p>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-700">Enviar mensaje / archivo</h3>
        <div className="mt-2 space-y-2">
          <PhoneInput
            value={testDest}
            onChange={(p) => setTestDest(p.telefono ?? '')}
            placeholder="412 4458116"
          />
          <textarea
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            placeholder="Contenido del mensaje…"
            rows={2}
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="file" onChange={(e) => setTestArchivo(e.target.files?.[0] ?? null)} className="text-xs" />
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Tipo:</span>
              <label className="flex items-center gap-1">
                <input type="radio" checked={testTipo === 'document'} onChange={() => setTestTipo('document')} /> Documento
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={testTipo === 'image'} onChange={() => setTestTipo('image')} /> Imagen
              </label>
            </div>
          </div>
          {testArchivo && <p className="text-xs text-slate-500">Adjunto: {testArchivo.name} ({(testArchivo.size / 1024).toFixed(0)} KB)</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                testDest.trim() &&
                testMsg.trim() &&
                prueba.mutate({ destino: testDest.trim(), mensaje: testMsg.trim() })
              }
              disabled={prueba.isPending || !testDest.trim() || !testMsg.trim() || !activo}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {prueba.isPending ? 'Enviando…' : 'Enviar mensaje de texto'}
            </button>
            <button
              type="button"
              onClick={async () => {
                const archivo = testArchivo
                const destino = testDest.trim()
                if (!destino || !archivo) {
                  setError('Indica un destino y adjunta un archivo.')
                  return
                }
                const reader = new FileReader()
                reader.onload = () => {
                  const dataBase64 = String(reader.result ?? '').split(',')[1] ?? ''
                  enviarArchivo.mutate({
                    destino,
                    mensaje: testMsg.trim(),
                    tipo: testTipo,
                    nombre: archivo.name,
                    mime: archivo.type || 'application/octet-stream',
                    dataBase64,
                  })
                }
                reader.readAsDataURL(archivo)
              }}
              disabled={enviarArchivo.isPending || !testDest.trim() || !testArchivo || !activo}
              className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {enviarArchivo.isPending ? 'Enviando archivo…' : 'Enviar texto + archivo'}
            </button>
          </div>
        </div>
      </div>

      {activo && (
        <button
          type="button"
          onClick={() => desconecta.mutate()}
          disabled={desconecta.isPending}
          className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {desconecta.isPending ? 'Desvinculando…' : 'Desvincular dispositivo'}
        </button>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}
    </div>
  )
}

function EstadoBadge({ estado }: { estado: WhatsAppEstado['estado'] }) {
  const map: Record<WhatsAppEstado['estado'], { label: string; cls: string }> = {
    idle: { label: 'Sin vincular', cls: 'bg-slate-100 text-slate-600' },
    abriendo: { label: 'Vinculando…', cls: 'bg-amber-100 text-amber-700' },
    conectado: { label: 'Conectado', cls: 'bg-emerald-100 text-emerald-700' },
    reintentando: { label: 'Reintentando…', cls: 'bg-amber-100 text-amber-700' },
  }
  const { label, cls } = map[estado]
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
}
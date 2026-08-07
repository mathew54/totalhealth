import { useConfigStore } from '../../lib/configStore'

/**
 * Cabecera de marca que se imprime en la parte superior de cualquier
 * documento (resultados, historial, exámenes, récipes). Solo visible en print.
 */
export default function PrintHeader() {
  const { razon_social, rif, direccion, telefono, logo_url } = useConfigStore()
  return (
    <div className="mb-4 hidden items-center gap-3 border-b border-slate-200 pb-3 print:flex">
      {logo_url && <img src={logo_url} alt="" className="h-12 w-12 object-contain" />}
      <div className="flex-1">
        <p className="text-lg font-bold text-slate-800">{razon_social}</p>
        {rif && <p className="text-xs text-slate-500">R.I.F. {rif}</p>}
        {(direccion || telefono) && (
          <p className="text-xs text-slate-500">
            {[direccion && `Dir: ${direccion}`, telefono && `Tel: ${telefono}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
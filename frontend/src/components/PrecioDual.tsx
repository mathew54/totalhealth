import { usdABs, formatearUsd, formatearBs } from '../lib/moneda'

interface Props {
  usd: number | null | undefined
  tasaUsd: number | null | undefined
  /** Si se provee, muestra el monto en Bs. del propio registro en vez de convertir. */
  bs?: number | null
  className?: string
  /** Texto para la equivalencia en Bs. (default: "≈ Bs. X"). */
  bsPrefix?: string
}

/**
 * Muestra un precio en USD (moneda base) junto a su equivalencia en Bs. con la
 * tasa del día: "$15,00 (≈ Bs. 547,50)".
 */
export default function PrecioDual({ usd, tasaUsd, bs, className = '', bsPrefix = '≈' }: Props) {
  const valorBs = bs ?? usdABs(usd ?? 0, tasaUsd)
  return (
    <span className={className}>
      <span className="font-semibold">{formatearUsd(usd)}</span>
      {valorBs != null && <span className="text-xs opacity-70"> ({bsPrefix} {formatearBs(valorBs)})</span>}
    </span>
  )
}

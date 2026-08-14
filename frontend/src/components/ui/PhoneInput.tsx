import { useEffect, useMemo, useRef, useState } from 'react'
import { usePaises, VENEZUELA, type Pais } from '../../lib/paises'
import { separarTelefono, unificarTelefono, limpiarNumeroLocal, paisDesdeCodigo } from '../../lib/phone'

export interface PhoneInputValue {
  country_code: string
  local_number: string
  telefono: string | null
}

interface PhoneInputProps {
  /** Nombre base de los inputs ocultos dentro de un <form> (ej. "telefono").
   *  Emite `name`, `name_country_code` y `name_local_number`. */
  name?: string
  label?: string
  /** Valor controlado (E.164 completo, ej. "+584121234567"). */
  value?: string | null
  /** Valor inicial no controlado (E.164 completo). */
  defaultValue?: string | null
  /** País por defecto (código ISO) cuando no hay valor inicial. */
  defaultCountry?: string
  onChange?: (valor: PhoneInputValue) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Entrada de teléfono con selector de país (E.164) + número local.
 * - Campo A: menú desplegable con bandera, nombre del país y su código
 *   internacional, con buscador de texto.
 * - Campo B: número local; el primer carácter no puede ser 0 (se elimina
 *   automáticamente cualquier 0 inicial en tiempo real).
 * Dentro de un <form> expone inputs ocultos con el string E.164 unificado y
 * las piezas separadas, para que FormData los recoja.
 */
export default function PhoneInput({
  name,
  label,
  value,
  defaultValue,
  defaultCountry = 'VE',
  onChange,
  placeholder = 'Número local',
  required,
  disabled,
  className,
}: PhoneInputProps) {
  const { paises: PAISES } = usePaises()

  const inicial = useMemo(() => {
    const fuente = value ?? defaultValue ?? ''
    const partes = separarTelefono(fuente)
    return {
      pais:
        partes.country_code
          ? paisDesdeCodigo(partes.country_code)
          : (PAISES.find((p) => p.iso2 === defaultCountry) ?? VENEZUELA),
      local: partes.local_number ?? '',
    }
  }, [value, defaultValue, defaultCountry, PAISES])

  const [pais, setPais] = useState<Pais>(inicial.pais)
  const [local, setLocal] = useState<string>(inicial.local)
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Sincronización controlada: si `value` cambia por fuera y no es lo que ya
  // representa el componente, se reajusta (p. ej. al elegir un paciente).
  useEffect(() => {
    if (value === undefined) return
    const partes = separarTelefono(value)
    if (value !== (unificarTelefono({ country_code: pais.codigo, local_number: local }) ?? '')) {
      setPais(partes.country_code ? paisDesdeCodigo(partes.country_code) : paisDesdeCodigo('58'))
      setLocal(partes.local_number ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Cierra el desplegable al hacer clic fuera o con Escape.
  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClicFuera)
    return () => document.removeEventListener('mousedown', alClicFuera)
  }, [])

  useEffect(() => {
    if (abierto) searchRef.current?.focus()
  }, [abierto])

  const emitir = (p: Pais, numero: string) => {
    const country_code = `+${p.codigo}`
    const local_number = numero
    const telefono = unificarTelefono({ country_code, local_number })
    onChange?.({ country_code, local_number, telefono })
  }

  const seleccionarPais = (p: Pais) => {
    setPais(p)
    setAbierto(false)
    setBusqueda('')
    emitir(p, local)
  }

  const cambiarLocal = (raw: string) => {
    const limpio = limpiarNumeroLocal(raw)
    setLocal(limpio)
    emitir(pais, limpio)
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return PAISES
    return PAISES.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.includes(q) || p.iso2.toLowerCase().includes(q))
  }, [busqueda, PAISES])

  const country_code = `+${pais.codigo}`
  const telefono = unificarTelefono({ country_code, local_number: local })

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

  return (
    <div ref={rootRef} className="space-y-1">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <div className="flex gap-2">
        {/* Campo A — prefijo de país (bandera + nombre + código E.164), buscable */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={abierto}
            title={`${pais.nombre} (+${pais.codigo})`}
            className={`flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-50 ${className ?? ''}`}
          >
            <span className="text-base leading-none">{pais.bandera}</span>
            <span className="hidden sm:inline font-medium text-slate-700">{pais.iso2}</span>
            <span className="font-medium text-slate-500">+{pais.codigo}</span>
            <span className="text-[10px] text-slate-400">{abierto ? '▲' : '▼'}</span>
          </button>

          {abierto && (
            <div className="absolute left-0 z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 p-2">
                <input
                  ref={searchRef}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAbierto(false)
                  }}
                  placeholder="Buscar país o código…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                {filtrados.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>
                )}
                {filtrados.map((p) => (
                  <li key={p.iso2}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={p.iso2 === pais.iso2}
                      onClick={() => seleccionarPais(p)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50 ${
                        p.iso2 === pais.iso2 ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                      }`}
                    >
                      <span className="text-base leading-none">{p.bandera}</span>
                      <span className="flex-1 truncate">{p.nombre}</span>
                      <span className="text-xs text-slate-400">+{p.codigo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Campo B — número local (sin 0 inicial) */}
        <input
          type="tel"
          inputMode="numeric"
          value={local}
          onChange={(e) => cambiarLocal(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={15}
          className={`${inputCls} ${className ?? ''}`}
        />
      </div>
      {local.startsWith('0') && (
        <p className="text-xs text-amber-700">El número local no puede empezar con 0.</p>
      )}

      {name && (
        <>
          <input type="hidden" name={name} value={telefono ?? ''} />
          <input type="hidden" name={`${name}_country_code`} value={country_code} />
          <input type="hidden" name={`${name}_local_number`} value={local} />
        </>
      )}
    </div>
  )
}

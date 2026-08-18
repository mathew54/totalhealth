// Facturación electrónica VE: genera comprobante, recibo y factura fiscal con
// estructura de datos lista para imprimir (sin HTML server-side; el frontend
// imprime/descarga). El IVA es parametrizable (leído de app_config en tiempo de
// cobro/factura; aquí solo el default y las funciones puras).

import { IVA_DEFECTO } from './configService.js';

export interface FacturaLinea {
  descripcion: string;
  cantidad: number;
  precio: number;
  precio_iva: number;
}

export interface Factura {
  serie: string;
  control: string;
  tipo: 'comprobante' | 'recibo' | 'factura' | 'nota_credito' | 'nota_debito';
  emisor: { razon_social: string; rif: string; direccion?: string; telefono?: string; country_code?: string | null; local_number?: string | null };
  receptor: { nombre: string; cedula: string | null };
  fecha: string; // ISO
  moneda: string;
  lineas: FacturaLinea[];
  base: number;
  iva: number;
  monto: number;
  pagado: boolean;
  /** Facturación VE: base exenta de IVA (0 si todo es gravado). */
  base_exenta?: number;
  /** IGTF aplicado en pagos en divisas (0 en Bs.). */
  igtf?: number;
  /** Descuento aplicado al documento (moneda del cobro). */
  descuento?: number;
}

export function numeroEnLetras(n: number): string {
  if (Math.floor(n) !== n) return `${n.toFixed(2)} (aproximado)`;
  const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE'];
  const de2_9 = ['VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const de3_9 = ['CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function hasta99(d: number): string {
    if (d < 10) return unidades[d];
    if (d <= 15) return especiales[d - 10];
    if (d < 20) return `DIECI${hasta99(d - 10)}`;
    if (d < 30) return d === 20 ? 'VEINTE' : `VEINTI${hasta99(d - 20)}`;
    const dec = de2_9[Math.floor(d / 10) - 2];
    const resto = d % 10;
    return resto ? `${dec} Y ${unidades[resto]}` : dec;
  }
  function hasta999(d: number): string {
    if (d < 100) return hasta99(d);
    const cen = Math.floor(d / 100);
    const resto = d % 100;
    if (cen === 1) {
      if (resto === 0) return 'CIEN';
      if (resto < 10) return `CIENTO ${unidades[resto]}`;
      return `CIENTO ${hasta99(resto)}`;
    }
    const base = de3_9[cen - 1];
    return resto ? `${base} ${hasta99(resto)}` : base;
  }
  function grupo(d: number, cat: string): string {
    if (d === 0) return '';
    if (d === 1) return cat;
    return `${hasta999(d)} ${cat}S`;
  }

  if (n < 1000) return hasta999(n) || 'CERO';
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const millares = grupo(miles, 'MIL').replace(/UNO MIL/, 'MIL').replace(/UNTOS/, 'QUINIENTOS');
  return resto ? `${millares} ${hasta999(resto)}` : millares;
}

/** Monto total en forma "XXX,YY (letras) BOLÍVARES" o "USD". */
export function montoTexto(monto: number, moneda: string): string {
  const entero = Math.floor(monto);
  const decimal = Math.round((monto - entero) * 100);
  const nombre = moneda === 'USD' ? 'DÓLARES' : 'BOLÍVARES';
  const letras = numeroEnLetras(entero);
  const base = `${letras} ${nombre}`;
  return decimal > 0 ? `${base} CON ${String(decimal).padStart(2, '0')}/100` : `${base} CON 00/100`;
}

export function calcularLinea(precioNeto: number, iva = IVA_DEFECTO): FacturaLinea['precio_iva'] {
  return Number((precioNeto * (1 + iva)).toFixed(2));
}

export function construirFactura(opts: {
  tipo: Factura['tipo'];
  emisor: Factura['emisor'];
  receptor: Factura['receptor'];
  fecha: string;
  moneda: string;
  conceptos: { descripcion: string; cantidad?: number; neto: number }[];
  serie: string;
  control: string;
  iva?: number;
}): Factura {
  const ivaAplicado = opts.iva ?? IVA_DEFECTO;
  const lineas: FacturaLinea[] = opts.conceptos.map((c) => {
    const cantidad = c.cantidad ?? 1;
    const neto = c.neto;
    return {
      descripcion: c.descripcion,
      cantidad,
      precio: Number(neto.toFixed(2)),
      precio_iva: Number((calcularLinea(neto / cantidad, ivaAplicado) * cantidad).toFixed(2)),
    };
  });
  const base = Number(lineas.reduce((acc, l) => acc + l.precio * l.cantidad, 0).toFixed(2));
  const monto = Number(lineas.reduce((acc, l) => acc + l.precio_iva * l.cantidad, 0).toFixed(2));
  const iva = Number((monto - base).toFixed(2));
  return { ...opts, lineas, base, iva, monto, pagado: true };
}
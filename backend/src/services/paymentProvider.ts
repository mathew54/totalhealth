import { env } from '../config/env.js';

export interface ChargeResult {
  reference: string; // referencia del proveedor (ej. ID de transacción bancaria)
  estado: 'pendiente' | 'pagado';
  details?: Record<string, unknown>;
}

export interface RefundResult {
  reference: string;
  estado: 'reembolsado';
}

/**
 * Abstracción de la pasarela de pagos. En producción se implementa un
 * adaptador real (pago móvil VE, transferencia, divisas); en desarrollo se
 * usa un proveedor mock que "confirma" el pago al instante.
 */
export interface PaymentProvider {
  name: string;
  /** Crea un cargo; devuelve referencia y estado inicial. */
  createCharge(opts: {
    monto: number;
    moneda: string;
    metodo: string;
    concepto: string;
    pacienteNombre: string;
  }): Promise<ChargeResult>;
  /** Confirma/captura un cargo previamente pendiente. */
  capture(reference: string): Promise<ChargeResult>;
  /** Reembolsa un cargo ya pagado. */
  refund(reference: string): Promise<RefundResult>;
}

/** Proveedor de desarrollo: aprueba todo al instante. */
class MockProvider implements PaymentProvider {
  name = 'mock';

  async createCharge(opts: { monto: number; moneda: string; metodo: string }): Promise<ChargeResult> {
    return {
      reference: `MOCK-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      estado: 'pagado',
      details: { monto: opts.monto, moneda: opts.moneda, metodo: opts.metodo },
    };
  }

  async capture(reference: string): Promise<ChargeResult> {
    return { reference, estado: 'pagado' };
  }

  async refund(reference: string): Promise<RefundResult> {
    return { reference, estado: 'reembolsado' };
  }
}

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    // Selección por variable de entorno: en prod apuntar a la pasarela real
    // (pago móvil/transferencia/divisas). El mock es el default de desarrollo.
    instance = env.paymentProvider === 'pasarela' ? new PasarelaProvider() : new MockProvider();
  }
  return instance;
}

/**
 * Adaptador plantilla para una pasarela real (Banesco/BDV pago móvil, Zelle,
 * transferencias). Requiere credenciales en env. Implementación pendiente de
 * contrato comercial; por ahora lanza error para no ocultar la ausencia.
 */
class PasarelaProvider implements PaymentProvider {
  name = 'pasarela';

  private unsupported(): never {
    throw new Error('Pasarela de pagos real no configurada: define credenciales en el entorno');
  }

  async createCharge(): Promise<ChargeResult> {
    return this.unsupported();
  }

  async capture(_reference: string): Promise<ChargeResult> {
    return this.unsupported();
  }

  async refund(_reference: string): Promise<RefundResult> {
    return this.unsupported();
  }
}

-- Fase C: Cuentas por cobrar (abonos parciales y saldos)
-- `solicitudes.monto_pagado` acumula (en USD, moneda base) lo que el paciente
-- ha abonado. El saldo pendiente = total facturado (base + IVA) - monto_pagado.
alter table public.solicitudes
  add column if not exists monto_pagado numeric(12, 2) not null default 0;

comment on column public.solicitudes.monto_pagado is
  'Acumulado pagado en USD (moneda base). La solicitud queda cobrada cuando monto_pagado >= total facturado.';
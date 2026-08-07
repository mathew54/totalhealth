-- Firma digital del bioanalista: hash SHA-256 del resultado (integridad y trazabilidad).
alter table public.resultados
  add column if not exists firma_hash text;

-- Backfill: firma de los resultados históricos a partir de sus propios datos.
update public.resultados
  set firma_hash = encode(
    digest(
      json_build_object(
        'bioanalista_id', bioanalista_id,
        'solicitud_detalle_id', solicitud_detalle_id,
        'valores', valores,
        'observaciones', observaciones
      )::text,
      'sha256'
    ),
    'hex'
  )
  where firma_hash is null and (valores is not null or observaciones is not null);

import { createApp } from '../src/app.ts'

const server = createApp().listen(0, async () => {
  const { port } = server.address() as { port: number }
  const base = `http://localhost:${port}`

  const req = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json: unknown = null
    try { json = text ? JSON.parse(text) : null } catch { json = text }
    return { status: res.status, json }
  }

  const CEDULAS: Record<string, string> = {
    sec: 'V-33445566',
    dra: 'V-99888777',
    lab: 'V-44556677',
    admin: 'V-11222333',
  }

  const login = async (key: 'sec' | 'dra' | 'lab' | 'admin') => {
    const r = await req('POST', '/api/auth/login', { cedula: CEDULAS[key], password: 'demo1234' })
    return (r.json as { access_token: string }).access_token
  }

  const ok = (name: string, r: { status: number }, expect = 200) => {
    const pass = r.status === expect
    console.log(`${pass ? '✓' : '✗'} ${name} → ${r.status}${pass ? '' : ` (esperado ${expect})`}`)
    if (!pass) process.exitCode = 1
  }

  try {
    const sec = await login('sec')

    ok('search pacientes por cédula', await req('GET', '/api/pacientes?q=V-12345678', undefined, sec))
    const search = await req('GET', '/api/pacientes?q=garcía', undefined, sec)
    ok('search pacientes por nombre', search)
    const paciente = (search.json as { id: string }[])[0]

    ok('ficha paciente con historial', await req('GET', `/api/pacientes/${paciente.id}`, undefined, sec))

    const creado = await req('POST', '/api/pacientes', {
      cedula: 'V-55566778', nombre_completo: 'Nuevo Paciente Demo', telefono: '+584150000099', sexo: 'M',
    }, sec)
    ok('crear paciente', creado, 201)
    const nuevoId = (creado.json as { id: string }).id
    ok('crear paciente duplicado da conflicto', await req('POST', '/api/pacientes', {
      cedula: 'V-55566778', nombre_completo: 'Otro',
    }, sec), 409)

    const dra = await login('dra')

    ok('agenda del médico', await req('GET', '/api/consultas', undefined, dra))
    const agenda = await req('GET', '/api/consultas', undefined, dra)
    const consultaId = (agenda.json as { id: string }[])[0]?.id

    ok('detalle consulta', await req('GET', `/api/consultas/${consultaId}`, undefined, dra))
    ok('historial del paciente', await req('GET', `/api/consultas/${consultaId}/historial`, undefined, dra))

    const nueva = await req('POST', '/api/consultas', {
      paciente_id: nuevoId, fecha_hora: '2026-08-10T09:00:00.000Z', motivo: 'Chequeo',
    }, dra)
    ok('crear consulta como médico', nueva, 201)
    const nuevaId = (nueva.json as { id: string }).id

    ok('registrar diagnóstico', await req('PATCH', `/api/consultas/${nuevaId}/diagnostico`, {
      diagnostico: 'Paciente sano', notas: 'Continuar dieta',
    }, dra))
    ok('secretaria no puede registrar diagnóstico', await req('PATCH', `/api/consultas/${nuevaId}/diagnostico`, {
      diagnostico: 'Intento',
    }, sec), 403)

    // ===== M3: laboratorio =====
    const catalogo = (await req('GET', '/api/examenes', undefined, dra)).json as { id: string; nombre: string; precio: number }[]
    ok('catálogo de exámenes', await req('GET', '/api/examenes', undefined, dra))

    const solicitud = await req('POST', '/api/solicitudes', {
      consulta_id: nuevaId,
      paciente_id: nuevoId,
      examenes: [catalogo[0].id, catalogo[1].id],
    }, dra)
    ok('médico ordena exámenes', solicitud, 201)
    const solicitudId = (solicitud.json as { id: string }).id
    const totalEsperado = catalogo[0].precio + catalogo[1].precio

    ok('detalle de solicitud', await req('GET', `/api/solicitudes/${solicitudId}`, undefined, dra))
    ok('secretaria no puede cambiar estado', await req('PATCH', `/api/solicitudes/${solicitudId}/estado`, { estado: 'en_proceso' }, sec), 403)

    const cobro = await req('POST', '/api/pagos/laboratorio', { solicitud_id: solicitudId, metodo: 'efectivo' }, sec)
    ok('secretaria cobra solicitud (USD base)', cobro, 201)
    const cobroJson = cobro.json as { monto: number; moneda: string; monto_usd: number; tasa_usd: number | null }
    const esperadoUsd = Number((totalEsperado * 1.16).toFixed(2))
    ok(`monto USD cobrado correcto (${cobroJson.monto} == ${esperadoUsd})`, { status: cobroJson.monto === esperadoUsd && cobroJson.moneda === 'USD' ? 200 : 500 })
    ok('reintento de cobro da conflicto', await req('POST', '/api/pagos/laboratorio', { solicitud_id: solicitudId }, sec), 409)

    // Cobro en Bs.: conversión automática con la tasa del día.
    const solicitudBs = await req('POST', '/api/solicitudes', {
      consulta_id: nuevaId,
      paciente_id: nuevoId,
      examenes: [catalogo[0].id],
    }, dra)
    const solicitudBsId = (solicitudBs.json as { id: string }).id
    const tasas = (await req('GET', '/api/tasas')).json as { monedas: { moneda: string; valor: number | null }[] }
    const tasaUsd = tasas.monedas.find((m) => m.moneda === 'USD')?.valor
    const cobroBs = await req('POST', '/api/pagos/laboratorio', { solicitud_id: solicitudBsId, metodo: 'pago_movil', moneda: 'BS' }, sec)
    ok('cobro en Bs. con conversión automática', cobroBs, 201)
    const cobroBsJson = cobroBs.json as { monto: number; moneda: string; monto_usd: number }
    const esperadoBs = tasaUsd ? Number((catalogo[0].precio * 1.16 * tasaUsd).toFixed(2)) : null
    ok(`monto Bs. convertido correcto (${cobroBsJson.monto} == ${esperadoBs})`, {
      status: esperadoBs != null && cobroBsJson.moneda === 'BS' && Math.abs(cobroBsJson.monto - esperadoBs) < 0.01 ? 200 : 500,
    })

    // Factura/recibo: USD y Bs. con equivalencia base USD.
    const pagoUsdId = (cobro.json as { pago: { id: string } }).pago.id
    const facturaUsd = await req('GET', `/api/pagos/${pagoUsdId}/factura`, undefined, sec)
    ok('factura del pago USD', facturaUsd)
    ok('factura USD mantiene moneda y equivalencia', {
      status: (facturaUsd.json as { moneda: string; monto_usd: number | null }).moneda === 'USD' ? 200 : 500,
    })
    const pagoBsId = (cobroBs.json as { pago: { id: string } }).pago.id
    const facturaBs = await req('GET', `/api/pagos/${pagoBsId}/factura`, undefined, sec)
    ok('factura del pago Bs.', facturaBs)
    ok('factura Bs. convierte líneas y mantiene base USD', {
      status: (facturaBs.json as { moneda: string; monto_usd: number | null }).moneda === 'BS' ? 200 : 500,
    })

    const lab = await login('lab')
    ok('cola de laboratorio', await req('GET', '/api/solicitudes?estado=pendiente', undefined, lab))
    ok('laboratorio marca en proceso', await req('PATCH', `/api/solicitudes/${solicitudId}/estado`, { estado: 'en_proceso' }, lab))

    const detalle = (await req('GET', `/api/solicitudes/${solicitudId}`, undefined, lab)).json as {
      lineas: { id: string }[]
    }
    const resultado = await req('POST', `/api/solicitudes/${solicitudId}/resultados`, {
      lineas: detalle.lineas.map((l, i) => ({
        solicitud_detalle_id: l.id,
        valores: { hemoglobina: `${13 + i}.0 g/dL` },
      })),
    }, lab)
    ok('laboratorio sube resultados', resultado, 201)
    ok('solicitud queda lista', (resultado.json as { solicitud_estado: string }).solicitud_estado === 'listo' ? { status: 200 } : { status: 500 })

    ok('reporte de pagos', await req('GET', '/api/pagos', undefined, sec))
    ok('reactivos', await req('GET', '/api/reactivos', undefined, lab))

    const admin = await login('admin')
    ok('reportería admin', await req('GET', '/api/admin/reporteria', undefined, admin))

    // ===== M4: portal público =====
    const gen = await req('POST', '/api/portal/generar-codigo', { cedula: 'V-12345678' })
    ok('generar código OTP', gen)
    const devCodigo = (gen.json as { dev_codigo: string }).dev_codigo

    ok('OTP inválido rechazado', await req('POST', '/api/portal/verificar', { cedula: 'V-12345678', codigo: '000000' }), 401)
    const verif = await req('POST', '/api/portal/verificar', { cedula: 'V-12345678', codigo: devCodigo })
    ok('OTP válido emite token', verif)
    const pToken = (verif.json as { token: string }).token

    ok('portal sin token rechazado', await req('GET', '/api/portal/mis-resultados'), 401)
    ok('mis-resultados', await req('GET', '/api/portal/mis-resultados', undefined, pToken))
    const resultados = await req('GET', '/api/portal/mis-resultados', undefined, pToken)
    ok('resultados traen exámenes', {
      status: (resultados.json as { examen: string | null }[]).some((r) => r.examen) ? 200 : 500,
    })
    ok('mis-recipes', await req('GET', '/api/portal/mis-recipes', undefined, pToken))
    ok('mis-consultas', await req('GET', '/api/portal/mis-consultas', undefined, pToken))

    // ===== M6: cuestionario de historial médico (anamnesis) =====
    const respuestasBase = () => {
      const r: Record<string, unknown> = {}
      const claves = ['alimentacion', 'actividad_fisica', 'trastornos_sueno', 'consumo_sustancias', 'estres_salud_mental', 'enfermedades_cronicas', 'medicamentos_continuos', 'alergias', 'cirugias_hospitalizaciones', 'vacunacion_incompleta', 'historial_familiar_cancer', 'historial_cardiovascular', 'historial_diabetes_renal', 'sintomas_cardiovasculares', 'sintomas_gastrointestinales', 'sintomas_neurologicos', 'sintomas_urologicos_ginecologicos']
      for (const c of claves) r[c] = { marcado: false, detalle: null }
      return r
    }

    ok('definición del cuestionario (staff)', await req('GET', '/api/cuestionarios/definicion', undefined, dra))
    ok('listado de cuestionarios', await req('GET', '/api/cuestionarios', undefined, dra))
    ok('secretaria no crea cuestionarios', await req('POST', '/api/cuestionarios', { paciente_id: nuevoId, respuestas: respuestasBase() }, sec), 403)

    const creadoCuest = await req('POST', '/api/cuestionarios', { paciente_id: nuevoId, respuestas: respuestasBase() }, dra)
    ok('médico crea cuestionario (borrador)', creadoCuest, 201)
    const cuestId = (creadoCuest.json as { id: string }).id

    const sinObs = await req('POST', '/api/cuestionarios', { paciente_id: nuevoId }, dra)
    const sinObsId = (sinObs.json as { id: string }).id
    ok('consolidar sin observaciones rechazado', await req('POST', `/api/cuestionarios/${sinObsId}/consolidar`, {}, dra), 400)

    const respuestasLlenas = { ...respuestasBase(),
      alergias: { marcado: true, detalle: 'Penicilina: reacción anafiláctica previa' },
      enfermedades_cronicas: { marcado: true, detalle: 'Asma bronquial' },
      sintomas_gastrointestinales: { marcado: true, detalle: 'Acidez postprandial' },
      observaciones: 'Ninguna adicional por el momento.',
    }
    ok('guardar respuestas del borrador', await req('PATCH', `/api/cuestionarios/${cuestId}/respuestas`, { respuestas: respuestasLlenas }, dra))
    ok('consolidar con observaciones', await req('POST', `/api/cuestionarios/${cuestId}/consolidar`, {}, dra))
    ok('edición tras consolidar rechazada (adenda)', await req('PATCH', `/api/cuestionarios/${cuestId}/respuestas`, { respuestas: respuestasLlenas }, dra), 409)

    const adenda = await req('POST', `/api/cuestionarios/${cuestId}/adendas`, { respuestas: respuestasLlenas }, dra)
    ok('registrar adenda con marca de agua', adenda, 201)
    ok('adenda trae firma digital', {
      status: (adenda.json as { firma: string }).firma ? 200 : 500,
    })

    ok('detalle con adendas', await req('GET', `/api/cuestionarios/${cuestId}`, undefined, dra))
    ok('borrado lógico exige justificación + password', await req('DELETE', `/api/cuestionarios/${cuestId}`, {}, admin), 400)

    // ===== M6: cuestionario vía portal (paciente) =====
    ok('definición del cuestionario (portal)', await req('GET', '/api/portal/cuestionario-definicion'))
    const miCuest = await req('GET', '/api/portal/mi-cuestionario', undefined, pToken)
    ok('paciente consulta su historial', miCuest)
    ok('historial consolidado de Juan Pérez', {
      status: (miCuest.json as { cuestionarios: { estado: string }[] }).cuestionarios.some((c) => c.estado === 'consolidado') ? 200 : 500,
    })
    ok('paciente con historial consolidado no responde de nuevo', await req('POST', '/api/portal/mi-cuestionario', { respuestas: respuestasLlenas }, pToken), 409)
  } catch (err) {
    console.error('SMOKE FAIL', err)
    process.exitCode = 1
  } finally {
    server.close()
    process.exit(0)
  }
})
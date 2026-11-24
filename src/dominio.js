// Reglas del negocio: estados, documentos y evaluación automática del caso

const ESTADOS = [
  { id: 'nuevo',           label: 'Recibido',                       cliente: 'Recibimos tu reclamo. Un abogado lo está revisando.', abierto: true },
  { id: 'doc_incompleta',  label: 'Falta documentación',            cliente: 'Necesitamos documentación adicional para avanzar.', abierto: true },
  { id: 'en_analisis',     label: 'En análisis',                    cliente: 'Estamos analizando tu caso y calculando el reclamo.', abierto: true },
  { id: 'reclamo_enviado', label: 'Reclamo presentado',             cliente: 'Presentamos el reclamo ante la aseguradora.', abierto: true },
  { id: 'negociacion',     label: 'En negociación',                 cliente: 'Estamos negociando el monto con la aseguradora.', abierto: true },
  { id: 'acuerdo',         label: 'Acuerdo alcanzado',              cliente: '¡Hay acuerdo! Estamos coordinando el pago.', abierto: true },
  { id: 'cobrado',         label: 'Cobrado',                        cliente: 'Caso cobrado. ¡Gracias por confiar en SAAT!', abierto: false },
  { id: 'rechazado',       label: 'No viable / rechazado',          cliente: 'Lamentablemente el caso no pudo prosperar por vía extrajudicial.', abierto: false },
  { id: 'desistido',       label: 'Desistido',                      cliente: 'El reclamo fue cerrado a pedido del cliente.', abierto: false },
  { id: 'judicial',        label: 'Derivado a vía judicial',        cliente: 'Tu caso continúa por vía judicial. Te contactaremos.', abierto: false },
];
const ESTADO = Object.fromEntries(ESTADOS.map(e => [e.id, e]));
const ORDEN_CLIENTE = ['nuevo', 'en_analisis', 'reclamo_enviado', 'negociacion', 'acuerdo', 'cobrado'];

const DOCUMENTOS = [
  { id: 'dni_frente',      label: 'DNI — frente',                                  obligatorio: true },
  { id: 'dni_dorso',       label: 'DNI — dorso',                                   obligatorio: true },
  { id: 'registro',        label: 'Registro de conducir (si manejabas)',          cuando: 'conductor' },
  { id: 'cedula',          label: 'Cédula del vehículo (verde o azul)',           cuando: 'vehiculo' },
  { id: 'poliza_propia',   label: 'Póliza o certificado de tu seguro',            cuando: 'vehiculo' },
  { id: 'datos_tercero',   label: 'Datos del otro vehículo (póliza, cédula, registro o foto de la patente)' },
  { id: 'denuncia',        label: 'Denuncia policial o exposición' },
  { id: 'denuncia_seguro', label: 'Denuncia de siniestro ante la aseguradora (si la hiciste)' },
  { id: 'fotos',           label: 'Fotos del accidente y de los daños',          multiple: true },
  { id: 'medicos',         label: 'Certificados médicos, historia clínica, estudios', cuando: 'lesiones', multiple: true },
  { id: 'presupuesto',     label: 'Presupuesto de reparación',                    cuando: 'dano_material' },
  { id: 'gastos',          label: 'Comprobantes de gastos (remedios, traslados, etc.)', multiple: true },
  { id: 'ingresos',        label: 'Recibo de sueldo o constancia de ingresos',    cuando: 'lesiones' },
  { id: 'otro',            label: 'Otro documento',                                multiple: true },
];
const DOC = Object.fromEntries(DOCUMENTOS.map(d => [d.id, d]));

function docsAplicables(caso) {
  const conductor = /conductor/.test(caso.rol || '');
  const vehiculo = conductor || !!caso.vehiculo_cliente;
  return DOCUMENTOS.filter(d => {
    if (!d.cuando) return true;
    if (d.cuando === 'conductor') return conductor;
    if (d.cuando === 'vehiculo') return vehiculo;
    if (d.cuando === 'lesiones') return !!caso.hubo_lesiones;
    if (d.cuando === 'dano_material') return !!caso.dano_material;
    return true;
  });
}

// Documentos importantes que todavía faltan
function docsPendientes(caso, docs) {
  const tiene = new Set(docs.map(d => d.tipo));
  const importantes = ['dni_frente', 'dni_dorso', 'registro', 'cedula', 'denuncia', 'fotos', 'medicos', 'presupuesto'];
  return docsAplicables(caso).filter(d => importantes.includes(d.id) && !tiene.has(d.id)).map(d => ({ id: d.id, label: d.label }));
}

function aniosDesde(fechaISO) {
  const f = new Date(fechaISO + 'T12:00:00');
  if (isNaN(f)) return null;
  return (Date.now() - f.getTime()) / (365.25 * 24 * 3600 * 1000);
}

// Evaluación automática. Devuelve { viable, bloqueo, score, prioridad, flags[] }
function evaluar(caso, aseguradora, cfg) {
  const flags = [];
  let score = 50;
  let bloqueo = null;
  const prescripcion = Number(cfg.prescripcion_anios || 3);

  if (caso.tercero_tiene_seguro === 'no') {
    bloqueo = 'Por ahora sólo tomamos reclamos cuando el vehículo responsable tiene seguro.';
  } else if (caso.tercero_tiene_seguro === 'no_se') {
    flags.push({ nivel: 'alerta', texto: 'Cobertura del tercero sin confirmar — verificar por patente' });
    score -= 10;
  }
  if (aseguradora && aseguradora.estado === 'excluida') {
    bloqueo = `Por el momento no estamos tomando reclamos contra ${aseguradora.nombre}. Escribinos por WhatsApp y te orientamos.`;
  } else if (aseguradora && aseguradora.estado === 'observada') {
    flags.push({ nivel: 'alerta', texto: `Aseguradora observada: ${aseguradora.nombre}` });
    score -= 10;
  }
  if (caso.fecha_accidente) {
    const a = aniosDesde(caso.fecha_accidente);
    if (a !== null && a < 0) { flags.push({ nivel: 'alerta', texto: 'Fecha del accidente en el futuro' }); }
    else if (a !== null && a >= prescripcion) {
      bloqueo = `El accidente tiene más de ${prescripcion} años: el reclamo podría estar prescripto. Escribinos y lo revisamos.`;
    } else if (a !== null && a >= prescripcion - 0.5) {
      flags.push({ nivel: 'urgente', texto: 'Próximo a prescribir — actuar de inmediato' });
    } else if (a !== null && a <= 0.25) {
      score += 5;
    }
  }
  if (caso.culpa === 'yo') {
    bloqueo = bloqueo || 'Según lo que nos contás, la responsabilidad sería tuya. Si tenés dudas, escribinos y lo analizamos sin costo.';
  } else if (caso.culpa === 'compartida') {
    flags.push({ nivel: 'alerta', texto: 'Responsabilidad posiblemente compartida' }); score -= 15;
  } else if (caso.culpa === 'no_se') {
    flags.push({ nivel: 'info', texto: 'Cliente no sabe quién fue responsable' }); score -= 5;
  } else if (caso.culpa === 'tercero') { score += 10; }

  if (caso.hubo_lesiones) { score += 20; flags.push({ nivel: 'info', texto: 'Con lesiones (mayor valor)' }); }
  if (caso.rol === 'acompanante' || caso.rol === 'peaton') { score += 10; flags.push({ nivel: 'info', texto: 'Acompañante/peatón: responsabilidad favorable' }); }
  if (caso.denuncia_policial === 'si') score += 5;
  if (caso.tercero_patente) score += 5;
  if (caso.dano_material) score += 5;

  score = Math.max(0, Math.min(100, score));
  let prioridad = 'normal';
  if (flags.some(f => f.nivel === 'urgente')) prioridad = 'urgente';
  else if (score >= 75) prioridad = 'alta';
  else if (score < 40) prioridad = 'baja';

  return { viable: !bloqueo, bloqueo, score, prioridad, flags };
}

const CATEGORIAS_GASTO = ['Sueldos', 'Honorarios de terceros', 'Comisiones / derivaciones', 'Publicidad y marketing',
  'Alquiler y servicios', 'Movilidad y combustible', 'Tecnología y software', 'Impuestos y tasas', 'Otros'];

module.exports = { ESTADOS, ESTADO, ORDEN_CLIENTE, DOCUMENTOS, DOC, docsAplicables, docsPendientes, evaluar, CATEGORIAS_GASTO };

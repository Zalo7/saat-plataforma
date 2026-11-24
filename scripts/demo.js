// Carga datos FICTICIOS para probar el panel. Usar SOLO con una carpeta de datos separada:
//   npm run demo   (usa ./data-demo, nunca toca ./data)
process.env.DATA_DIR = process.env.DATA_DIR || require('path').join(__dirname, '..', 'data-demo');
if (/[\\/]data$/.test(process.env.DATA_DIR)) { console.error('No cargues datos de prueba en la base real.'); process.exit(1); }
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo12345';
const { db } = require('../src/db');
const { evaluar } = require('../src/dominio');

if (db.prepare('SELECT COUNT(*) n FROM casos').get().n > 0) { console.log('La base demo ya tiene casos.'); process.exit(0); }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const NOM = ['Juan', 'María', 'Carlos', 'Laura', 'Diego', 'Sofía', 'Martín', 'Paula', 'Lucas', 'Romina', 'Facundo', 'Daiana', 'Matías', 'Florencia', 'Nicolás', 'Micaela'];
const APE = ['Gómez', 'Fernández', 'Acosta', 'Benítez', 'Romero', 'Sosa', 'Ramírez', 'Ojeda', 'Cáceres', 'Vallejos', 'Ayala', 'Giménez', 'Escobar', 'Duarte', 'Leiva', 'Medina'];
const LOC = [['Resistencia', 'Chaco'], ['Resistencia', 'Chaco'], ['Resistencia', 'Chaco'], ['Barranqueras', 'Chaco'], ['Fontana', 'Chaco'], ['Presidencia Roque Sáenz Peña', 'Chaco'], ['Corrientes', 'Corrientes'], ['Corrientes', 'Corrientes']];
const CAN = ['Instagram', 'Instagram', 'Instagram', 'Secretaría', 'Recomendación de un conocido', 'Facebook', 'TikTok', 'Taller / clínica / derivación', 'Fui cliente antes', 'Google'];
const ASE = db.prepare("SELECT id, nombre FROM aseguradoras WHERE nombre IN ('San Cristóbal','Sancor Seguros','La Segunda','Triunfo Seguros','Rivadavia Seguros','Federación Patronal','Caja Seguros','Zurich','Norte Seguros','Río Uruguay Seguros (RUS)')").all();
const cfg = { prescripcion_anios: 3 };
const ins = db.prepare(`INSERT INTO casos (codigo, created_at, updated_at, estado, prioridad, score, flags, canal, nombre, apellido, dni, telefono, localidad, provincia,
  fecha_accidente, lugar, localidad_acc, provincia_acc, rol, culpa, hubo_lesiones, dano_material, tercero_tiene_seguro, aseguradora_id, tercero_patente, responsable,
  pct_cuota_litis, monto_reclamado, monto_acordado, honorarios_aseguradora, honorarios_cliente, fecha_reclamo, fecha_acuerdo, fecha_cobro)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const ev = db.prepare('INSERT INTO eventos (caso_id, tipo, texto, visible_cliente, created_at) VALUES (?,?,?,?,?)');
const iso = d => d.toISOString().slice(0, 10);
const hoy = Date.now();
for (let i = 0; i < 64; i++) {
  const dias = Math.floor(rnd() * 200);
  const ingreso = new Date(hoy - dias * 86400000);
  const acc = new Date(ingreso.getTime() - Math.floor(rnd() * 60) * 86400000);
  const [loc, prov] = pick(LOC);
  const les = rnd() < 0.55 ? 1 : 0;
  const rol = pick(['conductor_moto', 'conductor_moto', 'conductor_moto', 'conductor_auto', 'acompanante', 'peaton']);
  const aseg = pick(ASE);
  const c = { tercero_tiene_seguro: 'si', fecha_accidente: iso(acc), culpa: rnd() < 0.85 ? 'tercero' : 'compartida', hubo_lesiones: les, rol, dano_material: 1, denuncia_policial: 'si', tercero_patente: 'X' };
  const e = evaluar(c, aseg, cfg);
  let estado;
  if (dias > 110) estado = rnd() < 0.78 ? 'cobrado' : pick(['rechazado', 'desistido', 'judicial']);
  else if (dias > 60) estado = pick(['cobrado', 'cobrado', 'acuerdo', 'negociacion', 'negociacion', 'rechazado']);
  else if (dias > 20) estado = pick(['reclamo_enviado', 'negociacion', 'en_analisis', 'doc_incompleta']);
  else estado = pick(['nuevo', 'nuevo', 'doc_incompleta', 'en_analisis']);
  const base = les ? 3500000 + rnd() * 9000000 : 900000 + rnd() * 2500000;
  const reclamado = ['nuevo', 'doc_incompleta', 'en_analisis'].includes(estado) ? null : Math.round(base);
  const acordado = ['acuerdo', 'cobrado'].includes(estado) ? Math.round(base * (0.55 + rnd() * 0.3)) : null;
  const honA = acordado ? Math.round(acordado * (0.08 + rnd() * 0.07)) : null;
  const honC = estado === 'cobrado' ? Math.round(acordado * 0.2) : null;
  const fRec = reclamado ? iso(new Date(ingreso.getTime() + 12 * 86400000)) : null;
  const fAc = acordado ? iso(new Date(ingreso.getTime() + (45 + rnd() * 40) * 86400000)) : null;
  let fCob = estado === 'cobrado' ? new Date(ingreso.getTime() + (65 + rnd() * 50) * 86400000) : null;
  if (fCob && fCob.getTime() > hoy) fCob = new Date(hoy - 86400000);
  const created = ingreso.toISOString().replace('T', ' ').slice(0, 19);
  const r = ins.run(`SAAT-2026-${100000 + i * 7919 % 899999}`, created, created, estado, e.prioridad, e.score, JSON.stringify(e.flags), pick(CAN), pick(NOM), pick(APE),
    String(25000000 + Math.floor(rnd() * 20000000)), '3624' + Math.floor(100000 + rnd() * 899999), loc, prov, iso(acc), 'Av. ' + pick(['Sarmiento', 'Alberdi', '9 de Julio', 'Italia', 'Hernandarias', 'Las Heras']),
    loc, prov, rol, c.culpa, les, 1, 'si', aseg.id, 'AB' + Math.floor(100 + rnd() * 899) + 'CD', pick(['Dr. Gerardo Martín Stancheff', 'Secretaría']), 20, reclamado, acordado, honA, honC, fRec, fAc, fCob ? iso(fCob) : null);
  ev.run(Number(r.lastInsertRowid), 'sistema', 'Caso de demostración', 0, created);
}
const G = [['Sueldos', 'Sueldo secretaría', 360000], ['Sueldos', 'Sueldo administrativa', 500000], ['Sueldos', 'Sueldo asistente', 367800], ['Publicidad y marketing', 'Pauta Instagram / Meta', 250000],
  ['Movilidad y combustible', 'Combustible', 80000], ['Comisiones / derivaciones', 'Comisión por cierre de casos', 240000], ['Alquiler y servicios', 'Servicios oficina', 120000], ['Tecnología y software', 'Hosting y dominio', 30000]];
const ig = db.prepare('INSERT INTO gastos (fecha, categoria, concepto, monto) VALUES (?,?,?,?)');
for (let m = 0; m < 7; m++) {
  const d = new Date(); d.setDate(5); d.setMonth(d.getMonth() - m);
  for (const [cat, con, monto] of G) ig.run(iso(d), cat, con, Math.round(monto * (1 - m * 0.04)));
}
db.prepare("INSERT INTO mensajes (caso_id, autor, texto) VALUES (3, 'cliente', 'Buen día, ya subí el certificado médico. ¿Necesitan algo más?')").run();
console.log('Datos de demostración cargados. Panel: email drstancheff@yahoo.com.ar / contraseña', process.env.ADMIN_PASSWORD);

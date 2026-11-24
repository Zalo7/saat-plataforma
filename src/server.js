// SAAT — Plataforma de reclamos por accidentes de tránsito
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const { db, DATA_DIR, getConfig, hashPassword, checkPassword } = require('./db');
const D = require('./dominio');
const { generarConvenioPDF } = require('./pdf');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
// gzip para HTML, CSS, JS y JSON (las imágenes y fuentes ya vienen comprimidas)
app.use(compression());
app.use(express.json({ limit: '2mb' }));

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  next();
});

// ---------- utilidades ----------
function secret() {
  let s = db.prepare("SELECT valor FROM config WHERE clave='_secret'").get();
  if (!s) { const v = crypto.randomBytes(32).toString('hex'); db.prepare("INSERT INTO config VALUES ('_secret', ?)").run(v); return v; }
  return s.valor;
}
const SECRET = process.env.APP_SECRET || secret();
const clienteToken = (c) => `${c.id}.${crypto.createHmac('sha256', SECRET).update(`${c.id}:${c.codigo}:${c.dni}`).digest('base64url').slice(0, 32)}`;
function casoDesdeToken(tok) {
  const [id] = String(tok || '').split('.');
  const c = db.prepare('SELECT * FROM casos WHERE id = ?').get(Number(id));
  if (!c) return null;
  const esperado = clienteToken(c);
  if (esperado.length !== String(tok).length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(tok)))) return null;
  return c;
}
const limpiar = (v, max = 500) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null;
const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function evento(casoId, tipo, texto, visible = 0, usuario = null) {
  db.prepare('INSERT INTO eventos (caso_id, tipo, texto, visible_cliente, usuario) VALUES (?,?,?,?,?)').run(casoId, tipo, texto, visible ? 1 : 0, usuario);
  db.prepare("UPDATE casos SET updated_at = datetime('now') WHERE id = ?").run(casoId);
}
function nuevoCodigo() {
  const y = new Date().getFullYear();
  for (;;) {
    const c = `SAAT-${y}-${crypto.randomInt(100000, 999999)}`;
    if (!db.prepare('SELECT 1 FROM casos WHERE codigo = ?').get(c)) return c;
  }
}

// Límite simple de intentos por IP
const intentos = new Map();
function limitar(clave, max, ventanaMs) {
  return (req, res, next) => {
    const k = clave + ':' + req.ip;
    const ahora = Date.now();
    const arr = (intentos.get(k) || []).filter(t => ahora - t < ventanaMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    arr.push(ahora); intentos.set(k, arr); next();
  };
}

// Subida de archivos
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(DATA_DIR, 'uploads', 'tmp'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname || '').toLowerCase().slice(0, 6)),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 40 },
  fileFilter: (req, file, cb) => cb(null, TIPOS_OK.includes(file.mimetype)),
});
function guardarDocs(casoId, files, subidoPor) {
  const dir = path.join(DATA_DIR, 'uploads', String(casoId));
  fs.mkdirSync(dir, { recursive: true });
  const ins = db.prepare('INSERT INTO documentos (caso_id, tipo, nombre_original, archivo, mime, size, subido_por) VALUES (?,?,?,?,?,?,?)');
  let n = 0;
  for (const f of files || []) {
    const tipo = D.DOC[f.fieldname] ? f.fieldname : 'otro';
    const destino = path.join(dir, path.basename(f.path));
    fs.renameSync(f.path, destino);
    ins.run(casoId, tipo, limpiar(f.originalname, 200), path.relative(DATA_DIR, destino), f.mimetype, f.size, subidoPor);
    n++;
  }
  return n;
}
function aseguradoraDe(c) {
  return c.aseguradora_id ? db.prepare('SELECT * FROM aseguradoras WHERE id = ?').get(c.aseguradora_id) : null;
}

// ======================================================================
//  API PÚBLICA (clientes)
// ======================================================================
app.get('/api/public/config', (req, res) => {
  const cfg = getConfig();
  res.json({
    abogado_nombre: cfg.abogado_nombre, abogado_matricula: cfg.abogado_matricula, domicilio: cfg.domicilio,
    email: cfg.email, whatsapp: cfg.whatsapp, pct_cuota_litis: cfg.pct_cuota_litis, marca_registro: cfg.marca_registro,
    jurisdiccion: cfg.jurisdiccion, prescripcion_anios: cfg.prescripcion_anios,
    aseguradoras: db.prepare('SELECT id, nombre, estado FROM aseguradoras ORDER BY nombre').all(),
    documentos: D.DOCUMENTOS, estados: D.ESTADOS,
  });
});

app.post('/api/public/precheck', limitar('pre', 60, 60_000), (req, res) => {
  const b = req.body || {};
  const caso = { tercero_tiene_seguro: b.tercero_tiene_seguro, fecha_accidente: b.fecha_accidente, culpa: b.culpa, aseguradora_id: Number(b.aseguradora_id) || null };
  const r = D.evaluar(caso, aseguradoraDe(caso), getConfig());
  res.json({ viable: r.viable, bloqueo: r.bloqueo });
});

app.post('/api/public/casos', limitar('alta', 20, 3600_000), upload.any(), async (req, res) => {
  const tmpFiles = req.files || [];
  const descartar = () => tmpFiles.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
  try {
    let b;
    try { b = JSON.parse(req.body.datos || '{}'); } catch { descartar(); return res.status(400).json({ error: 'Datos inválidos' }); }
    const cfg = getConfig();
    const c = {
      nombre: limpiar(b.nombre, 80), apellido: limpiar(b.apellido, 80), dni: soloDigitos(b.dni).slice(0, 9), cuil: soloDigitos(b.cuil).slice(0, 11) || null,
      fecha_nac: limpiar(b.fecha_nac, 10), telefono: limpiar(b.telefono, 40), email: limpiar(b.email, 120), domicilio: limpiar(b.domicilio, 200),
      localidad: limpiar(b.localidad, 80), provincia: limpiar(b.provincia, 40), ocupacion: limpiar(b.ocupacion, 100), ingresos_registrados: limpiar(b.ingresos_registrados, 20),
      fecha_accidente: limpiar(b.fecha_accidente, 10), hora_accidente: limpiar(b.hora_accidente, 5), lugar: limpiar(b.lugar, 200),
      localidad_acc: limpiar(b.localidad_acc, 80), provincia_acc: limpiar(b.provincia_acc, 40), rol: limpiar(b.rol, 30),
      vehiculo_cliente: limpiar(b.vehiculo_cliente, 80), patente_cliente: limpiar(b.patente_cliente, 12)?.toUpperCase() || null,
      tipo_siniestro: limpiar(b.tipo_siniestro, 60), descripcion: limpiar(b.descripcion, 3000), culpa: limpiar(b.culpa, 20),
      hubo_lesiones: b.hubo_lesiones ? 1 : 0, lesiones_desc: limpiar(b.lesiones_desc, 1500), atencion_medica: limpiar(b.atencion_medica, 300),
      denuncia_policial: limpiar(b.denuncia_policial, 10), dano_material: b.dano_material ? 1 : 0, dano_desc: limpiar(b.dano_desc, 1500),
      tercero_tiene_seguro: limpiar(b.tercero_tiene_seguro, 10), aseguradora_id: Number(b.aseguradora_id) || null, aseguradora_texto: limpiar(b.aseguradora_texto, 100),
      tercero_nombre: limpiar(b.tercero_nombre, 120), tercero_patente: limpiar(b.tercero_patente, 12)?.toUpperCase() || null,
      tercero_vehiculo: limpiar(b.tercero_vehiculo, 80), tercero_poliza: limpiar(b.tercero_poliza, 60),
      canal: limpiar(b.canal, 60), referido_por: limpiar(b.referido_por, 120), utm_source: limpiar(b.utm_source, 60), utm_campaign: limpiar(b.utm_campaign, 80),
    };
    const faltan = ['nombre', 'apellido', 'dni', 'telefono', 'fecha_accidente', 'lugar', 'localidad_acc', 'rol', 'culpa', 'tercero_tiene_seguro'].filter(k => !c[k]);
    if (faltan.length) { descartar(); return res.status(400).json({ error: 'Faltan datos obligatorios: ' + faltan.join(', ') }); }
    if (c.dni.length < 7) { descartar(); return res.status(400).json({ error: 'DNI inválido' }); }
    if (!b.acepta_convenio || !b.acepta_datos) { descartar(); return res.status(400).json({ error: 'Tenés que aceptar el convenio y la política de datos' }); }
    const firma = String(b.firma || '');
    if (!firma.startsWith('data:image/png;base64,') || firma.length < 2000) { descartar(); return res.status(400).json({ error: 'Falta la firma' }); }

    const aseg = aseguradoraDe(c);
    const ev = D.evaluar(c, aseg, cfg);
    if (!ev.viable) { descartar(); return res.status(422).json({ error: ev.bloqueo, bloqueo: true }); }

    c.codigo = nuevoCodigo();
    c.score = ev.score; c.prioridad = ev.prioridad; c.flags = JSON.stringify(ev.flags);
    c.pct_cuota_litis = Number(cfg.pct_cuota_litis);
    c.firmado_at = new Date().toISOString(); c.firma_ip = req.ip; c.firma_ua = limpiar(req.get('user-agent'), 300);
    const cols = Object.keys(c);
    const r = db.prepare(`INSERT INTO casos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => c[k]));
    const id = Number(r.lastInsertRowid);

    // Firma + convenio PDF
    const firmaRel = path.join('convenios', `${c.codigo}-firma.png`);
    fs.writeFileSync(path.join(DATA_DIR, firmaRel), Buffer.from(firma.split(',')[1], 'base64'));
    const pdfRel = path.join('convenios', `${c.codigo}-convenio.pdf`);
    const hash = await generarConvenioPDF({ ...c, aseguradora_nombre: aseg?.nombre }, cfg, path.join(DATA_DIR, firmaRel), path.join(DATA_DIR, pdfRel));
    db.prepare('UPDATE casos SET firma_archivo = ?, convenio_archivo = ?, convenio_hash = ? WHERE id = ?').run(firmaRel, pdfRel, hash, id);

    const n = guardarDocs(id, tmpFiles, 'cliente');
    evento(id, 'sistema', `Reclamo ingresado por la web con ${n} documento(s). Convenio firmado electrónicamente.`, 0);
    evento(id, 'estado', D.ESTADO.nuevo.cliente, 1);
    const caso = db.prepare('SELECT * FROM casos WHERE id = ?').get(id);
    const docs = db.prepare('SELECT tipo FROM documentos WHERE caso_id = ?').all(id);
    const pend = D.docsPendientes(caso, docs);
    res.json({ ok: true, codigo: c.codigo, token: clienteToken(caso), pendientes: pend });
  } catch (e) {
    console.error(e); descartar();
    res.status(500).json({ error: 'No pudimos registrar el reclamo. Intentá de nuevo o escribinos por WhatsApp.' });
  }
});

function resumenCliente(c) {
  const docs = db.prepare('SELECT id, tipo, nombre_original, created_at FROM documentos WHERE caso_id = ? ORDER BY id').all(c.id);
  return {
    codigo: c.codigo, nombre: c.nombre, estado: c.estado, estado_label: D.ESTADO[c.estado]?.label, estado_texto: D.ESTADO[c.estado]?.cliente,
    created_at: c.created_at, fecha_accidente: c.fecha_accidente, aseguradora: aseguradoraDe(c)?.nombre || c.aseguradora_texto,
    linea: D.ORDEN_CLIENTE.map(id => ({ id, label: D.ESTADO[id].label })),
    eventos: db.prepare('SELECT texto, created_at FROM eventos WHERE caso_id = ? AND visible_cliente = 1 ORDER BY id DESC').all(c.id),
    mensajes: db.prepare('SELECT autor, texto, created_at FROM mensajes WHERE caso_id = ? ORDER BY id').all(c.id),
    documentos: docs.map(d => ({ ...d, tipo_label: D.DOC[d.tipo]?.label || d.tipo })),
    pendientes: D.docsPendientes(c, docs),
    tipos_doc: D.docsAplicables(c).map(d => ({ id: d.id, label: d.label })),
  };
}

app.post('/api/public/seguimiento', limitar('seg', 20, 15 * 60_000), (req, res) => {
  const codigo = String(req.body?.codigo || '').trim().toUpperCase();
  const dni = soloDigitos(req.body?.dni);
  const c = db.prepare('SELECT * FROM casos WHERE codigo = ? AND dni = ?').get(codigo, dni);
  if (!c) return res.status(404).json({ error: 'No encontramos un reclamo con ese código y DNI.' });
  res.json({ token: clienteToken(c), caso: resumenCliente(c) });
});
app.get('/api/public/seguimiento', (req, res) => {
  const c = casoDesdeToken(req.get('x-token'));
  if (!c) return res.status(401).json({ error: 'Sesión vencida' });
  db.prepare("UPDATE mensajes SET leido = 1 WHERE caso_id = ? AND autor = 'estudio'").run(c.id);
  res.json({ caso: resumenCliente(c) });
});
app.post('/api/public/seguimiento/mensaje', limitar('msg', 30, 3600_000), (req, res) => {
  const c = casoDesdeToken(req.get('x-token'));
  if (!c) return res.status(401).json({ error: 'Sesión vencida' });
  const texto = limpiar(req.body?.texto, 2000);
  if (!texto) return res.status(400).json({ error: 'Mensaje vacío' });
  db.prepare("INSERT INTO mensajes (caso_id, autor, texto) VALUES (?, 'cliente', ?)").run(c.id, texto);
  db.prepare("UPDATE casos SET updated_at = datetime('now') WHERE id = ?").run(c.id);
  res.json({ ok: true });
});
app.post('/api/public/seguimiento/docs', limitar('docs', 30, 3600_000), upload.any(), (req, res) => {
  const c = casoDesdeToken(req.get('x-token'));
  if (!c) { (req.files || []).forEach(f => fs.unlinkSync(f.path)); return res.status(401).json({ error: 'Sesión vencida' }); }
  const n = guardarDocs(c.id, req.files, 'cliente');
  if (n) evento(c.id, 'documento', `El cliente subió ${n} documento(s) desde el seguimiento.`, 0);
  res.json({ ok: true, subidos: n });
});
app.get('/api/public/seguimiento/convenio', (req, res) => {
  const c = casoDesdeToken(req.query.t);
  if (!c || !c.convenio_archivo) return res.status(404).end();
  res.download(path.join(DATA_DIR, c.convenio_archivo), `Convenio-${c.codigo}.pdf`);
});

// ======================================================================
//  AUTENTICACIÓN DEL PANEL
// ======================================================================
function leerCookie(req, nombre) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(nombre + '='));
  return m ? decodeURIComponent(m.slice(nombre.length + 1)) : null;
}
function auth(req, res, next) {
  const tok = leerCookie(req, 'saat_sesion');
  const s = tok && db.prepare("SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira > datetime('now') AND u.activo = 1").get(tok);
  if (!s) return res.status(401).json({ error: 'No autorizado' });
  req.user = s; next();
}
const soloAdmin = (req, res, next) => req.user.rol === 'admin' ? next() : res.status(403).json({ error: 'Sólo administradores' });

app.post('/api/auth/login', limitar('login', 10, 15 * 60_000), (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(String(req.body?.email || '').toLowerCase().trim());
  if (!u || !checkPassword(String(req.body?.password || ''), u.pass_hash)) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, datetime('now', '+14 days'))").run(token, u.id);
  const seguro = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `saat_sesion=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${14 * 86400}${seguro}`);
  res.json({ ok: true, nombre: u.nombre, rol: u.rol });
});
app.post('/api/auth/logout', (req, res) => {
  const tok = leerCookie(req, 'saat_sesion');
  if (tok) db.prepare('DELETE FROM sesiones WHERE token = ?').run(tok);
  res.setHeader('Set-Cookie', 'saat_sesion=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ id: req.user.id, nombre: req.user.nombre, email: req.user.email, rol: req.user.rol }));
app.post('/api/auth/password', auth, (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!checkPassword(String(actual || ''), req.user.pass_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (String(nueva || '').length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE usuarios SET pass_hash = ? WHERE id = ?').run(hashPassword(nueva), req.user.id);
  res.json({ ok: true });
});

// ======================================================================
//  API DEL PANEL
// ======================================================================
const A = express.Router();
A.use(auth);

A.get('/meta', (req, res) => res.json({
  estados: D.ESTADOS, documentos: D.DOCUMENTOS, categorias_gasto: D.CATEGORIAS_GASTO,
  aseguradoras: db.prepare('SELECT * FROM aseguradoras ORDER BY nombre').all(),
  no_leidos: db.prepare("SELECT COUNT(*) n FROM mensajes WHERE autor = 'cliente' AND leido = 0").get().n,
}));

const CASO_LISTA_SQL = `SELECT c.id, c.codigo, c.created_at, c.updated_at, c.estado, c.prioridad, c.score, c.nombre, c.apellido, c.dni, c.telefono,
  c.localidad_acc, c.provincia_acc, c.fecha_accidente, c.hubo_lesiones, c.canal, c.responsable, c.flags,
  COALESCE(a.nombre, c.aseguradora_texto) AS aseguradora, c.honorarios_aseguradora, c.honorarios_cliente, c.monto_acordado, c.fecha_cobro,
  (SELECT COUNT(*) FROM documentos d WHERE d.caso_id = c.id) AS n_docs,
  (SELECT COUNT(*) FROM mensajes m WHERE m.caso_id = c.id AND m.autor = 'cliente' AND m.leido = 0) AS no_leidos
  FROM casos c LEFT JOIN aseguradoras a ON a.id = c.aseguradora_id`;

A.get('/casos', (req, res) => {
  const w = [], p = [];
  if (req.query.estado === 'abiertos') w.push(`c.estado IN (${D.ESTADOS.filter(e => e.abierto).map(e => `'${e.id}'`).join(',')})`);
  else if (req.query.estado) { w.push('c.estado = ?'); p.push(req.query.estado); }
  if (req.query.aseguradora) { w.push('c.aseguradora_id = ?'); p.push(Number(req.query.aseguradora)); }
  if (req.query.prioridad) { w.push('c.prioridad = ?'); p.push(req.query.prioridad); }
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    w.push('(c.nombre LIKE ? OR c.apellido LIKE ? OR c.dni LIKE ? OR c.codigo LIKE ? OR c.tercero_patente LIKE ? OR c.telefono LIKE ?)');
    p.push(q, q, q, q, q, q);
  }
  const sql = `${CASO_LISTA_SQL} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY no_leidos DESC, CASE c.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.updated_at DESC LIMIT 1000`;
  res.json(db.prepare(sql).all(...p));
});

A.get('/casos/:id', (req, res) => {
  const c = db.prepare('SELECT c.*, a.nombre AS aseguradora_nombre, a.estado AS aseguradora_estado FROM casos c LEFT JOIN aseguradoras a ON a.id = c.aseguradora_id WHERE c.id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'No existe' });
  db.prepare("UPDATE mensajes SET leido = 1 WHERE caso_id = ? AND autor = 'cliente'").run(c.id);
  const docs = db.prepare('SELECT * FROM documentos WHERE caso_id = ? ORDER BY id').all(c.id);
  res.json({
    caso: c, documentos: docs,
    eventos: db.prepare('SELECT * FROM eventos WHERE caso_id = ? ORDER BY id DESC').all(c.id),
    mensajes: db.prepare('SELECT * FROM mensajes WHERE caso_id = ? ORDER BY id').all(c.id),
    pendientes: D.docsPendientes(c, docs),
    link_seguimiento: `/seguimiento.html#${c.codigo}`,
  });
});

const EDITABLES = ['nombre', 'apellido', 'dni', 'cuil', 'fecha_nac', 'telefono', 'email', 'domicilio', 'localidad', 'provincia', 'ocupacion', 'ingresos_registrados',
  'fecha_accidente', 'hora_accidente', 'lugar', 'localidad_acc', 'provincia_acc', 'rol', 'vehiculo_cliente', 'patente_cliente', 'tipo_siniestro', 'descripcion', 'culpa',
  'hubo_lesiones', 'lesiones_desc', 'atencion_medica', 'denuncia_policial', 'dano_material', 'dano_desc', 'tercero_tiene_seguro', 'aseguradora_id', 'aseguradora_texto',
  'tercero_nombre', 'tercero_patente', 'tercero_vehiculo', 'tercero_poliza', 'nro_siniestro', 'responsable', 'prioridad', 'canal', 'referido_por',
  'monto_reclamado', 'monto_acordado', 'honorarios_aseguradora', 'honorarios_cliente', 'fecha_reclamo', 'fecha_acuerdo', 'fecha_cobro', 'motivo_cierre', 'pct_cuota_litis'];
const NUMERICOS = ['monto_reclamado', 'monto_acordado', 'honorarios_aseguradora', 'honorarios_cliente', 'pct_cuota_litis', 'aseguradora_id', 'hubo_lesiones', 'dano_material'];

A.patch('/casos/:id', (req, res) => {
  const id = Number(req.params.id);
  const sets = [], vals = [];
  for (const k of EDITABLES) if (k in (req.body || {})) {
    let v = req.body[k];
    if (NUMERICOS.includes(k)) v = (v === '' || v === null) ? null : Number(v);
    else v = limpiar(v, 3000);
    sets.push(`${k} = ?`); vals.push(v);
  }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE casos SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
  res.json({ ok: true });
});

A.post('/casos/:id/estado', (req, res) => {
  const id = Number(req.params.id);
  const { estado, mensaje } = req.body || {};
  if (!D.ESTADO[estado]) return res.status(400).json({ error: 'Estado inválido' });
  const c = db.prepare('SELECT * FROM casos WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  const hoy = new Date().toISOString().slice(0, 10);
  const extra = [];
  if (estado === 'reclamo_enviado' && !c.fecha_reclamo) extra.push(`fecha_reclamo = '${hoy}'`);
  if (estado === 'acuerdo' && !c.fecha_acuerdo) extra.push(`fecha_acuerdo = '${hoy}'`);
  if (estado === 'cobrado' && !c.fecha_cobro) extra.push(`fecha_cobro = '${hoy}'`);
  db.prepare(`UPDATE casos SET estado = ?${extra.length ? ', ' + extra.join(', ') : ''} WHERE id = ?`).run(estado, id);
  evento(id, 'sistema', `Estado: ${D.ESTADO[c.estado]?.label} → ${D.ESTADO[estado].label}`, 0, req.user.nombre);
  evento(id, 'estado', limpiar(mensaje, 1500) || D.ESTADO[estado].cliente, 1, req.user.nombre);
  res.json({ ok: true });
});

A.post('/casos/:id/nota', (req, res) => {
  const t = limpiar(req.body?.texto, 3000);
  if (!t) return res.status(400).json({ error: 'Vacío' });
  evento(Number(req.params.id), 'nota', t, req.body?.visible ? 1 : 0, req.user.nombre);
  res.json({ ok: true });
});
A.post('/casos/:id/mensaje', (req, res) => {
  const t = limpiar(req.body?.texto, 3000);
  if (!t) return res.status(400).json({ error: 'Vacío' });
  db.prepare("INSERT INTO mensajes (caso_id, autor, usuario, texto) VALUES (?, 'estudio', ?, ?)").run(Number(req.params.id), req.user.nombre, t);
  res.json({ ok: true });
});
A.post('/casos/:id/docs', upload.any(), (req, res) => {
  const n = guardarDocs(Number(req.params.id), req.files, req.user.nombre);
  if (n) evento(Number(req.params.id), 'documento', `${req.user.nombre} subió ${n} documento(s).`, 0, req.user.nombre);
  res.json({ ok: true, subidos: n });
});
A.get('/docs/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).end();
  const f = path.join(DATA_DIR, d.archivo);
  if (req.query.descargar) return res.download(f, d.nombre_original || path.basename(f));
  res.type(d.mime || 'application/octet-stream').sendFile(f);
});
A.get('/casos/:id/convenio', (req, res) => {
  const c = db.prepare('SELECT codigo, convenio_archivo FROM casos WHERE id = ?').get(Number(req.params.id));
  if (!c?.convenio_archivo) return res.status(404).json({ error: 'Este caso no tiene convenio firmado en la plataforma' });
  res.download(path.join(DATA_DIR, c.convenio_archivo), `Convenio-${c.codigo}.pdf`);
});

// Alta manual (casos que entran por la oficina, teléfono o derivación)
A.post('/casos', (req, res) => {
  const b = req.body || {};
  if (!b.nombre || !b.apellido) return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
  const codigo = nuevoCodigo();
  const r = db.prepare(`INSERT INTO casos (codigo, nombre, apellido, dni, telefono, fecha_accidente, localidad_acc, provincia_acc, aseguradora_id, aseguradora_texto,
    hubo_lesiones, canal, referido_por, responsable, tercero_tiene_seguro, created_at, estado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now')), ?)`).run(
    codigo, limpiar(b.nombre, 80), limpiar(b.apellido, 80), soloDigitos(b.dni) || null, limpiar(b.telefono, 40), limpiar(b.fecha_accidente, 10),
    limpiar(b.localidad_acc, 80), limpiar(b.provincia_acc, 40) || 'Chaco', Number(b.aseguradora_id) || null, limpiar(b.aseguradora_texto, 100),
    b.hubo_lesiones ? 1 : 0, limpiar(b.canal, 60) || 'Oficina', limpiar(b.referido_por, 120), limpiar(b.responsable, 80) || req.user.nombre, 'si',
    b.fecha_ingreso ? `${limpiar(b.fecha_ingreso, 10)} 12:00:00` : null, D.ESTADO[b.estado] ? b.estado : 'nuevo');
  const id = Number(r.lastInsertRowid);
  evento(id, 'sistema', `Caso cargado manualmente por ${req.user.nombre}.`, 0, req.user.nombre);
  evento(id, 'estado', D.ESTADO.nuevo.cliente, 1);
  res.json({ ok: true, id, codigo });
});

// ---------- métricas ----------
A.get('/metricas', (req, res) => {
  const cfg = getConfig();
  const casos = db.prepare(`SELECT c.*, COALESCE(a.nombre, c.aseguradora_texto, 'Sin dato') AS aseg FROM casos c LEFT JOIN aseguradoras a ON a.id = c.aseguradora_id`).all();
  const gastos = db.prepare('SELECT * FROM gastos').all();
  const hon = c => (c.honorarios_aseguradora || 0) + (c.honorarios_cliente || 0);
  const mes = d => String(d || '').slice(0, 7);
  const hoy = new Date();
  const mesActual = hoy.toISOString().slice(0, 7);
  const anio = String(hoy.getFullYear());
  const dias = (a, b) => (new Date(b) - new Date(String(a).replace(' ', 'T'))) / 86400000;

  const cobrados = casos.filter(c => c.estado === 'cobrado');
  const cerradosNeg = casos.filter(c => ['rechazado', 'desistido'].includes(c.estado));
  const abiertos = casos.filter(c => D.ESTADO[c.estado]?.abierto);
  const honCobrados = cobrados.reduce((s, c) => s + hon(c), 0);
  const honProm = cobrados.length ? honCobrados / cobrados.length : Number(cfg.honorario_estimado || 0);
  const diasCobro = cobrados.filter(c => c.fecha_cobro).map(c => dias(c.created_at, c.fecha_cobro)).filter(x => x >= 0);
  const tasaExito = (cobrados.length + cerradosNeg.length) ? cobrados.length / (cobrados.length + cerradosNeg.length) : null;
  const ingresosMes = cobrados.filter(c => mes(c.fecha_cobro) === mesActual).reduce((s, c) => s + hon(c), 0);
  const gastosMes = gastos.filter(g => mes(g.fecha) === mesActual).reduce((s, g) => s + g.monto, 0);
  const ingresosAnio = cobrados.filter(c => String(c.fecha_cobro || '').startsWith(anio)).reduce((s, c) => s + hon(c), 0);
  const gastosAnio = gastos.filter(g => String(g.fecha).startsWith(anio)).reduce((s, g) => s + g.monto, 0);
  // Pipeline: acuerdos con honorarios cargados + resto de abiertos al promedio ponderado por tasa de éxito
  const prob = tasaExito ?? 0.7;
  const pipeline = abiertos.reduce((s, c) => s + (c.estado === 'acuerdo' && hon(c) ? hon(c) : honProm * (c.estado === 'acuerdo' ? 0.95 : c.estado === 'negociacion' ? Math.max(prob, 0.8) : prob)), 0);

  // Series: últimas 12 semanas y 12 meses
  const semanas = [];
  const lunes = new Date(hoy); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) {
    const ini = new Date(lunes); ini.setDate(ini.getDate() - 7 * i);
    const fin = new Date(ini); fin.setDate(fin.getDate() + 7);
    const n = casos.filter(c => { const t = new Date(String(c.created_at).replace(' ', 'T') + 'Z'); return t >= ini && t < fin; }).length;
    semanas.push({ semana: ini.toISOString().slice(0, 10), casos: n });
  }
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ing = cobrados.filter(c => mes(c.fecha_cobro) === m).reduce((s, c) => s + hon(c), 0);
    const gas = gastos.filter(g => mes(g.fecha) === m).reduce((s, g) => s + g.monto, 0);
    meses.push({ mes: m, ingresos: ing, gastos: gas, resultado: ing - gas, casos: casos.filter(c => mes(c.created_at) === m).length, cobrados: cobrados.filter(c => mes(c.fecha_cobro) === m).length });
  }
  function agrupar(clave) {
    const g = {};
    for (const c of casos) {
      const k = (typeof clave === 'function' ? clave(c) : c[clave]) || 'Sin dato';
      const o = g[k] ||= { nombre: k, casos: 0, abiertos: 0, cobrados: 0, rechazados: 0, honorarios: 0, dias: [] };
      o.casos++;
      if (D.ESTADO[c.estado]?.abierto) o.abiertos++;
      if (c.estado === 'cobrado') { o.cobrados++; o.honorarios += hon(c); if (c.fecha_cobro) o.dias.push(dias(c.created_at, c.fecha_cobro)); }
      if (['rechazado', 'desistido'].includes(c.estado)) o.rechazados++;
    }
    return Object.values(g).map(o => ({ ...o, dias_cobro: o.dias.length ? Math.round(o.dias.reduce((a, b) => a + b, 0) / o.dias.length) : null,
      exito: (o.cobrados + o.rechazados) ? o.cobrados / (o.cobrados + o.rechazados) : null, hon_prom: o.cobrados ? o.honorarios / o.cobrados : null, dias: undefined }))
      .sort((a, b) => b.casos - a.casos);
  }
  const porEstado = D.ESTADOS.map(e => ({ id: e.id, label: e.label, n: casos.filter(c => c.estado === e.id).length }));
  const gastosCat = {};
  for (const g of gastos.filter(g => String(g.fecha).startsWith(anio))) gastosCat[g.categoria] = (gastosCat[g.categoria] || 0) + g.monto;

  res.json({
    kpi: {
      total: casos.length, abiertos: abiertos.length, cobrados: cobrados.length, nuevos_mes: casos.filter(c => mes(c.created_at) === mesActual).length,
      tasa_exito: tasaExito, hon_cobrados: honCobrados, hon_promedio: cobrados.length ? honCobrados / cobrados.length : null, hon_estimado: Number(cfg.honorario_estimado || 0),
      dias_promedio_cobro: diasCobro.length ? Math.round(diasCobro.reduce((a, b) => a + b, 0) / diasCobro.length) : null,
      ingresos_mes: ingresosMes, gastos_mes: gastosMes, resultado_mes: ingresosMes - gastosMes,
      ingresos_anio: ingresosAnio, gastos_anio: gastosAnio, resultado_anio: ingresosAnio - gastosAnio, pipeline,
      con_lesiones: casos.filter(c => c.hubo_lesiones).length,
      urgentes: abiertos.filter(c => c.prioridad === 'urgente').length,
      mensajes_sin_leer: db.prepare("SELECT COUNT(*) n FROM mensajes WHERE autor = 'cliente' AND leido = 0").get().n,
      docs_incompletos: casos.filter(c => c.estado === 'doc_incompleta').length,
    },
    semanas, meses, por_estado: porEstado,
    por_aseguradora: agrupar('aseg'), por_canal: agrupar('canal'), por_localidad: agrupar(c => c.localidad_acc ? `${c.localidad_acc}${c.provincia_acc ? ' (' + c.provincia_acc + ')' : ''}` : null),
    por_responsable: agrupar('responsable'),
    gastos_categoria: Object.entries(gastosCat).map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
  });
});

// ---------- aseguradoras ----------
A.get('/aseguradoras', (req, res) => res.json(db.prepare('SELECT * FROM aseguradoras ORDER BY nombre').all()));
A.post('/aseguradoras', (req, res) => {
  const n = limpiar(req.body?.nombre, 100);
  if (!n) return res.status(400).json({ error: 'Nombre vacío' });
  try { db.prepare('INSERT INTO aseguradoras (nombre) VALUES (?)').run(n); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Ya existe' }); }
});
A.patch('/aseguradoras/:id', (req, res) => {
  const { estado, nota } = req.body || {};
  if (estado && !['activa', 'observada', 'excluida'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  if (estado) db.prepare('UPDATE aseguradoras SET estado = ? WHERE id = ?').run(estado, Number(req.params.id));
  if (nota !== undefined) db.prepare('UPDATE aseguradoras SET nota = ? WHERE id = ?').run(limpiar(nota, 500), Number(req.params.id));
  res.json({ ok: true });
});

// ---------- gastos ----------
A.get('/gastos', (req, res) => {
  const m = req.query.mes;
  res.json(m ? db.prepare("SELECT * FROM gastos WHERE substr(fecha,1,7) = ? ORDER BY fecha DESC, id DESC").all(m)
             : db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC LIMIT 500').all());
});
A.post('/gastos', (req, res) => {
  const b = req.body || {};
  const monto = Number(b.monto);
  if (!b.fecha || !b.concepto || !(monto > 0)) return res.status(400).json({ error: 'Fecha, concepto y monto son obligatorios' });
  db.prepare('INSERT INTO gastos (fecha, categoria, concepto, detalle, monto) VALUES (?,?,?,?,?)')
    .run(limpiar(b.fecha, 10), D.CATEGORIAS_GASTO.includes(b.categoria) ? b.categoria : 'Otros', limpiar(b.concepto, 120), limpiar(b.detalle, 300), monto);
  res.json({ ok: true });
});
A.delete('/gastos/:id', (req, res) => { db.prepare('DELETE FROM gastos WHERE id = ?').run(Number(req.params.id)); res.json({ ok: true }); });

// ---------- configuración y usuarios ----------
A.get('/config', (req, res) => { const c = getConfig(); delete c._secret; res.json(c); });
A.put('/config', soloAdmin, (req, res) => {
  const permitidas = ['estudio_nombre', 'abogado_nombre', 'abogado_matricula', 'abogado_cuit', 'domicilio', 'email', 'whatsapp', 'pct_cuota_litis', 'honorario_estimado', 'prescripcion_anios', 'marca_registro', 'jurisdiccion'];
  const up = db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const k of permitidas) if (k in (req.body || {})) up.run(k, limpiar(req.body[k], 300) || '');
  res.json({ ok: true });
});
A.get('/usuarios', soloAdmin, (req, res) => res.json(db.prepare('SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY id').all()));
A.post('/usuarios', soloAdmin, (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || String(password || '').length < 8) return res.status(400).json({ error: 'Nombre, email y contraseña (mín. 8) son obligatorios' });
  try {
    db.prepare('INSERT INTO usuarios (nombre, email, pass_hash, rol) VALUES (?,?,?,?)').run(limpiar(nombre, 80), String(email).toLowerCase().trim(), hashPassword(password), rol === 'admin' ? 'admin' : 'operador');
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'Ese email ya existe' }); }
});
A.patch('/usuarios/:id', soloAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No podés desactivarte a vos mismo' });
  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(req.body?.activo ? 1 : 0, Number(req.params.id));
  if (!req.body?.activo) db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- exportar ----------
A.get('/export.csv', (req, res) => {
  const rows = db.prepare(`${CASO_LISTA_SQL} ORDER BY c.id`).all();
  const cols = ['codigo', 'created_at', 'estado', 'prioridad', 'apellido', 'nombre', 'dni', 'telefono', 'aseguradora', 'fecha_accidente', 'localidad_acc', 'provincia_acc', 'hubo_lesiones', 'canal', 'responsable', 'monto_acordado', 'honorarios_aseguradora', 'honorarios_cliente', 'fecha_cobro', 'n_docs'];
  const esc = v => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + cols.join(';') + '\n' + rows.map(r => cols.map(c => esc(c === 'estado' ? D.ESTADO[r[c]]?.label : r[c])).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="casos-saat-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.use('/api/admin', A);

// ---------- estáticos ----------
// Las fuentes no cambian: se guardan 30 días. El resto, 1 hora (CSS y JS se versionan con ?v= en los HTML).
app.use('/fonts', express.static(path.join(__dirname, '..', 'public', 'fonts'), { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'panel', 'index.html')));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

// Limpieza de archivos temporales y sesiones vencidas
setInterval(() => {
  db.prepare("DELETE FROM sesiones WHERE expira < datetime('now')").run();
  const tmp = path.join(DATA_DIR, 'uploads', 'tmp');
  if (fs.existsSync(tmp)) for (const f of fs.readdirSync(tmp)) {
    const p = path.join(tmp, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.unlinkSync(p);
  }
}, 3600_000).unref();

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(PORT, () => console.log(`SAAT plataforma en http://localhost:${PORT}`));
module.exports = app;

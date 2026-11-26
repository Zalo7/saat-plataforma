// Base de datos SQLite (incluida en Node 22, sin dependencias nativas)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'convenios'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'saat.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'operador',
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aseguradoras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'activa', -- activa | observada | excluida
  nota TEXT
);
CREATE TABLE IF NOT EXISTS casos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  estado TEXT NOT NULL DEFAULT 'nuevo',
  prioridad TEXT NOT NULL DEFAULT 'normal',
  responsable TEXT,
  canal TEXT, utm_source TEXT, utm_campaign TEXT, referido_por TEXT,
  -- cliente
  nombre TEXT, apellido TEXT, dni TEXT, cuil TEXT, fecha_nac TEXT,
  telefono TEXT, email TEXT, domicilio TEXT, localidad TEXT, provincia TEXT,
  ocupacion TEXT, ingresos_registrados TEXT,
  -- accidente
  fecha_accidente TEXT, hora_accidente TEXT, lugar TEXT, localidad_acc TEXT, provincia_acc TEXT,
  rol TEXT, vehiculo_cliente TEXT, patente_cliente TEXT, tipo_siniestro TEXT,
  descripcion TEXT, culpa TEXT, hubo_lesiones INTEGER, lesiones_desc TEXT, atencion_medica TEXT,
  denuncia_policial TEXT, dano_material INTEGER, dano_desc TEXT,
  -- tercero
  tercero_tiene_seguro TEXT, aseguradora_id INTEGER REFERENCES aseguradoras(id),
  aseguradora_texto TEXT, tercero_nombre TEXT, tercero_patente TEXT, tercero_vehiculo TEXT, tercero_poliza TEXT,
  nro_siniestro TEXT,
  -- evaluación automática
  score INTEGER, flags TEXT,
  -- firma del convenio
  pct_cuota_litis REAL, firma_archivo TEXT, firmado_at TEXT, firma_ip TEXT, firma_ua TEXT,
  convenio_archivo TEXT, convenio_hash TEXT,
  -- económico
  monto_reclamado REAL, monto_acordado REAL, honorarios_aseguradora REAL, honorarios_cliente REAL,
  fecha_reclamo TEXT, fecha_acuerdo TEXT, fecha_cobro TEXT, motivo_cierre TEXT
);
CREATE INDEX IF NOT EXISTS idx_casos_estado ON casos(estado);
CREATE INDEX IF NOT EXISTS idx_casos_dni ON casos(dni);
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nombre_original TEXT, archivo TEXT NOT NULL, mime TEXT, size INTEGER,
  subido_por TEXT NOT NULL DEFAULT 'cliente',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- estado | nota | documento | sistema
  texto TEXT NOT NULL,
  visible_cliente INTEGER NOT NULL DEFAULT 0,
  usuario TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  autor TEXT NOT NULL, -- cliente | estudio
  usuario TEXT,
  texto TEXT NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  categoria TEXT NOT NULL,
  concepto TEXT NOT NULL,
  detalle TEXT,
  monto REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
`);

// Configuración por defecto (editable desde el panel)
const DEFAULT_CONFIG = {
  estudio_nombre: 'SAAT — Servicio de Asistencia en Accidentes de Tránsito',
  abogado_nombre: 'Dr. Gerardo Martín Stancheff',
  abogado_matricula: 'Mat. 5851 S.T.J.Ch.',
  abogado_cuit: '',
  domicilio: 'Monteagudo 368, Resistencia, Chaco',
  email: 'saatasistencia@gmail.com',
  whatsapp: '5493625300011',
  pct_cuota_litis: '20',
  honorario_estimado: '800000',
  prescripcion_anios: '3',
  marca_registro: 'Marca registrada INPI Nº 3.950.470 — Clase 45',
  jurisdiccion: 'Tribunales Ordinarios de la ciudad de Resistencia, Provincia del Chaco',
};
const insCfg = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_CONFIG)) insCfg.run(k, v);

const ASEGURADORAS = [
  'Allianz', 'Caja Seguros', 'Federación Patronal', 'Galicia Seguros', 'HDI Seguros',
  'Integrity Seguros', 'La Equitativa del Plata', 'La Holando Sudamericana', 'La Mercantil Andina',
  'La Segunda', 'Libra Seguros', 'Mapfre', 'Meridional Seguros', 'Nación Seguros',
  'Norte Seguros', 'Orbis Seguros', 'Paraná Seguros', 'Provincia Seguros', 'Río Uruguay Seguros (RUS)',
  'Rivadavia Seguros', 'San Cristóbal', 'Sancor Seguros', 'Triunfo Seguros', 'Victoria Seguros', 'Zurich',
];
const insAs = db.prepare('INSERT OR IGNORE INTO aseguradoras (nombre) VALUES (?)');
for (const a of ASEGURADORAS) insAs.run(a);

function getConfig() {
  const rows = db.prepare('SELECT clave, valor FROM config').all();
  return Object.fromEntries(rows.map(r => [r.clave, r.valor]));
}

function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function checkPassword(pass, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pass, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

// Primer usuario administrador
const nUsers = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
if (nUsers === 0) {
  const email = process.env.ADMIN_EMAIL || 'drstancheff@yahoo.com.ar';
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO usuarios (nombre, email, pass_hash, rol) VALUES (?,?,?,?)')
    .run('Dr. Gerardo Martín Stancheff', email.toLowerCase(), hashPassword(pass), 'admin');
  const msg = `Usuario administrador inicial del panel SAAT\n\nEmail: ${email}\nContraseña: ${pass}\n\nCambiala desde el panel (Configuración > Mi contraseña) y borrá este archivo.\n`;
  fs.writeFileSync(path.join(DATA_DIR, 'CREDENCIALES-INICIALES.txt'), msg);
  console.log('\n' + msg);
}

module.exports = { db, DATA_DIR, getConfig, hashPassword, checkPassword };

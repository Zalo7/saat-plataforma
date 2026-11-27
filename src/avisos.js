// Avisos por email al estudio (reclamo nuevo, mensaje de un cliente).
//
// Se envían con Resend (https://resend.com) por HTTPS, porque Railway bloquea el envío por SMTP
// en los planes Hobby/Trial. Variables de entorno:
//   RESEND_API_KEY  clave de la cuenta de Resend (sin ella no se envía nada; sólo queda en el log)
//   AVISO_EMAIL     a quién llegan los avisos (por defecto: el "Email de contacto" del panel)
//   AVISO_DESDE     remitente (por defecto el de prueba de Resend, que sólo puede enviar al
//                   email con el que se creó la cuenta de Resend; con el dominio verificado
//                   usar, por ejemplo, "SAAT <avisos@saat.com.ar>")
// Un aviso que falla nunca frena el reclamo: se registra en el log y listo.
const { getConfig } = require('./db');

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

async function enviar(asunto, filas, link) {
  const clave = process.env.RESEND_API_KEY;
  const para = process.env.AVISO_EMAIL || getConfig().email;
  if (!clave || !para) { console.log(`[aviso sin enviar: falta RESEND_API_KEY] ${asunto}`); return; }
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#143A61;max-width:520px">
<h2 style="margin:0 0 12px">${esc(asunto)}</h2>
<table style="border-collapse:collapse">${filas.filter(f => f[1]).map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5b6b7f">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p style="margin:20px 0"><a href="${esc(link)}" style="background:#1F6FD6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Abrir en el panel</a></p>
<p style="color:#8a97a8;font-size:12px">Aviso automático de la plataforma SAAT.</p></div>`;
  const texto = `${asunto}\n\n${filas.filter(f => f[1]).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nAbrir en el panel: ${link}`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.AVISO_DESDE || 'SAAT <onboarding@resend.dev>', to: para.split(',').map(s => s.trim()), subject: asunto, html, text: texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error(`[aviso] Resend respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    else console.log(`[aviso enviado a ${para}] ${asunto}`);
  } catch (e) { console.error('[aviso] no se pudo enviar:', e.message); }
}

const PRIORIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja' };

function reclamoNuevo(caso, base) {
  const fecha = caso.fecha_accidente ? caso.fecha_accidente.split('-').reverse().join('/') : '';
  return enviar(`Nuevo reclamo ${caso.codigo}: ${caso.nombre} ${caso.apellido}`, [
    ['Código', caso.codigo],
    ['Nombre', `${caso.nombre} ${caso.apellido}`],
    ['Teléfono', caso.telefono],
    ['Accidente', [fecha, caso.localidad_acc].filter(Boolean).join(' · ')],
    ['Lesiones', caso.hubo_lesiones ? 'Sí' : 'No'],
    ['Prioridad', PRIORIDAD[caso.prioridad] || caso.prioridad],
  ], `${base}/panel#caso/${caso.id}`);
}

function mensajeCliente(caso, texto, base) {
  return enviar(`Mensaje de ${caso.nombre} ${caso.apellido} (${caso.codigo})`, [
    ['Código', caso.codigo],
    ['Mensaje', texto.length > 400 ? texto.slice(0, 400) + '…' : texto],
  ], `${base}/panel#caso/${caso.id}`);
}

module.exports = { reclamoNuevo, mensajeCliente };

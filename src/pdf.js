// Genera el PDF del convenio firmado electrónicamente
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { convenioTexto } = require('../public/js/convenio-texto');

const LOGO = path.join(__dirname, '..', 'public', 'img', 'logo-saat.png');
const NAVY = '#143A61';

function generarConvenioPDF(caso, cfg, firmaPath, destino) {
  return new Promise((resolve, reject) => {
    const t = convenioTexto(caso, cfg);
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 60, left: 60, right: 60 },
      info: { Title: `Convenio SAAT ${caso.codigo}`, Author: cfg.abogado_nombre } });
    const out = fs.createWriteStream(destino);
    doc.pipe(out);

    if (fs.existsSync(LOGO)) doc.image(LOGO, 60, 40, { width: 110 });
    doc.fontSize(8).fillColor('#555').text(`Caso ${caso.codigo}`, 380, 50, { width: 155, align: 'right' });
    doc.x = 60; doc.y = 115;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5).text(t.titulo, { align: 'center' });
    doc.moveDown(1);
    doc.fillColor('#111').font('Helvetica').fontSize(9.8).text(t.partes, { align: 'justify', lineGap: 2 });
    for (const [tit, txt] of t.clausulas) {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fillColor(NAVY).text(tit + '. ', { continued: true })
        .font('Helvetica').fillColor('#111').text(txt, { align: 'justify', lineGap: 2 });
    }

    if (doc.y > 600) doc.addPage();
    doc.moveDown(1.5);
    const y0 = doc.y;
    if (firmaPath && fs.existsSync(firmaPath)) doc.image(firmaPath, 60, y0, { fit: [200, 80] });
    doc.moveTo(60, y0 + 85).lineTo(260, y0 + 85).strokeColor('#999').stroke();
    doc.fontSize(9).fillColor('#111').text(`${caso.nombre} ${caso.apellido}`, 60, y0 + 90, { width: 200 });
    doc.text(`DNI ${caso.dni}`, 60, doc.y, { width: 200 });
    doc.text('EL CLIENTE', 60, doc.y, { width: 200 });

    doc.moveTo(330, y0 + 85).lineTo(530, y0 + 85).stroke();
    doc.text(cfg.abogado_nombre, 330, y0 + 90, { width: 200 });
    doc.text(cfg.abogado_matricula, 330, doc.y, { width: 200 });
    doc.text('EL ABOGADO', 330, doc.y, { width: 200 });

    // Constancia de firma electrónica
    doc.x = 60; doc.y = Math.max(doc.y, y0 + 140) + 10;
    const datos = JSON.stringify({ codigo: caso.codigo, dni: caso.dni, firmado_at: caso.firmado_at, ip: caso.firma_ip, pct: cfg.pct_cuota_litis, clausulas: t.clausulas });
    const hash = crypto.createHash('sha256').update(datos).digest('hex');
    doc.rect(60, doc.y, 475, 62).fillAndStroke('#F3F6FA', '#D5DEE9');
    doc.fillColor('#333').fontSize(7.5).text(
      `CONSTANCIA DE FIRMA ELECTRÓNICA — Firmado en la plataforma SAAT el ${new Date(caso.firmado_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' })} (hora Argentina). ` +
      `IP: ${caso.firma_ip || '-'}. Dispositivo: ${(caso.firma_ua || '-').slice(0, 110)}. ` +
      `Huella SHA-256 del contenido: ${hash}`, 68, doc.y + 8, { width: 460, lineGap: 1.5 });

    doc.end();
    out.on('finish', () => resolve(hash));
    out.on('error', reject);
  });
}

module.exports = { generarConvenioPDF };

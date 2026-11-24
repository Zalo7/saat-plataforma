// QA de la plataforma SAAT con Playwright, contra la DEMO (datos ficticios).
//
// Uso:
//   1) en una terminal:  npm run demo
//   2) en otra:          npm run qa
// La primera vez hace falta el navegador:  npx playwright install chromium
// Otra URL:  QA_URL=https://saat.com.ar npm run qa   (en producción NO envía reclamos: usá QA_SIN_ALTA=1)
//
// Deja capturas en tests/capturas/ (390 y 1440 px) y termina con código 1 si algo falla.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.QA_URL || 'http://localhost:3001').replace(/\/$/, '');
const SIN_ALTA = !!process.env.QA_SIN_ALTA || !/localhost|127\.0\.0\.1/.test(BASE);
const CAP = path.join(__dirname, 'capturas');
fs.mkdirSync(CAP, { recursive: true });
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// PNG de 1×1 para "subir" documentos de prueba
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const archivo = n => ({ name: n + '.png', mimeType: 'image/png', buffer: PNG });

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const titulo = t => console.log('\n' + t);
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ESCRITORIO = { viewport: { width: 1440, height: 900 } };

async function nueva(b, opts = MOVIL) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  p.errores = []; p.on('pageerror', e => p.errores.push(e.message));
  return p;
}
const sinScrollSuave = p => p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
async function recorrer(p) { // baja por toda la página para disparar animaciones y carga diferida
  await p.evaluate(async () => { document.documentElement.style.scrollBehavior = 'auto'; for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } scrollTo(0, 0); });
  await p.waitForTimeout(2600);
}
async function axe(p, nombre) {
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => v.id + '(' + v.nodes.length + ') ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')));
  ok(!v.length, nombre + ': accesibilidad AA sin fallas' + (v.length ? ' → ' + v.join(' | ') : ''));
}
async function captura(p, nombre) { await p.screenshot({ path: path.join(CAP, nombre + '.png'), fullPage: true, animations: 'disabled' }); }
async function tactiles(p, nombre) {
  const chicos = await p.evaluate(() => [...document.querySelectorAll('a,button,summary,[role=tab]')].filter(e => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width && r.height && s.visibility !== 'hidden' && !e.closest('[aria-hidden=true],.mini-pie,.login-ayuda,.conv,.chk,footer p,.legal') && r.height < 44;
  }).map(e => `"${e.textContent.trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().height)}px`));
  ok(!chicos.length, nombre + ': áreas táctiles de 44 px o más' + (chicos.length ? ' → ' + chicos.join(', ') : ''));
}

(async () => {
  const b = await chromium.launch();
  console.log('QA SAAT →', BASE, SIN_ALTA ? '(sin alta de reclamos)' : '');

  // ---------------------------------------------------------------- landing en celular
  titulo('Landing · celular');
  let p = await nueva(b);
  await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
  ok(await p.evaluate(() => window.__cls) < 0.05, 'no se mueve al cargar (CLS ' + (await p.evaluate(() => window.__cls)).toFixed(3) + ')');
  ok((await p.locator('h1').textContent()).includes('sin pagar nada por adelantado'), 'título con el claim aprobado');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal');
  ok(await p.locator('.barra-mobile').isVisible(), 'barra fija de abajo visible');
  await p.locator('.menu-btn').click();
  ok(await p.locator('#menu .seguir').isVisible(), 'menú: abre y muestra "Seguí tu caso"');
  await p.keyboard.press('Escape');
  ok(!(await p.locator('#menu').isVisible()), 'menú: Escape lo cierra');
  ok(await p.locator('.movil.anima').count() === 1, 'celular del hero animado');
  await tactiles(p, 'landing celular');
  await recorrer(p);
  ok(!(await p.locator('#testimonios').isVisible()), 'testimonios ocultos (sin testimonios reales)');
  await p.locator('.faq-btn').click();
  ok(await p.getByText('¿Mis datos están protegidos?').isVisible(), 'preguntas: "Ver más" muestra todas');
  await axe(p, 'landing celular');
  await captura(p, 'landing-390');
  ok(!p.errores.length, 'sin errores de JS ' + p.errores.join(' | '));
  await p.context().close();

  titulo('Landing · sin JS y sin la API de configuración');
  p = await (await b.newContext({ ...MOVIL, javaScriptEnabled: false })).newPage();
  await p.goto(BASE + '/');
  ok(await p.locator('.band .check').isVisible() && await p.locator('#menu .seguir').isVisible(), 'sin JS: se leen los requisitos y el menú');
  ok(await p.getByText('¿Mis datos están protegidos?').isVisible(), 'sin JS: todas las preguntas visibles');
  await p.context().close();
  p = await nueva(b); await p.route('**/api/public/config', r => r.abort());
  await p.goto(BASE + '/');
  const was = await p.$$eval('.wa-link', a => a.map(x => x.href));
  ok(was.length >= 3 && was.every(h => h.startsWith('https://wa.me/')), `WhatsApp funciona aunque falle la API (${was.length} links)`);
  await p.context().close();

  // ---------------------------------------------------------------- landing en escritorio
  titulo('Landing · escritorio');
  p = await nueva(b, ESCRITORIO);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
  ok(!(await p.locator('.menu-btn').isVisible()) && await p.locator('#menu').isVisible(), 'menú en línea');
  await sinScrollSuave(p); await p.locator('#como').scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  await p.locator('#pasos li').nth(2).click(); await p.waitForTimeout(500);
  ok(await p.locator('.demo-pant[data-p="2"].on').count() === 1, '"Cómo funciona": tocar un paso muestra su pantalla');
  await recorrer(p);
  await axe(p, 'landing escritorio');
  await captura(p, 'landing-1440');
  ok(!p.errores.length, 'sin errores de JS ' + p.errores.join(' | '));
  await p.context().close();

  // ---------------------------------------------------------------- simulador
  titulo('Simulador "¿Mi caso califica?"');
  p = await nueva(b);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.clear()); await sinScrollSuave(p);
  const elegir = async t => { await p.locator('#sim .choice', { hasText: t }).first().click(); await p.waitForTimeout(350); };
  await p.locator('#requisitos').scrollIntoViewIfNeeded();
  for (const t of ['No tiene', 'Sí', 'El otro', 'Sí']) await elegir(t);
  ok((await p.locator('.sim-res h3').textContent()).includes('no califica'), 'sin seguro → no califica');
  await p.locator('.sim-res .sim-atras').click();
  for (const t of ['No sé', 'Sí', 'Los dos', 'Sí']) await elegir(t);
  ok((await p.locator('.sim-res h3').textContent()).includes('puede calificar'), '"No sé" + culpa compartida → puede calificar');
  await p.locator('.sim-res .btn-primary').click(); await p.waitForURL('**/reclamar.html'); await p.waitForTimeout(600);
  const pre = await p.evaluate(() => [document.querySelector('input[name=tercero_tiene_seguro]:checked')?.value, document.querySelector('input[name=culpa]:checked')?.value]);
  ok(pre[0] === 'no_se' && pre[1] === 'compartida', 'el formulario abre con las respuestas cargadas');
  await p.context().close();

  // ---------------------------------------------------------------- medición
  titulo('Medición (tracking.js)');
  p = await nueva(b, ESCRITORIO); const externos = [];
  p.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:')) externos.push(new URL(u).host); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const ids = await p.evaluate(() => fetch('/js/tracking.js').then(r => r.text()).then(t => /metaPixelId: '([^']*)'|tiktokPixelId: '([^']*)'|ga4Id: '([^']*)'/g.test(t) && [...t.matchAll(/(metaPixelId|tiktokPixelId|ga4Id): '([^']*)'/g)].filter(m => m[2]).map(m => m[1])));
  if (!ids.length) ok(!externos.length, 'IDs vacíos: ningún pedido a Meta, TikTok ni Google');
  else console.log('  · IDs cargados:', ids.join(', '), '→ pedidos externos:', [...new Set(externos)].join(', '));
  await p.context().close();
  p = await nueva(b, ESCRITORIO); const ev = [];
  p.on('console', m => { if (m.text().startsWith('[SAAT tracking]')) ev.push(m.text().split(' ')[2]); });
  await p.route('https://wa.me/**', r => r.abort());
  await p.goto(BASE + '/?debug_tracking', { waitUntil: 'networkidle' });
  await p.locator('.hx .wa-link').click(); await p.locator('.hx .btn-primary').click(); await p.waitForURL('**/reclamar.html');
  await p.locator('label.choice:has(input[name=culpa][value=tercero]) span').click(); await p.waitForTimeout(200);
  ok(['whatsapp_click', 'cta_click', 'form_start'].every(e => ev.includes(e)), 'eventos: ' + ev.join(', '));
  await p.context().close();

  // ---------------------------------------------------------------- reclamo de punta a punta
  let codigo = null;
  if (!SIN_ALTA) {
    titulo('Reclamo completo (celular, datos ficticios)');
    p = await nueva(b); const ev2 = [];
    p.on('console', m => { if (m.text().startsWith('[SAAT tracking]')) ev2.push(m.text()); });
    await p.goto(BASE + '/reclamar.html?debug_tracking', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle' });
    await p.locator('[data-next]:visible').click();
    ok(await p.locator('.err:visible').count() > 0, 'marca los datos que faltan');
    await p.fill('#fecha_accidente', new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10));
    await p.locator('label.choice:has(input[name=tercero_tiene_seguro][value=no]) span').click();
    await p.locator('label.choice:has(input[name=culpa][value=tercero]) span').click();
    await p.locator('[data-next]:visible').click(); await p.waitForTimeout(600);
    ok(await p.locator('#bloqueo').isVisible(), 'bloquea si el otro vehículo no tiene seguro');
    await p.locator('label.choice:has(input[name=tercero_tiene_seguro][value=si]) span').click();
    await p.selectOption('#aseguradora_id', { index: 2 });
    await p.locator('[data-next]:visible').click(); await p.waitForTimeout(600);
    const nav = await p.locator('.step:not(.hide) .nav').boundingBox();
    ok(nav && nav.y + nav.height <= 845, 'botones Atrás/Siguiente fijos abajo');
    await p.fill('#nombre', 'Prueba'); await p.fill('#apellido', 'QA'); await p.fill('#dni', '30111222'); await p.fill('#telefono', '3624000000');
    await p.locator('[data-next]:visible').click();
    await p.fill('#localidad_acc', 'Resistencia'); await p.fill('#lugar', 'Av. Sarmiento y Belgrano');
    await p.locator('label.choice:has(input[name=rol][value=peaton]) span').click();
    await p.fill('#descripcion', 'Caso ficticio de la prueba automática (QA).');
    await p.locator('label.choice:has(input[name=hubo_lesiones][value="0"]) span').click();
    await p.locator('label.choice:has(input[name=dano_material][value="0"]) span').click();
    await p.locator('[data-next]:visible').click();
    await p.fill('#tercero_patente', 'AA000AA'); await p.locator('[data-next]:visible').click();
    ok(await p.evaluate(() => !!localStorage.getItem('saat_borrador')), 'guarda el borrador en el celular');
    await p.locator('.doc[data-tipo=dni_frente] input').setInputFiles(archivo('dni-frente'));
    await p.locator('.doc[data-tipo=dni_dorso] input').setInputFiles(archivo('dni-dorso'));
    await p.waitForTimeout(300);
    await p.locator('[data-next]:visible').click(); await p.waitForTimeout(300);
    ok((await p.locator('#conv').textContent()).length > 500, 'muestra el convenio');
    await p.check('#acepta_convenio'); await p.check('#acepta_datos'); await p.check('#declara');
    const cv = await p.locator('#sig').boundingBox();
    await p.mouse.move(cv.x + 30, cv.y + 100); await p.mouse.down();
    for (let i = 0; i < 30; i++) await p.mouse.move(cv.x + 30 + i * 9, cv.y + 100 + Math.sin(i / 3) * 40);
    await p.mouse.up();
    await p.click('#enviar'); await p.waitForSelector('.done:not(.hide)', { timeout: 20000 });
    codigo = (await p.locator('#codigo').textContent()).trim();
    ok(/^SAAT-\d{4}-\d+$/.test(codigo), 'reclamo enviado: ' + codigo);
    ok(ev2.some(e => e.includes('form_submit')), 'evento form_submit');
    await captura(p, 'reclamar-fin-390');
    const pdf = await p.request.get(await p.locator('#dl-conv').evaluate(a => a.href));
    ok(pdf.ok() && (await pdf.body()).slice(0, 4).toString() === '%PDF', 'convenio en PDF');
    await p.click('#ir-seg'); await p.waitForSelector('#vista:not(.hide)', { timeout: 10000 });
    ok((await p.locator('#v-hola').textContent()).includes('Prueba'), 'seguimiento abre el caso');
    ok(await p.locator('#v-linea div:nth-child(3)').evaluate(e => getComputedStyle(e).fontSize !== '0px'), 'seguimiento: se leen todas las etapas');
    await p.fill('#msg-t', 'Mensaje de prueba (QA)'); await p.click('.msg-form button'); await p.waitForTimeout(800);
    ok((await p.locator('#chat').textContent()).includes('Mensaje de prueba'), 'seguimiento: envía un mensaje');
    await p.locator('#up-f').setInputFiles(archivo('foto')); await p.waitForTimeout(1200);
    ok((await p.locator('#up-msg').textContent()).includes('recibimos'), 'seguimiento: sube un documento');
    await captura(p, 'seguimiento-caso-390');
    await p.click('#salir'); await p.waitForSelector('#login:not(.hide)');
    await p.fill('#codigo', codigo); await p.fill('#dni', '30111222'); await p.click('#login button');
    await p.waitForSelector('#vista:not(.hide)'); ok(true, 'seguimiento: entra con código + DNI');
    ok(!p.errores.length, 'sin errores de JS ' + p.errores.join(' | '));
    await p.context().close();
  }

  // ---------------------------------------------------------------- formulario y seguimiento: diseño y accesibilidad
  titulo('Formulario, seguimiento, 404 y privacidad (390 y 1440 px)');
  for (const [nombre, opts] of [['390', MOVIL], ['1440', ESCRITORIO]]) {
    p = await nueva(b, opts);
    for (const [pag, url] of [['reclamar', '/reclamar.html'], ['seguimiento', '/seguimiento.html'], ['404', '/no-existe'], ['privacidad', '/privacidad.html']]) {
      const r = await p.goto(BASE + url, { waitUntil: 'networkidle' });
      if (pag === '404') ok(r.status() === 404, '404: responde con código 404');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${pag} ${nombre}: sin scroll horizontal`);
      if (pag !== 'privacidad') await axe(p, `${pag} ${nombre}`); // privacidad es texto legal: no se toca
      if (nombre === '390' && pag !== 'privacidad') await tactiles(p, pag);
      await captura(p, `${pag}-${nombre}`);
    }
    ok(!p.errores.length, `sin errores de JS (${nombre}) ` + p.errores.join(' | '));
    await p.context().close();
  }

  // ---------------------------------------------------------------- panel
  if (!SIN_ALTA) {
    titulo('Panel del estudio');
    p = await nueva(b, ESCRITORIO);
    await p.goto(BASE + '/panel', { waitUntil: 'networkidle' });
    await p.fill('#l-email', 'drstancheff@yahoo.com.ar'); await p.fill('#l-pass', 'demo12345'); await p.press('#l-pass', 'Enter');
    await p.waitForTimeout(1500);
    ok(await p.getByText('Tablero').first().isVisible(), 'panel: login y tablero');
    if (codigo) {
      const lista = await p.evaluate(c => fetch('/api/admin/casos?q=' + encodeURIComponent(c)).then(r => r.json()), codigo);
      ok(Array.isArray(lista) && lista.some(x => x.codigo === codigo), 'panel: el reclamo de la prueba aparece en la lista');
    }
    await captura(p, 'panel-1440');
    ok(!p.errores.length, 'panel: sin errores de JS ' + p.errores.join(' | '));
    await p.context().close();
  }

  // ---------------------------------------------------------------- servidor
  titulo('Servidor');
  p = await nueva(b, ESCRITORIO);
  for (const u of ['/', '/css/saat.css', '/js/landing.js']) {
    const r = await p.request.get(BASE + u, { headers: { 'Accept-Encoding': 'gzip' } });
    ok(/gzip|br/.test(r.headers()['content-encoding'] || ''), u + ' viaja comprimido');
  }
  const html = await (await p.request.get(BASE + '/')).text();
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let ldOk = false; try { ldOk = JSON.parse(ld[1])['@graph'].some(x => x['@type'] === 'LegalService'); } catch (e) {}
  ok(ldOk, 'datos para Google (JSON-LD LegalService) válidos');
  ok((await p.request.get(BASE + '/img/og-saat.jpg')).ok(), 'imagen para compartir (og:image)');
  const vs = [...new Set([...html.matchAll(/\?v=(\w+)/g)].map(m => m[1]))];
  ok(vs.length === 1, 'versión única de CSS/JS en la landing (?v=' + vs.join(',') + ')');
  await p.context().close();

  await b.close();
  console.log('\n' + (fallas ? `✘ ${fallas} prueba(s) fallaron.` : '✔ Todo OK.') + ' Capturas en tests/capturas/');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

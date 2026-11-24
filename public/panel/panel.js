// Panel de control SAAT
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ars = n => (n === null || n === undefined || isNaN(n)) ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR');
const arsK = n => { if (n === null || n === undefined) return '—'; const a = Math.abs(n); return (n < 0 ? '-' : '') + '$ ' + (a >= 1e6 ? (a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M' : a >= 1e3 ? Math.round(a / 1e3).toLocaleString('es-AR') + ' mil' : Math.round(a)); };
const pct = n => n === null || n === undefined ? '—' : Math.round(n * 100) + '%';
const utc = s => new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : ''));
const fch = s => s ? utc(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const fchh = s => s ? utc(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const fd = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const MES = m => { const [y, mm] = m.split('-'); return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+mm - 1] + ' ' + y.slice(2); };
const C_ING = '#2F80ED', C_GAS = '#C8692B';
let META = null, ME = null, charts = [];

async function api(url, opt = {}) {
  const o = { ...opt, headers: { ...(opt.body && !(opt.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } };
  if (o.body && !(o.body instanceof FormData) && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch(url, o);
  if (r.status === 401) { mostrarLogin(); throw new Error('no auth'); }
  const j = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) { toast(j?.error || 'Error'); throw new Error(j?.error); }
  return j;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.remove('hide'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.add('hide'), 2600); }
const pillE = id => `<span class="pill e-${id}">${esc(META.estados.find(e => e.id === id)?.label || id)}</span>`;
const pillP = p => p && p !== 'normal' ? `<span class="pill p-${p}">${p[0].toUpperCase() + p.slice(1)}</span>` : '';

// ---------- login ----------
function mostrarLogin() { $('#app').classList.add('hide'); $('#login').classList.remove('hide'); }
$('#login-f').onsubmit = async e => {
  e.preventDefault();
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#l-email').value, password: $('#l-pass').value }) });
  const j = await r.json();
  if (!r.ok) { $('#l-err').textContent = j.error; $('#l-err').classList.remove('hide'); return; }
  iniciar();
};
$('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); };

async function iniciar() {
  try { ME = await api('/api/auth/me'); } catch { return; }
  META = await api('/api/admin/meta');
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  $('#me').textContent = ME.nombre;
  badge(META.no_leidos);
  window.onhashchange = ruta; ruta();
  setInterval(async () => { try { const m = await api('/api/admin/meta'); META = m; badge(m.no_leidos); } catch {} }, 30000);
}
function badge(n) { const b = $('#b-msg'); b.textContent = n; b.classList.toggle('hide', !n); }

function ruta() {
  charts.forEach(c => c.destroy()); charts = [];
  const [v, arg] = (location.hash.slice(1) || 'tablero').split('/');
  $$('#menu a').forEach(a => a.classList.toggle('on', a.dataset.v === v || (v === 'caso' && a.dataset.v === 'casos')));
  const main = $('#main'); main.innerHTML = '<div class="empty">Cargando…</div>';
  ({ tablero: vTablero, casos: vCasos, caso: () => vCaso(arg), mensajes: vMensajes, finanzas: vFinanzas, aseguradoras: vAseguradoras, config: vConfig }[v] || vTablero)(main);
  window.scrollTo(0, 0);
}

// ---------- gráficos ----------
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#5B6B7F';
function chart(canvas, cfg) {
  const base = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0B2340', padding: 10, cornerRadius: 8, titleFont: { weight: '600' } } },
    scales: { x: { grid: { display: false }, border: { color: '#E2E8F0' } }, y: { beginAtZero: true, grid: { color: '#EEF2F7' }, border: { display: false } } },
  };
  const c = new Chart(canvas, { ...cfg, options: Object.assign(base, cfg.options || {}) });
  charts.push(c); return c;
}
const barDs = (data, color, label) => ({ label, data, backgroundColor: color, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 28, borderColor: '#fff', borderWidth: { left: 1, right: 1 } });

// ---------- TABLERO ----------
async function vTablero(main) {
  const m = await api('/api/admin/metricas');
  const k = m.kpi;
  main.innerHTML = `
  <div class="ph"><div><h1>Tablero</h1><div class="muted">Salud del estudio en un vistazo</div></div>
    <div class="acts"><a class="btn btn-ghost btn-sm" href="#casos">Ver casos</a><button class="btn btn-dark btn-sm" id="nuevo">+ Cargar caso</button></div></div>
  <div class="kpis">
    <div class="card kpi"><div class="l">Casos en curso</div><div class="v">${k.abiertos}</div><div class="s">${k.nuevos_mes} nuevos este mes · ${k.total} en total</div></div>
    <div class="card kpi"><div class="l">Honorarios cobrados ${new Date().getFullYear()}</div><div class="v">${arsK(k.ingresos_anio)}</div><div class="s">Total histórico ${arsK(k.hon_cobrados)}</div></div>
    <div class="card kpi"><div class="l">Resultado del mes</div><div class="v ${k.resultado_mes >= 0 ? 'pos' : 'neg'}">${arsK(k.resultado_mes)}</div><div class="s">Ingresos ${arsK(k.ingresos_mes)} − gastos ${arsK(k.gastos_mes)}</div></div>
    <div class="card kpi"><div class="l">A cobrar estimado</div><div class="v">${arsK(k.pipeline)}</div><div class="s">Casos en curso × honorario promedio × tasa de éxito</div></div>
    <div class="card kpi"><div class="l">Tasa de éxito</div><div class="v">${pct(k.tasa_exito)}</div><div class="s">${k.cobrados} cobrados sobre casos cerrados</div></div>
    <div class="card kpi"><div class="l">Honorario promedio</div><div class="v">${arsK(k.hon_promedio)}</div><div class="s">${k.hon_promedio ? 'Por caso cobrado' : 'Sin cobros aún · estimado ' + arsK(k.hon_estimado)}</div></div>
    <div class="card kpi"><div class="l">Días hasta cobrar</div><div class="v">${k.dias_promedio_cobro ?? '—'}</div><div class="s">Promedio desde el ingreso</div></div>
    <div class="card kpi"><div class="l">Atención</div><div class="v ${k.urgentes + k.mensajes_sin_leer ? 'neg' : ''}">${k.urgentes + k.mensajes_sin_leer + k.docs_incompletos}</div><div class="s">${k.urgentes} urgentes · ${k.mensajes_sin_leer} mensajes · ${k.docs_incompletos} con docs faltantes</div></div>
  </div>
  <div class="g2">
    <div class="card panel"><h3>Casos nuevos por semana</h3><div class="sub">Últimas 12 semanas</div><div class="chartbox"><canvas id="c-sem"></canvas></div></div>
    <div class="card panel"><h3>Ingresos y gastos por mes</h3><div class="legend"><span><i style="background:${C_ING}"></i>Honorarios cobrados</span><span><i style="background:${C_GAS}"></i>Gastos</span></div><div class="chartbox" style="height:228px"><canvas id="c-mes"></canvas></div></div>
  </div>
  <div class="g3">
    <div class="card panel"><h3>Rendimiento por aseguradora</h3><div class="sub">Sirve para decidir qué compañías observar o excluir</div><div class="tablewrap" style="border:0">${tablaGrupo(m.por_aseguradora, 'Aseguradora', true)}</div></div>
    <div class="card panel"><h3>Embudo de casos</h3><div class="sub">Cantidad por estado</div><div class="chartbox" style="height:330px"><canvas id="c-est"></canvas></div></div>
  </div>
  <div class="g2">
    <div class="card panel"><h3>¿De dónde llegan los casos?</h3><div class="sub">Canal declarado por el cliente</div>${tablaGrupo(m.por_canal, 'Canal')}</div>
    <div class="card panel"><h3>¿Dónde ocurren?</h3><div class="sub">Localidad del accidente</div>${tablaGrupo(m.por_localidad.slice(0, 12), 'Localidad')}</div>
  </div>
  <div class="card panel"><h3>Resultado mensual</h3><div class="sub">Honorarios cobrados menos gastos cargados</div>
    <table class="t"><thead><tr><th>Mes</th><th class="n">Casos nuevos</th><th class="n">Cobrados</th><th class="n">Honorarios</th><th class="n">Gastos</th><th class="n">Resultado</th></tr></thead>
    <tbody>${m.meses.slice().reverse().map(x => `<tr><td>${MES(x.mes)}</td><td class="n">${x.casos}</td><td class="n">${x.cobrados}</td><td class="n">${ars(x.ingresos)}</td><td class="n">${ars(x.gastos)}</td><td class="n" style="color:${x.resultado < 0 ? 'var(--bad)' : 'var(--ok)'};font-weight:600">${ars(x.resultado)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#nuevo').onclick = modalNuevo;
  chart($('#c-sem'), { type: 'bar', data: { labels: m.semanas.map(s => fd(s.semana).slice(0, 5)), datasets: [barDs(m.semanas.map(s => s.casos), C_ING, 'Casos')] },
    options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEF2F7' }, border: { display: false } } } } });
  chart($('#c-mes'), { type: 'bar', data: { labels: m.meses.map(x => MES(x.mes)), datasets: [barDs(m.meses.map(x => x.ingresos), C_ING, 'Honorarios'), barDs(m.meses.map(x => x.gastos), C_GAS, 'Gastos')] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${ars(c.raw)}` } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => arsK(v) }, grid: { color: '#EEF2F7' }, border: { display: false } } } } });
  chart($('#c-est'), { type: 'bar', data: { labels: m.por_estado.map(e => e.label), datasets: [barDs(m.por_estado.map(e => e.n), C_ING, 'Casos')] },
    options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEF2F7' }, border: { display: false } }, y: { grid: { display: false } } } } });
  charts.at(-1).data.datasets[0].borderRadius = { topRight: 4, bottomRight: 4 }; charts.at(-1).data.datasets[0].borderSkipped = 'left'; charts.at(-1).update();
}
function tablaGrupo(rows, titulo, completa) {
  if (!rows.length) return '<div class="empty">Sin datos todavía</div>';
  return `<table class="t"><thead><tr><th>${titulo}</th><th class="n">Casos</th><th class="n">En curso</th><th class="n">Cobrados</th>${completa ? '<th class="n">Rechaz.</th><th class="n">Éxito</th><th class="n">Hon. prom.</th><th class="n">Días a cobro</th>' : '<th class="n">Honorarios</th>'}</tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.nombre)}</td><td class="n">${r.casos}</td><td class="n">${r.abiertos}</td><td class="n">${r.cobrados}</td>${completa ? `<td class="n">${r.rechazados}</td><td class="n">${pct(r.exito)}</td><td class="n">${arsK(r.hon_prom)}</td><td class="n">${r.dias_cobro ?? '—'}</td>` : `<td class="n">${arsK(r.honorarios)}</td>`}</tr>`).join('')}</tbody></table>`;
}

// ---------- CASOS ----------
let filtros = { estado: 'abiertos' };
async function vCasos(main) {
  main.innerHTML = `
  <div class="ph"><h1>Casos</h1><div class="acts"><a class="btn btn-ghost btn-sm" href="/api/admin/export.csv">Exportar a Excel (CSV)</a><button class="btn btn-dark btn-sm" id="nuevo">+ Cargar caso</button></div></div>
  <div class="filters">
    <input type="search" id="q" placeholder="Buscar por nombre, DNI, código, patente o teléfono">
    <select id="f-estado"><option value="abiertos">En curso</option><option value="">Todos</option>${META.estados.map(e => `<option value="${e.id}">${e.label}</option>`).join('')}</select>
    <select id="f-aseg"><option value="">Todas las aseguradoras</option>${META.aseguradoras.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select>
    <select id="f-prio"><option value="">Toda prioridad</option><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baja">Baja</option></select>
  </div>
  <div class="tablewrap" id="lista"></div>`;
  $('#nuevo').onclick = modalNuevo;
  $('#q').value = filtros.q || ''; $('#f-estado').value = filtros.estado ?? ''; $('#f-aseg').value = filtros.aseguradora || ''; $('#f-prio').value = filtros.prioridad || '';
  const cargar = async () => {
    filtros = { q: $('#q').value, estado: $('#f-estado').value, aseguradora: $('#f-aseg').value, prioridad: $('#f-prio').value };
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    const rows = await api('/api/admin/casos?' + qs);
    $('#lista').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Ingreso</th><th>Cliente</th><th>Aseguradora</th><th>Accidente</th><th>Estado</th><th></th><th class="n">Docs</th><th>Canal</th><th class="n">Honorarios</th></tr></thead><tbody>
      ${rows.map(c => `<tr class="click" data-id="${c.id}"><td>${fch(c.created_at)}</td>
        <td><b>${esc(c.apellido)}, ${esc(c.nombre)}</b>${c.no_leidos ? '<span class="dot" title="Mensaje sin leer"></span>' : ''}<br><small class="muted">${esc(c.codigo)} · DNI ${esc(c.dni || '—')}</small></td>
        <td>${esc(c.aseguradora || '—')}</td><td>${fd(c.fecha_accidente)}<br><small class="muted">${esc(c.localidad_acc || '')}${c.hubo_lesiones ? ' · con lesiones' : ''}</small></td>
        <td>${pillE(c.estado)}</td><td>${pillP(c.prioridad)}</td><td class="n">${c.n_docs}</td><td>${esc(c.canal || '—')}</td>
        <td class="n">${(c.honorarios_aseguradora || c.honorarios_cliente) ? ars((c.honorarios_aseguradora || 0) + (c.honorarios_cliente || 0)) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No hay casos con estos filtros.</div>';
    $$('#lista tr.click').forEach(tr => tr.onclick = () => location.hash = 'caso/' + tr.dataset.id);
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(cargar, 250); };
  ['#f-estado', '#f-aseg', '#f-prio'].forEach(s => $(s).onchange = cargar);
  cargar();
}

function modalNuevo() {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<form class="card modal"><h2 style="font-size:20px">Cargar caso manualmente</h2><p class="muted" style="margin-top:0">Para casos que entran por la oficina, por teléfono o derivados. Después completás el resto desde la ficha.</p>
  <div class="kv">
    <div class="field"><label>Nombre *</label><input name="nombre" required></div><div class="field"><label>Apellido *</label><input name="apellido" required></div>
    <div class="field"><label>DNI</label><input name="dni"></div><div class="field"><label>Teléfono</label><input name="telefono"></div>
    <div class="field"><label>Aseguradora del tercero</label><select name="aseguradora_id"><option value="">—</option>${META.aseguradoras.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select></div>
    <div class="field"><label>Fecha del accidente</label><input type="date" name="fecha_accidente"></div>
    <div class="field"><label>Localidad del accidente</label><input name="localidad_acc" value="Resistencia"></div>
    <div class="field"><label>Provincia</label><input name="provincia_acc" value="Chaco"></div>
    <div class="field"><label>Canal de ingreso</label><select name="canal"><option>Oficina</option><option>Secretaría</option><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>WhatsApp</option><option>Recomendación de un conocido</option><option>Fui cliente antes</option><option>Taller / clínica / derivación</option><option>Otro</option></select></div>
    <div class="field"><label>Cerrado por / responsable</label><input name="responsable" value="${esc(ME.nombre)}"></div>
    <div class="field"><label>Referido por</label><input name="referido_por"></div>
    <div class="field"><label>Fecha de ingreso</label><input type="date" name="fecha_ingreso" value="${new Date().toISOString().slice(0, 10)}"></div>
    <div class="field"><label>Estado inicial</label><select name="estado">${META.estados.map(e => `<option value="${e.id}">${e.label}</option>`).join('')}</select></div>
    <div class="field"><label>&nbsp;</label><label class="chk" style="font-weight:500"><input type="checkbox" name="hubo_lesiones" style="width:18px;height:18px"> Con lesiones</label></div>
  </div>
  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px"><button type="button" class="btn btn-ghost" id="cx">Cancelar</button><button class="btn btn-dark">Crear caso</button></div></form>`;
  document.body.appendChild(bg);
  $('#cx', bg).onclick = () => bg.remove();
  $('form', bg).onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); d.hubo_lesiones = !!d.hubo_lesiones;
    const r = await api('/api/admin/casos', { method: 'POST', body: d });
    bg.remove(); toast('Caso ' + r.codigo + ' creado'); location.hash = 'caso/' + r.id;
  };
}

// ---------- FICHA DEL CASO ----------
let tabCaso = 'resumen';
async function vCaso(id) {
  const main = $('#main');
  const r = await api('/api/admin/casos/' + id);
  const c = r.caso;
  const flags = JSON.parse(c.flags || '[]');
  const tel = String(c.telefono || '').replace(/\D/g, '');
  const telWa = tel ? (tel.startsWith('54') ? tel : '549' + tel.replace(/^0/, '').replace(/^(\d{2,4})15/, '$1')) : '';
  const linkSeg = location.origin + r.link_seguimiento;
  main.innerHTML = `
  <a href="#casos" class="muted" style="text-decoration:none;font-size:14px">← Casos</a>
  <div class="det-head">
    <div><div class="muted" style="font-weight:600;font-size:13px">${esc(c.codigo)} · ingresó ${fch(c.created_at)}${c.canal ? ' · ' + esc(c.canal) : ''}</div>
      <h1>${esc(c.apellido)}, ${esc(c.nombre)}</h1>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${pillE(c.estado)} ${pillP(c.prioridad)} ${c.score !== null ? `<span class="pill">Puntaje ${c.score}/100</span>` : ''} ${c.aseguradora_nombre || c.aseguradora_texto ? `<span class="pill">${esc(c.aseguradora_nombre || c.aseguradora_texto)}</span>` : ''}</div></div>
    <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
      ${telWa ? `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${telWa}?text=${encodeURIComponent(`Hola ${c.nombre}, te escribimos de SAAT por tu reclamo ${c.codigo}.`)}">WhatsApp al cliente</a>` : ''}
      ${c.convenio_archivo ? `<a class="btn btn-ghost btn-sm" href="/api/admin/casos/${c.id}/convenio">Convenio firmado (PDF)</a>` : ''}
      <button class="btn btn-ghost btn-sm" id="cp-link">Copiar link de seguimiento</button>
    </div>
  </div>
  <div class="det-grid">
    <div>
      <div class="tabs">${[['resumen', 'Datos del caso'], ['docs', `Documentos (${r.documentos.length})`], ['economico', 'Montos y honorarios'], ['mensajes', `Mensajes (${r.mensajes.length})`], ['historial', 'Historial y notas']].map(([k, l]) => `<button data-t="${k}" class="${tabCaso === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="card panel" id="tab"></div>
    </div>
    <div style="display:grid;gap:16px">
      <div class="card panel"><h3>Cambiar estado</h3>
        <div class="field" style="margin:10px 0"><select id="n-estado">${META.estados.map(e => `<option value="${e.id}" ${e.id === c.estado ? 'selected' : ''}>${e.label}</option>`).join('')}</select></div>
        <div class="field"><textarea id="n-msg" style="min-height:80px" placeholder="Mensaje que verá el cliente (opcional; si lo dejás vacío se usa el texto estándar)"></textarea></div>
        <button class="btn btn-dark btn-sm" id="b-estado" style="width:100%">Actualizar estado</button></div>
      ${flags.length ? `<div class="card panel"><h3>Alertas de la evaluación</h3><div class="flags" style="margin-top:10px">${flags.map(f => `<div class="flag ${f.nivel}">${esc(f.texto)}</div>`).join('')}</div></div>` : ''}
      ${r.pendientes.length ? `<div class="card panel"><h3>Documentación faltante</h3><ul style="margin:8px 0 0;padding-left:18px;font-size:13.5px">${r.pendientes.map(p => `<li>${esc(p.label)}</li>`).join('')}</ul></div>` : ''}
      <div class="card panel"><h3>Resumen económico</h3><table class="t" style="margin-top:6px"><tbody>
        <tr><td>Reclamado</td><td class="n">${ars(c.monto_reclamado)}</td></tr><tr><td>Acordado</td><td class="n">${ars(c.monto_acordado)}</td></tr>
        <tr><td>Hon. aseguradora</td><td class="n">${ars(c.honorarios_aseguradora)}</td></tr><tr><td>Hon. cliente (${c.pct_cuota_litis ?? '—'}%)</td><td class="n">${ars(c.honorarios_cliente)}</td></tr>
        <tr><td><b>Total honorarios</b></td><td class="n"><b>${ars((c.honorarios_aseguradora || 0) + (c.honorarios_cliente || 0))}</b></td></tr></tbody></table></div>
    </div>
  </div>`;
  $('#cp-link').onclick = () => { navigator.clipboard?.writeText(linkSeg); toast('Link copiado: el cliente entra con su DNI'); };
  $('#b-estado').onclick = async () => {
    await api(`/api/admin/casos/${c.id}/estado`, { method: 'POST', body: { estado: $('#n-estado').value, mensaje: $('#n-msg').value } });
    toast('Estado actualizado'); vCaso(id);
  };
  $$('.tabs button').forEach(b => b.onclick = () => { tabCaso = b.dataset.t; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); pintarTab(r, id); });
  pintarTab(r, id);
}

const CAMPOS = [
  ['Cliente', [['nombre', 'Nombre'], ['apellido', 'Apellido'], ['dni', 'DNI'], ['cuil', 'CUIL'], ['fecha_nac', 'Fecha de nacimiento', 'date'], ['telefono', 'Teléfono'], ['email', 'Email'], ['domicilio', 'Domicilio'], ['localidad', 'Localidad'], ['provincia', 'Provincia'], ['ocupacion', 'Ocupación'], ['ingresos_registrados', 'Ingresos']]],
  ['Accidente', [['fecha_accidente', 'Fecha', 'date'], ['hora_accidente', 'Hora', 'time'], ['lugar', 'Lugar'], ['localidad_acc', 'Localidad'], ['provincia_acc', 'Provincia'], ['rol', 'Rol del cliente'], ['vehiculo_cliente', 'Vehículo del cliente'], ['patente_cliente', 'Patente cliente'], ['tipo_siniestro', 'Tipo de siniestro'], ['culpa', 'Culpa según cliente'], ['denuncia_policial', 'Denuncia policial'], ['descripcion', 'Relato', 'area'], ['lesiones_desc', 'Lesiones', 'area'], ['atencion_medica', 'Atención médica'], ['dano_desc', 'Daños materiales', 'area']]],
  ['Tercero y aseguradora', [['aseguradora_id', 'Aseguradora', 'aseg'], ['aseguradora_texto', 'Aseguradora (otra)'], ['tercero_patente', 'Patente'], ['tercero_vehiculo', 'Vehículo'], ['tercero_nombre', 'Conductor / titular'], ['tercero_poliza', 'Póliza'], ['nro_siniestro', 'Nº de siniestro']]],
  ['Gestión', [['responsable', 'Responsable'], ['prioridad', 'Prioridad', 'prio'], ['canal', 'Canal'], ['referido_por', 'Referido por']]],
];
function input(c, [k, l, t]) {
  const v = c[k] ?? '';
  let h;
  if (t === 'area') h = `<textarea name="${k}">${esc(v)}</textarea>`;
  else if (t === 'aseg') h = `<select name="${k}"><option value="">—</option>${META.aseguradoras.map(a => `<option value="${a.id}" ${a.id == v ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select>`;
  else if (t === 'prio') h = `<select name="${k}">${['urgente', 'alta', 'normal', 'baja'].map(p => `<option ${p === v ? 'selected' : ''}>${p}</option>`).join('')}</select>`;
  else h = `<input type="${t || 'text'}" name="${k}" value="${esc(v)}">`;
  return `<div class="field ${t === 'area' ? 'full' : ''}"><label>${l}</label>${h}</div>`;
}
function pintarTab(r, id) {
  const c = r.caso, tab = $('#tab');
  if (tabCaso === 'resumen') {
    tab.innerHTML = `<form id="fc">${CAMPOS.map(([t, fs]) => `<h3 style="margin:${t === 'Cliente' ? 0 : 18}px 0 12px">${t}</h3><div class="kv">${fs.map(f => input(c, f)).join('')}</div>`).join('')}
      <div class="kv"><div class="field"><label>Con lesiones</label><select name="hubo_lesiones"><option value="1" ${c.hubo_lesiones ? 'selected' : ''}>Sí</option><option value="0" ${!c.hubo_lesiones ? 'selected' : ''}>No</option></select></div></div>
      <button class="btn btn-dark btn-sm">Guardar cambios</button></form>`;
    $('#fc').onsubmit = async e => { e.preventDefault(); await api('/api/admin/casos/' + c.id, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); toast('Guardado'); vCaso(id); };
  }
  if (tabCaso === 'docs') {
    const lab = t => META.documentos.find(d => d.id === t)?.label || t;
    tab.innerHTML = `${r.documentos.length ? `<div class="docgrid">${r.documentos.map(d => `<a class="docc" href="/api/admin/docs/${d.id}" target="_blank"><div class="im">${d.mime?.startsWith('image/') && !/hei[cf]/.test(d.mime) ? `<img loading="lazy" src="/api/admin/docs/${d.id}" alt="">` : 'PDF'}</div><div class="c"><b>${esc(lab(d.tipo))}</b><span class="muted">${fch(d.created_at)} · ${esc(d.subido_por)}</span></div></a>`).join('')}</div>` : '<div class="empty">Sin documentos</div>'}
      <div class="kv" style="margin-top:18px;align-items:end"><div class="field"><label>Tipo de documento</label><select id="d-tipo">${META.documentos.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('')}</select></div>
      <div class="field"><label class="btn btn-ghost" style="margin:0;font-size:14px">Subir archivos<input type="file" id="d-f" multiple accept="image/*,application/pdf" style="display:none"></label></div></div>`;
    $('#d-f').onchange = async e => { const f = new FormData(); [...e.target.files].forEach(x => f.append($('#d-tipo').value, x, x.name)); await api(`/api/admin/casos/${c.id}/docs`, { method: 'POST', body: f }); toast('Subido'); tabCaso = 'docs'; vCaso(id); };
  }
  if (tabCaso === 'economico') {
    const sug = c.monto_acordado && c.pct_cuota_litis ? c.monto_acordado * c.pct_cuota_litis / 100 : null;
    tab.innerHTML = `<form id="fe"><div class="kv">
      <div class="field"><label>Monto reclamado ($)</label><input type="number" step="0.01" name="monto_reclamado" value="${c.monto_reclamado ?? ''}"></div>
      <div class="field"><label>Fecha del reclamo</label><input type="date" name="fecha_reclamo" value="${c.fecha_reclamo ?? ''}"></div>
      <div class="field"><label>Monto acordado / indemnización ($)</label><input type="number" step="0.01" name="monto_acordado" value="${c.monto_acordado ?? ''}"></div>
      <div class="field"><label>Fecha del acuerdo</label><input type="date" name="fecha_acuerdo" value="${c.fecha_acuerdo ?? ''}"></div>
      <div class="field"><label>Honorarios a cargo de la aseguradora ($)</label><input type="number" step="0.01" name="honorarios_aseguradora" value="${c.honorarios_aseguradora ?? ''}"></div>
      <div class="field"><label>% cuota litis pactado</label><input type="number" step="0.1" name="pct_cuota_litis" value="${c.pct_cuota_litis ?? ''}"></div>
      <div class="field"><label>Honorarios a cargo del cliente ($)</label><input type="number" step="0.01" name="honorarios_cliente" value="${c.honorarios_cliente ?? ''}"><div class="hint">${sug ? `Según el pacto: ${ars(sug)} <a href="#" id="usar">usar</a>` : 'Se calcula al cargar el monto acordado'}</div></div>
      <div class="field"><label>Fecha de cobro</label><input type="date" name="fecha_cobro" value="${c.fecha_cobro ?? ''}"></div>
      <div class="field full"><label>Motivo de cierre / observaciones</label><textarea name="motivo_cierre">${esc(c.motivo_cierre || '')}</textarea></div></div>
      <div class="alert alert-info" style="font-size:13px">Los honorarios cuentan como ingreso en el tablero cuando el caso está en estado <b>Cobrado</b> (con la fecha de cobro de este formulario).</div>
      <button class="btn btn-dark btn-sm">Guardar</button></form>`;
    $('#usar')?.addEventListener('click', e => { e.preventDefault(); $('[name=honorarios_cliente]').value = Math.round(sug); });
    $('#fe').onsubmit = async e => { e.preventDefault(); await api('/api/admin/casos/' + c.id, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); toast('Guardado'); vCaso(id); };
  }
  if (tabCaso === 'mensajes') {
    tab.innerHTML = `<div class="chat" id="chat">${r.mensajes.length ? r.mensajes.map(m => `<div class="m ${m.autor === 'cliente' ? 'c' : 'e'}">${esc(m.texto)}<small>${m.autor === 'cliente' ? esc(c.nombre) : esc(m.usuario || 'Estudio')} · ${fchh(m.created_at)}</small></div>`).join('') : '<div class="empty">Sin mensajes. Lo que escribas acá lo ve el cliente en "Seguí tu caso".</div>'}</div>
      <form id="fm" style="display:flex;gap:8px"><input id="m-t" placeholder="Responder al cliente…" style="flex:1"><button class="btn btn-dark btn-sm">Enviar</button></form>`;
    const ch = $('#chat'); ch.scrollTop = ch.scrollHeight;
    $('#fm').onsubmit = async e => { e.preventDefault(); const t = $('#m-t').value.trim(); if (!t) return; await api(`/api/admin/casos/${c.id}/mensaje`, { method: 'POST', body: { texto: t } }); vCaso(id); };
  }
  if (tabCaso === 'historial') {
    tab.innerHTML = `<form id="fn" style="margin-bottom:14px"><textarea id="n-t" style="min-height:70px" placeholder="Nota interna (llamadas, ofertas, plazos…)"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><label class="chk" style="margin:0;font-size:13px"><input type="checkbox" id="n-v" style="width:16px;height:16px"> Visible para el cliente</label><button class="btn btn-dark btn-sm">Agregar nota</button></div></form>
      <ul class="hist">${r.eventos.map(e => `<li class="${e.tipo === 'nota' ? 'nota' : ''}">${esc(e.texto)} ${e.visible_cliente ? '<span class="vis">· visible al cliente</span>' : ''}<small>${fchh(e.created_at)}${e.usuario ? ' · ' + esc(e.usuario) : ''}</small></li>`).join('')}</ul>`;
    $('#fn').onsubmit = async e => { e.preventDefault(); const t = $('#n-t').value.trim(); if (!t) return; await api(`/api/admin/casos/${c.id}/nota`, { method: 'POST', body: { texto: t, visible: $('#n-v').checked } }); vCaso(id); };
  }
}

// ---------- MENSAJES ----------
async function vMensajes(main) {
  const rows = (await api('/api/admin/casos')).filter(c => c.no_leidos > 0);
  main.innerHTML = `<div class="ph"><h1>Mensajes sin leer</h1></div><div class="tablewrap">${rows.length ? `<table class="t"><thead><tr><th>Cliente</th><th>Estado</th><th class="n">Sin leer</th></tr></thead><tbody>${rows.map(c => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.apellido)}, ${esc(c.nombre)}</b><br><small class="muted">${esc(c.codigo)}</small></td><td>${pillE(c.estado)}</td><td class="n">${c.no_leidos}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No hay mensajes pendientes 🎉</div>'}</div>`;
  $$('tr.click', main).forEach(tr => tr.onclick = () => { tabCaso = 'mensajes'; location.hash = 'caso/' + tr.dataset.id; });
}

// ---------- FINANZAS ----------
let mesFin = new Date().toISOString().slice(0, 7);
async function vFinanzas(main) {
  const [m, gastos, cobr] = await Promise.all([api('/api/admin/metricas'), api('/api/admin/gastos?mes=' + mesFin), api('/api/admin/casos?estado=cobrado')]);
  const ing = cobr.filter(c => String(c.fecha_cobro || '').startsWith(mesFin));
  const totI = ing.reduce((s, c) => s + (c.honorarios_aseguradora || 0) + (c.honorarios_cliente || 0), 0);
  const totG = gastos.reduce((s, g) => s + g.monto, 0);
  main.innerHTML = `
  <div class="ph"><div><h1>Ingresos y gastos</h1><div class="muted">Rentabilidad real del estudio</div></div><div class="acts"><input type="month" id="mes" value="${mesFin}" style="width:auto"></div></div>
  <div class="kpis">
    <div class="card kpi"><div class="l">Honorarios cobrados</div><div class="v">${arsK(totI)}</div><div class="s">${ing.length} caso(s) cobrados en el mes</div></div>
    <div class="card kpi"><div class="l">Gastos</div><div class="v">${arsK(totG)}</div><div class="s">${gastos.length} movimiento(s)</div></div>
    <div class="card kpi"><div class="l">Resultado</div><div class="v ${totI - totG >= 0 ? 'pos' : 'neg'}">${arsK(totI - totG)}</div><div class="s">${totI ? 'Margen ' + Math.round((totI - totG) / totI * 100) + '%' : 'Sin ingresos en el mes'}</div></div>
    <div class="card kpi"><div class="l">Resultado ${new Date().getFullYear()}</div><div class="v ${m.kpi.resultado_anio >= 0 ? 'pos' : 'neg'}">${arsK(m.kpi.resultado_anio)}</div><div class="s">Ingresos ${arsK(m.kpi.ingresos_anio)} · gastos ${arsK(m.kpi.gastos_anio)}</div></div>
  </div>
  <div class="g2">
    <div class="card panel"><h3>Cargar gasto</h3><div class="sub">Sueldos, publicidad, alquiler, comisiones, etc.</div>
      <form id="fg" class="kv">
        <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${new Date().toISOString().slice(0, 10)}" required></div>
        <div class="field"><label>Categoría</label><select name="categoria">${META.categorias_gasto.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Concepto</label><input name="concepto" required placeholder="Ej.: Sueldo Analía"></div>
        <div class="field"><label>Monto ($)</label><input type="number" step="0.01" name="monto" required></div>
        <div class="field full"><label>Detalle</label><input name="detalle"></div>
        <div><button class="btn btn-dark btn-sm">Agregar gasto</button></div></form></div>
    <div class="card panel"><h3>Gastos del año por categoría</h3><div class="sub">${new Date().getFullYear()}</div>
      ${m.gastos_categoria.length ? `<table class="t"><tbody>${m.gastos_categoria.map(g => `<tr><td>${esc(g.categoria)}</td><td class="n">${ars(g.monto)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin gastos cargados</div>'}</div>
  </div>
  <div class="g2">
    <div class="card panel"><h3>Ingresos del mes</h3><div class="sub">Casos en estado Cobrado con fecha de cobro en el mes</div>
      ${ing.length ? `<table class="t"><thead><tr><th>Cliente</th><th>Aseguradora</th><th class="n">Honorarios</th></tr></thead><tbody>${ing.map(c => `<tr class="click" data-id="${c.id}"><td>${esc(c.apellido)}, ${esc(c.nombre)}<br><small class="muted">${fd(c.fecha_cobro)}</small></td><td>${esc(c.aseguradora || '—')}</td><td class="n">${ars((c.honorarios_aseguradora || 0) + (c.honorarios_cliente || 0))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin cobros este mes</div>'}</div>
    <div class="card panel"><h3>Gastos del mes</h3><div class="sub">&nbsp;</div>
      ${gastos.length ? `<table class="t"><thead><tr><th>Fecha</th><th>Concepto</th><th class="n">Monto</th><th></th></tr></thead><tbody>${gastos.map(g => `<tr><td>${fd(g.fecha)}</td><td>${esc(g.concepto)}<br><small class="muted">${esc(g.categoria)}${g.detalle ? ' · ' + esc(g.detalle) : ''}</small></td><td class="n">${ars(g.monto)}</td><td><button class="btn btn-ghost btn-sm" data-del="${g.id}">×</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin gastos este mes</div>'}</div>
  </div>`;
  $('#mes').onchange = e => { mesFin = e.target.value; vFinanzas(main); };
  $('#fg').onsubmit = async e => { e.preventDefault(); await api('/api/admin/gastos', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Gasto cargado'); vFinanzas(main); };
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('¿Borrar este gasto?')) return; await api('/api/admin/gastos/' + b.dataset.del, { method: 'DELETE' }); vFinanzas(main); });
  $$('tr.click', main).forEach(tr => tr.onclick = () => { tabCaso = 'economico'; location.hash = 'caso/' + tr.dataset.id; });
}

// ---------- ASEGURADORAS ----------
async function vAseguradoras(main) {
  const [as, m] = await Promise.all([api('/api/admin/aseguradoras'), api('/api/admin/metricas')]);
  const st = Object.fromEntries(m.por_aseguradora.map(x => [x.nombre, x]));
  main.innerHTML = `<div class="ph"><div><h1>Aseguradoras</h1><div class="muted"><b>Activa</b>: se toman casos · <b>Observada</b>: se toman pero se marcan · <b>Excluida</b>: la web no permite iniciar el reclamo</div></div>
    <form id="fa" class="acts"><input name="nombre" placeholder="Nueva aseguradora" style="width:220px"><button class="btn btn-dark btn-sm">Agregar</button></form></div>
    <div class="tablewrap"><table class="t"><thead><tr><th>Aseguradora</th><th>Estado</th><th class="n">Casos</th><th class="n">Cobrados</th><th class="n">Éxito</th><th class="n">Hon. prom.</th><th class="n">Días a cobro</th><th>Nota interna</th></tr></thead><tbody>
    ${as.map(a => { const s = st[a.nombre] || {}; return `<tr><td><b>${esc(a.nombre)}</b></td>
      <td><select data-id="${a.id}" class="st" style="width:auto;padding:6px 10px;font-size:13.5px">${['activa', 'observada', 'excluida'].map(e => `<option ${e === a.estado ? 'selected' : ''}>${e}</option>`).join('')}</select></td>
      <td class="n">${s.casos || 0}</td><td class="n">${s.cobrados || 0}</td><td class="n">${pct(s.exito)}</td><td class="n">${arsK(s.hon_prom)}</td><td class="n">${s.dias_cobro ?? '—'}</td>
      <td><input data-id="${a.id}" class="nt" value="${esc(a.nota || '')}" placeholder="Ej.: paga lento, ofertas bajas" style="padding:6px 10px;font-size:13.5px"></td></tr>`; }).join('')}</tbody></table></div>`;
  $$('.st').forEach(s => s.onchange = async () => { await api('/api/admin/aseguradoras/' + s.dataset.id, { method: 'PATCH', body: { estado: s.value } }); toast('Actualizado'); META = await api('/api/admin/meta'); });
  $$('.nt').forEach(s => s.onchange = async () => { await api('/api/admin/aseguradoras/' + s.dataset.id, { method: 'PATCH', body: { nota: s.value } }); toast('Nota guardada'); });
  $('#fa').onsubmit = async e => { e.preventDefault(); await api('/api/admin/aseguradoras', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); META = await api('/api/admin/meta'); vAseguradoras(main); };
}

// ---------- CONFIGURACIÓN ----------
async function vConfig(main) {
  const cfg = await api('/api/admin/config');
  const us = ME.rol === 'admin' ? await api('/api/admin/usuarios') : [];
  const F = [['abogado_nombre', 'Abogado'], ['abogado_matricula', 'Matrícula'], ['abogado_cuit', 'CUIT'], ['domicilio', 'Domicilio profesional'], ['email', 'Email de contacto'], ['whatsapp', 'WhatsApp (con 549…)'],
    ['pct_cuota_litis', '% cuota litis a cargo del cliente'], ['honorario_estimado', 'Honorario promedio estimado ($)'], ['prescripcion_anios', 'Plazo de prescripción (años)'], ['marca_registro', 'Leyenda de marca'], ['jurisdiccion', 'Jurisdicción del convenio']];
  main.innerHTML = `<div class="ph"><h1>Configuración</h1></div>
  <div class="g2">
    <div class="card panel"><h3>Datos del estudio y del convenio</h3><div class="sub">Se usan en la web y en el convenio que firma el cliente. Los cambios aplican a los convenios nuevos.</div>
      <form id="fcfg" class="kv">${F.map(([k, l]) => `<div class="field ${['domicilio', 'marca_registro', 'jurisdiccion'].includes(k) ? 'full' : ''}"><label>${l}</label><input name="${k}" value="${esc(cfg[k] || '')}" ${ME.rol !== 'admin' ? 'disabled' : ''}></div>`).join('')}
      ${ME.rol === 'admin' ? '<div><button class="btn btn-dark btn-sm">Guardar</button></div>' : ''}</form></div>
    <div style="display:grid;gap:16px;align-content:start">
      <div class="card panel"><h3>Mi contraseña</h3><form id="fpw" class="kv" style="margin-top:10px"><div class="field"><label>Actual</label><input type="password" name="actual" required></div><div class="field"><label>Nueva (mín. 8)</label><input type="password" name="nueva" required minlength="8"></div><div><button class="btn btn-dark btn-sm">Cambiar</button></div></form></div>
      ${ME.rol === 'admin' ? `<div class="card panel"><h3>Usuarios del panel</h3><div class="sub">Secretaría y colaboradores. "Operador" no puede cambiar la configuración.</div>
        <table class="t"><tbody>${us.map(u => `<tr><td>${esc(u.nombre)}<br><small class="muted">${esc(u.email)} · ${u.rol}</small></td><td class="n">${u.id === ME.id ? '<span class="muted">vos</span>' : `<button class="btn btn-ghost btn-sm" data-u="${u.id}" data-a="${u.activo ? 0 : 1}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('')}</tbody></table>
        <form id="fu" class="kv" style="margin-top:14px"><div class="field"><label>Nombre</label><input name="nombre" required></div><div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Contraseña inicial</label><input name="password" required minlength="8"></div><div class="field"><label>Rol</label><select name="rol"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
        <div><button class="btn btn-dark btn-sm">Crear usuario</button></div></form></div>` : ''}
    </div>
  </div>`;
  $('#fcfg').onsubmit = async e => { e.preventDefault(); await api('/api/admin/config', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Configuración guardada'); };
  $('#fpw').onsubmit = async e => { e.preventDefault(); await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Contraseña cambiada'); e.target.reset(); };
  $('#fu')?.addEventListener('submit', async e => { e.preventDefault(); await api('/api/admin/usuarios', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Usuario creado'); vConfig(main); });
  $$('[data-u]').forEach(b => b.onclick = async () => { await api('/api/admin/usuarios/' + b.dataset.u, { method: 'PATCH', body: { activo: b.dataset.a === '1' } }); vConfig(main); });
}

iniciar().catch(() => {});

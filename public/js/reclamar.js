(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const form = $('#f');
  const steps = $$('.step', form);
  let cur = 0, CFG = null;
  const archivos = {}; // tipo -> [File]
  const PROVS = ['Chaco', 'Corrientes', 'Formosa', 'Misiones', 'Santiago del Estero', 'Santa Fe', 'Otra'];
  const DRAFT = 'saat_borrador';

  // ---------- carga inicial ----------
  $$('select.prov').forEach(s => s.innerHTML = PROVS.map(p => `<option>${p}</option>`).join(''));
  $('#fecha_accidente').max = new Date().toISOString().slice(0, 10);
  $('#prog').innerHTML = steps.slice(0, -1).map(() => '<i></i>').join('');

  fetch('/api/public/config').then(r => r.json()).then(c => {
    CFG = c;
    const wa = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent('Hola, quiero consultar por un accidente de tránsito.');
    $$('.wa-link').forEach(a => a.href = wa);
    const sel = $('#aseguradora_id');
    sel.innerHTML = '<option value="">No lo sé todavía</option>' +
      c.aseguradoras.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('') + '<option value="otra">Otra compañía…</option>';
    restaurar();
  });

  // ---------- borrador (se guarda en el dispositivo, sin archivos) ----------
  function guardar() {
    try {
      const d = {};
      new FormData(form).forEach((v, k) => { if (typeof v === 'string') d[k] = v; });
      localStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (e) {}
  }
  function restaurar() {
    let d; try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) {}
    if (!d) return;
    for (const [k, v] of Object.entries(d)) {
      const els = form.elements[k];
      if (!els) continue;
      if (els instanceof RadioNodeList) { els.forEach(r => { if (r.type === 'radio') r.checked = r.value === v; else r.value = v; }); }
      else els.value = v;
    }
    toggles();
  }
  form.addEventListener('input', () => { toggles(); guardar(); });
  form.addEventListener('change', () => { toggles(); guardar(); });

  function val(name) { const e = form.elements[name]; return e ? (e.value || '').trim() : ''; }
  function toggles() {
    const ts = val('tercero_tiene_seguro');
    $('#f-aseg').classList.toggle('hide', ts === 'no');
    $('#aseguradora_texto').classList.toggle('hide', val('aseguradora_id') !== 'otra');
    $('#f-les').classList.toggle('hide', val('hubo_lesiones') !== '1');
    $('#f-dano').classList.toggle('hide', val('dano_material') !== '1');
    const rol = val('rol');
    $('#f-veh').classList.toggle('hide', !(rol.startsWith('conductor') || rol === 'ciclista'));
    $('#sig-name').textContent = (val('nombre') + ' ' + val('apellido')).trim() || 'EL CLIENTE';
  }

  // ---------- navegación ----------
  function mostrar(i) {
    steps.forEach((s, k) => s.classList.toggle('hide', k !== i));
    cur = i;
    const sn = $('#stepname'), nombre = document.createElement('b'), num = document.createElement('span');
    nombre.textContent = steps[i].dataset.name;
    num.textContent = `Paso ${Math.min(i + 1, steps.length - 1)} de ${steps.length - 1}`;
    sn.replaceChildren(nombre, num);
    $$('#prog i').forEach((b, k) => b.classList.toggle('on', k <= i));
    if (i === steps.length - 1) $('#progress').classList.add('hide');
    if (steps[i].dataset.name === 'Documentación') renderDocs();
    if (steps[i].dataset.name === 'Convenio y firma') { renderConvenio(); setTimeout(initFirma, 50); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function marcarError(el, msg) {
    el.classList.add('invalid');
    const e = document.createElement('div'); e.className = 'err'; e.textContent = msg;
    el.closest('.field')?.appendChild(e);
  }
  function validar(step) {
    $$('.err', step).forEach(e => e.remove());
    $$('.invalid', step).forEach(e => e.classList.remove('invalid'));
    let ok = true;
    $$('[required]', step).forEach(el => {
      if (el.offsetParent !== null && !el.value.trim()) { marcarError(el, 'Completá este dato'); ok = false; }
    });
    $$('[data-req]', step).forEach(g => {
      if (g.offsetParent !== null && !val(g.dataset.req)) { marcarError(g, 'Elegí una opción'); ok = false; }
    });
    const dni = $('#dni', step);
    if (dni && dni.value && dni.value.replace(/\D/g, '').length < 7) { marcarError(dni, 'Revisá el DNI'); ok = false; }
    if (step.dataset.name === 'Documentación') {
      if (!(archivos.dni_frente || []).length || !(archivos.dni_dorso || []).length) {
        alert('Subí una foto del frente y del dorso de tu DNI para continuar.'); ok = false;
      }
    }
    if (!ok) step.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }
  $$('[data-prev]').forEach(b => b.onclick = () => mostrar(cur - 1));
  $$('[data-next]').forEach(b => b.onclick = async () => {
    const step = steps[cur];
    if (!validar(step)) return;
    if (cur === 0) {
      b.disabled = true;
      const r = await fetch('/api/public/precheck', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_accidente: val('fecha_accidente'), tercero_tiene_seguro: val('tercero_tiene_seguro'), culpa: val('culpa'), aseguradora_id: val('aseguradora_id') }) })
        .then(r => r.json()).catch(() => ({ viable: true }));
      b.disabled = false;
      const bl = $('#bloqueo');
      if (!r.viable) {
        bl.innerHTML = `${r.bloqueo}<div style="margin-top:12px"><a class="btn btn-wa btn-sm" href="${$('.wa-link').href}" target="_blank" rel="noopener">Consultar por WhatsApp</a></div>`;
        bl.classList.remove('hide'); return;
      }
      bl.classList.add('hide');
    }
    mostrar(cur + 1);
  });

  // ---------- documentos ----------
  function docsAplicables() {
    const rol = val('rol');
    const cond = rol.startsWith('conductor');
    const veh = cond || !!val('vehiculo_cliente');
    return CFG.documentos.filter(d => !d.cuando || (d.cuando === 'conductor' && cond) || (d.cuando === 'vehiculo' && veh) ||
      (d.cuando === 'lesiones' && val('hubo_lesiones') === '1') || (d.cuando === 'dano_material' && val('dano_material') === '1'));
  }
  function renderDocs() {
    const box = $('#docs');
    box.innerHTML = docsAplicables().map(d => `
      <div class="doc ${(archivos[d.id] || []).length ? 'has' : ''}" data-tipo="${d.id}">
        <div class="t"><b>${d.label}${d.obligatorio ? ' <span class="req">*</span>' : ''}</b>
          <small>${(archivos[d.id] || []).length ? (archivos[d.id].length + ' archivo(s) cargado(s)') : (d.multiple ? 'Podés subir varios' : 'Foto o PDF')}</small>
          <div class="thumbs"></div></div>
        <label class="btn btn-ghost btn-sm" style="margin:0">${(archivos[d.id] || []).length ? 'Agregar' : 'Subir'}
          <input type="file" accept="image/*,application/pdf" ${d.multiple ? 'multiple' : ''}></label>
      </div>`).join('');
    $$('.doc', box).forEach(el => {
      const tipo = el.dataset.tipo;
      const th = $('.thumbs', el);
      (archivos[tipo] || []).forEach((f, i) => {
        const s = document.createElement('span');
        if (f.type.startsWith('image/')) { const im = document.createElement('img'); im.src = URL.createObjectURL(f); s.appendChild(im); }
        else s.textContent = 'PDF';
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Quitar';
        x.onclick = () => { archivos[tipo].splice(i, 1); renderDocs(); };
        s.appendChild(x); th.appendChild(s);
      });
      $('input', el).onchange = async (ev) => {
        const fs = [...ev.target.files];
        const lista = archivos[tipo] ||= [];
        const multiple = CFG.documentos.find(d => d.id === tipo)?.multiple;
        for (const f of fs) {
          if (f.size > 15 * 1024 * 1024 && !f.type.startsWith('image/')) { alert(`"${f.name}" supera 15 MB.`); continue; }
          const c = await comprimir(f);
          if (multiple) lista.push(c); else lista.splice(0, lista.length, c);
        }
        renderDocs();
      };
    });
  }
  // Reduce fotos del celular a ~1800px para que suban rápido
  function comprimir(file) {
    return new Promise(res => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return res(file);
      const img = new Image();
      img.onload = () => {
        const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => res(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.82);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => res(file);
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- convenio ----------
  function datos() {
    const d = {};
    new FormData(form).forEach((v, k) => { if (typeof v === 'string') d[k] = v.trim(); });
    if (d.aseguradora_id === 'otra') d.aseguradora_id = '';
    d.hubo_lesiones = d.hubo_lesiones === '1'; d.dano_material = d.dano_material === '1';
    const a = CFG.aseguradoras.find(x => String(x.id) === String(d.aseguradora_id));
    d.aseguradora_nombre = a ? a.nombre : null;
    try { const u = JSON.parse(sessionStorage.getItem('utm') || 'null'); if (u) { d.utm_source = u.s; d.utm_campaign = u.c; } } catch (e) {}
    return d;
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderConvenio() {
    const t = convenioTexto(datos(), CFG);
    $('#conv').innerHTML = `<h4>${esc(t.titulo)}</h4><p>${esc(t.partes)}</p>` + t.clausulas.map(([a, b]) => `<p><b>${esc(a)}.</b> ${esc(b)}</p>`).join('');
  }

  // ---------- firma ----------
  let firmado = false, ctx, cv;
  function initFirma() {
    cv = $('#sig');
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (cv.width === Math.round(r.width * dpr)) return;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B2340';
    let dib = false, last = null, puntos = 0;
    const pos = e => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    cv.onpointerdown = e => { dib = true; last = pos(e); cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (!dib) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; if (++puntos > 15) firmado = true; };
    cv.onpointerup = cv.onpointercancel = () => { dib = false; };
    $('#sig-clear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); firmado = false; puntos = 0; };
  }

  // ---------- envío ----------
  $('#enviar').onclick = () => {
    const err = $('#send-err'); err.classList.add('hide');
    const falta = [];
    if (!$('#acepta_convenio').checked) falta.push('aceptar el convenio');
    if (!$('#acepta_datos').checked) falta.push('aceptar el uso de datos');
    if (!$('#declara').checked) falta.push('confirmar que los datos son verdaderos');
    if (!firmado) falta.push('firmar');
    if (falta.length) { err.textContent = 'Te falta: ' + falta.join(', ') + '.'; err.classList.remove('hide'); return; }

    const d = datos();
    d.acepta_convenio = true; d.acepta_datos = true;
    d.firma = cv.toDataURL('image/png');
    const fd = new FormData();
    fd.append('datos', JSON.stringify(d));
    for (const [tipo, fs] of Object.entries(archivos)) fs.forEach(f => fd.append(tipo, f, f.name));

    const sending = $('#sending'); sending.classList.remove('hide');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/public/casos');
    xhr.upload.onprogress = e => { if (e.lengthComputable) $('#sending-p').textContent = Math.round(e.loaded / e.total * 100) + '%'; };
    xhr.onload = () => {
      sending.classList.add('hide');
      let r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status !== 200) { err.textContent = r.error || 'No pudimos enviar el reclamo. Probá de nuevo.'; err.classList.remove('hide'); return; }
      try { localStorage.removeItem(DRAFT); sessionStorage.setItem('saat_token', r.token); } catch (e) {}
      $('#codigo').textContent = r.codigo;
      $('#ir-seg').href = '/seguimiento.html#' + r.codigo;
      $('#dl-conv').href = '/api/public/seguimiento/convenio?t=' + encodeURIComponent(r.token);
      $('#wa-done').href = 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent(`Hola, acabo de cargar mi reclamo en la web. Código: ${r.codigo}. Soy ${d.nombre} ${d.apellido}.`);
      if (r.pendientes?.length) $('#pend').innerHTML = `<div class="alert alert-info" style="text-align:left"><b>Para avanzar más rápido, cuando puedas subí:</b><ul style="margin:6px 0 0;padding-left:20px">${r.pendientes.map(p => `<li>${esc(p.label)}</li>`).join('')}</ul></div>`;
      mostrar(steps.length - 1);
      document.dispatchEvent(new CustomEvent('saat:reclamo-enviado')); // lo mide tracking.js (sin datos personales)
    };
    xhr.onerror = () => { sending.classList.add('hide'); err.textContent = 'Error de conexión. Revisá tu internet y probá de nuevo.'; err.classList.remove('hide'); };
    xhr.send(fd);
  };

  mostrar(0);
})();

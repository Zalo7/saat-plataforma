// Landing (index.html): menú mobile, botón flotante de WhatsApp y datos del estudio.
(function () {
  // ---------- menú mobile ----------
  const top = document.querySelector('.top');
  const btn = top && top.querySelector('.menu-btn');
  const menu = document.getElementById('menu');
  if (btn && menu) {
    const abrir = si => {
      top.classList.toggle('abierto', si);
      btn.setAttribute('aria-expanded', String(si));
      btn.setAttribute('aria-label', si ? 'Cerrar menú' : 'Abrir menú');
    };
    btn.addEventListener('click', () => abrir(btn.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', e => { if (e.target.closest('a')) abrir(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && top.classList.contains('abierto')) { abrir(false); btn.focus(); }
    });
    document.addEventListener('click', e => { if (!top.contains(e.target)) abrir(false); });
    matchMedia('(min-width: 861px)').addEventListener('change', e => { if (e.matches) abrir(false); });
  }

  // ---------- WhatsApp flotante (escritorio) y barra de abajo (mobile) ----------
  // Se ocultan cuando el bloque final o el pie están a la vista: ahí ya hay botones de WhatsApp.
  const flotantes = document.querySelectorAll('.wa-float, .barra-mobile');
  const zonas = document.querySelectorAll('.cta-final, footer.pie');
  if (flotantes.length && zonas.length && 'IntersectionObserver' in window) {
    const visibles = new Set();
    const io = new IntersectionObserver(es => {
      es.forEach(e => e.isIntersecting ? visibles.add(e.target) : visibles.delete(e.target));
      flotantes.forEach(f => f.classList.toggle('oculto', visibles.size > 0));
    });
    zonas.forEach(z => io.observe(z));
  }

  // ---------- preguntas frecuentes: muestra 4 y el resto con "Ver más" ----------
  const faqBtn = document.querySelector('.faq-btn');
  const faqMas = document.getElementById('faq-mas');
  if (faqBtn && faqMas) {
    faqBtn.hidden = false;
    faqBtn.addEventListener('click', () => {
      faqMas.classList.add('abierto');
      faqBtn.setAttribute('aria-expanded', 'true');
      faqBtn.hidden = true;
      const primera = faqMas.querySelector('summary');
      if (primera) primera.focus();
    });
  }

  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- título del hero: "Reclamá online" se escribe letra por letra ----------
  const h1 = document.querySelector('.hx h1');
  const em = h1 && h1.querySelector('em');
  if (em && !reducir) {
    const texto = em.textContent;
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim()); // el lector de pantalla lee el título completo
    em.classList.add('tipeando');
    // El cursor va fuera del texto (posicionado sobre el h1) para no alterar dónde se cortan los renglones.
    const caret = document.createElement('span'); caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true');
    const letras = [...texto].map(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; return s; });
    em.replaceChildren(...letras);
    h1.appendChild(caret);
    const mover = el => {
      const r = el.getBoundingClientRect(), b = h1.getBoundingClientRect();
      caret.style.left = (el === letras[0] && !el.classList.contains('on') ? r.left : r.right) - b.left + 'px';
      caret.style.top = r.top - b.top + 'px';
      caret.style.height = r.height + 'px';
    };
    mover(letras[0]);
    let i = 0;
    const escribir = () => {
      if (i < letras.length) {
        letras[i].classList.add('on'); mover(letras[i]); i++;
        setTimeout(escribir, letras[i - 1].textContent === ' ' ? 40 : 55 + Math.random() * 45);
      } else {
        setTimeout(() => { // vuelve al texto original y arranca el brillo
          caret.remove(); em.textContent = texto; em.classList.remove('tipeando'); em.classList.add('listo'); h1.removeAttribute('aria-label');
        }, 1100);
      }
    };
    setTimeout(escribir, 450);
  } else if (em) em.classList.add('listo');

  // ---------- celular del hero: "Seguí tu caso" en movimiento ----------
  // Recibido → En análisis → Reclamo presentado → En negociación, mensaje del estudio y notificación. En loop.
  const movil = document.querySelector('.movil');
  if (movil && !reducir) {
    const pasos = [...movil.querySelectorAll('.m-ruta li')];
    const estado = movil.querySelector('.m-estado-t');
    const barra = movil.querySelector('.m-progreso');
    const nombres = pasos.map(li => li.textContent.trim());
    let timers = [], activo = false, visible = true;
    const en = (ms, fn) => timers.push(setTimeout(fn, ms));
    const ponerEstado = i => {
      estado.style.opacity = 0;
      setTimeout(() => { estado.textContent = nombres[i]; estado.style.opacity = 1; }, 220);
      barra.style.setProperty('--p', Math.round((i + 1) / pasos.length * 100) + '%');
    };
    const reiniciar = () => {
      movil.classList.remove('escribiendo', 'msg-ok', 'toast-ok', 'sale');
      pasos.forEach(li => li.classList.remove('ok', 'ahora'));
      pasos[0].classList.add('ahora'); ponerEstado(0);
    };
    const ciclo = () => {
      timers.forEach(clearTimeout); timers = [];
      reiniciar();
      [1, 2, 3].forEach((n, k) => en(900 + k * 900, () => {
        pasos[n - 1].classList.replace('ahora', 'ok'); pasos[n].classList.add('ahora'); ponerEstado(n);
      }));
      en(3900, () => movil.classList.add('escribiendo'));
      en(5600, () => { movil.classList.remove('escribiendo'); movil.classList.add('msg-ok'); });
      en(6100, () => movil.classList.add('toast-ok'));
      en(9000, () => movil.classList.remove('toast-ok'));
      en(11000, () => movil.classList.add('sale'));
      en(11500, () => (activo && visible ? ciclo() : (activo = false)));
    };
    const arrancar = () => { if (!activo && visible && !document.hidden) { activo = true; movil.classList.add('anima'); ciclo(); } };
    const frenar = () => { activo = false; timers.forEach(clearTimeout); timers = []; };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? arrancar() : frenar(); }).observe(movil);
    } else arrancar();
    document.addEventListener('visibilitychange', () => (document.hidden ? frenar() : arrancar()));
  }

  // ---------- "Cómo funciona": cada paso se muestra en la pantalla de al lado ----------
  // Avanza solo cada 5 s mientras la sección está a la vista; tocar un paso lo elige y frena el avance.
  const demo = document.getElementById('demo');
  const listaPasos = document.getElementById('pasos');
  if (demo && listaPasos) {
    const items = [...listaPasos.children];
    const pants = [...demo.querySelectorAll('.demo-pant')];
    const DUR = 5000;
    let actual = -1, timer = null, auto = !reducir, visible = false;
    demo.hidden = false;
    document.documentElement.classList.add('con-demo');
    listaPasos.setAttribute('role', 'tablist');
    items.forEach((li, n) => {
      li.setAttribute('role', 'tab'); li.tabIndex = 0;
      li.style.setProperty('--dur', DUR + 'ms');
      const elegir = () => { auto = false; mostrar(n); };
      li.addEventListener('click', elegir);
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const k = (n + (e.key === 'ArrowDown' ? 1 : 3)) % 4; items[k].focus(); auto = false; mostrar(k); }
      });
    });
    function mostrar(n) {
      clearTimeout(timer);
      items.forEach((li, k) => { li.classList.toggle('activo', k === n); li.classList.remove('corre'); li.setAttribute('aria-selected', String(k === n)); });
      pants.forEach((p, k) => { p.classList.remove('on'); if (k === n) { void p.offsetWidth; p.classList.add('on'); } }); // reinicia la animación de la pantalla
      actual = n;
      if (auto && visible) {
        void items[n].offsetWidth; items[n].classList.add('corre');
        timer = setTimeout(() => mostrar((n + 1) % items.length), DUR);
      }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        visible = es[0].isIntersecting;
        if (visible) mostrar(actual < 0 ? 0 : actual); else clearTimeout(timer);
      }, { threshold: .35 }).observe(demo);
    } else mostrar(0);
    if (actual < 0) mostrar(0);
  }

  // ---------- "¿Mi caso califica?": simulador de 4 preguntas ----------
  // Mismas reglas que el paso 1 del formulario. Si califica, deja las respuestas en el borrador
  // del formulario (saat_borrador), que reclamar.js ya sabe restaurar.
  const sim = document.getElementById('sim');
  if (sim) {
    const PREG = [
      { k: 'tercero_tiene_seguro', t: '¿El vehículo que te chocó tiene seguro?', o: [['si', 'Sí'], ['no_se', 'No sé'], ['no', 'No tiene']] },
      { k: 'tiempo', t: '¿El accidente fue hace menos de 3 años?', o: [['si', 'Sí'], ['no', 'No, hace más']] },
      { k: 'culpa', t: '¿Quién tuvo la culpa del accidente?', ayuda: 'Si eras acompañante o peatón, elegí "El otro".', o: [['tercero', 'El otro'], ['compartida', 'Los dos'], ['no_se', 'No sé'], ['yo', 'Yo']] },
      { k: 'zona', t: '¿Fue en Chaco, Corrientes o el resto del NEA?', o: [['si', 'Sí'], ['no', 'No, en otro lugar']] },
    ];
    const r = {}; let i = 0;
    const wa = () => (document.querySelector('.wa-link') || {}).href || '#';
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    sim.hidden = false;
    document.documentElement.classList.add('con-sim');
    function pintar() {
      sim.replaceChildren();
      const cab = el('div', 'sim-cab');
      cab.append(el('b', '', 'Probá si tu caso califica'), el('span', 'sim-paso', i < PREG.length ? `${i + 1} de ${PREG.length}` : 'Resultado'));
      const barra = el('div', 'sim-barra'); barra.append(el('i')); barra.firstChild.style.width = (Math.min(i, PREG.length) / PREG.length * 100) + '%';
      sim.append(cab, barra);
      if (i < PREG.length) {
        const q = PREG[i];
        const fs = el('fieldset', 'sim-q');
        fs.append(el('legend', '', q.t));
        if (q.ayuda) fs.append(el('p', 'sim-ayuda', q.ayuda));
        const ops = el('div', 'choices');
        q.o.forEach(([v, txt]) => {
          const lab = el('label', 'choice'); const inp = el('input'); inp.type = 'radio'; inp.name = 'sim-' + q.k; inp.value = v;
          if (r[q.k] === v) inp.checked = true;
          inp.addEventListener('change', () => { r[q.k] = v; setTimeout(() => { i++; pintar(); foco(); }, 220); });
          lab.append(inp, el('span', '', txt)); ops.append(lab);
        });
        fs.append(ops);
        sim.append(fs);
        if (i > 0) { const at = el('button', 'sim-atras', '← Anterior'); at.type = 'button'; at.onclick = () => { i--; pintar(); foco(); }; sim.append(at); }
      } else sim.append(resultado());
    }
    function resultado() {
      const box = el('div', 'sim-res');
      let no = null;
      if (r.tercero_tiene_seguro === 'no') no = 'Sin seguro del vehículo responsable no podemos hacer el reclamo extrajudicial.';
      else if (r.tiempo === 'no') no = 'Pasaron más de 3 años: en general el reclamo ya no se puede hacer.';
      else if (r.culpa === 'yo') no = 'Si la culpa fue tuya, no podemos reclamarle a la aseguradora del otro.';
      else if (r.zona === 'no') no = 'Por ahora trabajamos en Chaco, Corrientes y el resto del NEA.';
      document.dispatchEvent(new CustomEvent('saat:simulador', { detail: { califica: !no } })); // lo mide tracking.js
      const notas = [];
      if (r.tercero_tiene_seguro === 'no_se') notas.push('Si tenés la patente del otro vehículo, averiguamos nosotros si tiene seguro.');
      if (r.culpa === 'compartida' || r.culpa === 'no_se') notas.push('Sobre la culpa, el abogado lo revisa con lo que nos cuentes.');
      if (no) {
        box.classList.add('no');
        box.append(el('div', 'sim-ico', '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>'),
          el('h3', '', 'Con estos datos, el caso no califica'), el('p', '', no + ' Si tenés dudas, escribinos y lo vemos.'));
        const a = el('a', 'btn btn-wa', 'Consultar por WhatsApp'); a.href = wa(); a.target = '_blank'; a.rel = 'noopener'; box.append(a);
      } else {
        box.append(el('div', 'sim-ico', '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>'),
          el('h3', '', 'Tu caso puede calificar'), el('p', '', 'Seguí con el reclamo: tus respuestas ya quedan cargadas. Un abogado revisa cada caso antes de reclamar.'));
        notas.forEach(n => box.append(el('p', 'sim-nota', n)));
        const a = el('a', 'btn btn-primary btn-lg', 'Seguir con mi reclamo'); a.href = '/reclamar.html';
        a.addEventListener('click', () => {
          try {
            const d = JSON.parse(localStorage.getItem('saat_borrador') || '{}') || {};
            d.tercero_tiene_seguro = r.tercero_tiene_seguro; d.culpa = r.culpa;
            localStorage.setItem('saat_borrador', JSON.stringify(d));
          } catch (e) {}
        });
        box.append(a);
      }
      const de = el('button', 'sim-atras', 'Volver a empezar'); de.type = 'button'; de.onclick = () => { Object.keys(r).forEach(k => delete r[k]); i = 0; pintar(); foco(); };
      box.append(de);
      return box;
    }
    const foco = () => { const f = sim.querySelector('.sim-q input, .sim-res h3'); if (f) { if (f.tagName === 'H3') f.tabIndex = -1; f.focus({ preventScroll: true }); } };
    pintar();
  }

  // ---------- encabezado con sombra al bajar ----------
  if (top) {
    const sombra = () => top.classList.toggle('con-sombra', scrollY > 8);
    addEventListener('scroll', sombra, { passive: true }); sombra();
  }

  // ---------- honorarios: el "$0" cuenta hacia atrás la primera vez que se ve ----------
  const cero = document.querySelector('.precio-card .big');
  if (cero && !reducir && 'IntersectionObserver' in window) {
    const io3 = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; io3.disconnect();
      let n = 9; cero.classList.add('cuenta');
      const bajar = () => {
        cero.textContent = '$' + n;
        if (n-- > 0) setTimeout(bajar, 40 + (9 - n) * 14); // se frena al llegar a cero
        else setTimeout(() => cero.classList.remove('cuenta'), 350);
      };
      bajar();
    }, { threshold: .6 });
    io3.observe(cero);
  }

  // ---------- cifras del abogado: cuentan desde 0 la primera vez que se ven ----------
  const cifras = document.querySelectorAll('[data-cuenta]');
  if (cifras.length && !reducir && 'IntersectionObserver' in window) {
    const io4 = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io4.unobserve(e.target);
      const el = e.target, fin = +el.dataset.cuenta, pre = el.textContent.trim().startsWith('+') ? '+' : '', t0 = performance.now(), dur = 1400;
      const paso = t => {
        const k = Math.min(1, (t - t0) / dur), v = Math.round(fin * (1 - Math.pow(1 - k, 3))); // arranca rápido y frena al final
        el.textContent = pre + v;
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }), { threshold: .6 });
    cifras.forEach(c => io4.observe(c));
  }

  // ---------- aparición suave al hacer scroll ----------
  // Sólo se ocultan los bloques que están por debajo de la primera pantalla.
  if (!reducir && 'IntersectionObserver' in window) {
    const io2 = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.remove('pre'); e.target.classList.add('visto'); io2.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.anim').forEach(el => {
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('pre'); io2.observe(el); }
    });
  }

  // ---------- secciones en borrador (testimonios): visibles sólo con ?borrador ----------
  if (new URLSearchParams(location.search).has('borrador')) {
    document.querySelectorAll('[data-borrador]').forEach(s => { s.hidden = false; });
  }

  // ---------- datos del estudio desde la configuración del panel ----------
  // El HTML ya trae los valores por defecto (y links de WhatsApp reales); esto sólo los actualiza.
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.textContent = v; };
  fetch('/api/public/config').then(r => r.json()).then(c => {
    if (c.whatsapp) {
      const wa = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent('Hola, quiero consultar por un accidente de tránsito.');
      document.querySelectorAll('.wa-link').forEach(a => { a.href = wa; });
    }
    if (c.pct_cuota_litis) document.querySelectorAll('.pct').forEach(e => { e.textContent = c.pct_cuota_litis; });
    set('abogado', c.abogado_nombre);
    set('mat', c.abogado_matricula);
    if (c.abogado_nombre && c.abogado_matricula) set('f-abog', c.abogado_nombre + ' · ' + c.abogado_matricula);
    set('f-dom', c.domicilio);
    set('f-marca', c.marca_registro);
    const m = document.getElementById('f-mail');
    if (m && c.email) { m.href = 'mailto:' + c.email; m.textContent = c.email; }
  }).catch(() => {});

  // Guarda el origen de la visita (publicidad) para medir canales
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('utm_source')) sessionStorage.setItem('utm', JSON.stringify({ s: q.get('utm_source'), c: q.get('utm_campaign') }));
  } catch (e) {}
})();

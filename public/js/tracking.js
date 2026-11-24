// SAAT — medición de campañas (Meta Pixel, TikTok Pixel y Google Analytics 4).
//
// CONFIGURACIÓN: completar los IDs de cada cuenta. Si un ID queda vacío, esa plataforma no se carga
// (no se descarga ningún script ni se envía nada). Antes de cargar IDs reales, la política de
// privacidad tiene que mencionar estas herramientas (texto a aprobar por el Dr. Stancheff).
const SAAT_TRACKING = {
  metaPixelId: '',   // ej.: '123456789012345'   (Meta Business → Administrador de eventos)
  tiktokPixelId: '', // ej.: 'C1A2B3C4D5E6F7G8H9I0' (TikTok Ads Manager → Eventos)
  ga4Id: '',         // ej.: 'G-XXXXXXXXXX'      (Google Analytics → Flujos de datos)
};
//
// EVENTOS que se envían (nunca datos personales: ni nombre, ni DNI, ni código de caso):
//   cta_click          clic en un botón "Iniciar reclamo"           Meta: ClicIniciarReclamo · TikTok: ClickButton · GA4: cta_click
//   whatsapp_click     clic en cualquier link de WhatsApp           Meta: Contact            · TikTok: Contact     · GA4: whatsapp_click
//   form_start         primer dato cargado en el formulario         Meta: InicioFormulario   · TikTok: InicioFormulario · GA4: form_start
//   form_submit        reclamo enviado y confirmado por el servidor Meta: Lead               · TikTok: SubmitForm  · GA4: generate_lead
//   simulador          resultado de "¿Mi caso califica?"            Meta: Simulador          · TikTok: Simulador   · GA4: simulador_resultado
// Para probar sin cuentas: agregar ?debug_tracking a la URL y mirar la consola del navegador.
(function () {
  const C = SAAT_TRACKING;
  let debug = false;
  try { debug = /[?&]debug_tracking\b/.test(location.search) || sessionStorage.getItem('saat_debug_tracking') === '1'; if (debug) sessionStorage.setItem('saat_debug_tracking', '1'); } catch (e) {}

  const MAPA = {
    cta_click: { meta: ['trackCustom', 'ClicIniciarReclamo'], tiktok: 'ClickButton', ga4: 'cta_click' },
    whatsapp_click: { meta: ['track', 'Contact'], tiktok: 'Contact', ga4: 'whatsapp_click' },
    form_start: { meta: ['trackCustom', 'InicioFormulario'], tiktok: 'InicioFormulario', ga4: 'form_start' },
    form_submit: { meta: ['track', 'Lead'], tiktok: 'SubmitForm', ga4: 'generate_lead' },
    simulador: { meta: ['trackCustom', 'Simulador'], tiktok: 'Simulador', ga4: 'simulador_resultado' },
  };

  function enviar(evento, datos) {
    const m = MAPA[evento]; if (!m) return;
    datos = datos || {};
    if (debug) console.info('[SAAT tracking]', evento, datos);
    try { if (C.metaPixelId && window.fbq) window.fbq(m.meta[0], m.meta[1], datos); } catch (e) {}
    try { if (C.tiktokPixelId && window.ttq) window.ttq.track(m.tiktok, datos); } catch (e) {}
    try { if (C.ga4Id && window.gtag) window.gtag('event', m.ga4, datos); } catch (e) {}
  }
  window.saatTrack = enviar;

  // ---------- carga de las plataformas (sólo las que tienen ID), sin demorar la página ----------
  function cargar() {
    if (C.metaPixelId) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', C.metaPixelId); window.fbq('track', 'PageView');
    }
    if (C.tiktokPixelId) {
      !function (w, d, t) { w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e }; ttq.load = function (e, n) { var i = 'https://analytics.tiktok.com/i18n/pixel/events.js'; ttq._i = ttq._i || {}, ttq._i[e] = [], ttq._i[e]._u = i, ttq._t = ttq._t || {}, ttq._t[e] = +new Date, ttq._o = ttq._o || {}, ttq._o[e] = n || {}; var o = document.createElement('script'); o.type = 'text/javascript', o.async = !0, o.src = i + '?sdkid=' + e + '&lib=' + t; var a = document.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a) } }(window, document, 'ttq');
      window.ttq.load(C.tiktokPixelId); window.ttq.page();
      /* eslint-enable */
    }
    if (C.ga4Id) {
      const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(C.ga4Id); document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', C.ga4Id);
    }
  }
  if (C.metaPixelId || C.tiktokPixelId || C.ga4Id) {
    const despues = () => ('requestIdleCallback' in window ? requestIdleCallback(cargar, { timeout: 3000 }) : setTimeout(cargar, 1500));
    document.readyState === 'complete' ? despues() : addEventListener('load', despues);
  }

  // ---------- eventos ----------
  // Clics: se escuchan en todo el documento, así cubren también botones que se crean después.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const donde = (a.closest('[data-zona]') || {}).dataset?.zona || (a.closest('header') ? 'encabezado' : a.closest('footer') ? 'pie' : 'pagina');
    if (/^https:\/\/wa\.me\//.test(a.href)) enviar('whatsapp_click', { ubicacion: donde, pagina: location.pathname });
    else if (/\/reclamar(\.html)?$/.test(href.split('?')[0])) enviar('cta_click', { ubicacion: donde, texto: a.textContent.trim().slice(0, 40) });
  }, true);

  // Formulario de reclamo: inicio (primer dato que se carga) y envío confirmado.
  const form = document.getElementById('f');
  if (form && location.pathname.startsWith('/reclamar')) {
    let empezo = false;
    const inicio = () => { if (!empezo) { empezo = true; enviar('form_start', {}); } };
    form.addEventListener('input', inicio, { once: true });
    form.addEventListener('change', inicio, { once: true });
  }
  document.addEventListener('saat:reclamo-enviado', () => enviar('form_submit', {}));
  document.addEventListener('saat:simulador', e => enviar('simulador', { califica: !!(e.detail && e.detail.califica) }));
})();

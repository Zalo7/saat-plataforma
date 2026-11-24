# SAAT — Plataforma de reclamos por accidentes de tránsito

Plataforma web del **Dr. Gerardo Martín Stancheff** (Mat. 5851 S.T.J.Ch., apellido con doble F) para la marca **SAAT — Servicio de Asistencia en Accidentes de Tránsito** (marca mixta registrada en el INPI, Nº 3.950.470, clase 45, a su nombre, vigente hasta el 18/09/2036). Dominio: **saat.com.ar**. Estudio: Monteagudo 368, Resistencia, Chaco.

El accidentado carga su reclamo online desde el celular: datos, documentación y firma electrónica del convenio de honorarios. El estudio gestiona y mide cada caso desde un panel. Es únicamente vía **extrajudicial**, contra la aseguradora del tercero responsable.

## Partes

| Ruta | Qué es |
|---|---|
| `/` (`public/index.html`) | Página pública de marketing |
| `/reclamar.html` + `public/js/reclamar.js` | Formulario de 6 pasos: (1) filtro de viabilidad, (2) datos del cliente, (3) accidente, (4) tercero, (5) documentos, (6) convenio y firma. Al final muestra el código del caso |
| `/seguimiento.html` | El cliente entra con código + DNI: ve el estado y la línea de tiempo, envía mensajes, sube documentos y descarga su convenio. Se actualiza cada 30 s |
| `/panel` (`public/panel/`) | Panel del estudio: tablero de métricas, casos, ficha del caso, mensajes, ingresos y gastos, aseguradoras, configuración y usuarios |
| `/privacidad.html` | Política de datos personales (Ley 25.326) |

## Stack y estructura

- **Node.js ≥ 22.12**, Express 4, Multer 2 (subida de archivos), PDFKit (PDF del convenio). La base de datos es **SQLite vía `node:sqlite`**, incluida en Node: no hay dependencias nativas ni servidor de base de datos.
- El frontend es HTML, CSS y JS sin framework ni build. Chart.js va copiado en `public/vendor/chart.umd.js`, no se carga desde un CDN. Las fuentes (Inter y Montserrat) están alojadas en `public/fonts/` (woff2 variable, subset latin, licencia OFL) y se declaran en `saat.css`, con fuentes de respaldo calibradas para que el texto no salte al cargar. No se precargan (`preload`) a propósito: retrasaba el primer dibujado. `panel/index.html` y `privacidad.html` todavía tienen el link a Google Fonts, que ya es redundante.
- Los estilos de la landing están en `saat.css`, bajo `body.landing`: todo selector de la landing lleva el prefijo `.landing` porque otras páginas comparten el CSS (por ejemplo, `.req` en `reclamar.html` es otra cosa). Los logos de la landing se sirven en WebP con el PNG como respaldo; no hay logo en vector (falta el original del diseñador). La landing tiene secciones hero, cómo funciona, requisitos, quién lleva tu caso (`#estudio`, con foto y bio de Gerardo), testimonios (`#testimonios`, oculta con `hidden` hasta tener testimonios reales; se ve en la demo con `/?borrador`), honorarios, preguntas y bloque final. El contenido que falta (testimonios) está marcado en el HTML con `<!-- TODO GERARDO: ... -->`: no inventar ese contenido. Datos dados por Gerardo el 24/11/2026: claim "Reclamá tu accidente de tránsito sin pagar nada por adelantado."; bio "Abogado especialista en accidentes de tránsito. +500 casos de éxito | +18 años litigando contra aseguradoras"; equipo: él más 3 abogados y 3 secretarias. Fotos en `public/img/gerardo-*.webp` y `gerardo-avatar.webp` (recortes de una foto en el estudio). En mobile hay una barra fija abajo (`.barra-mobile`) en lugar de la burbuja de WhatsApp. Animaciones: los bloques con clase `.anim` aparecen al entrar en pantalla (landing.js sólo oculta los que están por debajo de la primera pantalla); todo se desactiva con `prefers-reduced-motion`. En el `h1` del hero sólo se anima el `<em>` ("sin pagar nada por adelantado.": se escribe letra por letra y después brilla); el resto del título se pinta de entrada porque es el LCP. El cursor va posicionado sobre el `h1`, fuera del texto, porque dentro del texto altera los cortes de línea. El hero muestra un celular (`.movil`) con "Seguí tu caso" de ejemplo (datos ficticios, sin montos) que `landing.js` anima en loop; el HTML trae el estado final, así sin JS o con "reducir movimiento" se ve completo y quieto; la animación se pausa fuera de pantalla. "Cómo funciona" es interactivo (`#pasos` + `#demo`): cada paso muestra una pantalla de ejemplo y avanza solo cada 5 s. "¿Mi caso califica?" tiene un simulador (`#sim`) con las mismas reglas que el paso 1 del formulario; si califica, escribe `tercero_tiene_seguro` y `culpa` en el borrador `saat_borrador`, que `reclamar.js` restaura (si cambian los nombres de esos campos, actualizar el simulador). Sin JS se ven la lista de requisitos y los pasos en texto. Transiciones entre páginas con `@view-transition` (sólo CSS). Estilo: radios de 8–12 px, botones de 10 px, sin sombras de color; la curva del logo se usa una sola vez, como borde del hero. Los textos de la landing priorizan los que escribió el dueño; no agregar frases publicitarias nuevas sin su visto bueno. **Caché:** el servidor manda `max-age=1h` para los archivos estáticos, así que `saat.css`, `landing.js` y `reclamar.js` se enlazan con `?v=AAAAMMDDx`: cambiar ese número en los HTML cada vez que se modifican, o los navegadores siguen usando la versión vieja. Reclamar, seguimiento y 404 usan `body.flujo` (estilos compartidos al final de `saat.css`) y un pie mínimo `.mini-pie` con los datos del abogado; en mobile los botones Atrás/Siguiente del formulario quedan fijos abajo (`position:sticky` dentro de cada `.step`). El JS de la landing está en `public/js/landing.js` (menú mobile, botón flotante de WhatsApp y datos desde `/api/public/config`). Los links de WhatsApp traen en el HTML un `href` real con el número por defecto, así funcionan aunque falle la API; el JS sólo los actualiza.
- **Medición:** `public/js/tracking.js` (cargado en index, reclamar y seguimiento). Los IDs de Meta Pixel, TikTok Pixel y GA4 van en el objeto `SAAT_TRACKING` al principio del archivo; vacíos, no se carga nada de terceros. Eventos: `cta_click`, `whatsapp_click`, `form_start`, `form_submit` (lo dispara `reclamar.js` con el evento `saat:reclamo-enviado` cuando el servidor confirma) y `simulador` (evento `saat:simulador` desde `landing.js`). Nunca se envían datos personales. `data-zona` en el HTML indica desde qué parte de la página viene cada clic. Para probar sin cuentas: `?debug_tracking` y mirar la consola. **Antes de cargar IDs reales, la política de privacidad tiene que mencionar estas herramientas** (texto legal: lo aprueba el Dr. Stancheff).
- **SEO:** la landing tiene JSON-LD (`LegalService` + `Person` + `WebSite`), Open Graph con `img/og-saat.jpg` (1200×630, generada a partir del claim y la foto) y `twitter:card`. `seguimiento.html` es `noindex` y no está en el `sitemap.xml`. Faltan el código postal y el horario en el JSON-LD (TODO GERARDO).
- `src/server.js`: servidor y API (`/api/public/*` para clientes, `/api/auth/*`, `/api/admin/*` con sesión). Comprime las respuestas con `compression` (gzip) y sirve `/fonts` con caché de 30 días. Con la variable `PREVIEW_PASSWORD`, todo el sitio pide clave (HTTP Basic, cualquier usuario) y manda `X-Robots-Tag: noindex`: es la versión de prueba en Railway; para publicar en serio se borra la variable (ver README).
- `src/db.js`: esquema, configuración inicial, aseguradoras precargadas y creación del primer administrador.
- `src/dominio.js`: estados, tipos de documento y **evaluación automática** (`evaluar`), que da puntaje, prioridad, alertas y bloqueo.
- `src/pdf.js`: PDF del convenio con la firma del cliente, una constancia de firma electrónica (fecha, IP, user agent) y un hash SHA-256.
- `public/js/convenio-texto.js`: **el texto del convenio**. Se comparte entre el navegador (vista previa) y el servidor (PDF).
- `scripts/demo.js`: carga datos **ficticios** en `./data-demo`. Se niega a correr sobre `./data`.
- Datos en tiempo de ejecución, en `DATA_DIR` (por defecto `./data`): `saat.db`, `uploads/<caso_id>/`, `convenios/`, `CREDENCIALES-INICIALES.txt`. **Nunca versionar ni compartir esa carpeta.**

## Cómo correrlo

```bash
npm install
npm run demo     # datos ficticios → http://localhost:3001/panel (drstancheff@yahoo.com.ar / demo12345)
npm start        # base real (vacía) → http://localhost:3000
```

Variables de entorno: `DATA_DIR`, `PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (sólo se usan en el primer arranque), `APP_SECRET`. Si falta `APP_SECRET`, se genera uno y se guarda en la tabla `config`. La forma recomendada de publicar está en el `README.md`: Railway con el `Dockerfile` y un volumen en `/app/data`, más Cloudflare para el DNS.

## Decisiones tomadas

### Negocio

- **Sólo reclamos extrajudiciales** y **sólo si el tercero tiene seguro**. Cuando no lo tiene, el formulario bloquea el reclamo. Si el cliente responde "No sé", el caso pasa con una alerta para verificar la cobertura por patente.
- **Honorarios**: el cliente no paga nada por adelantado ni gastos de gestión. El estudio cobra (a) los honorarios que pacte con la aseguradora y (b) un **pacto de cuota litis**, hoy del **20 %** y configurable en el panel, que se cobra **sólo cuando el cliente cobra**. Si no hay cobro, no hay honorarios. El porcentaje vigente al firmar queda guardado en cada caso (`casos.pct_cuota_litis`).
- El honorario de referencia es de unos $ 700.000 a $ 900.000 por caso. Hasta que haya cobros reales, el tablero usa $ 800.000 como estimado (`honorario_estimado`).
- **Aseguradoras**: por ahora se trabaja con todas. Cada una puede estar `activa`, `observada` (se toma el caso, pero con alerta y menor puntaje) o `excluida` (el formulario no deja avanzar). Excluir alguna es una decisión que se toma más adelante, con datos del panel.
- **Prescripción**: el formulario bloquea los accidentes de más de 3 años (configurable) y marca como urgentes los que están a menos de 6 meses de ese límite.
- Si el cliente declara que la culpa fue suya, el formulario bloquea el reclamo. Una culpa compartida pasa con alerta.
- Cobertura geográfica: empieza en Resistencia y Chaco, con Corrientes y el resto del NEA como siguiente paso.
- Objetivo de largo plazo del dueño: escalar y eventualmente vender. Por eso todo se mide en el panel: casos por semana, canal, aseguradora, tasa de éxito, días hasta el cobro, honorario promedio y resultado mensual. El panel reemplaza las planillas semanales de Excel.
- Recomendación estratégica ya conversada: lo vendible es la **tecnología y los datos** (en una sociedad aparte), no el estudio jurídico.

### Técnicas

- El monolito es simple a propósito, para que lo mantenga un solo programador y se pueda desplegar en un servidor barato.
- El **convenio se firma con firma electrónica** (Ley 25.506), no con firma digital: firma dibujada, IP, user agent, fecha y hash. El convenio incluye una cláusula de ratificación ológrafa por si una aseguradora la exige.
- Los honorarios cuentan como **ingreso** en el tablero sólo cuando el caso está en estado `cobrado` y tiene `fecha_cobro`. Los ingresos del mes son la suma de `honorarios_aseguradora` y `honorarios_cliente`.
- La tasa de éxito es cobrados / (cobrados + rechazados + desistidos). Los casos derivados a vía judicial no entran en el cálculo.
- El cliente se identifica con código + DNI. Recibe un token HMAC (`id.firma`) sin cuenta ni contraseña.
- La sesión del panel es una cookie `HttpOnly` y `SameSite=Strict` de 14 días, guardada en la tabla `sesiones`. Las contraseñas usan scrypt. Hay dos roles: `admin` y `operador` (el operador no puede cambiar la configuración ni los usuarios).
- El formulario guarda un borrador sin archivos en el `localStorage` del cliente y comprime las fotos en el navegador (máximo 1800 px, JPEG al 82 %). El límite es de 15 MB por archivo, sólo imágenes o PDF.
- El canal de ingreso se mide con "¿Cómo nos conociste?" más `utm_source` y `utm_campaign`, que se toman de la URL de llegada.
- El límite de intentos por IP se guarda en memoria y se reinicia con el servidor.
- Paleta de los gráficos validada para daltonismo: ingresos `#2F80ED`, gastos `#C8692B`. Colores de la marca: navy `#143A61`, azul `#4B9DFF`. Para botones y texto sobre fondo claro se usan `--blue-600` `#1F6FD6` y `--wa` `#0F7F43`, porque el texto blanco sobre `#4B9DFF` o sobre el verde de WhatsApp no llega al contraste AA (decidido el 11/11/2026). El `#4B9DFF` queda para íconos, detalles y fondos.

## Convenciones

- Toda la interfaz está en **español rioplatense**, con voseo.
- **No modificar los textos legales** (`public/js/convenio-texto.js`, `public/privacidad.html`) sin el visto bueno del Dr. Stancheff.
- Hay datos personales y de salud: no commitear `data/`, no loguear contenido de casos y no usar datos reales en pruebas (usar `npm run demo`).
- El nombre correcto es "Stancheff" y la matrícula correcta es la **5851** (los registros con 6881 están equivocados).

## Estado

- El código está completo y probado de punta a punta en local (Playwright) el 6/10/2026: alta de un reclamo con documentos y firma, PDF, seguimiento, mensajes, bloqueo por falta de seguro, panel, cambio de estado, alta manual, finanzas y vista móvil.
- **Al 6/10/2026 no estaba publicado en saat.com.ar.** El dueño se lo pasó a un programador externo para el despliegue: verificar con él en qué estado está.
- **QA automatizada:** `tests/qa.js` (Playwright + axe, devDependencies). Con `npm run demo` corriendo: `npm run qa` (67 pruebas: landing celular/escritorio/sin JS, simulador, medición, reclamo completo, seguimiento, panel, 404, accesibilidad AA, compresión y SEO; capturas en `tests/capturas/`). Contra producción: `QA_URL=https://saat.com.ar npm run qa` (no envía reclamos fuera de localhost; `QA_ALTA=1` lo fuerza). Contra la versión con clave: agregar `QA_PASS=la-clave`. La primera vez: `npx playwright install chromium`. Pasó completa el 24/11/2026.

## Lo que falta

### Antes de lanzar (decisiones del dueño)

- [ ] Revisión del texto del convenio por el Dr. Stancheff.
- [ ] Confirmar el 20 % de cuota litis frente a la ley arancelaria del Chaco.
- [ ] Definir la ratificación ológrafa para las aseguradoras que la exijan.
- [ ] Consultar al Colegio de Abogados del Chaco sobre la publicidad ("$0 por adelantado").
- [ ] Inscribir la base de datos ante la AAIP (incluye datos de salud).
- [ ] Agregar la firma del abogado al PDF del convenio. Hoy esa línea queda en blanco; hace falta la imagen PNG transparente.
- [ ] Para casos de Corrientes: un abogado matriculado allá o matrícula propia.

### Despliegue

- [ ] Publicar en Railway (o un VPS) con un volumen persistente en `/app/data` y **backup diario**.
- [ ] Configurar `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `APP_SECRET`. Conectar `saat.com.ar` y `www` con HTTPS (Cloudflare + NIC Argentina).
- [ ] Cambiar la contraseña inicial, borrar `CREDENCIALES-INICIALES.txt` y crear usuarios para la secretaría.
- [ ] Hacer un reclamo de prueba desde un celular real. Después, un piloto de 2 semanas sin publicidad antes de anunciar.

### Mejoras técnicas sugeridas

- [ ] Avisos automáticos al cliente y al estudio (email o WhatsApp Business API) cuando cambia el estado o llega un mensaje. Hoy no se envía ninguna notificación.
- [ ] Generar el reclamo extrajudicial (.docx) desde la ficha del caso, reutilizando el modelo de reclamos del estudio (fórmula Vuotto/García, baremo Altube/Rinaldi).
- [ ] Portal de derivación para talleres y clínicas, con un canal propio para medirlo.
- [x] Tests automatizados del flujo con Playwright (`npm run qa`, 24/11/2026).
- [ ] `node:sqlite` todavía está marcado como experimental: revisarlo al actualizar Node. Si algún día hay más de una instancia, migrar a Postgres y mover el límite de intentos y los archivos a un almacenamiento compartido.
- [ ] Vista previa de fotos HEIC en el panel: hoy se guardan, pero sólo se ven al descargarlas.
- [x] Alojar las fuentes en el propio servidor (11/11/2026).
- [ ] Agregar `Content-Security-Policy`.

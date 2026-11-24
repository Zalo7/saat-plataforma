# SAAT — Plataforma de reclamos por accidentes de tránsito

Plataforma propia del Dr. Gerardo Martín Stancheff (marca SAAT, INPI Nº 3.950.470, clase 45) para **saat.com.ar**.

## Qué incluye

| Parte | Dirección | Para quién |
|---|---|---|
| Sitio público (marketing) | `/` | Clientes potenciales |
| Formulario de reclamo en 6 pasos, con filtro de viabilidad, carga de documentos y firma del convenio | `/reclamar.html` | Clientes |
| Seguimiento del caso en tiempo real, con mensajes y carga de documentos | `/seguimiento.html` | Clientes (con código + DNI) |
| Panel del estudio: tablero de métricas, casos, mensajes, ingresos y gastos, aseguradoras y usuarios | `/panel` | Estudio |

Cada reclamo genera un **PDF del convenio firmado** con la firma del cliente, la fecha y hora, la IP y una huella SHA-256 del contenido.

## Probarlo en una computadora

Necesita **Node.js 22.12 o superior** (https://nodejs.org).

```bash
npm install
npm run demo        # carga datos ficticios y abre http://localhost:3001/panel
                    # usuario: drstancheff@yahoo.com.ar · contraseña: demo12345
npm start           # versión real (vacía) en http://localhost:3000
```

La primera vez que corre `npm start`, la contraseña inicial del panel se imprime en la consola y queda en `data/CREDENCIALES-INICIALES.txt`. Cambiala desde **Configuración** y borrá ese archivo.

## Publicarlo en saat.com.ar (recomendado: Railway + Cloudflare)

1. **Subir el código a GitHub** como repositorio **privado**.
2. **Railway** (railway.app): *New Project → Deploy from GitHub repo*. Railway detecta el `Dockerfile`.
3. En el servicio: *Settings → Volumes → Add volume* montado en **`/app/data`**. Ahí viven la base de datos, los documentos y los convenios. **Sin el volumen se pierde todo en cada actualización.**
4. *Variables*:
   - `ADMIN_EMAIL` = tu email del panel
   - `ADMIN_PASSWORD` = una contraseña fuerte (sólo se usa la primera vez)
   - `APP_SECRET` = una cadena larga al azar (por ejemplo, 64 letras y números)
5. *Settings → Networking → Custom domain*: `saat.com.ar` y `www.saat.com.ar`. Railway te muestra los registros DNS.
6. **DNS**: en NIC Argentina, delegá el dominio a Cloudflare (gratis) y cargá ahí los registros CNAME que te dio Railway. Cloudflare permite usar el CNAME en el dominio raíz. El HTTPS lo pone Railway automáticamente.

**Después de cada deploy:** desde tu computadora, `QA_URL=https://saat.com.ar npm run qa` (revisa la página publicada sin enviar reclamos).

**Alternativa:** cualquier VPS con Docker (DonWeb, Hostinger, DigitalOcean): `docker build -t saat . && docker run -d -p 80:3000 -v /srv/saat-data:/app/data saat`, con un proxy HTTPS (Caddy o Nginx).

## Copias de seguridad

Toda la información está en la carpeta de datos (`/app/data`): `saat.db`, `uploads/` y `convenios/`. Configurá un backup diario de esa carpeta (Railway: *Volume → Backups*). **Sin backup, una falla del servidor implica perder casos y documentos.**

## Estructura

```
src/server.js        servidor y API
src/db.js            base de datos (SQLite incluida en Node 22) y configuración inicial
src/dominio.js       estados, documentos y evaluación automática de viabilidad
src/pdf.js           PDF del convenio firmado
public/              sitio, formulario, seguimiento y panel
public/js/convenio-texto.js   texto del convenio (revisarlo antes de publicar)
scripts/demo.js      datos ficticios para probar
```

# Ship Commander — Guía de despliegue

## Arquitectura

```
server/server.js   puerto 8080 — HTTP (sirve dist/) + WebSocket del juego (path /ws)
server/server.js   puerto 8081 — HTTP (panel admin → dist/admin.html + API /config)
```

El cliente se empaqueta con **Vite** (`npm run build` → `dist/`). En producción el propio `server.js` sirve `dist/` en el puerto 8080; no hace falta ningún servidor web separado. La URL del WebSocket en el cliente es dinámica (`location.host` + `/ws`), por lo que funciona en local, en producción y vía túnel sin cambiar ningún archivo.

No hay base de datos. El estado de las partidas vive en memoria y se pierde al reiniciar el proceso (comportamiento esperado).

---

## Build con Vite — el patrón híbrido

El cliente se empaqueta con **Vite 8** (bundler Rolldown), pero **solo como paso de build del frontend**: el servidor WebSocket con estado sigue siendo el mismo proceso Node de siempre. Es el patrón híbrido:

- **Desarrollo:** Vite dev server con HMR (`:5173`) + `node server/server.js` (`:8080`/`:8081`) en dos terminales. Vite hace de proxy de `/ws` → `:8080` y de `/config` → `:8081`, así que el cliente no cambia entre dev y prod.
- **Producción:** `npm run build` genera `dist/` (HTML + JS/CSS hasheados) y `server.js` lo sirve. **El deploy sigue siendo "arranca `server.js`"**, solo que precedido de un `npm run build`.

Por qué Vite no toca el servidor: las partidas viven en memoria y requieren un proceso Node de larga duración con conexiones WS persistentes → eso no es "estático puro" ni serverless, y una herramienta de frontend no lo empaqueta. Vite aporta al **cliente**: HMR, ES modules (`game.js` importa `i18n`/`particles`/`sounds`), minificado y tree-shaking.

> **El servidor es TypeScript pero NO se compila.** Sus módulos son `.ts` que **Node 24 ejecuta directamente** con *type stripping* nativo (borra los tipos en runtime). No hay paso de build para el server: el comando de arranque sigue siendo `node server/server.js` y el entry resuelve los `.ts` por sí solo. Por eso es imprescindible **Node ≥ 24.16**. El chequeo de tipos (`pnpm run typecheck` → `tsc --noEmit`) es opcional en CI; no genera artefactos.

> Para un contenedor reproducible: un **Dockerfile** que instale deps de raíz + `server/`, ejecute `npm run build` y arranque `node server/server.js` (copiando `dist/` + `server/`).

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto del servidor de juego + cliente |

El puerto del panel admin es siempre `PORT + 1` (o `8081` si `PORT` no está definido). Ajústalo en `server.js` si la plataforma no lo permite.

---

## Ejecutar en local

Requiere **Node 24.16+ (LTS)** y **pnpm** (un único `package.json` en la raíz cubre cliente y servidor).

```bash
pnpm install        # cliente (vite) + servidor (ws)
pnpm run build      # → dist/
pnpm start          # node server/server.js
# → Game:        http://localhost:8080
# → Panel admin: http://localhost:8081
```

Para desarrollo con HMR usa dos terminales (`pnpm run dev:server` + `pnpm run dev:client`, → `:5173`); ver `README.md`.

---

## Plataformas PaaS (opción más rápida)

### Railway · Render · Fly.io

Cualquiera de las tres detecta Node.js automáticamente. Ahora hay un paso de build (Vite empaqueta el cliente), así que el **root directory es la raíz del repo**, no `server/`:

1. Subir el repositorio a GitHub
2. Conectar el repositorio en la plataforma elegida
3. **Root directory:** raíz del repo
4. **Build command:** `pnpm install && pnpm run build` (instala deps y genera `dist/`)
5. **Start command:** `node server/server.js`
6. La plataforma asigna `PORT` automáticamente — el servidor ya lo lee con `process.env.PORT || 8080`

> Asegúrate de que la plataforma use Node **24.16+** (lo declara `engines` en `package.json`).

**Sobre el panel admin en producción:** el puerto 8081 normalmente no estará expuesto públicamente en PaaS. Es intencionado — el panel no tiene autenticación. Si necesitas acceder al panel en producción, usa un túnel SSH o expón el puerto manualmente con restricción de IP.

---

## VPS (nginx + pm2)

### nginx

```nginx
# /etc/nginx/sites-available/shipcommander
server {
    listen 80;
    server_name tu-dominio.com;

    # Juego + cliente (HTTP y WebSocket en el mismo puerto)
    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
    }
}
```

Para TLS (necesario si quieres `wss://`): Certbot/Let's Encrypt.

```bash
certbot --nginx -d tu-dominio.com
```

### pm2

```bash
pnpm install && pnpm run build    # genera dist/ (en la raíz del repo)
pm2 start server/server.js --name shipcommander
pm2 save
pm2 startup   # para que arranque con el sistema
```

---

## Verificación post-despliegue

1. Abrir el dominio — debe aparecer el lobby de Ship Commander
2. Abrir una segunda pestaña con la misma URL — el jugador debe aparecer en la lista
3. Ambas pestañas pueden entrar en partida y verse mutuamente
4. La consola del navegador no debe mostrar errores de WebSocket

Si hay problemas de WS detrás de un proxy: asegurarse de que se pasan las cabeceras `Upgrade` y `Connection` (el bloque nginx de arriba ya lo hace).

---

## Notas

- **Sin autenticación.** Cualquiera con la URL puede unirse. Para acceso restringido, un proxy con basic auth es suficiente en esta fase.
- **Panel admin** (`puerto 8081`) no debe exponerse públicamente. Solo para uso en local o acceso vía SSH tunnel.
- **Sin límite** de salas o jugadores más allá de la RAM disponible. Para grupos pequeños no es un problema.
- El estado de las salas se pierde al reiniciar el proceso. Es el comportamiento esperado.

# Ship Commander — Guía de despliegue

## Arquitectura

```
server/server.js   puerto 8080 — HTTP (cliente estático) + WebSocket (juego)
server/server.js   puerto 8081 — HTTP (panel admin)
```

El servidor sirve los archivos del cliente directamente en el puerto 8080. No hace falta ningún servidor web separado. La URL del WebSocket en el cliente es dinámica (`location.host`), por lo que funciona en local, en producción y via túnel sin cambiar ningún archivo.

No hay base de datos. El estado de las partidas vive en memoria y se pierde al reiniciar el proceso (comportamiento esperado).

---

## Build y herramientas — ¿por qué no hay Vite / bundler?

El proyecto **no usa ningún build step** (ni Vite, ni Webpack, ni bundler). Es intencionado y, para este caso, **simplifica el despliegue**, no lo complica:

- **El cliente no es el cuello de botella del deploy.** Son 3 ficheros JS vanilla (`game.js`, `sounds.js`, `particles.js`) + HTML/CSS servidos como estáticos por el propio proceso Node. No hay nada que compilar.
- **Lo difícil de desplegar es el servidor WebSocket con estado**, y eso una herramienta de frontend como Vite no lo toca. Las partidas viven en memoria y requieren un proceso Node de larga duración con conexiones WS persistentes → no se puede hacer "estático puro" ni serverless.
- Con Vite, en producción seguirías necesitando **el mismo `server.js`** para el WebSocket, pero además tendrías que ejecutar `vite build` y servir su salida. Es decir: **una pieza y un paso más**, no menos.

**Cuándo SÍ compensaría Vite** (es ganancia de *experiencia de desarrollo*, no de deploy): HMR al editar el cliente, modularizar `game.js` en imports ES, minificado/tree-shaking o TypeScript.

**Patrón híbrido recomendado** si algún día se quiere ese DX sin perder la simpleza de despliegue: usar Vite **solo en desarrollo** (su dev server con HMR y un proxy de WebSocket hacia `:8080`) y en producción `vite build` servido por el mismo Node. Así el deploy sigue siendo "arranca `server.js`".

> Lo que de verdad reduce la fricción de despliegue aquí no es un bundler, sino empaquetar el **servidor**: el PaaS documentado abajo (prácticamente un clic) o un **Dockerfile** (un contenedor reproducible: instala `ws`, copia `client/` + `server/`, `node server.js`).

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto del servidor de juego + cliente |

El puerto del panel admin es siempre `PORT + 1` (o `8081` si `PORT` no está definido). Ajústalo en `server.js` si la plataforma no lo permite.

---

## Ejecutar en local

```bash
cd server
npm install
node server.js
# → Game:        http://localhost:8080
# → Panel admin: http://localhost:8081
```

---

## Plataformas PaaS (opción más rápida)

### Railway · Render · Fly.io

Cualquiera de las tres detecta Node.js automáticamente.

1. Subir el repositorio a GitHub
2. Conectar el repositorio en la plataforma elegida
3. **Root directory:** `server/`
4. **Start command:** `node server.js`
5. La plataforma asigna `PORT` automáticamente — el servidor ya lo lee con `process.env.PORT || 8080`

> **Railway** es la opción más rápida: detecta `package.json` en `server/` sin configuración adicional.

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
cd server
npm install
pm2 start server.js --name shipcommander
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

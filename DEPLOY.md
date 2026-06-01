# Ship Commander — Guía de despliegue

## Arquitectura actual

```
client/ (ficheros estáticos: HTML, JS, CSS)
server/ (Node.js + WebSocket, puerto 8080)
```

El cliente se conecta al servidor vía WebSocket. Actualmente la URL está hardcodeada como `ws://localhost:8080` — esto hay que hacerlo dinámico para producción.

No hay base de datos. El estado de las partidas vive en memoria; se pierde al reiniciar el servidor (comportamiento esperado).

---

## Cambios de código necesarios antes del deploy

### 1. Servidor — puerto dinámico y servir ficheros estáticos

El servidor actual solo gestiona WebSocket. En producción debe servir también el cliente estático desde el mismo proceso y puerto.

Reemplazar el inicio de `server/server.js`:

```js
const WebSocket = require("ws");
const crypto    = require("crypto");
const http      = require("http");
const fs        = require("fs");
const path      = require("path");

const CLIENT_DIR = path.join(__dirname, "../client");

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".jpg":  "image/jpeg",
  ".png":  "image/png",
};

const httpServer = http.createServer((req, res) => {
  const url      = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(CLIENT_DIR, url);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server: httpServer });

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

Eliminar la línea original `new WebSocket.Server({ port: 8080 })` y la llamada a `setInterval` / `console.log` al final (quedan igual, solo cambia el arranque).

### 2. Cliente — URL de WebSocket dinámica

En `client/game.js`, línea 14, sustituir:

```js
// Antes
const ws = new WebSocket("ws://localhost:8080");

// Después
const proto = location.protocol === "https:" ? "wss:" : "ws:";
const ws    = new WebSocket(`${proto}//${location.host}`);
```

---

## Requisitos de infraestructura

| Requisito | Detalle |
|---|---|
| Runtime | Node.js 18+ |
| Puerto | Uno solo (HTTP + WS upgrade en el mismo puerto) |
| Base de datos | Ninguna |
| Variables de entorno | Solo `PORT` (opcional, default 8080) |
| Persistencia de ficheros | No necesaria |
| Procesos | Un único proceso Node.js |

---

## Plataformas recomendadas (PaaS — opción más rápida)

### Railway · render.com · Fly.io

Cualquiera de las tres detecta Node.js automáticamente. Pasos generales:

1. Subir el repositorio a GitHub
2. Conectar el repositorio en la plataforma elegida
3. Configurar el **directorio raíz del servidor** como `server/` (o ajustar el start command)
4. Start command: `node server.js`
5. La plataforma asigna `PORT` automáticamente

> **Railway** es la opción más rápida. Detecta `package.json` en `server/` sin configuración adicional.

---

## VPS (nginx + pm2)

Si se despliega en un servidor propio:

```nginx
# /etc/nginx/sites-available/shipcommander
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

```bash
# Arrancar con pm2
cd server
pm2 start server.js --name shipcommander
pm2 save
```

Para TLS (obligatorio si se quiere `wss://`): Certbot/Let's Encrypt en el dominio.

---

## Verificación

1. Abrir el dominio en el navegador — debe aparecer el lobby
2. Abrir una segunda pestaña — el jugador debe aparecer en la lista de la sala
3. Ambas pestañas deben poder entrar en partida y verse mutuamente

Si hay problemas de WebSocket: revisar que el proxy pasa correctamente las cabeceras `Upgrade` y `Connection`.

---

## Notas adicionales

- El juego **no tiene autenticación**. Cualquiera con la URL puede unirse. Si se quiere acceso restringido, un proxy con basic auth es suficiente para esta fase.
- El estado de las salas se pierde al reiniciar el proceso. Es el comportamiento esperado en alpha.
- No hay límite de salas ni de jugadores globales más allá de la RAM disponible. Para este caso de uso (grupos pequeños) no es un problema.

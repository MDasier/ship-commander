// Servidor HTTP del juego (sirve el build de dist/ en producción) y servidor
// WebSocket en el path /ws. El path es necesario para no chocar con el socket de
// HMR de Vite en desarrollo. Gestiona el ciclo de vida de cada conexión y delega
// los mensajes en handlers.handleMessage.

const WebSocket = require("ws");
const crypto    = require("crypto");
const http      = require("http");
const fs        = require("fs");
const path      = require("path");
const CFG       = require("../config");
const { WORLD_PRESETS } = require("../constants.ts");
const { clients } = require("../state.ts");
const { send, broadcastRoomList } = require("./broadcast.ts");
const { createPlayer } = require("../entities/player.ts");
const { removeFromRoom, roomList } = require("../rooms/rooms.ts");
const { handleMessage } = require("./handlers.ts");

// dist/ está dos niveles por encima de server/net/
const clientDir = path.join(__dirname, "../../dist");
const MIME_TYPES: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".json":  "application/json; charset=utf-8",
  ".map":   "application/json; charset=utf-8",
  ".svg":   "image/svg+xml",
  ".png":   "image/png",
  ".ico":   "image/x-icon",
  ".woff2": "font/woff2",
};

function startGameServer(port: number): any {
  const gameHttpServer = http.createServer((req: any, res: any) => {
    const reqPath  = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
    const fullPath = path.join(clientDir, safePath);

    if (!fullPath.startsWith(clientDir)) {
      res.writeHead(403); res.end(); return;
    }

    fs.readFile(fullPath, (err: any, data: any) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      const mime = MIME_TYPES[path.extname(fullPath)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
    });
  });

  const wss = new WebSocket.Server({ server: gameHttpServer, path: "/ws" });

  gameHttpServer.listen(port, () =>
    console.log(`Game:         http://localhost:${port}`)
  );

  wss.on("connection", (ws: any) => {
    const id     = crypto.randomUUID();
    const player = createPlayer(id);
    ws.player    = player;
    clients.set(id, ws);

    send(ws, { type: "init", id, ships: CFG.SHIP_TYPES, worldPresets: WORLD_PRESETS });
    send(ws, { type: "rooms", rooms: roomList() });

    ws.on("message", (raw: any) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      handleMessage(ws, player, msg);
    });

    ws.on("close", () => {
      removeFromRoom(player);
      clients.delete(id);
      broadcastRoomList();
    });
  });

  return { gameHttpServer, wss };
}

module.exports = { startGameServer };

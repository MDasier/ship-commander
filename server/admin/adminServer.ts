// Panel admin. La API `/config` (GET devuelve CFG sin propiedades privadas; POST
// aplica cambios en caliente y los persiste en config.json — se reflejan al
// instante en las partidas en curso) se expone mediante `handleConfigRequest`,
// que el servidor del JUEGO monta TAMBIÉN en su puerto. Es necesario porque en
// PaaS tipo Render solo se expone un puerto público: el panel debe vivir en el
// mismo puerto que el juego. Este servidor independiente en PORT+1 se mantiene
// para acceso local / red privada (en desarrollo el proxy de Vite apunta aquí).
//
// Protección: si la variable de entorno ADMIN_ACCESS está definida, tanto el panel
// (admin.html) como la API /config exigen HTTP Basic Auth (usuario cualquiera,
// contraseña = ADMIN_ACCESS). El navegador cachea las credenciales y las reenvía
// también en el fetch("/config") al ser mismo origen. Si ADMIN_ACCESS no está
// definida (típico en local/dev) no se pide nada.

const http = require("http");
const fs   = require("fs");
const path = require("path");
const CFG  = require("../config");

// El panel admin se sirve desde el build de Vite (dist/admin.html). Se lee por
// petición (no en arranque) para no romper si aún no se ha ejecutado `npm run build`
// — en desarrollo el panel lo sirve el dev server de Vite, no este servidor.
// dist/ está dos niveles por encima de server/admin/.
const adminHtmlPath = path.join(__dirname, "../../dist/admin.html");

const ADMIN_KEY = process.env.ADMIN_ACCESS || "";

// Comprueba la protección del panel. Devuelve `true` si la petición puede pasar
// (no hay ADMIN_ACCESS configurada, o las credenciales Basic son correctas). Si no,
// responde 401 pidiendo autenticación y devuelve `false`.
function adminAuthorized(req: any, res: any): boolean {
  if (!ADMIN_KEY) return true;
  const hdr = req.headers["authorization"] || "";
  if (hdr.startsWith("Basic ")) {
    const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === ADMIN_KEY) return true;
  }
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Ship Commander Admin", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Autenticación requerida");
  return false;
}

// Maneja la API `/config` (con CORS). Devuelve `true` si la petición era para
// `/config` (y ya la respondió), `false` si no es ruta de esta API (para que el
// servidor que la llama siga con su propio enrutado). Se comparte entre el
// servidor admin (PORT+1) y el del juego (PORT) — único puerto público en Render.
function handleConfigRequest(req: any, res: any): boolean {
  const url = (req.url || "").split("?")[0];
  if (url !== "/config") return false;

  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return true; }

  if (!adminAuthorized(req, res)) return true;   // 401 ya enviado

  if (req.method === "GET") {
    const { save, ...rest } = CFG;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rest));
    return true;
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk: any) => body += chunk);
    req.on("end", () => {
      try {
        const updates = JSON.parse(body);
        if (updates.__reset) {
          // Restaurar los defaults originales (copia profunda pristina)
          Object.assign(CFG, CFG.getDefaults());
        } else {
          Object.assign(CFG, updates);
        }
        CFG.save();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end("Bad request");
      }
    });
    return true;
  }

  res.writeHead(405); res.end(); return true;
}

// Sirve dist/admin.html (build de Vite); catch-all del panel admin.
function serveAdminHtml(res: any): void {
  fs.readFile(adminHtmlPath, (err: any, data: any) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (err) {
      res.end("<h1>Panel admin</h1><p>No se encontró <code>dist/admin.html</code>. " +
              "Ejecuta <code>npm run build</code>, o en desarrollo abre el panel desde el " +
              "dev server de Vite (<code>npm run dev:client</code> → <code>/admin.html</code>).</p>");
      return;
    }
    res.end(data);
  });
}

function startAdminServer(port: number): any {
  const adminServer = http.createServer((req: any, res: any) => {
    if (handleConfigRequest(req, res)) return;
    if (!adminAuthorized(req, res)) return;
    serveAdminHtml(res);
  });

  adminServer.listen(port, () =>
    console.log(`Panel admin: http://localhost:${port}`)
  );

  return adminServer;
}

module.exports = { startAdminServer, handleConfigRequest, adminAuthorized };

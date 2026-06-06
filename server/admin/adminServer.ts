// Servidor HTTP del panel admin (puerto PORT+1). GET /config devuelve CFG (sin
// las propiedades privadas), POST /config aplica cambios en caliente y los persiste
// en config.json — se reflejan inmediatamente en las partidas en curso. Sirve
// dist/admin.html (build de Vite) en producción.

const http = require("http");
const fs   = require("fs");
const path = require("path");
const CFG  = require("../config");

// El panel admin se sirve desde el build de Vite (dist/admin.html). Se lee por
// petición (no en arranque) para no romper si aún no se ha ejecutado `npm run build`
// — en desarrollo el panel lo sirve el dev server de Vite, no este servidor.
// dist/ está dos niveles por encima de server/admin/.
const adminHtmlPath = path.join(__dirname, "../../dist/admin.html");

function startAdminServer(port: number): any {
  const adminServer = http.createServer((req: any, res: any) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/config") {
      if (req.method === "GET") {
        const { save, ...rest } = CFG;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rest));
        return;
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
        return;
      }
    }

    // Admin panel HTML (build de Vite)
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
  });

  adminServer.listen(port, () =>
    console.log(`Panel admin: http://localhost:${port}`)
  );

  return adminServer;
}

module.exports = { startAdminServer };

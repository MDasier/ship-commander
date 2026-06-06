# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ship Commander es un juego de combate espacial multijugador en el navegador. El `README.md` documenta gameplay, naves, controles y el protocolo de mensajes WebSocket en gran detalle — consúltalo para "qué hace el juego". Este archivo cubre lo necesario para **modificar el código** sin romper las invariantes de arquitectura.

## Comandos

Requiere **Node 24.16+ (LTS)** y **pnpm** (gestor fijado en `packageManager`). El cliente se empaqueta con **Vite 8** (bundler Rolldown); el servidor sigue siendo Node + `ws`. Hay **un único `package.json` en la raíz** que cubre cliente y servidor (`server/` no tiene el suyo; `server.js` resuelve `ws` desde el `node_modules` de la raíz).

```bash
pnpm install          # cliente (vite) + servidor (ws) — un solo install

# Desarrollo (dos terminales):
pnpm run dev:client   # Vite + HMR en :5173 (proxy /ws→:8080 y /config→:8081)
pnpm run dev:server   # node server/server.js → :8080 (juego+WS) y :8081 (admin)

# Producción:
pnpm run build        # vite build → dist/  (index.html + admin.html + assets hasheados)
pnpm start            # node server/server.js sirve dist/ en :8080 y :8081
```

- **En desarrollo** se abre `http://localhost:5173` (lo sirve Vite con HMR). **En producción** el propio `server.js` sirve el build de `dist/` en `:8080`. El deploy sigue siendo "arranca `server.js`" — solo hay que `pnpm run build` antes.
- **No hay tests.**
- Para probar multijugador en local: abrir varias pestañas en la URL activa.
- `PORT` (env) cambia el puerto del juego; el panel admin es siempre `PORT + 1`.
- Tras cambiar las formas de las naves (`SHIP_SHAPES` en `client/src/game.js`), regenerar los presets del editor: `node tools/gen-presets.js`. ⚠️ `tools/*.js` son CommonJS; por eso la config de Vite es `vite.config.mjs` (ESM) y la raíz **no** declara `"type": "module"`.

## Arquitectura — invariantes que NO se deben romper

**Servidor autoritativo a 60 fps; el cliente es solo render.** Toda la física, colisiones, cooldowns, puntuación y condición de victoria viven en `server/server.js`. El cliente (`client/src/game.js`) solo envía inputs (~30/s), interpola el estado recibido y dibuja. **Nunca muevas lógica de juego (física, daño, validación) al cliente** — es la superficie anti-trampa. Los muertos no actúan, una nave apagada por EMP no se mueve, todos los cooldowns se validan en servidor.

**La IA reutiliza la simulación.** Los bots son jugadores normales con `isBot`; una rutina de IA en el servidor fija su `input` y luego corre la misma física que un humano. No hay código de bot en el cliente. El sistema de oleadas (`WAVES` + `manageWaves`) es el mismo en Co-op multijugador y práctica en solitario.

**Configuración en caliente.** `server/config.js` exporta el objeto `CFG` que el game loop lee **cada tick**. `DEFAULTS` (en `config.js`) se fusiona con `config.json` mediante `deepMerge` (los objetos anidados se mergean, los arrays como `WAVES` se reemplazan enteros). El panel admin (`:8081`, sirve `admin.html`) hace `POST /config`, escribe `config.json` y los cambios se aplican **inmediatamente a las partidas en curso** sin reiniciar. → Si añades una variable de juego, declárala en `DEFAULTS` y se editará automáticamente desde el panel.

**Estado en memoria.** No hay base de datos. Las salas viven en RAM y se pierden al reiniciar — comportamiento esperado.

## Sincronización servidor ↔ cliente (puntos frágiles)

Hay datos de naves duplicados a propósito en dos ficheros que **deben mantenerse coherentes**:

- `server/config.js` → `SHIP_TYPES`: stats, física, escudos, `collider` (cápsula de colisión), `turretHardpoints`.
- `client/src/game.js` → `SHIP_SHAPES`: geometría de dibujo en canvas, incluido `turretHardpoints` para las torretas.

Los `turretHardpoints` de la Capital deben coincidir entre ambos: el servidor calcula desde dónde salen las balas, el cliente dibuja la torreta ahí. Si divergen, las balas salen de un punto distinto al visible.

El **modelo de colisión** es una cápsula: segmento proa→popa (`collider.front`/`rear`) + `radius`. Los proyectiles usan trayectoria barrida del tick (anti-tunneling). EMP/minas/explosiones usan distancia radial. El rayo de la Capital es hitscan instantáneo (los `beams` en el estado son solo efecto visual; el daño ya se aplicó).

El **protocolo de mensajes** cliente↔servidor (campos `type` en ambos sentidos, contenido de `state`) está tabulado en el README sección "Arquitectura Técnica Detallada". Si añades un mensaje nuevo, manéjalo en el `switch`/handler de `server.js` y en el receptor de `game.js`.

El **WebSocket usa el path `/ws`** (no la raíz): el servidor monta `new WebSocket.Server({ server, path: "/ws" })` y el cliente conecta a `…/ws`. Es necesario para no chocar con el socket de HMR de Vite en dev y para que el proxy del dev server distinga el tráfico del juego. No conectes a la raíz.

## ES modules y empaquetado (Vite)

El cliente son **ES modules** y viven en `client/src/`. `client/index.html` (en la raíz del *Vite root* `client/`) carga un único `<script type="module" src="/src/game.js">`; `game.js` importa `./styles.css` y hace `import` de `i18n.js`, `particles.js` y `sounds.js` (todos en `src/`), que exportan su superficie pública con un `export { … }` al final de cada fichero. Al añadir una función que `game.js` deba usar de esos módulos, **añádela al `export` del módulo y al `import` de `game.js`** (si no, `ReferenceError` en runtime).

`admin.html` vive en `client/` y es una segunda entrada de Vite (multi-page, ver `vite.config.mjs`). Es autocontenido (script inline, sin assets externos) y hace `fetch("/config")`; en dev el proxy de Vite lo redirige a `:8081`, en prod lo sirve el servidor admin desde `dist/admin.html`.

## Ficheros

| Fichero | Rol |
|---|---|
| `vite.config.mjs` (raíz) | Config de Vite 8: `root: client`, multi-page (index + admin), `outDir: dist`, proxy `/ws` y `/config` para dev |
| `server/server.js` (~2.5k líneas) | Servidor autoritativo: física, colisiones, salas, timer, IA, oleadas, ambos servidores HTTP. Sirve `dist/` en prod |
| `server/config.js` | `DEFAULTS` + carga/merge/persistencia de `config.json`; exporta `CFG` |
| `client/index.html` | Juego. Entrada Vite principal (en la raíz del *Vite root* `client/`); carga `/src/game.js` como módulo |
| `client/admin.html` | Panel admin (`:8081`). Segunda entrada Vite (en `client/`); autocontenido, `fetch("/config")` |
| `client/src/game.js` (~4.5k líneas) | Entrada ES module: WebSocket, render loop, input, menús, `SHIP_SHAPES`; importa `styles.css` e i18n/particles/sounds |
| `client/src/particles.js` | Campo de estrellas + sistema de partículas (módulo) |
| `client/src/sounds.js` | Música y SFX procedurales (Web Audio API, sin assets) (módulo) |
| `client/src/i18n.js` | Traducciones ES/EN; `i18nt("key", {vars})` + `data-i18n` en el DOM. Los textos con teclas de control se componen en `game.js` con `bindingText()`, no aquí |
| `client/src/styles.css` | Toda la UI. Convención: unidades **rem**, texto **≥ 16px** |
| `tools/ship-editor.html` | Editor visual de formas de nave |
| `tools/ship-presets.js` | **Auto-generado** desde `SHIP_SHAPES` por `gen-presets.js` (CommonJS) — no editar a mano |
| `dist/` | Salida de `vite build` (gitignored); servida por `server.js` en prod |

## Idioma

El proyecto está documentado y comentado en español. El cliente es bilingüe ES/EN vía `i18n.js`; al añadir texto de UI, usa claves `i18nt(...)` (o `data-i18n` en el HTML) y entradas en ambos idiomas en `I18N`.

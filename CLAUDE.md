# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ship Commander es un juego de combate espacial multijugador en el navegador. El `README.md` documenta gameplay, naves, controles y el protocolo de mensajes WebSocket en gran detalle — consúltalo para "qué hace el juego". Este archivo cubre lo necesario para **modificar el código** sin romper las invariantes de arquitectura.

## Comandos

Requiere **Node 24.16+ (LTS)** y **pnpm** (gestor fijado en `packageManager`). El cliente es **React 19 + TypeScript** (con `react-router`, **Tailwind CSS v4** y el **React Compiler**) y se empaqueta con **Vite 8** (bundler Rolldown, compiler Oxc); la migración del cliente vanilla a React es **incremental** (*strangler* — ver «Cliente: React + TypeScript (strangler)»). El servidor es Node + `ws` escrito en **TypeScript** — son módulos `.ts` que Node 24 ejecuta directamente con *type stripping* nativo (**sin paso de build**; ver «Servidor: módulos y TypeScript»). Hay **un único `package.json` en la raíz** que cubre cliente y servidor (`server/` no tiene el suyo; el server resuelve `ws` desde el `node_modules` de la raíz).

```bash
pnpm install          # cliente (vite) + servidor (ws) — un solo install

# Desarrollo (dos terminales):
pnpm run dev:client   # Vite + HMR en :5173 (proxy /ws→:8080 y /config→:8081)
pnpm run dev:server   # node server/server.js → :8080 (juego+WS) y :8081 (admin)

pnpm run typecheck    # tsc -b — chequea cliente (app), vite.config (node) y server (NO compila: noEmit)

# Producción:
pnpm run build        # vite build → dist/  (index.html + admin.html + assets hasheados)
pnpm start            # node server/server.js sirve dist/ en :8080 y :8081
```

- **En desarrollo** se abre `http://localhost:5173` (lo sirve Vite con HMR). **En producción** el propio `server.js` sirve el build de `dist/` en `:8080`. El deploy sigue siendo "arranca `server.js`" — solo hay que `pnpm run build` antes (el server **no** se compila: Node ejecuta los `.ts` tal cual).
- **No hay tests.** Sí hay chequeo de tipos: `pnpm run typecheck` (`tsc -b`). Es un *solution tsconfig* (`tsconfig.json` con `references`) que construye tres proyectos en modo build: `tsconfig.app.json` (cliente React/TSX, `client/src`), `tsconfig.node.json` (`vite.config.ts`) y `tsconfig.server.json` (`server/**/*.ts`). Todos con `noEmit`: valida tipos, Node no se entera.
- Para probar multijugador en local: abrir varias pestañas en la URL activa.
- `PORT` (env) cambia el puerto del juego; el panel admin es siempre `PORT + 1`.
- Tras cambiar las formas de las naves (`SHIP_SHAPES` en `client/src/game.js`), regenerar los presets del editor: `node tools/gen-presets.js`. ⚠️ `tools/*.js` son CommonJS (`require`); el server también es CommonJS, por eso la raíz **no** declara `"type": "module"`. La config de Vite es `vite.config.ts` (la transpila el propio Vite, no Node).

## Arquitectura — invariantes que NO se deben romper

**Servidor autoritativo a 60 fps; el cliente es solo render.** Toda la física, colisiones, cooldowns, puntuación y condición de victoria viven en `server/` (repartido en módulos: `sim/`, `entities/`, `rooms/`, `ai/` — ver «Servidor: módulos y TypeScript»). El cliente (`client/src/game.js`) solo envía inputs (~30/s), interpola el estado recibido y dibuja. **Nunca muevas lógica de juego (física, daño, validación) al cliente** — es la superficie anti-trampa. Los muertos no actúan, una nave apagada por EMP no se mueve, todos los cooldowns se validan en servidor.

**La IA reutiliza la simulación.** Los bots son jugadores normales con `isBot`; una rutina de IA en el servidor fija su `input` y luego corre la misma física que un humano. No hay código de bot en el cliente. El sistema de oleadas (`WAVES` + `manageWaves`) es el mismo en Co-op multijugador y práctica en solitario.

**Configuración en caliente.** `server/config.js` exporta el objeto `CFG` que el game loop lee **cada tick**. `DEFAULTS` (en `config.js`) se fusiona con `config.json` mediante `deepMerge` (los objetos anidados se mergean, los arrays como `WAVES` se reemplazan enteros). El panel admin (`:8081`, sirve `admin.html`) hace `POST /config`, escribe `config.json` y los cambios se aplican **inmediatamente a las partidas en curso** sin reiniciar. → Si añades una variable de juego, declárala en `DEFAULTS` y se editará automáticamente desde el panel.

**Estado en memoria.** No hay base de datos. Las salas viven en RAM y se pierden al reiniciar — comportamiento esperado.

## Sincronización servidor ↔ cliente (puntos frágiles)

Hay datos de naves duplicados a propósito en dos ficheros que **deben mantenerse coherentes**:

- `server/config.js` → `SHIP_TYPES`: stats, física, escudos, `collider` (cápsula de colisión), `turretHardpoints`.
- `client/src/game.js` → `SHIP_SHAPES`: geometría de dibujo en canvas, incluido `turretHardpoints` para las torretas.

Los `turretHardpoints` de la Capital deben coincidir entre ambos: el servidor calcula desde dónde salen las balas, el cliente dibuja la torreta ahí. Si divergen, las balas salen de un punto distinto al visible.

El **modelo de colisión** es una cápsula: segmento proa→popa (`collider.front`/`rear`) + `radius`. Los proyectiles usan trayectoria barrida del tick (anti-tunneling). EMP/minas/explosiones usan distancia radial. El rayo de la Capital es hitscan instantáneo (los `beams` en el estado son solo efecto visual; el daño ya se aplicó).

El **protocolo de mensajes** cliente↔servidor (campos `type` en ambos sentidos, contenido de `state`) está tabulado en el README sección "Arquitectura Técnica Detallada". Si añades un mensaje nuevo entrante, manéjalo en `server/net/handlers.ts` (el `switch` de mensajes) y en el receptor de `game.js`; si cambias el `state` que se difunde, edítalo en `server/net/serialize.ts` (`buildState`) y avisa al worktree del frontend.

El **WebSocket usa el path `/ws`** (no la raíz): el servidor monta `new WebSocket.Server({ server, path: "/ws" })` (en `server/net/wsServer.ts`) y el cliente conecta a `…/ws`. Es necesario para no chocar con el socket de HMR de Vite en dev y para que el proxy del dev server distinga el tráfico del juego. No conectes a la raíz.

## Cliente: React + TypeScript (strangler)

El cliente vive en `client/src/` y son **ES modules**. La migración de la UI vanilla a React es **incremental** (*strangler*): React y el motor de juego legacy (`game.js`) **conviven** durante la transición.

- **Entrada:** `client/index.html` (en la raíz del *Vite root* `client/`) carga un único `<script type="module" src="/src/main.tsx">`. `main.tsx` monta React (`StrictMode` + `BrowserRouter`) en `#root`, importa los CSS (`index.css` + `styles.css`) e **importa `game.js`**, que se auto-ejecuta y captura por `id` el markup que sigue en `index.html`.
- **Router (`App.tsx`):** mapea cada pantalla del menú a una ruta. `game.js` emite `CustomEvent("menu-screen", {detail})` al cambiar de pantalla y `App` refleja la URL; emite `CustomEvent("open-controls")` para abrir el overlay de controles. **Solo `/` (`MainMenu`) está migrado a React**; lobby/solo/room siguen en `game.js`. Este par de eventos es el **puente legacy↔React** — al migrar una pantalla nueva, añade su ruta aquí y emite el evento desde `game.js`.
- **i18n:** `i18n.js` (legacy, `i18nt`/`getLang`/`setLang`/`onLangChange`) es la fuente única; los componentes React se suscriben vía el hook `hooks/useI18n.ts`. No dupliques traducciones en React — usa el hook.
- **CSS:** `index.css` carga **Tailwind v4 sin preflight** (solo capas `theme` + `utilities`) para no pisar el CSS legacy; `styles.css` es la UI legacy del juego. Cuando todo sea React podrá reactivarse el preflight.
- **Módulos legacy:** `game.js` importa `i18n.js`, `particles.js` y `sounds.js`, que exportan su superficie con un `export { … }` al final. Al añadir una función que `game.js` deba usar de esos módulos, **añádela al `export` del módulo y al `import` de `game.js`** (si no, `ReferenceError` en runtime).

`admin.html` vive en `client/` y es una segunda entrada de Vite (multi-page, ver `vite.config.ts`). Es autocontenido (script inline, sin assets externos) y hace `fetch("/config")`; en dev el proxy de Vite lo redirige a `:8081`, en prod lo sirve el servidor admin desde `dist/admin.html`.

## Servidor: módulos y TypeScript

El servidor está troceado por responsabilidad y escrito en **TypeScript sobre CommonJS**. `server/server.js` (el entry) y `server/config.js` se mantienen en `.js`; **el resto son `.ts`**.

```
server/
  server.js            # entry / composition root: arranca admin + juego + loop (.js)
  config.js            # DEFAULTS + carga/merge/persistencia de config.json; exporta CFG (.js)
  types.d.ts           # tipos de dominio AMBIENTE (Player, Room, Bullet, Missile, Asteroid…)
  constants.ts         # FPS, WORLD_PRESETS, MAX_PLAYERS, BOT_NAMES
  state.ts             # estado en RAM: rooms, clients (se MUTAN, nunca se reasignan)
  net/
    wsServer.ts        # servidor HTTP del juego + WebSocketServer (/ws) + ciclo de conexión
    handlers.ts        # handleMessage(ws, player, msg): el switch de mensajes entrantes
    serialize.ts       # buildState(room): el objeto `state` que se difunde cada tick
    broadcast.ts       # send / broadcastRoom / broadcastRoomList
  rooms/
    rooms.ts           # createRoom, joinRoom, roomList, removeFromRoom, crew (gunners)
    lifecycle.ts       # startGame, restartRoom
  sim/
    loop.ts            # update() (orquestador de fases) + startLoop() (setInterval)
    physics.ts         # math pura: distToSegment, segToSegDist, shipCapsule, isSheltered
    movement.ts        # stepPlayers: input, EMP, fuel, integración
    collisions.ts      # collideAsteroids, stepBullets, stepMissiles (swept/anti-tunneling)
    effects.ts         # stepEffects: minas, beams, ondas EMP, bengalas
    weapons.ts         # fireCapitalBeam, fireEmpPulse, dropMine, steerMissile
  entities/
    player.ts          # createPlayer, applyShipStats, applyDamage, killPlayer…
    spawn.ts           # spawnPos, spawnSafePos, createAsteroids
  ai/
    ai.ts              # computeBotAI, makeBot, helpers de IA
    waves.ts           # spawnWave, manageWaves, WAVES, TEAM_LIVES
  admin/
    adminServer.ts     # servidor HTTP del panel admin (PORT+1): GET/POST /config
```

Reglas al trabajar aquí:

- **TypeScript sin build.** Node 24 ejecuta los `.ts` borrando los tipos (*type stripping*). Solo **sintaxis borrable**: nada de `enum`, `namespace`, parámetros-propiedad ni decoradores que emitan (el `tsconfig.server.json` activa `erasableSyntaxOnly` para detectarlo). `pnpm run typecheck` (`tsc -b`) valida; Node no chequea, solo borra.
- **Sigue siendo CommonJS:** `require()` / `module.exports`, no `import`/`export`. Por eso no hay `"type": "module"`.
- ⚠️ **`require()` a un módulo `.ts` necesita la extensión `.ts` explícita** (`require("./physics.ts")`); los `.js` (config.js) se resuelven sin extensión. Si conviertes/añades un módulo `.ts`, los `require` que lo apunten llevan `.ts`.
- **Tipos de dominio en `types.d.ts`** (ambiente, sin `import`/`export` → globales): usa `Player`, `Room`, `Bullet`, etc. sin importarlos. Como los módulos se importan con `require()`, TS ve los límites entre módulos como `any` (el tipado vive *dentro* de cada módulo y en estos shapes).
- **Estado compartido:** `rooms` y `clients` viven en `state.ts` y se mutan; nunca se reasignan (la referencia compartida debe permanecer estable). Hay **un único ciclo** de `require` (`rooms` ↔ `broadcast`) resuelto con un `require` perezoso dentro de `broadcastRoomList`.

## Ficheros

| Fichero | Rol |
|---|---|
| `vite.config.ts` (raíz) | Config de Vite 8: `root: client`, plugins React + React Compiler (Babel) + Tailwind v4, multi-page (index + admin), `outDir: dist`, proxy `/ws` y `/config` para dev |
| `tsconfig.json` (raíz) | *Solution tsconfig*: `files: []` + `references` a `app`/`node`/`server`. `tsc -b` lo usa de raíz |
| `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.server.json` | Proyectos referenciados: cliente (`client/src`, JSX), `vite.config.ts`, y server (`server/**/*.ts`) respectivamente |
| `server/server.js` (~2.5k líneas) | Servidor autoritativo: física, colisiones, salas, timer, IA, oleadas, ambos servidores HTTP. Sirve `dist/` en prod |
| `server/config.js` | `DEFAULTS` + carga/merge/persistencia de `config.json`; exporta `CFG` |
| `client/index.html` | Juego. Entrada Vite principal (en la raíz del *Vite root* `client/`); carga `/src/main.tsx` como módulo |
| `client/admin.html` | Panel admin (`:8081`). Segunda entrada Vite (en `client/`); autocontenido, `fetch("/config")` |
| `client/src/main.tsx` | **Entrada del cliente:** monta React (`BrowserRouter`) en `#root`, importa los CSS y arranca `game.js` (strangler) |
| `client/src/App.tsx` | Router React: mapea pantallas (`menu-screen`) a rutas; overlay de controles (`open-controls`). Solo `/` migrado |
| `client/src/ui/*.tsx` | Componentes React migrados (`MainMenu`, `ControlsScreen`) |
| `client/src/hooks/useI18n.ts` | Hook que suscribe componentes React al idioma de `i18n.js` (`t`, `lang`, `setLang`) |
| `client/src/index.css` | Tailwind v4 **sin preflight** (capas theme + utilities) para convivir con el CSS legacy |
| `client/src/game.js` (~4.5k líneas) | Motor de juego legacy (importado por `main.tsx`): WebSocket, render loop, input, menús legacy, `SHIP_SHAPES`; importa i18n/particles/sounds |
| `client/src/particles.js` | Campo de estrellas + sistema de partículas (módulo) |
| `client/src/sounds.js` | Música y SFX procedurales (Web Audio API, sin assets) (módulo) |
| `client/src/i18n.js` | Traducciones ES/EN; `i18nt("key", {vars})` + `data-i18n` en el DOM. Los textos con teclas de control se componen en `game.js` con `bindingText()`, no aquí |
| `client/src/styles.css` | UI legacy del juego. Convención: unidades **rem**, texto **≥ 16px** |
| `tools/ship-editor.html` | Editor visual de formas de nave |
| `tools/ship-presets.js` | **Auto-generado** desde `SHIP_SHAPES` por `gen-presets.js` (CommonJS) — no editar a mano |
| `dist/` | Salida de `vite build` (gitignored); servida por `server.js` en prod |

## Idioma

El proyecto está documentado y comentado en español. El cliente es bilingüe ES/EN vía `i18n.js`; al añadir texto de UI, usa claves `i18nt(...)` (o `data-i18n` en el HTML) y entradas en ambos idiomas en `I18N`.

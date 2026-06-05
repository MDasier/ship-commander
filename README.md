# Ship Commander

> **Beta** — Combate espacial multijugador en tiempo real para el navegador, inspirado en el dogfighting en equipo de Star Citizen.

Vuela, dispara y coordina con tu equipo directamente en el navegador. **Sin instalaciones, sin plugins, sin cuentas** — abre el cliente y al combate.

**Lo esencial:**
- 🛰 **Multijugador en tiempo real** con servidor autoritativo a 60 fps
- 🚀 **6 naves** con armas, habilidades y roles distintos, incluidas **naves multitripuladas**
- 🤝 **3 modos**: PvP por equipos, Co-op vs IA por oleadas y práctica en solitario
- 🤖 **IA de combate** con oleadas escaladas hasta un jefe Capital
- 🎛 **Panel de configuración en vivo** para ajustar todas las variables del juego
- 🎨 Render Canvas 2D y **audio 100% procedural**, sin assets externos

---

## Tabla de contenidos

- [Características](#características)
- [Modos de juego](#modos-de-juego)
- [Naves de Combate](#naves-de-combate)
- [Stack Tecnológico](#stack-tecnológico)
- [Inicio rápido](#inicio-rápido)
- [Controles](#controles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Arquitectura Técnica Detallada](#arquitectura-técnica-detallada)

---

## Características

### Gameplay
- **Combate por equipos** — Verde vs Rojo, hasta 6 jugadores por sala
- **Servidor autoritativo** — toda la física y las colisiones se ejecutan en el servidor; sin trampas desde el cliente
- **6 tipos de nave** con stats y armas diferenciados (ver sección Naves)
- **Naves multitripuladas** — Gunship (2) y Capital (4) llevan artilleros que controlan torretas independientes
- **Misiles guiados** con guía proporcional, selección de objetivo con retículo de lock y contramedidas de bengala
- **Asteroides** como terreno con daño por colisión y cobertura (rompen la línea de visión y el lock)
- **Sistema de combustible** — regeneración pasiva lenta; empuje y retroceso consumen fuel
- **Autodestrucción** — mantén Supr 2 s para iniciar cuenta atrás de 5 s; Supr de nuevo cancela
- **Límite de tiempo** configurable por partida (por defecto 3 minutos)

### Modos de juego

El menú principal permite elegir cómo jugar:

| Modo | Descripción | Vidas |
|---|---|---|
| **PvP por equipos** | Verde vs Rojo. Al acabar el tiempo gana el equipo con más supervivientes, más bajas o empate. | **Reaparición infinita** hasta que acaba el tiempo |
| **Co-op vs IA (oleadas)** | Todos los jugadores en un equipo contra oleadas de naves controladas por IA, cada vez más difíciles hasta el jefe (Capital). El host lo activa con un interruptor en el lobby. La dificultad **escala con el número de jugadores**. | **3 vidas compartidas** de equipo |
| **Práctica en solitario** | Sala privada para un jugador. Submodo **Vuelo libre** (escenario vacío para practicar controles y armas) o **Oleadas** (las mismas rondas de IA en solitario). Duración, tamaño de escenario y nave configurables. | Vuelo libre: infinitas · Oleadas: 3 |

> En modo **Oleadas** se muestra en el HUD la oleada actual, los enemigos restantes y las vidas de equipo. Al superar la última oleada: *"¡OLEADAS SUPERADAS!"*; si el equipo agota sus vidas: *"HAS CAÍDO"*.

### Multijugador y Salas
- **Menú principal** — punto de entrada con: Buscar partidas, Práctica en solitario, Ver controles y Apoyar el proyecto
- Lobby con creación de sala, unirse, cambio de equipo y sistema de listo
- **Opciones de host** — tamaño de escenario, equipos equilibrados, unirse en partida y **Co-op vs IA**
- **Reinicio de sala** — el host puede reiniciar la partida sin disolver la sala
- **Reconexión automática** — si se pierde la conexión con el servidor, se muestra un overlay y se reintenta conectar sin recargar manualmente
- Nombres de piloto con persistencia vía `localStorage` y confirmación visual al guardar
- **Chat en partida** — pulsa Enter, escribe, Enter para enviar

### Naves de Combate

Los stats salen directamente de `server/config.js` (`SHIP_TYPES`). Velocidad/giro son multiplicadores sobre los valores base (`THRUST`, `TURN_RATE`).

| Nave | HP | Escudo | Velocidad | Giro | Misiles | Firma radar | Tripulación |
|---|---|---|---|---|---|---|---|
| **Interceptor** | 50 | 35 | +55% | +65% | 3 | Muy baja (700) | 1 |
| **L.Fighter** | 100 | 50 | base | base | 6 | Normal (1000) | 1 |
| **Bomber** | 300 | 120 | −40% | −45% | 12 | Alta (2000) | 1 |
| **Gunship** | 600 | 250 | −70% | −80% | 4+20 | Muy alta (5000) | 2 |
| **Capital** | 1500 | 500 | −82% | −90% | 6 | Máxima (9000) | 4 |
| **Disruptor** | 50 | 30 | base | base | 4 (torpedos) | Ínfima (150) | 1 |

**Armas y habilidades por nave:**

- **Interceptor** — cañón estándar + misiles. Habilidad **[X]: suelta minas** que explotan al pasar un enemigo cerca (hasta 4 activas, solo visibles para tu equipo). Cada mina muestra un **temporizador circular** de vida y el HUD lleva un indicador de las 4 ranuras con su tiempo restante.
- **L.Fighter / Bomber** — cañón estándar + misiles guiados. El Bomber es un tanque lento con muchos misiles.
- **Gunship** — cañón del piloto + **1 torreta de artillero** independiente. Necesita un 2.º jugador para tripular la torreta.
- **Capital** — **sin cañón normal**; su arma principal es un **rayo de carga** ([clic]/[E] mantener ~1,25 s y soltar): hitscan muy potente (150 dmg) con efecto de impacto propio (nodo de energía + chispas eléctricas azul/blancas). Soltar el rayo por mouseleave/perder el foco lo **cancela** (no dispara). Lleva además **3 torretas** para 3 artilleros.
- **Disruptor** — **sigilo extremo** (casi invisible en radar). Cañón débil (8 dmg) + **4 torpedos** (misil más grande, 90 dmg). Habilidad **[X]: pulso EMP en área** que *apaga* a los enemigos cercanos (motor + armas) durante 2-4 s.

La **firma radar** determina a qué distancia los enemigos pueden verte en el radar y el HUD: el Disruptor y el Interceptor son casi invisibles hasta tenerlos encima; el Capital se detecta desde lejísimos. En el selector de naves, la barra **FIR** (firma) refleja esta señal.

**Artilleros (torreteros).** En las naves multitripuladas (Gunship, Capital) un segundo jugador puede embarcarse como artillero y controlar una torreta independiente:
- En el **lobby**, desde la lista de jugadores (plazas de torreta libres).
- **En partida**, un jugador muerto puede elegir **reaparecer directamente en una torreta** aliada libre desde el panel de muerte.
- Al reaparecer (tecla `R`) sin torreta reservada, el artillero es eyectado como caza independiente.

Cada nave tiene una geometría canvas distinta definida en `client/game.js` (`SHIP_SHAPES`): aguja (Interceptor), delta (L.Fighter), ala volante (Bomber), casco ancho (Gunship), silueta alargada tipo Idris (Capital) y triángulo ancho y corto con el pico en la proa (Disruptor).

### HUD y UI
- HP / Escudo / Combustible / Velocidad / K/D / Cooldown de misil en tiempo real
- **Retículo de objetivo** — al lockear, un retículo estilo space-sim sobre el enemigo (anillo giratorio, corchetes de esquina y distancia). El lock se pierde automáticamente al morir, al esconderse el objetivo tras un asteroide o al romperse la línea de visión
- **Indicador de habilidad [X]** — muestra `LISTO` o el cooldown restante del EMP (Disruptor) o la mina (Interceptor); suena un blip al quedar lista
- **Temporizador de minas** — hasta 4 ranuras con anillo de carga circular y segundos restantes (Interceptor)
- **Carga del rayo** (Capital) — orbe de energía en la proa con anillo de progreso y aviso eléctrico al estar listo; aviso "⚡ SISTEMAS APAGADOS" cuando un EMP te deja a la deriva
- **HUD de oleadas** (modo Co-op / Práctica oleadas) — oleada actual, enemigos restantes, **vidas de equipo** (♥) y banner central al iniciar cada ronda
- **Contador de partida** centrado en la parte superior (naranja en el último minuto, rojo parpadeante en los últimos 15 s)
- **Kill feed** — con color de equipo, icono de arma, desaparece a los 5 s
- **Modo espectador** — sigue a jugadores vivos con Tab tras morir
- **Panel de muerte** — selector de nave para reaparecer, opción de **entrar de artillero** en una torreta aliada y botón de **salir al lobby**; indica reapariciones (∞ en PvP, vidas de equipo en oleadas)
- **Overlay de reconexión** — pantalla central cuando se pierde la conexión, con reintento automático
- **MobiGlass** (F1) inspirado en Star Citizen:
  - *PILOTO* — barras de integridad estructural, cuadrícula de stats, cooldown de misil
  - *PARTIDA* — marcador por equipo, jugadores vivos y botón de **salir al lobby**
  - *CONTROLES* — referencia completa de teclas (reasignables)
  - *AJUSTES* — botón mute, sliders independientes de **volumen de efectos** y **música**, y selector de **pista de música** (A ambiental / B con más presencia); todo guardado en localStorage

### Configuración en tiempo real
Un servidor HTTP independiente en el **puerto 8081** expone un panel admin web donde se pueden modificar todas las variables de juego sin reiniciar el servidor:

- Duración de partida
- Física de nave (empuje, giro, drag, regeneración de fuel)
- Stats por tipo de nave (`SHIP_TYPES`: HP, multiplicadores, escudo, firma radar, collider…)
- Balas (velocidad, cooldown, daño, radio)
- Misiles y **torpedos** (velocidad, vida, giro, daño, radio)
- **Rayo de la Capital** (daño, tiempo de carga, alcance, anchura)
- **EMP** (radio del pulso, cooldown, duración del apagado) y **minas** (cooldown, radio de disparo/explosión, daño, vida)
- Bengalas (duración, radio, cooldown)
- **IA / Dificultad** (modo oleadas) — velocidad, agilidad de giro, error de puntería y cadencia de disparo de los bots
- Asteroides (umbral de impacto, factor de daño)

Los cambios se aplican **inmediatamente** a las partidas en curso y se persisten en `server/config.json`.

### Visuals y Audio
- Campo de estrellas con parallax (3 capas de profundidad)
- Explosiones de partículas (coloreadas por equipo) y estela de empuje
- Screen shake al recibir daño o explosiones cercanas
- Flash de impacto en naves dañadas
- Misiles alargados con brillo de escape
- Rayo de la Capital con haz, halo y chispas, y **efecto de impacto propio** (nodo de energía + descarga eléctrica azul/blanca en la nave golpeada, distinto del EMP)
- Pulso EMP (onda roja), minas con temporizador y explosiones de partículas
- Audio procedural via **Web Audio API** (sin archivos externos):
  - **2 pistas de música** seleccionables (A: drone ambiental con pings; B: **Lo-Fi Chill arcade** — pad de acordes con warble de cinta, beat boom-bap relajado, bajo, melodía dispersa y crujido de vinilo)
  - Bus de audio: fuentes → (música | efectos) → mute → salida, con volúmenes independientes
  - SFX: cañón, explosión, lanzamiento de misil, alarma de misil entrante, pitidos de autodestrucción, carga/disparo del rayo, EMP, blip de habilidad lista

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Servidor | Node.js + librería WebSocket [`ws`](https://github.com/websockets/ws) |
| Cliente | JS vanilla, Canvas HTML5 |
| Renderizado | Canvas 2D API |
| Audio | Web Audio API |
| Estilos | CSS (sin frameworks) |
| Build | [Vite 8](https://vite.dev) (bundler Rolldown) — empaqueta el cliente |

Sin librerías de terceros **en tiempo de ejecución** en el cliente (el bundle es JS vanilla). La única dependencia de runtime es `ws` en el servidor; Vite es solo una `devDependency` de build.

---

## Inicio rápido

### Requisitos
- Node.js **24.16+ (LTS)** — requerido por Vite 8
- **pnpm** (gestor de paquetes del proyecto; fijado en `packageManager`)

### Instalar

Un único `package.json` en la raíz cubre cliente (Vite) y servidor (`ws`):

```bash
pnpm install
```

### Desarrollo (con HMR)

Vite sirve el cliente con recarga en caliente y hace de proxy del WebSocket y del panel admin hacia el servidor. Necesita **dos terminales**:

```bash
pnpm run dev:server   # node server/server.js → :8080 (juego+WS) y :8081 (admin)
pnpm run dev:client   # Vite + HMR → http://localhost:5173
```

Abre `http://localhost:5173`. Abre varias pestañas para probar el multijugador.

### Producción

```bash
pnpm run build        # vite build → dist/
pnpm start            # node server/server.js sirve dist/ en :8080
```

Abre `http://localhost:8080`. El servidor sirve el build de `dist/` directamente — no hace falta servidor web aparte.

### Panel de configuración

Panel admin para modificar cualquier variable de juego en tiempo real (los cambios se guardan en `server/config.json`):
- **Producción:** `http://localhost:8081`
- **Desarrollo:** `http://localhost:5173/admin.html` (Vite hace de proxy de `/config` hacia `:8081`)

---

## Controles

| Tecla | Acción |
|---|---|
| `W` | Empuje adelante |
| `S` | Empuje atrás (más lento) |
| `Mouse` | Apuntar / Girar nave |
| `A` / `D` | Strafe |
| `Clic izq.` / `E` | Disparar cañón · **mantener para cargar el rayo** (Capital) |
| `Clic der.` | Ciclar / lockear objetivo |
| `Q` | Lanzar misil o torpedo (requiere objetivo) |
| `F` | Lanzar bengala (contramedida anti-misil) |
| `X` | Habilidad especial — pulso **EMP** (Disruptor) / soltar **mina** (Interceptor) |
| `Z` | Alternar inercia (DAMP / DRIFT) |
| `C` | Escaneo de radar |
| `Tab` | Marcador (mantener) · ciclar cámaras de espectador al morir |
| `R` | Reaparecer tras morir |
| `Enter` | Abrir chat |
| `Supr` | Autodestrucción (mantener 2 s → cuenta atrás 5 s · Supr cancela) |
| `F1` | Abrir / cerrar MobiGlass |

> Todas las teclas (salvo `Tab`, `F1`, `Supr`, `Esc`) son reasignables desde MobiGlass → *CONTROLES* y se guardan en `localStorage`.

---

## Estructura del Proyecto

```
ship-commander/
├── vite.config.mjs     # Config de Vite 8 (root: client, multi-page, proxy /ws y /config)
├── package.json        # Único: cliente (vite) + servidor (ws); scripts, engines, packageManager (pnpm)
├── pnpm-lock.yaml      # Lockfile (commiteado)
├── client/             # ← empaquetado por Vite (ES modules)
│   ├── index.html      # Entrada principal: menú, lobby, práctica, HUD, MobiGlass… carga /game.js como módulo
│   ├── admin.html      # Panel admin (2.ª entrada Vite); autocontenido, fetch("/config")
│   ├── game.js         # Entrada ES module: WebSocket, render loop, input, menús; importa i18n/particles/sounds
│   ├── i18n.js         # Traducciones ES/EN (módulo)
│   ├── particles.js    # Campo de estrellas, sistema de partículas (módulo)
│   ├── sounds.js       # Música y SFX procedurales — Web Audio API (módulo)
│   └── styles.css      # Todos los estilos UI (convención: unidades rem, texto ≥ 16px)
├── server/             # ← Node + ws (sin package.json propio; usa el de la raíz)
│   ├── server.js       # Servidor autoritativo — física, colisiones, salas, timer, IA, oleadas. Sirve dist/ en prod
│   ├── config.js       # Carga y exporta la configuración (con defaults y persistencia)
│   └── config.json     # Valores personalizados (generado automáticamente al guardar)
├── tools/              # Utilidades CommonJS (editor de naves, generador de presets)
└── dist/               # Salida de `vite build` (gitignored)
```

---

## Notas de Arquitectura

- **Servidor autoritativo a 60 fps** (`const FPS = 60`) — los clientes solo envían inputs; el servidor ejecuta toda la física, detección de colisiones, cooldowns, condición de victoria, puntuación y atribución de bajas.
- **El cliente es solo render** — recibe el estado del servidor, interpola y gestiona efectos locales (partículas, sonido, temporizador de autodestrucción). No predice física.
- **IA reutiliza la simulación** — los bots son jugadores normales (`isBot`) cuyo `input` lo fija una rutina de IA en el servidor; reaprovechan toda la física, colisiones y render sin código especial en el cliente.
- **Sistema de oleadas desacoplado** — un conjunto de rondas escaladas (`WAVES`) y un gestor (`manageWaves`) controlan la aparición de bots, los intermedios y el resultado; se usa igual en Co-op multijugador y en práctica en solitario.
- **Reglas de vidas por modo** — PvP/vuelo libre: reaparición infinita hasta el tiempo; oleadas: pool compartido de vidas de equipo (`teamLives`).
- **Superficie anti-trampa** — todos los cooldowns y validaciones viven en el servidor: los muertos no actúan, una nave apagada por EMP no se mueve ni dispara, el cañón/EMP/mina/torpedo respetan su cooldown, los nombres se sanean y solo el host reinicia.
- **Resiliencia de conexión** — al caer el WebSocket, el cliente muestra un overlay y reintenta la conexión automáticamente.
- **Configuración en caliente** — los valores de `CFG` se leen cada tick; cambiar un valor en el panel admin se aplica inmediatamente sin reiniciar el servidor ni las partidas.

---

## Arquitectura Técnica Detallada

Esta sección explica cómo fluye la información entre cliente y servidor para que otros desarrolladores puedan entender el proyecto rápidamente.

### Diagrama de flujo general

```
[NAVEGADOR - Cliente]                    [NODE.JS - Servidor]
        │                                         │
        │   WebSocket (ws://<host>:8080)          │
        │◄────────────────────────────────────────│
        │────────────────────────────────────────►│
        │                                         │
  Canvas render loop (60+ fps)           Game loop (60 fps)
  Input → JSON (~30/s, cada 33ms)        Física, colisiones, cooldowns
  Interpolación + efectos locales        Estado autoritativo (broadcast cada tick)
```

### Conexión WebSocket

El servidor (`server/server.js`) inicia un servidor HTTP en el puerto **8080** que también sirve los archivos estáticos del cliente. Encima de ese mismo servidor HTTP se monta el servidor WebSocket (`ws`):

```js
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", ws => { /* nuevo jugador */ });
```

El cliente (`client/game.js`) abre la conexión al cargar la página, eligiendo `ws://` o `wss://` según el protocolo:

```js
const _wsProto = location.protocol === "https:" ? "wss:" : "ws:";
const _wsHost  = location.hostname ? location.host : "localhost:8080";
const ws = new WebSocket(_wsProto + "//" + _wsHost);
```

### Mensajes cliente → servidor

El cliente envía objetos JSON con un campo `type`. Los principales son:

| `type` | Cuándo | Contenido adicional |
|---|---|---|
| `getRooms` | Al entrar al lobby | — |
| `setName` | Al guardar el nombre | `name` |
| `createRoom` | Botón "Crear sala" | — |
| `startSolo` | Botón "Empezar práctica" | `mode` (`"waves"`/`"free"`), `size`, `durationS`, `shipType` |
| `joinRoom` | Botón "Unirse" | `roomId` |
| `leaveRoom` | Botón "Salir" / "Volver al lobby" | — |
| `setWorldSize` | Host, en lobby | `size` |
| `setRoomName` | Host, en lobby | `name` |
| `toggleEnforceBalance` | Host, en lobby | — |
| `toggleCoop` | Host, en lobby | — (modo Co-op vs IA) |
| `toggleMidGameJoin` | Host, en partida | — |
| `ready` | Botón "Listo" | — |
| `switchTeam` | Botón "Cambiar equipo" (bloqueado en Co-op) | — |
| `selectShip` | Clic en carta de nave (lobby o panel de muerte) | `shipType` |
| `boardShip` | Embarcar como artillero (lobby o, muerto, en partida) | `targetId` |
| `leaveShip` | Salir como artillero | — |
| `input` | Cada 33 ms mientras se juega | `thrust`, `reverse`, `strafeLeft`, `strafeRight`, `targetAngle`, `inertiaDamp` |
| `shoot` | Clic izq. / `E` | — (ignorado en Capital, que usa el rayo) |
| `beamCharge` | Capital: pulsar/soltar disparo | `charging` (bool), `cancel` (bool) — dispara solo al soltar a tope sin cancelar |
| `special` | Tecla `X` | — (EMP en Disruptor / mina en Interceptor) |
| `missile` | Tecla `Q` | `targetId` (torpedo si la nave es Disruptor) |
| `flare` | Tecla `F` | — |
| `respawn` | Tecla `R` tras morir | — |
| `selfDestruct` | `Supr` ×2 s | — |
| `restartGame` | Host, en Game Over (no en práctica) | — |
| `chat` | Enter, escribe, Enter | `text` |

### Mensajes servidor → cliente

El servidor hace **broadcast** a todos los clientes de una sala usando `broadcastRoom()`. Los mensajes son:

| `type` | Cuándo | Qué contiene |
|---|---|---|
| `init` | Al conectar | `id` (UUID del jugador), `ships` (`SHIP_TYPES` con stats) |
| `rooms` | Al pedir lista / cambios | Array de salas disponibles |
| `roomUpdate` | Cambio en la sala (equipo, nave, listo…) | Objeto `room` completo |
| `roomRestarted` | El host reinicia | Objeto `room` |
| `balanceError` | Equipos desbalanceados al dar Listo | `green`, `red` |
| `gameStarted` | Todos listos | — |
| `state` | Cada tick (60 fps) | ver abajo |
| `chat` | Mensaje de chat | `name`, `team`, `text` |

El mensaje `state` contiene el mundo completo cada tick:

```
players, bullets, missiles, beams, empPulses, mines, flare, asteroids,
winner, killFeed, timeLeft, world,
solo, waveMode, wave, waveTotal, enemiesLeft, waveBanner, teamLives
```

- `players` — mapa de jugadores y **bots** (posición, ángulo, hp, escudo, cooldowns, `beamCharge`, `beamHit`, `emp`, `empDisabled`, `empCooldown`, `mineCooldown`…). Los bots de IA son jugadores normales con `isBot`.
- `beams` — rayos de la Capital (solo efecto visual; el daño ya se aplicó). Cada uno con `id` y `hit` para el efecto de impacto en cliente.
- `empPulses` — ondas EMP y explosiones de mina (visual, con `blast` para distinguir).
- `mines` — minas activas con `life`/`maxLife` y `arm`/`maxArm` para el temporizador (el cliente solo dibuja las de su propio equipo).
- **Campos de oleadas** — `solo`, `waveMode`, `wave`/`waveTotal`, `enemiesLeft`, `waveBanner` (texto temporal) y `teamLives` (vidas compartidas; `null` cuando el respawn es infinito).

### Game loop del servidor

`setInterval(update, 1000 / FPS)` con `FPS = 60` — se ejecuta cada ~16,6 ms y, por cada sala en juego:

1. **Jugadores** — por cada jugador vivo:
   - Si es un **bot de IA** (`isBot`): calcula su `input` (persigue al humano más cercano, orbita a distancia de combate y dispara cañón/misiles cuando está alineado; la Capital carga y suelta el rayo) antes de aplicar la física.
   - Si es **artillero**: sincroniza posición/ángulo con el piloto y fija el ángulo de su torreta (la Capital guarda un ángulo por artillero en `turretAngles`).
   - Decrementa cooldowns (misil, bala, EMP, mina) y temporizadores **EMP** (`empTimer` visual, `empDisableTicks` de apagado).
   - **Carga del rayo** (Capital): si `beamCharging`, acumula `beamChargeTicks` y publica `beamCharge` (0..1).
   - **Recarga de escudo** (pausada si la nave está apagada por EMP).
   - **Movimiento**: rotación hacia `targetAngle`, empuje/retroceso/strafe (consumen fuel). Si está **EMP-apagada**, se ignora el input y la nave queda a la deriva.
   - Inercia/drag (DAMP frena al soltar; DRIFT conserva la velocidad), clamp al mundo y **colisión con asteroides** (rebote + daño por velocidad de impacto).
2. **Balas** — mueven, se descartan fuera del mundo y se prueban con un **test barrido** contra la **cápsula** de cada nave enemiga; aplican `damage` (por nave, p. ej. 8 en el Disruptor).
3. **Misiles / torpedos** — posible seducción por bengala, guía proporcional (`steerMissile`) y movimiento; colisión por cápsula. Los **torpedos** usan mayor radio y daño (90 vs 40).
4. **Rayo de la Capital** — es **instantáneo** (hitscan) al dispararse; aquí solo decae su efecto visual (`beams`).
5. **Ondas EMP** (`empPulses`) — decaen (visual); el apagado se aplicó al lanzar el pulso.
6. **Minas** — se arman, expiran y, al entrar un enemigo en su radio de disparo, **explotan** con daño en área que decae con la distancia.
7. **Bengalas** — decaen por vida.
8. **Oleadas** (solo modo Co-op / práctica): `manageWaves()` gestiona la progresión — aparición de la siguiente ronda tras un intermedio, victoria al superar todas, derrota al agotar las vidas de equipo, y limpieza de bots muertos. La dificultad de cada ronda escala con el número de jugadores.
9. **Timer** y **condición de victoria** — en PvP normal gana, al acabar el tiempo, el equipo con más supervivientes/bajas (o empate); el respawn es infinito. En oleadas, el resultado lo decide `manageWaves()`.
10. **Broadcast** — envía el estado completo a todos los clientes de la sala.

### Modelo de colisiones

Cada nave se modela como una **cápsula**: un segmento de proa a popa (`collider.front`/`rear`) más un radio (`collider.radius`), rotado por el ángulo de la nave. Los proyectiles usan su trayectoria barrida del tick (anti-tunneling) y se comparan con `segToSegDist(trayectoria, eje de la nave) < radioNave + radioProyectil`. El rayo de la Capital es un rayo recto que impacta a la nave enemiga más cercana (bloqueado por asteroides). EMP, minas y explosiones usan distancia radial.

### Interpolación en el cliente

El cliente mantiene un buffer `stateBuffer` con los últimos estados recibidos y renderiza con un pequeño retardo (`INTERP_DELAY`). En cada frame de `requestAnimationFrame` **interpola** linealmente la posición y el ángulo de los jugadores entre los dos estados que rodean al instante de render; las balas y misiles se **extrapolan** según los ticks transcurridos.

En cambio, `asteroids`, `beams`, `empPulses` y `mines` se aplican de forma **inmediata** (sin interpolación), porque son terreno o efectos breves. Las ondas EMP y explosiones de mina se reproducen con sonido solo la primera vez que aparece cada `id`.

### Panel admin (puerto 8081)

Un servidor HTTP independiente en `server.js` sirve `admin.html` en el puerto 8081. El panel hace `GET /config` al cargar y `POST /config` al guardar. El servidor escribe los cambios en `server/config.json` y los aplica en el mismo objeto `CFG` que usa el game loop; los cambios son inmediatos.

---
# Ship Commander

> **Beta** — Juego de combate espacial multijugador en el navegador, creado para practicar combate en equipo al estilo Star Citizen.

Combate espacial en tiempo real, en equipo, que funciona completamente en el navegador. Sin instalaciones, sin plugins — abre el cliente y vuela.

---

## Características

### Gameplay
- **Combate 2 equipos** — Verde vs Rojo, hasta 6 jugadores por sala
- **Servidor autoritativo** — toda la física y las colisiones se ejecutan en el servidor; sin trampas desde el cliente
- **6 tipos de nave** con stats y armas diferenciados (ver sección Naves)
- **Naves multitripuladas** — Gunship (2) y Capital (4) llevan artilleros que controlan torretas independientes
- **Misiles guiados** con guía proporcional, selección de objetivo con clic derecho y contramedidas de bengala
- **Asteroides** como terreno con daño por colisión
- **Sistema de combustible** — regeneración pasiva lenta; empuje y retroceso consumen fuel
- **Autodestrucción** — mantén Supr 2 s para iniciar cuenta atrás de 5 s; Supr de nuevo cancela
- **Límite de tiempo** configurable por partida (por defecto 3 minutos); al acabar el tiempo gana el equipo con más supervivientes o más bajas, o empate

### Multijugador y Salas
- Lobby con creación de sala, unirse, cambio de equipo y sistema de listo
- **Reinicio de sala** — el host puede reiniciar la partida sin disolver la sala
- Nombres de piloto con persistencia via `localStorage`
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

- **Interceptor** — cañón estándar + misiles. Habilidad **[X]: suelta minas** que explotan al pasar un enemigo cerca (hasta 4 activas, solo visibles para tu equipo).
- **L.Fighter / Bomber** — cañón estándar + misiles guiados. El Bomber es un tanque lento con muchos misiles.
- **Gunship** — cañón del piloto + **1 torreta de artillero** independiente. Necesita un 2.º jugador para tripular la torreta.
- **Capital** — **sin cañón normal**; su arma principal es un **rayo de carga** ([clic]/[E] mantener ~1,25 s y soltar): hitscan muy potente (150 dmg) que aplica chispas EMP visuales. Lleva además **3 torretas** para 3 artilleros.
- **Disruptor** — **sigilo extremo** (casi invisible en radar). Cañón débil (8 dmg) + **4 torpedos** (misil más grande, 90 dmg). Habilidad **[X]: pulso EMP en área** que *apaga* a los enemigos cercanos (motor + armas) durante 2-4 s.

La **firma radar** determina a qué distancia los enemigos pueden verte en el radar y el HUD: el Disruptor y el Interceptor son casi invisibles hasta tenerlos encima; el Capital se detecta desde lejísimos.

Cada nave tiene una geometría canvas distinta definida en `client/game.js` (`SHIP_SHAPES`): aguja (Interceptor), delta (L.Fighter), ala volante (Bomber), casco ancho (Gunship), silueta alargada tipo Idris (Capital) y triángulo ancho y corto con el pico en la proa (Disruptor).

### HUD y UI
- HP / Escudo / Combustible / Velocidad / K/D / Cooldown de misil en tiempo real
- **Indicador de habilidad [X]** — muestra `LISTO` o el cooldown restante del EMP (Disruptor) o la mina (Interceptor); suena un blip al quedar lista
- **Carga del rayo** (Capital) — orbe de energía en la proa con anillo de progreso y aviso eléctrico al estar listo; aviso "⚡ SISTEMAS APAGADOS" cuando un EMP te deja a la deriva
- **Contador de partida** centrado en la parte superior (naranja en el último minuto, rojo parpadeante en los últimos 15 s)
- **Kill feed** — con color de equipo, icono de arma, desaparece a los 5 s
- **Modo espectador** — sigue a jugadores vivos con Tab tras morir
- **MobiGlass** (F1) inspirado en Star Citizen:
  - *PILOTO* — barras de integridad estructural, cuadrícula de stats, cooldown de misil
  - *PARTIDA* — marcador por equipo, jugadores vivos
  - *CONTROLES* — referencia completa de teclas
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
- Asteroides (umbral de impacto, factor de daño)

Los cambios se aplican **inmediatamente** a las partidas en curso y se persisten en `server/config.json`.

### Visuals y Audio
- Campo de estrellas con parallax (3 capas de profundidad)
- Explosiones de partículas (coloreadas por equipo) y estela de empuje
- Screen shake al recibir daño o explosiones cercanas
- Flash de impacto en naves dañadas
- Misiles alargados con brillo de escape
- Efectos del rayo de la Capital (haz con halo + chispas), pulso EMP (onda roja), minas y explosiones
- Audio procedural via **Web Audio API** (sin archivos externos):
  - **2 pistas de música** seleccionables (A: drone ambiental con pings; B: acorde apilado más brillante con pulso de bajo)
  - Bus de audio: fuentes → (música | efectos) → mute → salida, con volúmenes independientes
  - SFX: cañón, explosión, lanzamiento de misil, alarma de misil entrante, fanfarria de victoria, pitidos de autodestrucción, carga/disparo del rayo, EMP, blip de habilidad lista

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Servidor | Node.js + librería WebSocket [`ws`](https://github.com/websockets/ws) |
| Cliente | JS vanilla, Canvas HTML5 |
| Renderizado | Canvas 2D API |
| Audio | Web Audio API |
| Estilos | CSS (sin frameworks) |
| Build | Ninguno — archivos planos, sin bundler |

Sin librerías de terceros en el cliente. La única dependencia es `ws` en el servidor.

---

## Inicio rápido

### Requisitos
- Node.js 18+

### Ejecutar en local

```bash
# Instalar dependencia del servidor
cd server
npm install

# Arrancar el servidor de juego
node server.js
# → Game:         http://localhost:8080
# → Panel admin:  http://localhost:8081
```

Abre `http://localhost:8080` en el navegador. El servidor sirve el cliente directamente — no hace falta abrir archivos locales.

Abre varias pestañas para probar el multijugador en local.

### Panel de configuración

Abre `http://localhost:8081` para acceder al panel admin y modificar cualquier variable de juego en tiempo real. Los cambios se guardan en `server/config.json`.

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
├── client/
│   ├── index.html      # Menú, HUD, MobiGlass, Game Over, selector de nave
│   ├── game.js         # Cliente WebSocket, loop de renderizado, input, lógica UI
│   ├── particles.js    # Campo de estrellas, sistema de partículas (explosiones, empuje)
│   ├── sounds.js       # Música y efectos de sonido procedurales (Web Audio API)
│   └── styles.css      # Todos los estilos UI
└── server/
    ├── server.js       # Servidor autoritativo — física, colisiones, salas, timer
    ├── config.js       # Carga y exporta la configuración (con defaults y persistencia)
    ├── config.json     # Valores personalizados (generado automáticamente al guardar)
    ├── admin.html      # Panel admin web (servido en puerto 8081)
    └── package.json
```

---

## Notas de Arquitectura

- **Servidor autoritativo a 60 fps** (`const FPS = 60`) — los clientes solo envían inputs; el servidor ejecuta toda la física, detección de colisiones, cooldowns, condición de victoria, puntuación y atribución de bajas.
- **El cliente es solo render** — recibe el estado del servidor, interpola y gestiona efectos locales (partículas, sonido, temporizador de autodestrucción). No predice física.
- **Superficie anti-trampa** — todos los cooldowns y validaciones viven en el servidor: los muertos no actúan, una nave apagada por EMP no se mueve ni dispara, el cañón/EMP/mina/torpedo respetan su cooldown, los nombres se sanean y solo el host reinicia.
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
| `joinRoom` | Botón "Unirse" | `roomId` |
| `leaveRoom` | Botón "Salir" | — |
| `setWorldSize` | Host, en lobby | `size` |
| `setRoomName` | Host, en lobby | `name` |
| `toggleEnforceBalance` | Host, en lobby | — |
| `toggleMidGameJoin` | Host, en partida | — |
| `ready` | Botón "Listo" | — |
| `switchTeam` | Botón "Cambiar equipo" | — |
| `selectShip` | Clic en carta de nave | `shipType` |
| `boardShip` | Embarcar como artillero | `targetId` |
| `leaveShip` | Salir como artillero | — |
| `input` | Cada 33 ms mientras se juega | `thrust`, `reverse`, `strafeLeft`, `strafeRight`, `targetAngle`, `inertiaDamp` |
| `shoot` | Clic izq. / `E` | — (ignorado en Capital, que usa el rayo) |
| `beamCharge` | Capital: pulsar/soltar disparo | `charging` (bool) — al soltar a tope dispara el rayo |
| `special` | Tecla `X` | — (EMP en Disruptor / mina en Interceptor) |
| `missile` | Tecla `Q` | `targetId` (torpedo si la nave es Disruptor) |
| `flare` | Tecla `F` | — |
| `respawn` | Tecla `R` tras morir | — |
| `selfDestruct` | `Supr` ×2 s | — |
| `restartGame` | Host, en Game Over | — |
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
players, bullets, missiles, beams, empPulses, mines,
flare, asteroids, winner, killFeed, timeLeft, world
```

- `players` — mapa de jugadores (posición, ángulo, hp, escudo, cooldowns, `beamCharge`, `emp`, `empDisabled`, `empCooldown`, `mineCooldown`…).
- `beams` — rayos de la Capital (solo efecto visual; el daño ya se aplicó al dispararse).
- `empPulses` — ondas EMP y explosiones de mina (visual, con `blast` para distinguir).
- `mines` — minas activas (el cliente solo dibuja las de su propio equipo).

### Game loop del servidor

`setInterval(update, 1000 / FPS)` con `FPS = 60` — se ejecuta cada ~16,6 ms y, por cada sala en juego:

1. **Jugadores** — por cada jugador vivo:
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
8. **Timer** y **condición de victoria** — gana quien deja al rival sin jugadores (vidas agotadas) o, al acabar el tiempo, el equipo con más supervivientes/bajas (o empate).
9. **Broadcast** — envía el estado completo a todos los clientes de la sala.

### Modelo de colisiones

Cada nave se modela como una **cápsula**: un segmento de proa a popa (`collider.front`/`rear`) más un radio (`collider.radius`), rotado por el ángulo de la nave. Los proyectiles usan su trayectoria barrida del tick (anti-tunneling) y se comparan con `segToSegDist(trayectoria, eje de la nave) < radioNave + radioProyectil`. El rayo de la Capital es un rayo recto que impacta a la nave enemiga más cercana (bloqueado por asteroides). EMP, minas y explosiones usan distancia radial.

### Interpolación en el cliente

El cliente mantiene un buffer `stateBuffer` con los últimos estados recibidos y renderiza con un pequeño retardo (`INTERP_DELAY`). En cada frame de `requestAnimationFrame` **interpola** linealmente la posición y el ángulo de los jugadores entre los dos estados que rodean al instante de render; las balas y misiles se **extrapolan** según los ticks transcurridos.

En cambio, `asteroids`, `beams`, `empPulses` y `mines` se aplican de forma **inmediata** (sin interpolación), porque son terreno o efectos breves. Las ondas EMP y explosiones de mina se reproducen con sonido solo la primera vez que aparece cada `id`.

### Panel admin (puerto 8081)

Un servidor HTTP independiente en `server.js` sirve `admin.html` en el puerto 8081. El panel hace `GET /config` al cargar y `POST /config` al guardar. El servidor escribe los cambios en `server/config.json` y los aplica en el mismo objeto `CFG` que usa el game loop; los cambios son inmediatos.

---
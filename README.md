# Ship Commander

> **Beta** — Juego de combate espacial multijugador en el navegador, creado para practicar combate en equipo al estilo Star Citizen.

Combate espacial en tiempo real, en equipo, que funciona completamente en el navegador. Sin instalaciones, sin plugins — abre el cliente y vuela.

---

## Características

### Gameplay
- **Combate 2 equipos** — Verde vs Rojo, hasta 6 jugadores por sala
- **Servidor autoritativo** — toda la física y las colisiones se ejecutan en el servidor; sin trampas desde el cliente
- **3 tipos de nave** con stats diferenciados (ver sección Naves)
- **Misiles guiados** con guía proporcional, selección de objetivo con Tab y contramedidas de bengala
- **Asteroides** como terreno con daño por colisión
- **Sistema de combustible** — regeneración pasiva lenta; empuje y retroceso consumen fuel
- **Autodestrucción** — mantén Supr 2 s para iniciar cuenta atrás de 5 s; Supr de nuevo cancela
- **Límite de tiempo** configurable por partida (por defecto 3 minutos); al acabar el tiempo gana el equipo con más supervivientes o más bajas, o empate

### Multijugador y Salas
- Lobby con creación de sala, unirse, cambio de equipo y sistema de listo
- **Reinicio de sala** — el host puede reiniciar la partida sin disolver la sala
- Nombres de piloto con persistencia via `localStorage`
- **Chat en partida** — pulsa T, escribe, Enter para enviar

### Naves de Combate

| Nave | HP | Velocidad | Giro | Misiles | Firma radar | Players |
|---|---|---|---|---|---|
| **1** | 70 | +55% | +65% | 3 | Muy baja (700 u) | 1 |
| **2** | 100 | base | base | 6 | Normal (1000 u) | 1 |
| **3** | 160 | −40% | −45% | 12 | Alta (2000 u) | 1 |
| **4** | 600 | −40% | −45% | 4-20 | Alta (5000 u) | 2 |

La **firma radar** determina a qué distancia los enemigos pueden verte en el radar y en el HUD. El Interceptor es casi invisible hasta que te tiene encima; el Bombardero se detecta desde lejos.

Cada nave tiene una geometría canvas diferente: el Interceptor es una aguja estrecha, el Caza un delta clásico, y el Bombardero un ala volante ancha estilo B-2.

### HUD y UI
- HP / Combustible / Velocidad / K/D / Cooldown de misil en tiempo real
- **Contador de partida** centrado en la parte superior (naranja en el último minuto, rojo parpadeante en los últimos 15 s)
- **Kill feed** — con color de equipo, icono de arma, desaparece a los 5 s
- **Modo espectador** — sigue a jugadores vivos con Tab tras morir
- **MobiGlass** (F1) inspirado en Star Citizen:
  - *PILOTO* — barras de integridad estructural, cuadrícula de stats, cooldown de misil
  - *PARTIDA* — marcador por equipo, jugadores vivos
  - *CONTROLES* — referencia completa de teclas
  - *AJUSTES* — sliders de volumen master y música (guardados en localStorage); acceso al panel admin

### Configuración en tiempo real
Un servidor HTTP independiente en el **puerto 8081** expone un panel admin web donde se pueden modificar todas las variables de juego sin reiniciar el servidor:

- Duración de partida
- Física de nave (empuje, giro, drag, regeneración de fuel)
- Balas (velocidad, cooldown, daño, radio)
- Misiles (velocidad, vida, giro, daño, radio)
- Bengalas (duración, radio, cooldown)
- Asteroides (umbral de impacto, factor de daño)
- Volúmenes de audio

Los cambios se aplican **inmediatamente** a las partidas en curso y se persisten en `server/config.json`.

### Visuals y Audio
- Campo de estrellas con parallax (3 capas de profundidad)
- Explosiones de partículas (coloreadas por equipo) y estela de empuje
- Screen shake al recibir daño o explosiones cercanas
- Flash de impacto en naves dañadas
- Misiles alargados con brillo de escape
- Audio procedural via **Web Audio API** (sin archivos externos):
  - Drone ambiental espacial con notas altas aleatorias
  - SFX: cañón, explosión, lanzamiento de misil, alarma de misil entrante, fanfarria de victoria, pitidos de cuenta atrás de autodestrucción

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
| `Clic izq.` | Disparar cañón |
| `Clic der.` | Lockear objetivo |
| `Q` | Lanzar misil (requiere objetivo) |
| `F` | Lanzar bengala (contramedida anti-misil) |
| `T` | Abrir chat |
| `Supr` | Autodestrucción (mantener 2 s → cuenta atrás 5 s · Supr cancela) |
| `F1` | Abrir / cerrar MobiGlass |

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

- **Servidor autoritativo a 30 fps** — los clientes solo envían inputs; el servidor ejecuta toda la física, detección de colisiones, condición de victoria, puntuación y atribución de bajas.
- **El cliente es solo render** — recibe el estado del servidor y gestiona efectos locales (partículas, sonido, temporizador de autodestrucción).
- **Superficie anti-trampa** — limitación de cadencia de fuego y misiles, saneamiento de nombres, validación de acciones (los jugadores muertos no pueden disparar, solo el host puede reiniciar).
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
  Canvas render loop                     Game loop (30 fps)
  Input → JSON msgs                      Física, colisiones
  Efectos locales                        Estado autoritativo
```

### Conexión WebSocket

El servidor (`server/server.js`) inicia un servidor HTTP en el puerto **8080** que también sirve los archivos estáticos del cliente. Encima de ese mismo servidor HTTP se monta el servidor WebSocket (`ws`):

```js
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", ws => { /* nuevo jugador */ });
```

El cliente (`client/game.js`) abre la conexión al cargar la página:

```js
const ws = new WebSocket("ws://" + location.host);
```

### Mensajes cliente → servidor

El cliente envía objetos JSON con un campo `type`. Los principales son:

| `type` | Cuándo | Contenido adicional |
|---|---|---|
| `setName` | Al guardar el nombre | `name` |
| `createRoom` | Botón "Crear sala" | — |
| `joinRoom` | Botón "Unirse" | `roomId` |
| `leaveRoom` | Botón "Salir" | — |
| `ready` | Botón "Listo" | — |
| `switchTeam` | Botón "Cambiar equipo" | — |
| `selectShip` | Clic en carta de nave | `shipType` |
| `boardShip` | Botón "Embarcar" (artillero) | `targetId` |
| `leaveShip` | Botón "Salir" del artillero | — |
| `input` | Cada 33 ms mientras se juega | `thrust`, `reverse`, `strafeLeft`, `strafeRight`, `targetAngle`, `inertiaDamp` |
| `shoot` | Clic izquierdo / tecla E | — |
| `missile` | Tecla Q | `targetId` |
| `flare` | Tecla F | — |
| `respawn` | Tecla R tras morir | — |
| `selfDestruct` | Del ×2 s | — |
| `toggleMidGameJoin` | Host, en partida | — |
| `restartGame` | Host, en Game Over | — |
| `chat` | Enter, escribe, Enter | `text` |

### Mensajes servidor → cliente

El servidor hace **broadcast** a todos los clientes de una sala usando `broadcastRoom()`. Los mensajes son:

| `type` | Cuándo | Qué contiene |
|---|---|---|
| `init` | Al conectar | `id` (UUID del jugador), `ships` (tipos de nave con stats) |
| `rooms` | Al pedir lista / cambios | Array de salas disponibles |
| `roomUpdate` | Cambio en la sala (equipo, nave, listo…) | Objeto `room` completo |
| `gameStarted` | Todos listos | — |
| `state` | Cada tick (30 fps) | `players`, `bullets`, `missiles`, `flare`, `asteroids`, `winner`, `killFeed`, `timeLeft`, `world` |
| `chat` | Mensaje de chat | `name`, `team`, `text` |

### Game loop del servidor

`setInterval(update, 1000 / 30)` — se ejecuta cada ~33 ms:

1. **Input** — para cada jugador vivo, lee su último `player.input` y aplica rotación, empuje, strafe.
2. **Física** — aplica drag (o no si `inertiaDamp = false`), mueve posición, clipa al límite del mundo.
3. **Artillero** — si el jugador es artillero, sincroniza su posición con la del piloto y actualiza el ángulo de torreta.
4. **Colisiones balas** — para cada bala, comprueba si choca con un jugador enemigo. Aplica daño, registra `damageDealt`, llama a `killPlayer()` si HP ≤ 0.
5. **Colisiones misiles** — igual que balas pero con radio mayor.
6. **Colisiones asteroides** — comprueba velocidad de impacto; por encima del umbral aplica daño proporcional.
7. **Misiles guiados** — `steerMissile()` calcula el ángulo hacia el objetivo con guía proporcional y lo persigue.
8. **Condición de victoria** — comprueba si un equipo se quedó sin jugadores (todas las vidas agotadas) o si se acabó el tiempo.
9. **Broadcast** — envía el estado completo a todos los clientes de la sala.

### Interpolación en el cliente

El cliente recibe estados a 30 fps pero renderiza a 60+ fps. Para evitar tirones mantiene un buffer `stateBuffer` con los últimos estados recibidos. En cada frame de `requestAnimationFrame` interpola linealmente la posición de los jugadores entre el estado anterior y el siguiente usando el timestamp del servidor como referencia.

### Panel admin (puerto 8081)

Un servidor HTTP independiente en `server.js` sirve `admin.html` en el puerto 8081. El panel hace `GET /config` al cargar y `POST /config` al guardar. El servidor escribe los cambios en `server/config.json` y los aplica en el mismo objeto `CFG` que usa el game loop; los cambios son inmediatos.

---

## Tareas pendientes

El juego es jugable y estable para sesiones locales y con amigos via túnel. Las áreas principales aún en desarrollo son:

- [ ] Tenemos que compensar los equipos en el lobby para que la partida esté bien configurada. Si un equipo tiene naves multitripuladas, en el otro equipo tiene que haber al menos la misma cantidad de jugadores.
- [ ] El daño de la nave multitripulada se guarda mal. Le cuenta todo a un solo jugador. (La explosión doble ya está corregida; y el selector de nave al morir ya está implementado. Pendiente: revisar atribución de daño/kills)
- [ ] Ahora que tenemos una nave para 2 personas, deberíamos hacer una nave aún más grande con 1 piloto y 3 torretas. (Controlar equipos proporcionales).
- [ ] Añadir "ruido" como habilidad adicional además del "flare". Una habilidad que hace que no te puedan ver/targetear en unos segundos.
- [ ] Poder reiniciar datos del servidor para evitar datos corruptos del config.json. Esto es relativo, Igual hay que cambiar alguna lógica por ahora no hagas nada.


## Estado actual (Beta)

### Nueva nave: Gunner

Nave Gunner (2 tripulantes)

Piloto: selecciona "GUNNER" en el selector de naves. Controla movimiento con W/S/A/D y mouse. Disparo principal con clic izquierdo. 4 misiles.
Artillero: en la sala de espera ve el slot "ARTILLERO ↳ Vacío" debajo de la nave Gunner y pulsa "Embarcar". En partida controla la torreta con el mouse (gira independientemente del casco). Clic izquierdo = cañón de torreta (40 dmg, más rápido que el principal). Clic derecho = misiles (20 disponibles).
La torreta se dibuja en el centro del casco y rota suavemente siguiendo el mouse del artillero, visible para todos los jugadores.
Muerte compartida: si el piloto muere, el artillero también muere. Al reaparecer, el artillero se eyecta como caza independiente.
Equipo: el artillero hereda el equipo del piloto automáticamente al embarcar.
HP en HUD: el artillero ve la HP del casco del piloto, no la suya.
Stats: 600 HP, muy lento, firma radar enorme (5000u), detectable desde lejos.
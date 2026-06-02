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

| Nave | HP | Velocidad | Giro | Misiles | Firma radar |
|---|---|---|---|---|---|
| **Interceptor** | 70 | +55% | +65% | 3 | Muy baja (700 u) |
| **Caza** | 100 | base | base | 6 | Normal (1000 u) |
| **Bombardero** | 160 | −40% | −45% | 12 | Alta (2000 u) |
| **Tornado** | X | X | X | X | X |

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

## Estado actual (Beta)

El juego es jugable y estable para sesiones locales y con amigos via túnel. Las áreas principales aún en desarrollo son:


- [ ] Más tipos de nave y personalización visual. Vamos a empezar por una nave nueva que sea para dos jugadores. Hay que controlar que un jugador maneja el movimiento y el disparo de la nave y el otro la torreta con disparos más potentes y misiles. además tenemos que equilibrar el juego entre los equipos asique si hay una de estas en un equipo, el otro equipo tiene que tener también dos jugadores (aun que sean dos naves diferentes).

- [ ] Añadir el campo "daño" en el leaderboard/socoreboard para saber quién ha hecho más daño en la partida. Además añadir KDA completo, kills, deaths y assists.

- [ ] Añadir "ruido" como habilidad adicional además del "flare". Una habilidad que hace que no te puedan ver/targetear en unos segundos.
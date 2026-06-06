# Divergencias de arquitectura del servidor — propuestas futuras

> Estado: **documentado, NO implementado.** El refactor de `refactor/server` fue
> estrictamente *behavior-preserving*. Estas tres divergencias respecto a los
> estándares de la industria **cambian comportamiento o protocolo**, así que se
> dejan aquí como propuestas independientes, cada una con su propio visto bueno.

Contexto: Ship Commander ya implementa el modelo canónico correcto (servidor
autoritativo + cliente render/interpolación, à la Gambetta/Fiedler). No hay que
"arreglar la red". Lo que sigue son mejoras opcionales, ordenadas de menor a mayor
impacto.

---

## 1. Game loop: `setInterval` → acumulador de timestep fijo

**Hoy:** `setInterval(update, 1000 / FPS)` en `server/sim/loop.js`. La integración
es por tick sin `dt` (`p.x += p.vx`), asumiendo 60 fps perfectos.

**Estándar (Fiedler, "Fix Your Timestep"):** un bucle con acumulador y `dt` fijo,
desacoplado del timer real. `setInterval` *deriva* y, si un tick supera 16.6 ms,
todo se ralentiza (riesgo de "spiral of death").

**Por qué queda fuera:** migrar a integración con `dt` **cambia todos los números
de física** (velocidades, aceleraciones, cooldowns expresados en ticks). No es
behavior-preserving. Requeriría re-tunear y re-testear el gameplay completo.

**Si se aborda:** acumular `deltaTime` real y avanzar la simulación en pasos fijos
de `1/FPS`; mantener el resto de la lógica en "ticks" para no tocar los valores de
`CFG`. Aislado en `loop.js`, el cambio no toca el resto de módulos.

---

## 2. Sincronización de estado: snapshot completo 60×/s → menor tasa + delta

**Hoy:** `buildState(room)` (en `server/net/serialize.js`) serializa el estado
completo de la sala (todos los jugadores, balas, misiles, asteroides…) y se difunde
a cada cliente **cada tick** (60/s).

**Estándar (snapshot interpolation de Valve/Fiedler):** tasa de snapshot menor
(20–30 Hz) + interpolación en cliente, y delta-compression / relevancia (area of
interest) para no reenviar lo que no cambió.

**Por qué queda fuera:** es la mayor palanca de escalado, pero **cambia el
protocolo** `state` y la lógica de interpolación del cliente → afectaría al worktree
`refactor/client`. Fuera del alcance "solo server, behavior-preserving".

**Si se aborda:** coordinar con el frontend. La capa está aislada en
`net/serialize.js` (qué se envía) y `net/broadcast.js` (a quién), así que el cambio
es localizable.

---

## 3. Robustez de `ws`: backpressure + heartbeat ping/pong

**Hoy:** `broadcast.js` hace `ws.send(...)` directamente, sin comprobar el buffer ni
detectar conexiones muertas.

**Estándar (README oficial de `ws`, lo único que marca como crítico para
producción):**
- **Backpressure:** difundir el estado completo 60×/s puede llenar el buffer de un
  cliente lento; sin control, la memoria crece sin límite. Comprobar
  `ws.bufferedAmount` (o el valor de retorno de `send`) y/o escuchar `drain`.
- **Heartbeat:** `ping`/`pong` periódico (~30 s) para cerrar (`terminate()`) sockets
  zombis que no cierran limpiamente.

**Por qué queda fuera:** es robustez sin tocar gameplay, pero técnicamente **añade
comportamiento nuevo** (descartar frames / cerrar clientes inactivos), así que se
decide aparte, no se cuela en un refactor.

**Si se aborda:** todo se localiza en `net/broadcast.js` (chequeo de `bufferedAmount`
antes de `send`) y `net/wsServer.js` (intervalo de `ping` + flag `isAlive` por
socket, `terminate()` en el que no responde). Sin impacto en el protocolo ni en el
cliente.

---

## Notas de código muerto detectadas (no tocadas en este refactor)

Durante el split se identificaron símbolos sin uso que **se conservaron** por no
estar en el alcance acordado de borrado:

- **`pushKill(room, killer, victim, weapon)`** (`server/entities/player.js`):
  alimenta `room.killFeed` (que el cliente muestra) pero **nunca se llama** → el
  kill feed siempre va vacío. Probablemente convenga *cablearlo* dentro de
  `killPlayer` en vez de borrarlo.
- **`distToSegment(...)`** (`server/sim/physics.js`): helper de distancia
  punto-segmento sin uso actual (las colisiones usan `segToSegDist`).

Se borraron, en cambio: `killPlayerOLD`, los dos bloques de colisión comentados
(versión antigua de balas y misiles), el handler `brake` (con typo `THRUST_VAL`) y
la variable vestigial `botCounter`.

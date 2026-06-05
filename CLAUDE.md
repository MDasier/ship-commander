# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ship Commander es un juego de combate espacial multijugador en el navegador. El `README.md` documenta gameplay, naves, controles y el protocolo de mensajes WebSocket en gran detalle — consúltalo para "qué hace el juego". Este archivo cubre lo necesario para **modificar el código** sin romper las invariantes de arquitectura.

## Comandos

```bash
cd server
npm install        # única dependencia: ws
node server.js     # → juego+cliente en :8080, panel admin en :8081
```

- **No hay build step, ni bundler, ni tests.** El cliente son ficheros JS vanilla servidos como estáticos por el propio `server.js`. Editar → recargar el navegador. (Ver `DEPLOY.md` para el razonamiento de por qué no hay Vite y cómo desplegar.)
- Para probar multijugador en local: abrir varias pestañas en `http://localhost:8080`.
- `PORT` (env) cambia el puerto del juego; el panel admin es siempre `PORT + 1`.
- Tras cambiar las formas de las naves (`SHIP_SHAPES` en `client/game.js`), regenerar los presets del editor: `node tools/gen-presets.js`.

## Arquitectura — invariantes que NO se deben romper

**Servidor autoritativo a 60 fps; el cliente es solo render.** Toda la física, colisiones, cooldowns, puntuación y condición de victoria viven en `server/server.js`. El cliente (`client/game.js`) solo envía inputs (~30/s), interpola el estado recibido y dibuja. **Nunca muevas lógica de juego (física, daño, validación) al cliente** — es la superficie anti-trampa. Los muertos no actúan, una nave apagada por EMP no se mueve, todos los cooldowns se validan en servidor.

**La IA reutiliza la simulación.** Los bots son jugadores normales con `isBot`; una rutina de IA en el servidor fija su `input` y luego corre la misma física que un humano. No hay código de bot en el cliente. El sistema de oleadas (`WAVES` + `manageWaves`) es el mismo en Co-op multijugador y práctica en solitario.

**Configuración en caliente.** `server/config.js` exporta el objeto `CFG` que el game loop lee **cada tick**. `DEFAULTS` (en `config.js`) se fusiona con `config.json` mediante `deepMerge` (los objetos anidados se mergean, los arrays como `WAVES` se reemplazan enteros). El panel admin (`:8081`, sirve `admin.html`) hace `POST /config`, escribe `config.json` y los cambios se aplican **inmediatamente a las partidas en curso** sin reiniciar. → Si añades una variable de juego, declárala en `DEFAULTS` y se editará automáticamente desde el panel.

**Estado en memoria.** No hay base de datos. Las salas viven en RAM y se pierden al reiniciar — comportamiento esperado.

## Sincronización servidor ↔ cliente (puntos frágiles)

Hay datos de naves duplicados a propósito en dos ficheros que **deben mantenerse coherentes**:

- `server/config.js` → `SHIP_TYPES`: stats, física, escudos, `collider` (cápsula de colisión), `turretHardpoints`.
- `client/game.js` → `SHIP_SHAPES`: geometría de dibujo en canvas, incluido `turretHardpoints` para las torretas.

Los `turretHardpoints` de la Capital deben coincidir entre ambos: el servidor calcula desde dónde salen las balas, el cliente dibuja la torreta ahí. Si divergen, las balas salen de un punto distinto al visible.

El **modelo de colisión** es una cápsula: segmento proa→popa (`collider.front`/`rear`) + `radius`. Los proyectiles usan trayectoria barrida del tick (anti-tunneling). EMP/minas/explosiones usan distancia radial. El rayo de la Capital es hitscan instantáneo (los `beams` en el estado son solo efecto visual; el daño ya se aplicó).

El **protocolo de mensajes** cliente↔servidor (campos `type` en ambos sentidos, contenido de `state`) está tabulado en el README sección "Arquitectura Técnica Detallada". Si añades un mensaje nuevo, manéjalo en el `switch`/handler de `server.js` y en el receptor de `game.js`.

## Ficheros

| Fichero | Rol |
|---|---|
| `server/server.js` (~2.5k líneas) | Servidor autoritativo: física, colisiones, salas, timer, IA, oleadas, ambos servidores HTTP |
| `server/config.js` | `DEFAULTS` + carga/merge/persistencia de `config.json`; exporta `CFG` |
| `server/admin.html` | Panel admin (`:8081`) |
| `client/game.js` (~4.5k líneas) | WebSocket, render loop, input, navegación de menús, `SHIP_SHAPES` |
| `client/particles.js` | Campo de estrellas + sistema de partículas |
| `client/sounds.js` | Música y SFX procedurales (Web Audio API, sin assets) |
| `client/i18n.js` | Traducciones ES/EN; `t("key", {vars})` + `data-i18n` en el DOM. Los textos con teclas de control se componen en `game.js` con `bindingText()`, no aquí |
| `client/styles.css` | Toda la UI. Convención: unidades **rem**, texto **≥ 16px** |
| `tools/ship-editor.html` | Editor visual de formas de nave |
| `tools/ship-presets.js` | **Auto-generado** desde `SHIP_SHAPES` por `gen-presets.js` — no editar a mano |

## Idioma

El proyecto está documentado y comentado en español. El cliente es bilingüe ES/EN vía `i18n.js`; al añadir texto de UI, usa claves `t(...)` y entradas en ambos idiomas en `I18N`.

// Game loop autoritativo a 60 fps. Orquesta las fases sobre cada sala en juego:
// jugadores → colisiones (asteroides/balas/misiles) → efectos → oleadas → timer →
// condición de victoria → broadcast del estado. El orden es significativo: todos
// los jugadores se mueven antes de resolver colisiones.

const { FPS } = require("../constants.ts");
const { rooms } = require("../state.ts") as { rooms: Record<string, Room> };
const { stepPlayers } = require("./movement.ts");
const { collideAsteroids, stepBullets, stepMissiles } = require("./collisions.ts");
const { stepEffects } = require("./effects.ts");
const { manageWaves } = require("../ai/waves.ts");
const { buildState } = require("../net/serialize.ts");
const { broadcastRoom } = require("../net/broadcast.ts");

// Resuelve el ganador (aniquilación total o tiempo agotado con cascada de criterios).
function resolveVictory(room: Room): void {
  const allPlayers  = Object.values(room.players);
  const greenAlive  = allPlayers.filter(p => p.team === "green" && !p.dead).length;
  const redAlive    = allPlayers.filter(p => p.team === "red"   && !p.dead).length;

  if (!room.winner) {
    if (room.gameValid && room.shipsDestroyed) {
      const greenAllOut = greenAlive === 0 && !allPlayers.some(p => p.team === "green" && p.dead && (p.respawnsLeft ?? 0) > 0);
      const redAllOut   = redAlive   === 0 && !allPlayers.some(p => p.team === "red"   && p.dead && (p.respawnsLeft ?? 0) > 0);
      if (greenAllOut) room.winner = "red";
      if (redAllOut)   room.winner = "green";
    }

    // Time's up
    if (room.timeLeft <= 0 && room.gameValid) {
      if      (greenAlive > redAlive) room.winner = "green";
      else if (redAlive > greenAlive) room.winner = "red";
      else {
        const greenKills = allPlayers.filter(p => p.team === "green").reduce((s, p) => s + (p.kills || 0), 0);
        const redKills   = allPlayers.filter(p => p.team === "red"  ).reduce((s, p) => s + (p.kills || 0), 0);
        if      (greenKills > redKills) room.winner = "green";
        else if (redKills > greenKills) room.winner = "red";
        else {
          // Desempate por daño total infligido
          const greenDmg = allPlayers.filter(p => p.team === "green").reduce((s, p) => s + (p.damageDealt || 0), 0);
          const redDmg   = allPlayers.filter(p => p.team === "red"  ).reduce((s, p) => s + (p.damageDealt || 0), 0);
          if      (greenDmg > redDmg) room.winner = "green";
          else if (redDmg > greenDmg) room.winner = "red";
          else                        room.winner = "draw";
        }
      }
    }
  }
}

function update(): void {
  Object.values(rooms).forEach(room => {
    if (room.status !== "playing") return;

    stepPlayers(room);
    collideAsteroids(room);
    stepBullets(room);
    stepMissiles(room);
    stepEffects(room);

    // ── Oleadas (solo práctica)
    if (room.waveMode) manageWaves(room);

    // ── Timer
    if (room.timeLeft > 0) room.timeLeft--;

    // ── Win condition
    resolveVictory(room);

    // ── Broadcast
    broadcastRoom(room, buildState(room));
  });
}

function startLoop(): NodeJS.Timeout {
  return setInterval(update, 1000 / FPS);
}

module.exports = { update, startLoop };

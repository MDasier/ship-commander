// Posiciones de aparición y generación de asteroides del mundo.

const CFG = require("../config");

function spawnSafePos(team: Team | null, room: Room): Vec2 {
  const W = room.worldW;
  const H = room.worldH;

  const margin = 0.08;
  const minDist = CFG.SPAWN_MIN_DISTANCE ?? 800;
  const maxAttempts = 12;

  for (let i = 0; i < maxAttempts; i++) {
    const pos = {
      x: W * margin + Math.random() * W * (1 - margin * 2),
      y: H * margin + Math.random() * H * (1 - margin * 2)
    };

    let safe = true;

    for (const id in room.players) {
      const p = room.players[id];
      if (!p || p.dead) continue;
      if (p.team === team) continue;

      const dx = p.x - pos.x;
      const dy = p.y - pos.y;

      if (dx * dx + dy * dy < minDist * minDist) {
        safe = false;
        break;
      }
    }

    if (safe) return pos;
  }

  // fallback (evita soft-lock)
  return {
    x: W * margin + Math.random() * W * (1 - margin * 2),
    y: H * margin + Math.random() * H * (1 - margin * 2)
  };
}

function spawnPos(team: Team | null, room: Room): Vec2 {
  const W = room.worldW;
  const H = room.worldH;

  const margin = 0.08; // 8% de borde libre

  return {
    x: W * margin + Math.random() * W * (1 - margin * 2),
    y: H * margin + Math.random() * H * (1 - margin * 2)
  };
}

function createAsteroids(count: number, W: number, H: number): Asteroid[] {
  const arr: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const z: -1 | 0 | 1 = roll < 0.5 ? 0 : roll < 0.75 ? 1 : -1;
    arr.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 40 + Math.random() * 100,
      z,
    });
  }
  return arr;
}

module.exports = { spawnSafePos, spawnPos, createAsteroids };

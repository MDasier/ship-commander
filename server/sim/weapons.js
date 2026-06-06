// Armas con lógica propia de disparo: EMP del Disruptor, rayo hitscan de la
// Capital, minas del Interceptor, y la guía de misiles.

const CFG = require("../config");
const { shipCapsule, segToSegDist, isSheltered } = require("./physics.ts");
const { applyDamage, updateDamageLog, killPlayer } = require("../entities/player");

// Aplica el efecto EMP a una nave. `ticks` = duración; `disable` = si además la "apaga".
function applyEmp(target, ticks, disable) {
  target.empTimer = Math.max(target.empTimer ?? 0, ticks);
  target.empMax   = Math.max(target.empMax ?? 0, ticks);
  if (disable) target.empDisableTicks = Math.max(target.empDisableTicks ?? 0, ticks);
}

// Disparo principal de la nave Capital: un rayo instantáneo (hitscan) muy potente.
// Traza una línea desde la proa; impacta al primer enemigo en su trayectoria
// (o se detiene en un asteroide), aplica daño grande y deja un efecto visual.
function fireCapitalBeam(player, room) {
  const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
  const col = (CFG.SHIP_TYPES.capital.collider) || { front: 0 };
  const ox = player.x + col.front * cos;   // origen en la proa
  const oy = player.y + col.front * sin;
  const range = CFG.CAPITAL_BEAM_RANGE;
  const ex = ox + cos * range, ey = oy + sin * range;

  // Distancia a lo largo del rayo de un punto proyectado sobre la dirección
  const along = (px, py) => (px - ox) * cos + (py - oy) * sin;

  // 1) Asteroide sólido (z=0) que bloquea el rayo más cerca
  let blockDist = range;
  for (const a of room.asteroids) {
    if (a.z !== 0) continue;
    const t = along(a.x, a.y);
    if (t < 0 || t > blockDist) continue;
    const perp = Math.hypot((ox + cos * t) - a.x, (oy + sin * t) - a.y);
    if (perp < a.r) {
      const entry = t - Math.sqrt(Math.max(0, a.r * a.r - perp * perp));
      if (entry >= 0 && entry < blockDist) blockDist = entry;
    }
  }

  // 2) Enemigo más cercano cuya cápsula intersecta el rayo dentro de blockDist
  let hitPlayer = null, hitDist = blockDist;
  for (const p of Object.values(room.players)) {
    if (p.dead || p.team === player.team || p.pilotingFor || p.id === player.id) continue;
    const cap = shipCapsule(p);
    const d = segToSegDist(ox, oy, ex, ey, cap.rx, cap.ry, cap.fx, cap.fy);
    if (d < CFG.CAPITAL_BEAM_HALFWIDTH + cap.r) {
      const t = Math.max(0, along(p.x, p.y));
      if (t <= hitDist) { hitDist = t; hitPlayer = p; }
    }
  }

  let endX, endY, didHit = false;
  if (hitPlayer) {
    endX = ox + cos * hitDist; endY = oy + sin * hitDist;
    // Cubierto bajo asteroide flotante → el rayo no daña (pero se detiene ahí)
    if (!isSheltered(hitPlayer.x, hitPlayer.y, room.asteroids)) {
      const beamAngle = Math.atan2(oy - hitPlayer.y, ox - hitPlayer.x);
      applyDamage(room, hitPlayer, CFG.CAPITAL_BEAM_DAMAGE, player, beamAngle);
      updateDamageLog(hitPlayer, player.id);
      hitPlayer.beamHit = CFG.CAPITAL_BEAM_LIFE; // marca de impacto del rayo (efecto propio, no EMP)
      didHit = true;
      if (hitPlayer.hp <= 0) killPlayer(hitPlayer, player, "beam", room);
    }
  } else {
    endX = ox + cos * blockDist; endY = oy + sin * blockDist;
  }

  room.beams.push({
    id: Date.now() + Math.random(),
    x1: ox, y1: oy, x2: endX, y2: endY,
    team: player.team, ownerId: player.id,
    hit: didHit,
    life: CFG.CAPITAL_BEAM_LIFE, maxLife: CFG.CAPITAL_BEAM_LIFE,
  });
}

// Pulso EMP en área del Disruptor: apaga a todos los enemigos dentro del radio 2-4s.
function fireEmpPulse(player, room) {
  const R = CFG.EMP_PULSE_RADIUS;
  for (const p of Object.values(room.players)) {
    if (p.dead || p.team === player.team || p.pilotingFor || p.id === player.id) continue;
    if (Math.hypot(p.x - player.x, p.y - player.y) > R) continue;
    if (isSheltered(p.x, p.y, room.asteroids)) continue;
    const dur = CFG.EMP_DISABLE_MIN +
      Math.floor(Math.random() * (CFG.EMP_DISABLE_MAX - CFG.EMP_DISABLE_MIN + 1));
    applyEmp(p, dur, true);   // apaga (motor + armas) + chispas rojas
  }
  room.empPulses.push({
    id: Date.now() + Math.random(),
    x: player.x, y: player.y, r: R, team: player.team,
    life: CFG.EMP_PULSE_LIFE, maxLife: CFG.EMP_PULSE_LIFE,
  });
}

// El Interceptor suelta una mina en su posición; explota al pasar un enemigo por encima.
function dropMine(player, room) {
  const active = room.mines.filter(m => m.ownerId === player.id).length;
  if (active >= CFG.MINE_MAX_ACTIVE) return;
  room.mines.push({
    id: Date.now() + Math.random(),
    x: player.x, y: player.y,
    team: player.team, ownerId: player.id,
    arm: CFG.MINE_ARM_TIME,        // cuenta atrás hasta armarse
    maxArm: CFG.MINE_ARM_TIME,
    life: CFG.MINE_LIFE,
    maxLife: CFG.MINE_LIFE,        // para el temporizador en cliente
  });
}

function steerMissile(m, tx, ty, maxTurn, thrust) {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const currentSpeed = Math.hypot(m.vx, m.vy);
  const currentAngle = currentSpeed > 0.5 ? Math.atan2(m.vy, m.vx) : Math.atan2(dy, dx);
  const desiredAngle = Math.atan2(dy, dx);
  let diff = desiredAngle - currentAngle;
  if (diff >  Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));
  // Rotate velocity vector to new angle and accelerate
  const newSpeed = Math.min(currentSpeed + thrust, CFG.MISSILE_SPEED_MAX);
  m.vx = Math.cos(newAngle) * newSpeed;
  m.vy = Math.sin(newAngle) * newSpeed;
}

module.exports = { applyEmp, fireCapitalBeam, fireEmpPulse, dropMine, steerMissile };

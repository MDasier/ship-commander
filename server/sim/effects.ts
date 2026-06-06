// Fase del game loop: efectos con vida propia. Beams y ondas EMP son solo visuales
// (el daño/apagado ya se aplicó al disparar). Las minas se arman, expiran y explotan
// en área al pasar un enemigo. Las bengalas decaen.

const CFG = require("../config");
const { applyDamage, registerCrewDamage, killPlayer } = require("../entities/player.ts");

function stepEffects(room: Room): void {
  // ── Beams (rayo de la Capital): solo efecto visual, el daño ya se aplicó al disparar
  room.beams = (room.beams || []).filter(b => { b.life--; return b.life > 0; });

  // ── Ondas EMP (solo visual; el apagado ya se aplicó al disparar)
  room.empPulses = (room.empPulses || []).filter(e => { e.life--; return e.life > 0; });

  // ── Minas: se arman, expiran y explotan al pasar un enemigo por encima
  for (let i = room.mines.length - 1; i >= 0; i--) {
    const mine = room.mines[i];
    if (mine.arm > 0) mine.arm--;
    mine.life--;
    if (mine.life <= 0) { room.mines.splice(i, 1); continue; }
    if (mine.arm > 0) continue;   // aún no armada
    // ¿Enemigo dentro del radio de disparo?
    const trigger = Object.values(room.players).find(p =>
      !p.dead && p.team !== mine.team && !p.pilotingFor &&
      Math.hypot(p.x - mine.x, p.y - mine.y) <= CFG.MINE_TRIGGER_RADIUS);
    if (!trigger) continue;
    // Explosión: daño en área que decae con la distancia
    const attacker = room.players[mine.ownerId];
    for (const p of Object.values(room.players)) {
      if (p.dead || p.team === mine.team || p.pilotingFor) continue;
      const dist = Math.hypot(p.x - mine.x, p.y - mine.y);
      if (dist > CFG.MINE_BLAST_RADIUS) continue;
      const dmg = CFG.MINE_DAMAGE * (1 - dist / CFG.MINE_BLAST_RADIUS);
      const ang = Math.atan2(mine.y - p.y, mine.x - p.x);
      applyDamage(room, p, dmg, attacker, ang);
      //if (attacker) updateDamageLog(p, attacker.id);
      if (attacker) registerCrewDamage(p, attacker, room);
      if (p.hp <= 0) killPlayer(p, attacker || null, "mine", room);
    }
    // Marca para efecto visual de explosión (reutiliza empPulses en blanco/naranja)
    room.empPulses.push({
      id: Date.now() + Math.random(),
      x: mine.x, y: mine.y, r: CFG.MINE_BLAST_RADIUS, team: mine.team,
      life: CFG.EMP_PULSE_LIFE, maxLife: CFG.EMP_PULSE_LIFE, blast: true,
    });
    room.mines.splice(i, 1);
  }

  // ── Flares
  room.flare = (room.flare || []).filter(f => { f.life--; return f.life > 0; });
}

module.exports = { stepEffects };

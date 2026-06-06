// Fase del game loop: actualización de jugadores. Sincroniza artilleros con su
// piloto, fija el input de los bots vía IA, decrementa cooldowns/timers, aplica
// rotación/propulsión/strafe e integra la posición. Los muertos no actúan; una
// nave apagada por EMP queda a la deriva.

const CFG = require("../config");
const { computeBotAI, steerAroundAsteroids, applyWorldBoundaryAvoidance } = require("../ai/ai.ts");

function stepPlayers(room: Room): void {
  Object.values(room.players).forEach((p: Player) => {
    if (p.dead) return;

    // Artillero: sincronizar al piloto y procesar su turno
    if (p.pilotingFor) {
      const pilot = room.players[p.pilotingFor];
      if (!pilot || pilot.dead) return; // muere con el piloto via killPlayer
      p.x     = pilot.x;
      p.y     = pilot.y;
      p.angle = pilot.angle;
      if (p.turretCooldown  > 0) p.turretCooldown--;
      if (p.missileCooldown > 0) p.missileCooldown--;
      const inp = p.input || {};
      if (inp.targetAngle != null) {
        if (pilot.shipType === "capital") {
          // Capital: cada artillero tiene su propio ángulo de torreta
          if (!pilot.turretAngles) pilot.turretAngles = {};
          pilot.turretAngles[p.id] = inp.targetAngle;
        } else {
          // Gunship: torreta única del piloto
          pilot.turretAngle = inp.targetAngle;
        }
      }
      return;
    }

    // IA: fija el input del bot (y dispara) antes de aplicar el movimiento
    if (p.isBot) {
      computeBotAI(p, room);
      // Esquiva de asteroides: ajusta el rumbo deseado del bot
      if (p.input && p.input.targetAngle != null) {
        p.input.targetAngle = steerAroundAsteroids(p, room, p.input.targetAngle);
      }
    }

    p.lockedByMissile = false;
    p.lockedOnMe      = 0;

    if (p.missileCooldown > 0) p.missileCooldown--;
    if (p.bulletCooldown  > 0) p.bulletCooldown--;
    if (p.hitFlash        > 0) p.hitFlash--;
    if ((p.beamHit ?? 0)  > 0) p.beamHit!--;
    // Carga del rayo de la Capital (mantener pulsado)
    if (p.shipType === "capital") {
      if (p.beamCharging) {
        p.beamChargeTicks = Math.min(CFG.CAPITAL_BEAM_CHARGE_TIME, (p.beamChargeTicks ?? 0) + 1);
      }
      p.beamCharge = (p.beamChargeTicks ?? 0) / CFG.CAPITAL_BEAM_CHARGE_TIME; // 0..1 para el cliente
    }
    // EMP: chispas rojas (visual) y apagado (motor + armas)
    if ((p.empTimer ?? 0) > 0) p.empTimer!--; else p.empMax = 0;
    p.emp = (p.empMax ?? 0) > 0 ? (p.empTimer ?? 0) / p.empMax! : 0; // 0..1 para el cliente
    if ((p.empDisableTicks ?? 0) > 0) p.empDisableTicks!--;
    p.empDisabled = (p.empDisableTicks ?? 0) > 0;
    if ((p.empCooldown  ?? 0) > 0) p.empCooldown!--;
    if ((p.mineCooldown ?? 0) > 0) p.mineCooldown!--;
    if ((p.shieldFlash ?? 0)    > 0) p.shieldFlash!--;
    if (p.flaredCooldown  > 0) p.flaredCooldown--;
    // Recarga de escudo (parada mientras la nave está apagada)
    if (!p.empDisabled) {
      if ((p.shieldHitTimer ?? 99999) < (p.shieldRegenDelayTicks ?? 99999)) {
        p.shieldHitTimer!++;
      } else if ((p.shield ?? 0) < (p.maxShield ?? 0)) {
        p.shield = Math.min(p.maxShield!, p.shield! + p.shieldRegenPerTick!);
      }
    }

    // Nave apagada por EMP → sin propulsión ni giro (queda a la deriva)
    const i: PlayerInput = p.empDisabled ? { inertiaDamp: false } : (p.input || {});

    // En DAMP con nave parada, giro hasta 1.5× más ágil
    const baseTurn = p.turnRateVal ?? CFG.TURN_RATE;
    const dampBoost = (i.inertiaDamp !== false && Math.hypot(p.vx, p.vy) < 0.8);
    const maxTurn   = dampBoost ? baseTurn * 1.5 : baseTurn;

    // Rotación: mouse aim (targetAngle) o fallback teclado
    if (i.targetAngle != null) {
      let diff = i.targetAngle - p.angle;
      while (diff >  Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      p.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    } else {
      if (i.left)  p.angle -= maxTurn;
      if (i.right) p.angle += maxTurn;
    }

    const thrustVal   = p.thrustVal        ?? CFG.THRUST;
    const reverseVal  = p.reverseThrustVal ?? CFG.REVERSE_THRUST;
    const strafeVal   = thrustVal * 0.4;

    if (i.thrust && p.fuel > 0) {
      p.vx  += Math.cos(p.angle) * thrustVal;
      p.vy  += Math.sin(p.angle) * thrustVal;
      p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL);
    } else if (i.reverse && p.fuel > 0) {
      p.vx  -= Math.cos(p.angle) * reverseVal;
      p.vy  -= Math.sin(p.angle) * reverseVal;
      p.fuel = Math.max(0, p.fuel - CFG.REVERSE_FUEL);
    } else if (p.fuel < 100) {
      p.fuel = Math.min(100, p.fuel + (p.fuelRegenVal ?? CFG.FUEL_REGEN));
    }

    // Strafe lateral (A/D) — perpendicular izquierda/derecha en canvas (Y↓)
    /*
    if (i.strafeLeft && p.fuel > 0) {
      p.vx += Math.sin(p.angle) * strafeVal;
      p.vy -= Math.cos(p.angle) * strafeVal;
      p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
    }
    if (i.strafeRight && p.fuel > 0) {
      p.vx -= Math.sin(p.angle) * strafeVal;
      p.vy += Math.cos(p.angle) * strafeVal;
      p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
    }*/
    // Strafe lateral (A/D) → siempre en horizontal/pantalla
    if (i.strafeLeft && p.fuel > 0) {
      p.vx -= strafeVal;
      p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
    }

    if (i.strafeRight && p.fuel > 0) {
      p.vx += strafeVal;
      p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
    }

    if (i.inertiaDamp !== false) {
      // DAMP: misma aceleración que DRIFT con motores; frena al soltarlos
      const thrusting = !!(i.thrust || i.reverse || i.strafeLeft || i.strafeRight);
      if (!thrusting) {
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
    }
    // DRIFT (inertiaDamp=false): sin drag, inercia indefinida
    p.x  += p.vx;
    p.y  += p.vy;

    // ── Evitar esquinas y tender al centro (bots-IA)
    if (p.isBot) applyWorldBoundaryAvoidance(p, room);

    p.x   = Math.max(0, Math.min(room.worldW, p.x));
    p.y   = Math.max(0, Math.min(room.worldH, p.y));
  });
}

module.exports = { stepPlayers };

// Fase del game loop: colisiones. Nave↔asteroide (radial con rebote), balas y
// misiles (trayectoria barrida del tick contra la cápsula del casco, anti-tunneling).
// La guía de misiles (flares + steerMissile + integración) ocurre aquí, justo antes
// de su detección de impacto.

const CFG = require("../config");
const { segmentHitsAsteroid, shipCapsule, segToSegDist, isSheltered } = require("./physics");
const { applyDamage, registerCrewDamage, killPlayer } = require("../entities/player");
const { steerMissile } = require("./weapons");

function collideAsteroids(room) {
  Object.values(room.players).forEach(p => {
    if (p.dead) return;

    for (const ast of room.asteroids) {
      if (ast.z !== 0) continue; // por encima o por debajo → sin colisión
      const dx = p.x - ast.x;
      const dy = p.y - ast.y;
      const dist = Math.hypot(dx, dy);

      const min = ast.r + 14;

      if (dist < min) {
        // ── normal de colisión
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);

        // ── corregir penetración (sacar fuera del asteroide)
        const penetration = min - dist;
        p.x += nx * penetration;
        p.y += ny * penetration;

        // ── velocidad actual
        const vx = p.vx;
        const vy = p.vy;

        // ── velocidad en dirección de la normal (impacto real)
        const dot = vx * nx + vy * ny;

        // ── solo si viene HACIA el asteroide
        if (dot < 0) {
          const restitution = 0.35; // rebote (0 = absorbe, 1 = perfecto rebote)

          // ── rebote físico correcto
          p.vx = vx - (1 + restitution) * dot * nx;
          p.vy = vy - (1 + restitution) * dot * ny;

          // ── daño SOLO si supera velocidad mínima
          const impactSpeed = -dot;

          if (impactSpeed > CFG.ASTEROID_IMPACT_MIN) {
            const damage =
              (impactSpeed - CFG.ASTEROID_IMPACT_MIN) *
              CFG.ASTEROID_DAMAGE_FACTOR;

            // Dirección del impacto: desde la nave hacia el asteroide = -(normal)
            const impactAngle = Math.atan2(-ny, -nx);
            applyDamage(room, p, Math.floor(damage), null, impactAngle);

            if (p.hp <= 0) {
              killPlayer(p, null, "asteroid", room);
            }
          }
        }
      }
    }
  });
}

function stepBullets(room) {
  room.bullets.forEach(b => {
    b.x += b.vx;
    b.y += b.vy;
  });

  room.bullets = room.bullets.filter(b =>
    b.x > -100 && b.x < room.worldW + 100 &&
    b.y > -100 && b.y < room.worldH + 100
  );

  for (let i = room.bullets.length - 1; i >= 0; i--) {

    const b = room.bullets[i];

    const bPrevX = b.x - b.vx;
    const bPrevY = b.y - b.vy;

    // Asteroide intercepta la bala
    if (
      segmentHitsAsteroid(
        bPrevX,
        bPrevY,
        b.x,
        b.y,
        room.asteroids
      )
    ) {
      room.bullets.splice(i, 1);
      continue;
    }

    for (const p of Object.values(room.players)) {

      if (p.dead || p.team === b.team || p.pilotingFor) continue;

      const cap = shipCapsule(p);

      if (
        segToSegDist(
          bPrevX,
          bPrevY,
          b.x,
          b.y,
          cap.rx,
          cap.ry,
          cap.fx,
          cap.fy
        ) < cap.r + CFG.BULLET_RADIUS
      ) {

        // Compatibilidad con tu sistema actual
        if (isSheltered(p.x, p.y, room.asteroids)) {
          room.bullets.splice(i, 1);
          break;
        }

        const dmg = b.damage ?? CFG.BULLET_DAMAGE;
        const attacker = room.players[b.ownerId];
        const bulletAngle = Math.atan2(
          b.y - p.y,
          b.x - p.x
        );

        applyDamage(
          room,
          p,
          dmg,
          attacker,
          bulletAngle
        );

        if (attacker) {
          registerCrewDamage(
            p,
            attacker,
            room
          );
        }

        if (p.hp <= 0) {
          killPlayer(
            p,
            attacker || null,
            "bullet",
            room
          );
        }

        room.bullets.splice(i, 1);
        break;
      }
    }
  }
}

function stepMissiles(room) {
  room.missiles.forEach(m => {
    const flares = room.flare || [];

    // ¿Está siguiendo una flare?
    const flareTarget = m.flareTarget
      ? flares.find(f => f.id === m.flareTarget)
      : null;

    // ¿Está siguiendo un avión?
    const target = m.targetId
      ? room.players[m.targetId]
      : null;

    if (target && !target.dead) {
      target.lockedByMissile = true;
      target.lockedOnMe++;
    }

    // Si todavía no fue engañado por una flare
    if (!m.flareTarget) {
      for (const f of flares) {
        if (Math.hypot(m.x - f.x, m.y - f.y) < CFG.FLARE_RADIUS) {
          // 90% de probabilidad de perder el lock
          if (Math.random() < 0.9) {
            m.flareTarget = f.id;
            m.targetId = null;
          }
          break;
        }
      }
    }

    // Guardar posición previa para swept collision
    m.prevX = m.x;
    m.prevY = m.y;

    // Persigue la flare
    if (flareTarget) {
      steerMissile(
        m,
        flareTarget.x,
        flareTarget.y,
        CFG.FLARE_TURN,
        CFG.FLARE_THRUST
      );
    }
    // Persigue a la nave
    else if (target && !target.dead) {
      steerMissile(
        m,
        target.x,
        target.y,
        CFG.MISSILE_TURN,
        CFG.MISSILE_THRUST
      );
    }
    m.x += m.vx;
    m.y += m.vy;
    m.life--;
  });

  room.missiles = room.missiles.filter(m => m.life > 0);

  for (let i = room.missiles.length - 1; i >= 0; i--) {

    const m = room.missiles[i];

    const mPrevX = m.prevX ?? m.x;
    const mPrevY = m.prevY ?? m.y;

    // Asteroide intercepta el misil
    if (
      segmentHitsAsteroid(
        mPrevX,
        mPrevY,
        m.x,
        m.y,
        room.asteroids
      )
    ) {
      room.missiles.splice(i, 1);
      continue;
    }

    for (const p of Object.values(room.players)) {

      if (p.dead || p.team === m.team || p.pilotingFor) continue;

      const cap = shipCapsule(p);

      const hitR = m.torpedo
        ? CFG.TORPEDO_RADIUS
        : CFG.MISSILE_RADIUS;

      if (
        segToSegDist(
          mPrevX,
          mPrevY,
          m.x,
          m.y,
          cap.rx,
          cap.ry,
          cap.fx,
          cap.fy
        ) < cap.r + hitR
      ) {

        // Compatibilidad con tu sistema actual
        if (isSheltered(p.x, p.y, room.asteroids)) {
          room.missiles.splice(i, 1);
          break;
        }

        const attacker = room.players[m.ownerId];

        const missileAngle = Math.atan2(
          m.y - p.y,
          m.x - p.x
        );

        const dmg = m.torpedo
          ? CFG.TORPEDO_DAMAGE
          : CFG.MISSILE_DAMAGE;

        applyDamage(
          room,
          p,
          dmg,
          attacker,
          missileAngle
        );

        if (attacker) {
          registerCrewDamage(
            p,
            attacker,
            room
          );
        }

        if (p.hp <= 0) {
          killPlayer(
            p,
            attacker || null,
            m.torpedo ? "torpedo" : "missile",
            room
          );
        }

        room.missiles.splice(i, 1);
        break;
      }
    }
  }
}

module.exports = { collideAsteroids, stepBullets, stepMissiles };

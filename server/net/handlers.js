// Manejo de los mensajes WebSocket entrantes. handleMessage(ws, player, msg)
// recibe el mensaje ya parseado y muta el estado de la sala correspondiente.
// El ciclo de conexión (alta/baja del socket) vive en wsServer.js.

const CFG = require("../config");
const { WORLD_PRESETS, MAX_PLAYERS, FPS } = require("../constants");
const { rooms } = require("../state");
const { send, broadcastRoom, broadcastRoomList } = require("./broadcast");
const {
  createRoom, joinRoom, removeFromRoom, roomList, detachGunner,
} = require("../rooms/rooms");
const { startGame, restartRoom } = require("../rooms/lifecycle");
const { applyShipStats, killPlayer } = require("../entities/player");
const { spawnPos, spawnSafePos, createAsteroids } = require("../entities/spawn");
const { fireEmpPulse, dropMine, fireCapitalBeam } = require("../sim/weapons");
const { setWaveBanner, TEAM_LIVES } = require("../ai/waves");

function handleMessage(ws, player, msg) {
  if (msg.type === "getRooms") {
    send(ws, { type: "rooms", rooms: roomList() });
    return;
  }

  if (msg.type === "setName") {
    const raw = String(msg.name || "").trim();
    player.name = raw.replace(/[^\w\sÀ-ɏ\-\.]/g, "").slice(0, 16) || "Pilot";
    const room = rooms[player.roomId];
    if (room) broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "leaveRoom") {
    removeFromRoom(player);
    broadcastRoomList();
    return;
  }

  if (msg.type === "createRoom") {
    const room = createRoom(player.id, player.name);
    joinRoom(player, room);
    send(ws, { type: "roomJoined", roomId: room.id });
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();
    return;
  }

  // Práctica en solitario: sala privada (no listada ni unible) que arranca al instante
  // con un solo jugador y un temporizador configurable.
  if (msg.type === "startSolo") {
    const room = createRoom(player.id, player.name);
    room.solo = true;
    room.name = "Práctica";
    // Tamaño de mundo
    const preset = WORLD_PRESETS[msg.size] || WORLD_PRESETS.medium;
    room.worldSize = WORLD_PRESETS[msg.size] ? msg.size : "medium";
    room.worldW = preset.w; room.worldH = preset.h;
    room.asteroids = createAsteroids(preset.asteroids, preset.w, preset.h);
    // Duración (s): >0 acota a [30, 3600]; 0 o vacío = prácticamente ilimitada
    const secs = Number(msg.durationS);
    room.durationS = (Number.isFinite(secs) && secs > 0) ? Math.min(3600, Math.max(30, secs)) : 999999;

    joinRoom(player, room);
    player.team = "green";
    if (CFG.SHIP_TYPES[msg.shipType]) player.shipType = msg.shipType;
    send(ws, { type: "roomJoined", roomId: room.id });
    startGame(room);          // arranca ya (1 jugador); gameValid=false → sin condición de victoria

    // Modo oleadas: enemigos por rondas escaladas hasta el jefe (Capital)
    if (msg.mode === "waves") {
      room.waveMode  = true;
      room.wave      = 0;
      room.waveState = "intermission";
      room.waveTimer = 5 * FPS;     // primera oleada en ~5s
      room.teamLives = TEAM_LIVES();  // pool de vidas compartido
      setWaveBanner(room, "PREPÁRATE...", 2000);
    }

    broadcastRoomList();
    return;
  }

  if (msg.type === "joinRoom") {
    const room = rooms[msg.roomId];
    if (!room || room.solo) return;
    if (room.status === "playing" && !room.allowJoinMidGame) return;
    if (Object.keys(room.players).length >= MAX_PLAYERS) return;
    joinRoom(player, room);
    send(ws, { type: "roomJoined", roomId: room.id });
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();

    // Mid-game spawn: inicializar el jugador directamente en partida
    if (room.status === "playing") {
      const allP = Object.values(room.players);
      const greenCount = allP.filter(p => p.team === "green" && !p.dead).length;
      const redCount   = allP.filter(p => p.team === "red"   && !p.dead).length;
      if (player.team !== "green" && player.team !== "red") {
        player.team = greenCount <= redCount ? "green" : "red";
      }
      applyShipStats(player);
      player.dead = false;
      player.fuel = 100;
      player.vx = 0; player.vy = 0; player.angle = 0;
      player.kills = 0; player.deaths = 0;
      player.respawnsLeft = CFG.RESPAWN_COUNT ?? 3;
      player.deadAt = null; player.respawnReadyAt = 0;
      player.missileCooldown = 0; player.bulletCooldown = 0;
      const sp = spawnPos(player.team, room);
      player.x = sp.x; player.y = sp.y;
      send(ws, { type: "gameStarted" });
    }
    return;
  }

  if (msg.type === "toggleMidGameJoin") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id) return;
    room.allowJoinMidGame = !room.allowJoinMidGame;
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();
    return;
  }

  // Modo co-op vs IA: todos los jugadores en un equipo (verde) contra oleadas de bots
  if (msg.type === "toggleCoop") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
    room.coopMode = !room.coopMode;
    if (room.coopMode) {
      room.enforceBalance = false;
      // Todos al equipo verde (humanos juntos contra la IA)
      Object.values(room.players).forEach(p => { p.team = "green"; });
    }
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();
    return;
  }

  if (msg.type === "setWorldSize") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
    const preset = WORLD_PRESETS[msg.size];
    if (!preset) return;
    room.worldSize = msg.size;
    room.worldW    = preset.w;
    room.worldH    = preset.h;
    // Regenerar asteroides con el nuevo tamaño
    room.asteroids = createAsteroids(preset.asteroids, preset.w, preset.h);
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();
    return;
  }

  if (msg.type === "setRoomName") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
    room.name = String(msg.name || "").trim().slice(0, 28) || "Nueva sala";
    broadcastRoom(room, { type: "roomUpdate", room });
    broadcastRoomList();
    return;
  }

  if (msg.type === "toggleEnforceBalance") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
    room.enforceBalance = !room.enforceBalance;
    broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "ready") {
    const room = rooms[player.roomId];
    if (!room || room.status !== "waiting") return;

    player.ready = !player.ready;
    broadcastRoom(room, { type: "roomUpdate", room });

    const list = Object.values(room.players);
    if (list.length >= 1 && list.every(p => p.ready)) {
      if (room.enforceBalance) {
        const gc = list.filter(p => p.team === "green").length;
        const rc = list.filter(p => p.team === "red").length;
        if (gc !== rc) {
          broadcastRoom(room, { type: "balanceError", green: gc, red: rc });
          return;
        }
      }
      startGame(room);
      broadcastRoomList();
    }
    return;
  }

  if (msg.type === "switchTeam") {
    const room = rooms[player.roomId];
    if (!room) return;
    if (room.coopMode) return;   // en co-op todos van juntos vs IA, sin cambio de equipo
    if (room.status === "playing") {
      if (!player.dead) return;
      player.team = player.team === "green" ? "red" : "green";
      return;
    }
    player.team   = player.team === "green" ? "red" : "green";
    player.dead   = false;
    player.hp     = 100;
    player.fuel   = 100;
    player.vx     = 0;
    player.vy     = 0;
    player.targetId = null;
    // Sincronizar equipo de todos los artilleros
    if (player.gunnerId) {
      const gunner = room.players[player.gunnerId];
      if (gunner) gunner.team = player.team;
    }
    if (player.gunnerIds) {
      player.gunnerIds.filter(Boolean).forEach(gid => {
        const g = room.players[gid];
        if (g) g.team = player.team;
      });
    }
    broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "selectShip") {
    const room = rooms[player.roomId];
    if (!room) return;
    if (!CFG.SHIP_TYPES[msg.shipType]) return;
    const inLobby = room.status === "waiting";
    const deadInGame = room.status === "playing" && player.dead;
    if (!inLobby && !deadInGame) return;
    // Expulsar artilleros al cambiar de nave multi-crew (solo en lobby)
    if (inLobby) {
      if (player.gunnerId && player.shipType === "gunship" && msg.shipType !== "gunship") {
        const gunner = room.players[player.gunnerId];
        if (gunner) { gunner.pilotingFor = null; gunner.turretIndex = undefined; }
        player.gunnerId = null;
      }
      if (player.gunnerIds && player.shipType === "capital" && msg.shipType !== "capital") {
        player.gunnerIds.forEach((gid, idx) => {
          if (!gid) return;
          const g = room.players[gid];
          if (g) { g.pilotingFor = null; g.turretIndex = undefined; }
          player.gunnerIds[idx] = null;
        });
        player.turretAngles = {};
      }
    }
    // Si estaba muerto con una torreta reservada y ahora elige nave propia, soltar la plaza
    if (deadInGame && player.pilotingFor) detachGunner(room, player);
    player.shipType = msg.shipType;
    if (inLobby) broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "boardShip") {
    const room = rooms[player.roomId];
    if (!room) return;
    // Permitido en el lobby, o en partida si el jugador está muerto (elige reaparecer
    // de torretero en una nave aliada con torreta libre).
    const inLobby     = room.status === "waiting";
    const deadInGame  = room.status === "playing" && player.dead;
    if (!inLobby && !deadInGame) return;

    const target = room.players[msg.targetId];
    if (!target || target.dead) return;          // no se aborda una nave destruida
    if (player.id === msg.targetId) return;
    // En partida solo se aborda una nave del propio equipo
    if (deadInGame && target.team !== player.team) return;

    // Si ya tenía una plaza reservada (o su piloto murió), liberarla antes de reasignar
    if (player.pilotingFor) detachGunner(room, player);

    if (target.shipType === "gunship") {
      if (target.gunnerId) return;
      target.gunnerId    = player.id;
      player.pilotingFor = target.id;
      if (inLobby) player.team = target.team;
    } else if (target.shipType === "capital") {
      if (!target.gunnerIds) target.gunnerIds = [null, null, null];
      const slot = target.gunnerIds.indexOf(null);
      if (slot === -1) return;  // nave llena
      target.gunnerIds[slot] = player.id;
      player.pilotingFor  = target.id;
      player.turretIndex  = slot;
      if (inLobby) player.team = target.team;
      if (!target.turretAngles) target.turretAngles = {};
    } else {
      return;
    }
    broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "leaveShip") {
    const room = rooms[player.roomId];
    if (!room || !player.pilotingFor) return;
    detachGunner(room, player);
    broadcastRoom(room, { type: "roomUpdate", room });
    return;
  }

  if (msg.type === "input") { player.input = msg; return; }

  if (msg.type === "flare") {
    const room = rooms[player.roomId];
    if (!room || player.flaredCooldown > 0 || player.empDisabled) return;
    if ((player.flaresLeft ?? 0) <= 0) return;   // pool de bengalas agotado
    room.flare = room.flare || [];
    room.flare.push({
      id: Date.now() + Math.random(),
      x: player.x,
      y: player.y,
      life: CFG.FLARE_LIFE,
      team: player.team
    });
    player.flaredCooldown = CFG.FLARE_COOLDOWN;
    player.flaresLeft     = Math.max(0, (player.flaresLeft ?? 0) - 1);
  }

  if (msg.type === "missile") {
    const room = rooms[player.roomId];
    if (!room || player.dead) return;
    if (player.empDisabled || (player.pilotingFor && room.players[player.pilotingFor]?.empDisabled)) return;
    if (player.missileCooldown > 0) return;
    const active = room.missiles.filter(m => m.ownerId === player.id).length;
    if (active >= (player.maxMissiles ?? CFG.MISSILE_MAX_ACTIVE)) return;

    // Artillero lanza desde la posición del piloto con ángulo de su torreta
    const origin = player.pilotingFor ? room.players[player.pilotingFor] : player;
    if (!origin || origin.dead) return;
    const fireAngle = player.pilotingFor
      ? ((origin.shipType === "capital" && origin.turretAngles)
          ? (origin.turretAngles[player.id] ?? 0)
          : (origin.turretAngle ?? 0))
      : player.angle;

    // Origen: artillero de Capital lanza desde el hardpoint de su torreta
    let mox = origin.x, moy = origin.y;
    if (player.pilotingFor && origin.shipType === "capital") {
      const slot = (origin.gunnerIds || []).indexOf(player.id);
      const hp = (CFG.SHIP_TYPES.capital.turretHardpoints || [])[slot];
      if (hp) {
        const ca = Math.cos(origin.angle), sa = Math.sin(origin.angle);
        mox = origin.x + hp[0] * ca - hp[1] * sa;
        moy = origin.y + hp[0] * sa + hp[1] * ca;
      }
    }

    room.missiles.push({
      x:        mox,
      y:        moy,
      vx:       Math.cos(fireAngle) * CFG.MISSILE_SPEED_INIT,
      vy:       Math.sin(fireAngle) * CFG.MISSILE_SPEED_INIT,
      team:     player.team,
      targetId: msg.targetId,
      ownerId:  player.id,
      life:     CFG.MISSILE_LIFE,
      torpedo:  !!player.firesTorpedoes,   // Disruptor lanza torpedos (más grandes y dañinos)
    });

    player.missileCooldown = player.missileCooldownBase ?? CFG.MISSILE_COOLDOWN;
  }

  if (msg.type === "selfDestruct") {
    const room = rooms[player.roomId];
    if (!room || room.status !== "playing" || player.dead) return;
    killPlayer(player, null, "self", room);
    return;
  }

  if (msg.type === "respawn") {
    const room = rooms[player.roomId];
    if (!room || room.status !== "playing" || !player.dead) return;
    if (Date.now() < (player.respawnReadyAt ?? 0)) return;
    // Vidas: en modo oleadas (co-op / solo-oleadas) hay un pool compartido del equipo;
    // en PVP normal / vuelo libre el respawn es infinito (hasta que acabe el tiempo).
    if (room.waveMode) {
      if ((room.teamLives ?? 0) <= 0) return;
      room.teamLives--;
    }
    // ¿Tiene una torreta reservada en una nave aliada viva? (eligió "ir de torretero")
    const seatPilot = player.pilotingFor ? room.players[player.pilotingFor] : null;
    const seatValid = seatPilot && !seatPilot.dead && seatPilot.team === player.team &&
      (((seatPilot.gunnerIds || []).includes(player.id)) || seatPilot.gunnerId === player.id);

    player.dead   = false;
    player.deadAt = null;

    if (seatValid) {
      // Reaparece directamente como artillero de la nave aliada
      player.team           = seatPilot.team;
      player.hp = 1; player.maxHp = 1;         // muere con el piloto
      player.shield = 0; player.maxShield = 0;
      player.maxMissiles    = CFG.GUNNER_MISSILES ?? 20;
      player.missileCooldownBase = CFG.GUNNER_MISSILE_COOLDOWN ?? 55;
      player.missileCooldown = 0; player.bulletCooldown = 0; player.turretCooldown = 0;
      player.x = seatPilot.x; player.y = seatPilot.y;
      player.vx = 0; player.vy = 0; player.angle = seatPilot.angle;
      if (seatPilot.shipType === "capital") {
        if (!seatPilot.turretAngles) seatPilot.turretAngles = {};
        seatPilot.turretAngles[player.id] = seatPilot.angle;
      }
    } else {
      // Sin reserva válida: eyectar como caza independiente (mantiene la nave elegida)
      detachGunner(room, player);
      if (!CFG.SHIP_TYPES[player.shipType]) player.shipType = "fighter";
      applyShipStats(player);
      player.vx = 0; player.vy = 0; player.angle = 0;
      player.missileCooldown = 0; player.bulletCooldown = 0;
      player.fuel = 100;
      //const rsp = spawnPos(player.team, room);
      const rsp = spawnSafePos(player.team, room);
      player.x = rsp.x; player.y = rsp.y;
    }
    return;
  }

  if (msg.type === "restartGame") {
    const room = rooms[player.roomId];
    if (!room || room.ownerId !== player.id || room.status !== "playing") return;
    if (room.solo) return;   // las salas de práctica no se reinician (se sale al lobby)
    restartRoom(room);
    broadcastRoomList();
    return;
  }

  if (msg.type === "chat") {
    const room = rooms[player.roomId];
    if (!room || room.status !== "playing") return;
    const text = String(msg.text || "").trim().slice(0, 60);
    if (!text) return;
    broadcastRoom(room, { type: "chat", name: player.name, team: player.team, text });
    return;
  }

  if (msg.type === "shoot") {
    const room = rooms[player.roomId];
    if (!room || player.dead) return;

    if (player.pilotingFor) {
      // Artillero: disparo de torreta
      const pilot = room.players[player.pilotingFor];
      if (!pilot || pilot.dead) return;
      if (pilot.empDisabled) return;   // nave apagada por EMP
      if (player.turretCooldown > 0) return;
      player.turretCooldown = CFG.TURRET_COOLDOWN;
      // Ángulo: Capital usa turretAngles por artillero; Gunship usa turretAngle único
      const fireAngle = (pilot.shipType === "capital" && pilot.turretAngles)
        ? (pilot.turretAngles[player.id] ?? 0)
        : (pilot.turretAngle ?? 0);
      // Origen de la bala: la Capital dispara desde el hardpoint de la torreta
      // (rotado con el casco); el Gunship desde el centro.
      let ox = pilot.x, oy = pilot.y;
      if (pilot.shipType === "capital") {
        const slot = (pilot.gunnerIds || []).indexOf(player.id);
        const hp = (CFG.SHIP_TYPES.capital.turretHardpoints || [])[slot];
        if (hp) {
          const ca = Math.cos(pilot.angle), sa = Math.sin(pilot.angle);
          ox = pilot.x + hp[0] * ca - hp[1] * sa;
          oy = pilot.y + hp[0] * sa + hp[1] * ca;
        }
      }
      room.bullets.push({
        x: ox, y: oy,
        vx: Math.cos(fireAngle) * CFG.TURRET_BULLET_SPEED,
        vy: Math.sin(fireAngle) * CFG.TURRET_BULLET_SPEED,
        team: player.team, ownerId: player.id,
        damage: CFG.TURRET_DAMAGE,
      });
    } else if (player.shipType === "capital") {
      // La Capital no dispara balas: su arma principal es el rayo cargado
      // (gestionado por los mensajes "beamCharge"). Ignorar "shoot".
      return;
    } else {
      // Piloto: disparo normal
      if (player.empDisabled) return;   // nave apagada por EMP
      if (player.bulletCooldown > 0) return;
      player.bulletCooldown = CFG.BULLET_COOLDOWN;
      room.bullets.push({
        x: player.x, y: player.y,
        vx: Math.cos(player.angle) * CFG.BULLET_SPEED,
        vy: Math.sin(player.angle) * CFG.BULLET_SPEED,
        team: player.team, ownerId: player.id,
        damage: player.bulletDamage ?? CFG.BULLET_DAMAGE,
      });
    }
  }

  // ── Habilidad especial (tecla X): depende del tipo de nave
  if (msg.type === "special") {
    const room = rooms[player.roomId];
    if (!room || player.dead || player.pilotingFor || player.empDisabled) return;
    if (player.shipType === "emp") {
      if ((player.empCooldown ?? 0) > 0) return;
      player.empCooldown = CFG.EMP_PULSE_COOLDOWN;
      fireEmpPulse(player, room);
    } else if (player.shipType === "interceptor") {
      if ((player.mineCooldown ?? 0) > 0) return;
      player.mineCooldown = CFG.MINE_COOLDOWN;
      dropMine(player, room);
    }
    return;
  }

  // ── Carga del rayo de la Capital (mantener pulsado para cargar, soltar para disparar)
  if (msg.type === "beamCharge") {
    const room = rooms[player.roomId];
    if (!room || player.dead || player.pilotingFor) return;
    if (player.shipType !== "capital") return;

    if (msg.charging) {
      player.beamCharging = true;
    } else {
      // Al soltar: dispara solo si está totalmente cargado Y no es una cancelación
      // (mouseleave / pérdida de foco / muerte). Así el rayo no se dispara por un
      // release involuntario.
      player.beamCharging = false;
      if (!msg.cancel && (player.beamChargeTicks ?? 0) >= CFG.CAPITAL_BEAM_CHARGE_TIME) {
        fireCapitalBeam(player, room);
      }
      player.beamChargeTicks = 0;
      player.beamCharge = 0;
    }
  }
}

module.exports = { handleMessage };

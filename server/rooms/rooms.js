// Gestión de salas y de la tripulación (crew): alta/baja de salas, listado
// público, y vínculos piloto↔artillero. broadcast se requiere por namespace
// (no destructurado) porque rooms↔broadcast forman un ciclo: así la resolución
// ocurre en tiempo de llamada, no de carga.

const crypto = require("crypto");
const { WORLD_PRESETS } = require("../constants");
const { rooms } = require("../state");
const { createAsteroids } = require("../entities/spawn");
const broadcast = require("../net/broadcast");

// Desvincula a un artillero de su nave, liberando la plaza en el piloto.
function detachGunner(room, gunner) {
  if (!gunner || !gunner.pilotingFor) return;
  const pilot = room.players[gunner.pilotingFor];
  if (pilot) {
    if (pilot.gunnerIds) {
      const idx = pilot.gunnerIds.indexOf(gunner.id);
      if (idx !== -1) pilot.gunnerIds[idx] = null;
    }
    if (pilot.gunnerId === gunner.id) pilot.gunnerId = null;
    if (pilot.turretAngles) delete pilot.turretAngles[gunner.id];
  }
  gunner.pilotingFor = null;
  gunner.turretIndex = undefined;
}

// Libera todas las plazas de una nave y desvincula a su tripulación
// (al destruirse la nave o al salir/desconectarse el piloto).
function clearCrewSeats(room, pilot) {
  const crewIds = pilot.gunnerIds ? pilot.gunnerIds.filter(Boolean) : (pilot.gunnerId ? [pilot.gunnerId] : []);
  for (const gid of crewIds) {
    const g = room.players[gid];
    if (g) { g.pilotingFor = null; g.turretIndex = undefined; }
  }
  if (pilot.gunnerIds) pilot.gunnerIds = [null, null, null];
  pilot.gunnerId = null;
  if (pilot.turretAngles) pilot.turretAngles = {};
}

function createRoom(ownerId, ownerName) {
  const id     = crypto.randomUUID();
  const preset = WORLD_PRESETS.medium;
  const W = preset.w, H = preset.h;
  rooms[id] = {
    id,
    status: "waiting",
    ownerId,
    name: ownerName ? `Sala de ${ownerName}`.slice(0, 28) : "Nueva sala",
    enforceBalance: false,
    worldSize: "medium",
    worldW: W,
    worldH: H,
    players: {},
    bullets: [],
    missiles: [],
    beams: [],
    empPulses: [],
    mines: [],
    flare: [],
    asteroids: createAsteroids(preset.asteroids, W, H),
    winner:  null,
    killFeed: [],
    timeLeft: 0,
    allowJoinMidGame: false,
  };
  return rooms[id];
}

function joinRoom(player, room) {
  player.roomId = room.id;
  room.players[player.id] = player;
  if (room.coopMode) player.team = "green";   // co-op: todos en el mismo equipo
}

function removeFromRoom(player) {
  if (!player.roomId) return;
  const room = rooms[player.roomId];
  if (!room) return;

  // Limpiar vínculos de tripulación (artillero y/o piloto, Gunship y Capital)
  detachGunner(room, player);     // si era artillero, libera su plaza
  clearCrewSeats(room, player);   // si pilotaba, desvincula a sus artilleros

  delete room.players[player.id];
  player.roomId = null;

  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
  } else {
    broadcast.broadcastRoom(room, { type: "roomUpdate", room });
  }
}

function roomList() {
  return Object.values(rooms).filter(r => !r.solo).map(r => ({
    id:               r.id,
    name:             r.name || "Nueva sala",
    players:          Object.keys(r.players).length,
    status:           r.status,
    allowJoinMidGame: r.allowJoinMidGame,
    enforceBalance:   r.enforceBalance,
    worldSize:        r.worldSize || "medium",
  }));
}

module.exports = {
  detachGunner,
  clearCrewSeats,
  createRoom,
  joinRoom,
  removeFromRoom,
  roomList,
};

// Estado global en memoria del servidor. No hay base de datos: las salas viven en
// RAM y se pierden al reiniciar (comportamiento esperado). Ambas estructuras se
// MUTAN (nunca se reasignan) para que la referencia compartida entre módulos
// permanezca estable.
//
//   rooms   — { roomId → room }           salas activas
//   clients — Map<playerId, WebSocket>    sockets conectados

const rooms   = {};
const clients = new Map();

module.exports = { rooms, clients };

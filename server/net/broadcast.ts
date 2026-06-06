// Helpers de envío por WebSocket. broadcastRoomList necesita roomList() de
// rooms.ts, que a su vez necesita broadcastRoom() de aquí: ese ciclo se rompe con
// un require PEREZOSO de rooms dentro de la función (rooms ya está cargado cuando
// se emite el primer broadcast).

const { clients } = require("../state.ts");

function send(ws: any, data: any): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcastRoom(room: Room, data: any): void {
  const payload = JSON.stringify(data);
  Object.keys(room.players).forEach(id => {
    const ws = clients.get(id);
    if (ws && ws.readyState === 1) ws.send(payload);
  });
}

function broadcastRoomList(): void {
  const { roomList } = require("../rooms/rooms.ts");   // lazy → rompe el ciclo broadcast↔rooms
  const payload = JSON.stringify({ type: "rooms", rooms: roomList() });
  for (const [, ws] of clients) {
    if (ws.readyState === 1 && !ws.player?.roomId) ws.send(payload);
  }
}

// Aviso puntual a UN jugador (toast en el cliente). `key` es una clave i18n.
function notifyPlayer(playerId: string, key: string): void {
  const ws = clients.get(playerId);
  if (ws) send(ws, { type: "notice", key });
}

module.exports = { send, broadcastRoom, broadcastRoomList, notifyPlayer };

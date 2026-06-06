// Helpers de envío por WebSocket. broadcastRoomList necesita roomList() de
// rooms.js, que a su vez necesita broadcastRoom() de aquí: ese ciclo se rompe con
// un require PEREZOSO de rooms dentro de la función (rooms ya está cargado cuando
// se emite el primer broadcast).

const { clients } = require("../state");

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcastRoom(room, data) {
  const payload = JSON.stringify(data);
  Object.keys(room.players).forEach(id => {
    const ws = clients.get(id);
    if (ws && ws.readyState === 1) ws.send(payload);
  });
}

function broadcastRoomList() {
  const { roomList } = require("../rooms/rooms");   // lazy → rompe el ciclo broadcast↔rooms
  const payload = JSON.stringify({ type: "rooms", rooms: roomList() });
  for (const [, ws] of clients) {
    if (ws.readyState === 1 && !ws.player?.roomId) ws.send(payload);
  }
}

module.exports = { send, broadcastRoom, broadcastRoomList };

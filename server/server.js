// Punto de entrada del servidor (composition root). Arranca los dos servidores
// HTTP (juego en PORT, panel admin en PORT+1) y el game loop a 60 fps. Toda la
// lógica vive en los módulos de net/ rooms/ sim/ entities/ ai/ admin/.
//
// Servidor autoritativo: toda la física, colisiones, cooldowns, puntuación y
// condición de victoria viven aquí (no en el cliente). El cliente solo envía
// inputs, interpola el estado recibido y dibuja.

const { startAdminServer } = require("./admin/adminServer");
const { startGameServer }  = require("./net/wsServer");
const { startLoop }        = require("./sim/loop");

const PORT       = parseInt(process.env.PORT) || 8080;
const ADMIN_PORT = PORT + 1;

startAdminServer(ADMIN_PORT);
startGameServer(PORT);
startLoop();

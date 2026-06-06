// ── Canvas compartido + helpers de proyección ────────────────────────
// El <canvas id="c"> y su contexto 2D los comparten todos los módulos de
// render (mundo, entidades, HUD, loop) y también game.ts (input necesita el
// tamaño del canvas). Vive aquí para tener una única fuente de verdad.

import { S } from "../state";

export const canvas = document.getElementById("c") as HTMLCanvasElement;
export const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

canvas.width = innerWidth;
canvas.height = innerHeight;

addEventListener("resize", () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});

// Jugador local (atajo sobre el estado interpolado).
export function getMe(): any {
  return S.players[S.myId as string];
}

// Convierte coordenadas de mundo a pantalla según la cámara.
export function worldToScreen(x: number, y: number, camX: number, camY: number) {
  return {
    x: x - camX + canvas.width / 2,
    y: y - camY + canvas.height / 2,
  };
}

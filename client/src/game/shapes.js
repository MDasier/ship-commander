// Geometria de naves (formas para dibujar en canvas).
// Modulo autocontenido: las funciones reciben el contexto 2D por parametro y no
// dependen de estado mutable del juego. Extraido de game.js (Fase A modular).

const SHIP_SHAPES = {
  interceptor: {
    body: [
      [22, 0], [21, -6.2], [20, -6.4], [18.4, -2.7], [12.5, -4.7],
      [6.3, -7.2], [7.8, -10.1], [6.2, -10.3], [4.5, -8], [-6.9, -7.2],
      [-10.2, -4.8], [-11.5, -7], [-11.5, -14.1], [-12.6, -14.2], [-14.1, -12.9],
      [-15.5, -14.1], [-16.9, -13.8], [-18.1, -8.4], [-16.8, -7.5], [-17.2, -6.6],
      [-18.5, -6.4], [-18.8, -0.6], [-18.8, 0.6], [-18.5, 6.4], [-17.2, 6.6],
      [-16.8, 7.5], [-18.1, 8.4], [-16.9, 13.8], [-15.5, 14.1], [-14.1, 12.9],
      [-12.6, 14.2], [-11.5, 14.1], [-11.5, 7], [-10.2, 4.8], [-6.9, 7.2],
      [4.5, 8], [6.2, 10.3], [7.8, 10.1], [6.3, 7.2], [12.5, 4.7],
      [18.4, 2.7], [20, 6.4], [21, 6.2],
    ],
    engine: [[-20, -10], [-18, 0], [-20, 10]],
    hpBarW: 34,
    uiOffY: -30,
    shieldR: 22,
    cockpit: [0.8, -0.3, 4.9, 2.5],
    lines: [
      [[16, 0], [-20, 0]],
      [[2, -7], [-16, -18]],
      [[2, 7], [-16, 18]],
      [[-6, -5], [-6, 5]],
    ],
  },
  fighter: {
    body: [
      [35.1, -0.1], [34, -1.2], [33.5, -1.8], [29.9, -3.2], [26.8, -3.7],
      [23.6, -4.4], [23.5, -6.3], [19.5, -7.5], [19.9, -8.6], [-1.7, -24.1],
      [-4.3, -21.4], [-22.1, -35.1], [-25.3, -33.6], [-14.7, -17.6], [-13.4, -17.8],
      [-12.5, -16.5], [-14.2, -12.5], [-18.2, -11.6], [-21.9, -14], [-24.7, -13.7],
      [-26.1, -10.6], [-26.6, -9.6], [-27.8, -9.6], [-29.2, -8.6], [-30.8, -8.7],
      [-34.2, -6.5], [-33.8, -5.3], [-24.9, -3.2], [-24.1, -1.7], [-24.6, -0.5],
      [-24.1, 1.7], [-24.9, 3.2], [-33.8, 5.3], [-34.2, 6.5], [-30.8, 8.7],
      [-29.2, 8.6], [-27.8, 9.6], [-26.6, 9.6], [-26.1, 10.6], [-24.7, 13.7],
      [-21.9, 14], [-18.2, 11.6], [-14.2, 12.5], [-12.5, 16.5], [-13.4, 17.8],
      [-14.7, 17.6], [-25.3, 33.6], [-22.1, 35.1], [-4.3, 21.4], [-1.7, 24.1],
      [19.9, 8.6], [19.5, 7.5], [23.5, 6.3], [23.6, 4.4], [26.8, 3.7],
      [29.9, 3.2], [33.5, 1.8], [34, 1.2],
    ],
    engine: [[-34.2, -24], [-52.2, 0], [-34.2, 24]],
    hpBarW: 44,
    uiOffY: -30,
    shieldR: 40,
    cockpit: [27.7, 0, 3.5, 2],
    lines: [
      [[16, 0], [-22, 0]],
      [[4, -10], [-12, -20]],
      [[4, 10], [-12, 20]],
      [[-4, -7], [-4, 7]],
    ],
  },

  bomber: {
    body: [
      [14.4, 0], [16.56, -3.06], [13.32, -4.5], [6.66, -6.12], [3.42, -8.82],
      [7.2, -9.18], [34.56, -9.9], [34.56, -16.92], [10.98, -23.76], [12.96, -21.42],
      [-3.78, -25.92], [-5.94, -28.62], [-15.84, -30.42], [-38.34, -20.16], [-38.7, -12.96],
      [-35.82, -10.98], [-33.84, -9.54], [-31.5, -9.72], [-29.88, -10.62], [-28.62, -11.16],
      [-24.84, -10.26], [-23.58, -8.64], [-35.82, -5.22], [-35.82, -3.78], [-37.44, -3.96],
      [-37.98, -1.26], [-37.98, 1.26], [-37.44, 3.96], [-35.82, 3.78], [-35.82, 5.22],
      [-23.58, 8.64], [-24.84, 10.26], [-28.62, 11.16], [-29.88, 10.62], [-31.5, 9.72],
      [-33.84, 9.54], [-35.82, 10.98], [-38.7, 12.96], [-38.34, 20.16], [-15.84, 30.42],
      [-5.94, 28.62], [-3.78, 25.92], [12.96, 21.42], [10.98, 23.76], [34.56, 16.92],
      [34.56, 9.9], [7.2, 9.18], [3.42, 8.82], [6.66, 6.12], [13.32, 4.5],
      [16.56, 3.06],
    ],
    engine: [[-35.5, -20], [-49.5, 0], [-35.5, 20]],
    hpBarW: 111.6,
    uiOffY: -57.6,
    shieldR: 45,
    cockpit: [16.02, -0.54, 6.48, 6.12],
    lines: [
      [[43.2, 0], [-39.6, 0]],
      [[-18, -16.2], [-28.8, -36]],
      [[-18, 16.2], [-28.8, 36]],
      [[0, -16.2], [0, 16.2]],
      [[-25.2, -14.4], [-25.2, 14.4]],
    ],
  },

  gunship: {
    body: [
      [45.4, 0.1], [45.2, -4], [36.6, -5.3], [30.6, -14.6], [15.7, -20.3],
      [12.3, -20.5], [3.4, -29.4], [-7.4, -29.7], [-8.4, -27.5], [-6.8, -26.9],
      [-7.4, -22.7], [-5, -19.7], [-13.5, -19.2], [-43.1, -14.8], [-43.4, -9.4],
      [-39.9, -7.8], [-14.7, -7.5], [-15.3, -4.3], [-16.9, -3.8], [-17.3, -0.9],
      [-17.3, 0.9], [-16.9, 3.8], [-15.3, 4.3], [-14.7, 7.5], [-39.9, 7.8],
      [-43.4, 9.4], [-43.1, 14.8], [-13.5, 19.2], [-5, 19.7], [-7.4, 22.7],
      [-6.8, 26.9], [-8.4, 27.5], [-7.4, 29.7], [3.4, 29.4], [12.3, 20.5],
      [15.7, 20.3], [30.6, 14.6], [36.6, 5.3], [45.2, 4],
    ],
    engine: [[-20.4, -10], [-19.4, 0], [-20.4, 10]],
    hpBarW: 90,
    uiOffY: -46,
    shieldR: 58,
    cockpit: [39.2, -0.2, 2, 4.3],
    cockpitRect: true,
    lines: [
      [[20, 0], [-24, 0]],
      [[4, -28], [-16, -30]],
      [[4, 28], [-16, 30]],
      [[-16, -14], [-16, 14]],
      [[2, -10], [2, 10]],
    ],
  },

  emp: {
    body: [
      [24, 0], [22.2, -2.6], [21.5, -4], [20, -5.3], [18.6, -5.5],
      [15.5, -6.7], [-16.3, -48.5], [-19.8, -49.8], [-21.5, -49.3], [-23.6, -42.6],
      [-26, -41.2], [-25.6, -38.9], [-28.9, -32.3], [-26.3, -27], [-20.4, -27.2],
      [-29.9, -12.6], [-28.3, -10.9], [-18.1, -10.9], [-24.7, -9.3], [-29.6, -6.3],
      [-30.4, -2.8], [-30.4, 2.8], [-29.6, 6.3], [-24.7, 9.3], [-18.1, 10.9],
      [-28.3, 10.9], [-29.9, 12.6], [-20.4, 27.2], [-26.3, 27], [-28.9, 32.3],
      [-25.6, 38.9], [-26, 41.2], [-23.6, 42.6], [-21.5, 49.3], [-19.8, 49.8],
      [-16.3, 48.5], [15.5, 6.7], [18.6, 5.5], [20, 5.3], [21.5, 4],
      [22.2, 2.6],
    ],
    engine: [[-30.4, -24], [-48.4, 0], [-30.4, 24]],
    hpBarW: 70,
    uiOffY: -50,
    shieldR: 46,
    cockpit: [18.2, -0.2, 2, 2.4],
    lines: [
      [[20, 0], [-8, 0]],
      [[16, 0], [-13, -36]],
      [[16, 0], [-13, 36]],
    ],
  },
  capital: {
    body: [
      [125, -3.1], [93.8, -13.5], [66.7, -29], [48.3, -30.2], [53.3, -36.5],
      [43.8, -42.3], [12.9, -40.2], [11.7, -33.5], [-5.4, -34.8], [-11.7, -47.7],
      [-24.2, -51.5], [-31.2, -49], [-41.7, -50.2], [-39.6, -55.6], [-42.1, -60.6],
      [-79.2, -61], [-78.7, -54], [-60.4, -52.7], [-61.2, -49], [-76.7, -48.5],
      [-90.4, -20.6], [-109.6, -12.7], [-115, -8.1], [-119.6, -5.6], [-119.6, 5.6],
      [-115, 8.1], [-109.6, 12.7], [-90.4, 20.6], [-76.7, 48.5], [-61.2, 49],
      [-60.4, 52.7], [-78.7, 54], [-79.2, 61], [-42.1, 60.6], [-39.6, 55.6],
      [-41.7, 50.2], [-31.2, 49], [-24.2, 51.5], [-11.7, 47.7], [-5.4, 34.8],
      [11.7, 33.5], [12.9, 40.2], [43.8, 42.3], [53.3, 36.5], [48.3, 30.2],
      [66.7, 29], [93.8, 13.5], [125, 3.1],
    ],

    engine: [[-119.6, -24], [-137.6, 0], [-119.6, 24]],

    hpBarW: 190,
    uiOffY: -70,
    shieldR: 108,

    cockpit: [-33.7, -0.2, 11.2, 7.5],
    cockpitRect: true,

    lines: [
      // espina dorsal principal
      [[118, -3], [-110, -3]],

      // eje secundario inferior (refuerzo estructural)
      [[118, 3], [-110, 3]],

      // costados internos superiores
      [[76, -20], [66, -29]],
      [[43.8, -42.3], [11.7, -33.5]],
      [[-11.7, -47.7], [-41.7, -50.2]],
      [[-60.4, -52.7], [-90.4, -20.6]],

      // costados internos inferiores
      [[76, 20], [66.7, 29]],
      [[43.8, 42.3], [11.7, 33.5]],
      [[-11.7, 47.7], [-41.7, 50.2]],
      [[-60.4, 52.7], [-90.4, 20.6]],

      // secciones tipo “mamparos”
      [[48, -30], [48, 30]],
      [[12, -40], [12, 40]],
      [[-31.2, -49], [-31.2, 49]],
      [[-76.7, -48.5], [-76.7, 48.5]],

      // unión hacia popa / motores
      [[-110, -12], [-90, -20]],
      [[-110, 12], [-90, 20]],

      // estructura central (núcleo)
      [[11.7, -33.5], [43.8, -42.3]],
      [[11.7, 33.5], [43.8, 42.3]],
      [[-5.4, -34.8], [-5.4, 34.8]],
    ],

    turretHardpoints: [
      [-13.3, -38.1],
      [-13.3, 38.1],
      [87.1, -0.2]
    ],
  }
};

function getShapeDef(type) {
  return SHIP_SHAPES[type] || SHIP_SHAPES.fighter;
}

// Draw a ship polygon path (no fill/stroke — caller does that)
function buildShipPath(c, type) {
  const pts = getShapeDef(type).body;
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

// Dibuja el detalle interior de una nave (líneas de chasis + cabina/puente).
// Asume que el contexto ya está trasladado/rotado a la nave. Recorta al casco
// para que ningún trazo se salga de la silueta.
function drawShipDetail(c, type, player) {
  const shape = getShapeDef(type);
  const isGreen = player.team === "green";

  // ── Paneles / líneas de chasis (recortados al casco) ──
  if (shape.lines && shape.lines.length) {
    c.save();
    c.beginPath();
    buildShipPath(c, type);
    c.clip();

    // surco oscuro
    c.lineCap = "round";
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 1.3;
    c.beginPath();
    for (const [a, b] of shape.lines) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();

    // realce tenue desplazado (relieve)
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = 0.8;
    c.beginPath();
    for (const [a, b] of shape.lines) { c.moveTo(a[0], a[1] + 0.9); c.lineTo(b[0], b[1] + 0.9); }
    c.stroke();
    c.restore();
  }

  // ── Cabina / puente de mando (cristal, con tinte de equipo) ──
  if (shape.cockpit && !player.dead) {
    const [cx, cy, rx, ry] = shape.cockpit;
    const rect = !!shape.cockpitRect;
    c.save();
    c.translate(cx, cy);
    const g = c.createRadialGradient(-rx * 0.3, -ry * 0.35, 0.5, 0, 0, Math.max(rx, ry));
    g.addColorStop(0, "#eaffff");
    g.addColorStop(0.5, isGreen ? "#1fd6a0" : "#ff7088");
    g.addColorStop(1, "#03101a");
    c.fillStyle = g;
    if (rect) {
      // Puente rectangular (superestructura militar) con esquinas redondeadas
      const r = Math.min(rx, ry) * 0.35;
      roundRectPath(c, -rx, -ry, rx * 2, ry * 2, r);
    } else {
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    }
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.55)";
    c.lineWidth = 1.2;
    c.stroke();
    if (rect) {
      // Ventanales: línea de mirada del puente
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(-rx * 0.75, -ry * 0.2); c.lineTo(rx * 0.75, -ry * 0.2);
      c.moveTo(-rx * 0.75, ry * 0.2); c.lineTo(rx * 0.75, ry * 0.2);
      c.stroke();
    }
    // brillo especular
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.beginPath();
    c.ellipse(-rx * 0.32, -ry * 0.35, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

// Traza un rectángulo de esquinas redondeadas (no rellena ni dibuja).
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Draw preview silhouettes into the selector canva
// `accent` opcional ("gold") recolorea la preview para el reskin React; por
// defecto mantiene el cian de las pantallas legacy (sala / panel de muerte).
function drawShipPreviewInto(el, type, shape, accent) {
  const C = accent === "gold"
    ? { fill: "#ffc61933", stroke: "#ffc619", line: "#908d4899", cockpit: "#ffe75ccc", engine: "#908d48aa" }
    : { fill: "#00ccff55", stroke: "#00ccff", line: "#00aaff66", cockpit: "#bff4ffcc", engine: "#00aaff88" };
  const pc = el.getContext("2d");
  const w = el.width, h = el.height;
  pc.clearRect(0, 0, w, h);
  pc.save();
  pc.translate(w / 2, h / 2);
  const rotated = type === "gunship";
  if (rotated) pc.rotate(-Math.PI / 2);
  const xs = shape.body.map(p => p[0]);
  const ys = shape.body.map(p => p[1]);
  const bW = rotated ? (Math.max(...ys) - Math.min(...ys)) : (Math.max(...xs) - Math.min(...xs));
  const bH = rotated ? (Math.max(...xs) - Math.min(...xs)) : (Math.max(...ys) - Math.min(...ys));
  const sc = Math.min((w * 0.88) / bW, (h * 0.88) / bH);
  pc.scale(sc, sc);
  pc.beginPath();
  buildShipPath(pc, type);
  pc.fillStyle = C.fill;
  pc.strokeStyle = C.stroke;
  pc.lineWidth = 1.5 / sc;
  pc.fill();
  pc.stroke();
  // Líneas de chasis
  if (shape.lines && shape.lines.length) {
    pc.strokeStyle = C.line;
    pc.lineWidth = 1 / sc;
    pc.beginPath();
    for (const [a, b] of shape.lines) { pc.moveTo(a[0], a[1]); pc.lineTo(b[0], b[1]); }
    pc.stroke();
  }
  // Cabina / puente
  if (shape.cockpit) {
    const [cx, cy, rx, ry] = shape.cockpit;
    pc.fillStyle = C.cockpit;
    if (shape.cockpitRect) {
      roundRectPath(pc, cx - rx, cy - ry, rx * 2, ry * 2, Math.min(rx, ry) * 0.35);
    } else {
      pc.beginPath();
      pc.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    pc.fill();
  }
  const eng = shape.engine;
  pc.beginPath();
  pc.moveTo(eng[0][0], eng[0][1]);
  pc.lineTo(eng[1][0], eng[1][1]);
  pc.lineTo(eng[2][0], eng[2][1]);
  pc.strokeStyle = C.engine;
  pc.lineWidth = 1 / sc;
  pc.stroke();
  pc.restore();
}

// Puente para React: dibuja la geometría de una nave en un canvas dado.
function drawShipPreview(canvas, type, accent) {
  const shape = SHIP_SHAPES[type];
  if (canvas && shape) drawShipPreviewInto(canvas, type, shape, accent);
}

export {
  SHIP_SHAPES, getShapeDef, buildShipPath, drawShipDetail,
  roundRectPath, drawShipPreviewInto, drawShipPreview,
};

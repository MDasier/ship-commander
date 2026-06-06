// Genera tools/ship-presets.js a partir de SHIP_SHAPES en client/game.js.
// Úsalo para refrescar las plantillas del editor tras cambiar formas en el juego:
//   node tools/gen-presets.js
const fs = require("fs");
const path = require("path");

const gamePath = path.join(__dirname, "..", "client", "src", "game.js");
const src = fs.readFileSync(gamePath, "utf8");

const marker = "const SHIP_SHAPES =";
const mi = src.indexOf(marker);
if (mi === -1) { console.error("No se encontró SHIP_SHAPES en game.js"); process.exit(1); }

// Extrae el literal de objeto contando llaves balanceadas
let i = src.indexOf("{", mi);
let depth = 0, end = -1;
for (let j = i; j < src.length; j++) {
  const ch = src[j];
  if (ch === "{") depth++;
  else if (ch === "}") { depth--; if (depth === 0) { end = j; break; } }
}
const objText = src.slice(i, end + 1);

// Solo contiene arrays/números/booleanos/strings → eval seguro en este contexto local
let SHIP_SHAPES;
try { SHIP_SHAPES = eval("(" + objText + ")"); }
catch (e) { console.error("Error al evaluar SHIP_SHAPES:", e.message); process.exit(1); }

const out = "// AUTO-GENERADO por gen-presets.js — no editar a mano.\n" +
            "// Refresca con:  node tools/gen-presets.js\n" +
            "window.SHIP_PRESETS = " + JSON.stringify(SHIP_SHAPES, null, 2) + ";\n";

fs.writeFileSync(path.join(__dirname, "ship-presets.js"), out);
console.log("ship-presets.js generado con naves:", Object.keys(SHIP_SHAPES).join(", "));

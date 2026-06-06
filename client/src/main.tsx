import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import "./styles.css";
// Arranca el juego (canvas imperativo). El markup vive en index.html; game.js
// se auto-ejecuta al importarse y captura sus elementos por id. Migración
// incremental (strangler): la UI se irá moviendo a componentes React.
import "./game.js";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router";
import MainMenu from "./ui/MainMenu";
import ControlsScreen from "./ui/ControlsScreen";

// Mapea cada pantalla del menú (emitida por game.js) a una ruta. Por ahora solo
// "/" (MainMenu) tiene componente React; lobby/solo/room siguen en game.js y se
// migrarán a estas rutas en los próximos pasos.
const SCREEN_PATH: Record<string, string> = {
  mainMenu: "/",
  lobby: "/lobby",
  soloSetup: "/solo",
  room: "/room",
};

export default function App() {
  const navigate = useNavigate();
  const [showControls, setShowControls] = useState(false);

  // game.js emite "menu-screen" al cambiar de pantalla → reflejamos en la URL.
  useEffect(() => {
    const onScreen = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      const path = SCREEN_PATH[name];
      if (path) navigate(path);
    };
    window.addEventListener("menu-screen", onScreen as EventListener);
    return () => window.removeEventListener("menu-screen", onScreen as EventListener);
  }, [navigate]);

  // Overlay de controles (sobre cualquier ruta).
  useEffect(() => {
    const open = () => setShowControls(true);
    window.addEventListener("open-controls", open);
    return () => window.removeEventListener("open-controls", open);
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        {/* lobby/solo/room siguen en game.js (legacy); se migrarán a estas rutas. */}
        <Route path="*" element={null} />
      </Routes>
      {showControls && <ControlsScreen onClose={() => setShowControls(false)} />}
    </>
  );
}

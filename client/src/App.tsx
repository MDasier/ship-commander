import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router";
import MainMenu from "./ui/MainMenu";
import CoopRooms from "./ui/CoopRooms";
import Room from "./ui/Room";
import FlySolo from "./ui/FlySolo";
import Hud from "./ui/Hud";
import ControlsScreen from "./ui/ControlsScreen";
import Reconnect from "./ui/Reconnect";

// Mapea cada pantalla del menú (emitida por game.js) a una ruta. Por ahora solo
// "/" (MainMenu) tiene componente React; lobby/solo/room siguen en game.js y se
// migrarán a estas rutas en los próximos pasos.
const SCREEN_PATH: Record<string, string> = {
  mainMenu: "/",
  lobby: "/lobby",
  soloSetup: "/solo",
  room: "/room",
  game: "/game",
};

export default function App() {
  const navigate = useNavigate();
  const [showControls, setShowControls] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

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

  // Overlay de conexión perdida. game.js emite "conn-lost" tras una caída (ya
  // conectado) y conduce la reconexión automática; aquí solo mostramos el overlay.
  useEffect(() => {
    const lost = () => setDisconnected(true);
    window.addEventListener("conn-lost", lost);
    return () => window.removeEventListener("conn-lost", lost);
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/lobby" element={<CoopRooms />} />
        <Route path="/room" element={<Room />} />
        <Route path="/solo" element={<FlySolo />} />
        <Route path="/game" element={<Hud />} />
        {/* MobiGlass / panel de muerte / game over / chat siguen en game.js (legacy). */}
        <Route path="*" element={null} />
      </Routes>
      {showControls && <ControlsScreen onClose={() => setShowControls(false)} />}
      {disconnected && <Reconnect onRetry={() => location.reload()} />}
    </>
  );
}

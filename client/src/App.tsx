import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router";
import MainMenu from "./ui/MainMenu";
import CoopRooms from "./ui/CoopRooms";
import Room from "./ui/Room";
import FlySolo from "./ui/FlySolo";
import Hud from "./ui/Hud";
import MobiGlass from "./ui/MobiGlass";
import GameOver from "./ui/GameOver";
import ChatInput from "./ui/ChatInput";
import DeadPanel from "./ui/DeadPanel";
import ControlsScreen from "./ui/ControlsScreen";
import Reconnect from "./ui/Reconnect";
import { closeMobiglass, getMenuScreen } from "./game";

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
  const [mobiOpen, setMobiOpen] = useState(false);
  const [gameOver, setGameOver] = useState<{ isHost: boolean; solo: boolean } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [dead, setDead] = useState(false);

  // game.js emite "menu-screen" al cambiar de pantalla → reflejamos en la URL.
  // Al montar, sincronizamos la ruta con la pantalla actual de game.js: su
  // primer evento "mainMenu" se dispara en el bootstrap ANTES de que React
  // monte y escuche (main.tsx importa game.js antes de renderizar App), así que
  // sin esto un refresco en /game se quedaría sin menú. getMenuScreen() ya
  // refleja la pantalla real (mainMenu tras el arranque).
  useEffect(() => {
    const initial = SCREEN_PATH[getMenuScreen()] || "/";
    navigate(initial, { replace: true });
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

  // MobiGlass en partida: game.js emite "mobi" (true/false) al abrir/cerrar (F1).
  useEffect(() => {
    const onMobi = (e: Event) => setMobiOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("mobi", onMobi as EventListener);
    return () => window.removeEventListener("mobi", onMobi as EventListener);
  }, []);

  // Overlays en partida (game.js emite los eventos): game over, chat, muerte.
  useEffect(() => {
    const onGameOver = (e: Event) => {
      const d = (e as CustomEvent<{ show: boolean; isHost?: boolean; solo?: boolean }>).detail;
      setGameOver(d.show ? { isHost: !!d.isHost, solo: !!d.solo } : null);
    };
    const onChat = (e: Event) => setChatOpen((e as CustomEvent<boolean>).detail);
    const onDead = (e: Event) => setDead((e as CustomEvent<boolean>).detail);
    window.addEventListener("gameover", onGameOver as EventListener);
    window.addEventListener("chat", onChat as EventListener);
    window.addEventListener("dead", onDead as EventListener);
    return () => {
      window.removeEventListener("gameover", onGameOver as EventListener);
      window.removeEventListener("chat", onChat as EventListener);
      window.removeEventListener("dead", onDead as EventListener);
    };
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
      {dead && <DeadPanel />}
      {gameOver && <GameOver isHost={gameOver.isHost} solo={gameOver.solo} />}
      {chatOpen && <ChatInput />}
      {showControls && <ControlsScreen onClose={() => setShowControls(false)} />}
      {mobiOpen && <MobiGlass onClose={() => closeMobiglass()} />}
      {disconnected && <Reconnect onRetry={() => location.reload()} />}
    </>
  );
}

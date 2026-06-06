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
import Boot from "./ui/Boot";
import Toast from "./ui/Toast";
import { closeMobiglass, getMenuScreen, isEverConnected } from "./game";

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
  // Overlay de arranque: visible al cargar hasta conectar (salvo que ya
  // estuviéramos conectados al montar, p. ej. si el "open" llegó antes).
  const [boot, setBoot] = useState<{ cold: boolean } | null>(() => (isEverConnected() ? null : { cold: false }));

  // Sincroniza la ruta con la pantalla actual de game.js SOLO al montar: su
  // primer evento "mainMenu" se dispara en el bootstrap ANTES de que React monte
  // (main.tsx importa game.js antes de renderizar App), así que sin esto un
  // refresco en /game se quedaría sin menú. Debe correr UNA vez ([] deps): si
  // dependiera de `navigate` (cuya identidad cambia al navegar en react-router),
  // se re-ejecutaría al entrar en partida y rebotaría de /game a /room.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    navigate(SCREEN_PATH[getMenuScreen()] || "/", { replace: true });
  }, []);

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
    const onBoot = (e: Event) => {
      const d = (e as CustomEvent<{ show: boolean; cold?: boolean }>).detail;
      setBoot(d.show ? { cold: !!d.cold } : null);
    };
    window.addEventListener("gameover", onGameOver as EventListener);
    window.addEventListener("chat", onChat as EventListener);
    window.addEventListener("dead", onDead as EventListener);
    window.addEventListener("boot", onBoot as EventListener);
    // Por si el "open" del WS (hideBoot) ocurrió entre el render y este efecto:
    // re-chequeamos y ocultamos el overlay de arranque si ya estamos conectados.
    if (isEverConnected()) setBoot(null);
    return () => {
      window.removeEventListener("gameover", onGameOver as EventListener);
      window.removeEventListener("chat", onChat as EventListener);
      window.removeEventListener("dead", onDead as EventListener);
      window.removeEventListener("boot", onBoot as EventListener);
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
      {boot && <Boot cold={boot.cold} />}
      <Toast />
    </>
  );
}

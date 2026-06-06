import { useEffect, useState } from "react";
import ControlsScreen from "./ui/ControlsScreen";

// UI propia de React. Se va poblando en la Fase 1 a medida que migramos piezas
// del menú legacy. game.js emite CustomEvents para abrir las pantallas React.
export default function App() {
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const open = () => setShowControls(true);
    window.addEventListener("open-controls", open);
    return () => window.removeEventListener("open-controls", open);
  }, []);

  return <>{showControls && <ControlsScreen onClose={() => setShowControls(false)} />}</>;
}

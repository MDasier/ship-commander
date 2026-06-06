import { useEffect, useRef, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { chatSend } from "../game";

// Input de chat migrado a React (Fase 2). El LOG de mensajes se dibuja en el
// canvas (game.js); aquí solo el campo de entrada al abrir (Enter desde el
// juego → game.js openChat → evento "chat"). Enter envía, Esc cierra (envío
// vacío). stopPropagation evita que las teclas muevan la nave mientras escribes.
export default function ChatInput() {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="fixed bottom-7 left-6 z-[300] w-[460px] max-w-[70vw] font-body">
      <input
        ref={ref}
        className="gs-input font-mono text-[13px]"
        value={value}
        maxLength={60}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("chat.placeholder")}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") chatSend(value);
          else if (e.key === "Escape") chatSend("");
        }}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

import { useI18n } from "../hooks/useI18n";
import { gameRestart, roomLeave } from "../game";

// Overlay de fin de partida migrado a React (Fase 2). El texto VICTORIA/DERROTA
// y el marcador se siguen dibujando en el canvas (game.js); aquí solo van las
// pistas host/invitado y los botones. game.js emite "gameover" {show,isHost,solo}.
export default function GameOver({ isHost, solo }: { isHost: boolean; solo: boolean }) {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[300] flex flex-col items-center gap-4 px-6 font-body">
      {!solo && (
        <div className="max-w-[520px] text-center text-[13px] text-gs-grey-2">
          {isHost ? t("gameover.hostHint") : t("gameover.guestHint")}
        </div>
      )}
      <div className="pointer-events-auto flex flex-wrap justify-center gap-3">
        {isHost && !solo && (
          <button className="gs-btn gs-btn-go" onClick={() => gameRestart()}>
            {t("gameover.restart")}
          </button>
        )}
        <button className="gs-btn gs-btn-danger" onClick={() => roomLeave()}>
          {t("gameover.back")}
        </button>
      </div>
    </div>
  );
}

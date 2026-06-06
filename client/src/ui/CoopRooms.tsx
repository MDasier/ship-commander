import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getRoomList, lobbyCreateRoom, lobbyRefresh, lobbyJoin, menuMain } from "../game";
import { Backdrop, BackBtn, BrandTitle, Icon, LangToggle } from "./ds";

// Lista de salas Co-op migrada a React (Fase 2). Los datos llegan del servidor
// vía game.js (getRoomList + evento "rooms-update"); las acciones (crear/
// actualizar/unirse) delegan en game.js, que mantiene el flujo real (nombre,
// audio, WebSocket). Al crear/unirse, game.js abre la sala (#room, aún legacy).

type Room = {
  id: string;
  name?: string;
  status?: string;
  allowJoinMidGame?: boolean;
  worldSize?: string;
  players: number;
};

const SIZE_LABELS: Record<string, string> = { small: "3K", medium: "6K", large: "10K", huge: "15K" };

// Suscribe al listado de salas del servidor.
function useRooms(): Room[] {
  const [rooms, setRooms] = useState<Room[]>(() => getRoomList() || []);
  useEffect(() => {
    const sync = () => setRooms([...(getRoomList() || [])]);
    window.addEventListener("rooms-update", sync);
    sync(); // re-lee al montar por si el mensaje "rooms" llegó antes del efecto
    return () => window.removeEventListener("rooms-update", sync);
  }, []);
  return rooms;
}

function RoomRow({ room }: { room: Room }) {
  const { t } = useI18n();
  const playing = room.status === "playing";
  const canJoin = !playing || !!room.allowJoinMidGame;
  const size = SIZE_LABELS[room.worldSize || ""] || "6K";
  const statusColor = playing ? "var(--color-gs-gold-soft)" : "var(--color-gs-green)";
  const statusText = playing ? (room.allowJoinMidGame ? `${t("lobby.playing")} · ${t("lobby.open")}` : t("lobby.playing")) : t("lobby.waiting");

  return (
    <div className="gs-panel flex items-center gap-4 px-5 py-4 transition-all duration-200 ease-gs hover:border-gs-gold hover:shadow-gs-glow">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-bold text-white">{room.name || "#" + room.id.slice(0, 6)}</div>
        <div className="mt-0.5 text-[12px] text-gs-grey-3">{size}</div>
      </div>
      <span className="gs-hud-mono inline-flex items-center gap-1.5 text-[13px] font-semibold text-gs-rule">
        <Icon name="coop" size={15} style={{ color: "var(--color-gs-grey-3)" }} />
        {room.players}/20
      </span>
      <span
        className="inline-flex min-w-[92px] items-center justify-end gap-1.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: statusColor }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
        {statusText}
      </span>
      <button
        className="gs-btn gs-btn-primary min-w-[92px] px-4 py-2.5"
        onClick={() => lobbyJoin(room.id)}
        disabled={!canJoin}
      >
        {t("lobby.join")}
      </button>
    </div>
  );
}

export default function CoopRooms() {
  const { t, lang, setLang } = useI18n();
  const rooms = useRooms();

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-gs-void font-body text-white">
      <Backdrop />
      <LangToggle lang={lang} onChange={setLang} />
      <div className="fixed left-7 top-7 z-40">
        <BackBtn onClick={() => menuMain()} label={t("common.backMenu")} />
      </div>

      <div className="relative z-[1] flex min-h-full animate-gs-fade flex-col items-center justify-center gap-9 px-6 py-20">
        <BrandTitle size={46} sub={false} />

        <div className="gs-panel w-full max-w-[720px] p-6">
          {/* Header del card: título + acciones (crear sala / actualizar lista) */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="gs-eyebrow">{t("lobby.title")}</span>
            <div className="flex items-center gap-2.5">
              <button className="gs-btn gs-btn-primary px-4 py-2.5" onClick={() => lobbyCreateRoom()}>
                <Icon name="coop" size={16} /> {t("lobby.create")}
              </button>
              <button
                className="gs-btn gs-btn-ghost min-h-11 w-11 px-0"
                onClick={() => lobbyRefresh()}
                title={t("lobby.refresh")}
                aria-label={t("lobby.refresh")}
              >
                <Icon name="refresh" size={17} />
              </button>
            </div>
          </div>

          {rooms.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-gs border border-dashed border-gs-rule/15 px-6 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-gs-gold/40 text-gs-gold">
                <Icon name="coop" size={28} />
              </div>
              <p className="m-0 max-w-[360px] leading-relaxed text-gs-grey-3">{t("lobby.hint")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rooms.map((r) => (
                <RoomRow key={r.id} room={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

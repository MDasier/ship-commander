import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import {
  getRoomData,
  getMyId,
  roomSend,
  roomToggleReady,
  roomSwitchTeam,
  roomLeave,
} from "../game";
import { Backdrop, BackBtn, BrandTitle, GoldToggle, Icon, LangToggle, SegOption, useWorldPresets, presetKm } from "./ds";
import ShipPicker from "./ShipPicker";

// Sala / lobby con equipos, migrada a React (Fase 2). Reproduce el flujo real
// multijugador (host toggles, tamaño, equipos, tripulación, ready) leyendo
// getRoomData() y delegando cada acción en game.js (roomSend), que conserva el
// protocolo WebSocket. El listado se refresca con el evento "room-update".

type RoomPlayer = {
  id: string;
  name?: string;
  team?: string;
  shipType?: string;
  ready?: boolean;
  pilotingFor?: string | null;
  gunnerId?: string | null;
  gunnerIds?: (string | null)[];
};
type RoomData = {
  id: string;
  name?: string;
  ownerId: string;
  players: Record<string, RoomPlayer>;
  allowJoinMidGame?: boolean;
  enforceBalance?: boolean;
  coopMode?: boolean;
  worldSize?: string;
};

// Las claves i18n del nombre por tamaño; el km y el nº de asteroides se derivan
// de los WORLD_PRESETS del servidor (useWorldPresets) para no quedar desfasados.
const SIZE_LABEL_KEYS: Record<string, string> = {
  small: "room.sizeSmall",
  medium: "room.sizeMedium",
  large: "room.sizeLarge",
  huge: "room.sizeHuge",
};

// Suscribe al estado de sala del servidor (game.js → evento "room-update").
function useRoom() {
  const [room, setRoom] = useState<RoomData | null>(() => (getRoomData() as RoomData) || null);
  useEffect(() => {
    const sync = () => setRoom(getRoomData() ? { ...(getRoomData() as RoomData) } : null);
    window.addEventListener("room-update", sync);
    // Re-lee al montar: el roomUpdate de creación es único; si su evento cayó
    // entre el render y este efecto, lo recuperamos aquí (si no, no llega otro).
    sync();
    return () => window.removeEventListener("room-update", sync);
  }, []);
  return room;
}

function PlayerRow({ player, mine, shipLabel }: { player: RoomPlayer; mine: boolean; shipLabel: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <span className="min-w-0 flex-1 truncate font-bold text-white">
        {player.name || "Pilot"} {mine && <span className="font-normal text-gs-grey-3">{t("room.you")}</span>}
      </span>
      <span className="rounded border border-gs-gold-bright/40 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-gs-gold-bright">
        {shipLabel}
      </span>
      <span
        className={`font-mono text-[10px] font-bold uppercase tracking-wider ${player.ready ? "text-gs-green" : "text-gs-grey-3"}`}
      >
        {player.ready ? t("common.ready") : t("room.waitingShort")}
      </span>
    </div>
  );
}

function CrewSlot({
  role,
  gunner,
  pilotId,
  canBoard,
  mine,
}: {
  role: string;
  gunner: RoomPlayer | null;
  pilotId: string;
  canBoard: boolean;
  mine: boolean;
}) {
  const { t } = useI18n();
  const occupied = !!gunner;
  return (
    <div
      className={`flex items-center gap-2.5 border-t border-gs-rule/8 py-2.5 pl-9 pr-4 ${
        occupied ? "bg-gs-gold-bright/[0.05]" : ""
      }`}
    >
      <span className="gs-hud-mono text-[10px] font-semibold uppercase tracking-wider text-gs-grey-3">↳ {role}</span>
      {occupied ? (
        <>
          <Icon name="pilot" size={13} style={{ color: "var(--color-gs-gold-bright)" }} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-white">
            {gunner!.name || "Pilot"}
            {mine && <span className="ml-1 font-normal text-gs-grey-3">{t("room.you")}</span>}
          </span>
          <span className="rounded border border-gs-gold-bright/40 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gs-gold-bright">
            {t("room.gunner")}
          </span>
          {mine && (
            <button className="ml-auto text-[12px] font-semibold text-gs-red hover:underline" onClick={() => roomSend({ type: "leaveShip" })}>
              {t("room.leaveShip")}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="text-[13px] italic text-gs-grey-3">{t("room.emptySlot")}</span>
          {canBoard && (
            <button
              className="ml-auto text-[12px] font-semibold text-gs-gold-bright hover:underline"
              onClick={() => roomSend({ type: "boardShip", targetId: pilotId })}
            >
              {t("room.board")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TeamColumn({
  side,
  players,
  room,
  myId,
}: {
  side: "green" | "red";
  players: RoomPlayer[];
  room: RoomData;
  myId: string;
}) {
  const { t } = useI18n();
  const color = side === "green" ? "var(--color-gs-green)" : "var(--color-gs-red)";
  const title = side === "green" ? t("room.teamGreen") : t("room.teamRed");
  const me = room.players[myId];
  const amGunnerElsewhere = !!(me && me.pilotingFor);

  return (
    <div className="gs-panel flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gs-rule/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color }}>
          {title}
        </span>
        <span className="gs-hud-mono ml-auto text-[14px] font-bold" style={{ color }}>
          {players.length}
        </span>
      </div>
      {players.length === 0 ? (
        <div className="grid min-h-[80px] place-items-center p-4 text-center text-[13px] text-gs-grey-3">
          {t("room.emptyTeam")}
        </div>
      ) : (
        // Los artilleros (pilotingFor) NO se listan como piloto top-level: solo
        // aparecen bajo la torreta de su nave (evita la fila duplicada "FIGHTER").
        players.filter((p) => !p.pilotingFor).map((p) => {
          const shipLabel = (p.shipType || "fighter").slice(0, 7).toUpperCase();
          const slots: { role: string; gid: string | null }[] = [];
          if (p.shipType === "gunship") slots.push({ role: t("room.gunner").toUpperCase(), gid: p.gunnerId ?? null });
          if (p.shipType === "capital")
            (p.gunnerIds || [null, null, null]).forEach((gid, i) =>
              slots.push({ role: `${t("room.turret").toUpperCase()} ${["I", "II", "III"][i]}`, gid }),
            );
          const iAmPilot = p.id === myId;
          return (
            <div key={p.id}>
              <PlayerRow player={p} mine={p.id === myId} shipLabel={shipLabel} />
              {slots.map((s, i) => (
                <CrewSlot
                  key={i}
                  role={s.role}
                  gunner={s.gid ? room.players[s.gid] : null}
                  pilotId={p.id}
                  canBoard={!iAmPilot && !amGunnerElsewhere}
                  mine={s.gid === myId}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Room() {
  const { t, lang, setLang } = useI18n();
  const room = useRoom();
  const myId = getMyId() as string;
  const presets = useWorldPresets();
  const [name, setName] = useState("");
  const [balanceWarn, setBalanceWarn] = useState(false);

  // Tamaños de mapa derivados de los WORLD_PRESETS del servidor (km + asteroides).
  const sizes = presets
    ? Object.entries(presets).map(([key, p]) => ({
        key,
        km: presetKm(p),
        ast: p.asteroids,
        label: SIZE_LABEL_KEYS[key] || key,
      }))
    : [];

  // Sincroniza el input de nombre cuando cambia la sala (solo host lo edita).
  useEffect(() => {
    if (room) setName(room.name || "");
  }, [room?.name]);

  // Aviso de desequilibrio al intentar empezar (game.js emite "room-error").
  useEffect(() => {
    const onErr = () => {
      setBalanceWarn(true);
      setTimeout(() => setBalanceWarn(false), 8000);
    };
    window.addEventListener("room-error", onErr);
    return () => window.removeEventListener("room-error", onErr);
  }, []);

  if (!room) {
    return (
      <div className="fixed inset-0 z-[400] grid place-items-center bg-gs-void font-body text-gs-grey-3">
        <Backdrop />
        <span className="relative z-[1] animate-gs-pulse">{t("room.hint")}</span>
      </div>
    );
  }

  const isHost = room.ownerId === myId;
  const me = room.players[myId];
  const isGunner = !!(me && me.pilotingFor);
  const all = Object.values(room.players);
  const green = all.filter((p) => (p.team || "green") === "green");
  const red = all.filter((p) => p.team === "red");

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-gs-void font-body text-white">
      <Backdrop />
      <LangToggle lang={lang} onChange={setLang} />
      <div className="fixed left-7 top-7 z-40">
        <BackBtn onClick={() => roomLeave()} label={t("common.backMenu")} />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-full max-w-[1180px] animate-gs-fade flex-col items-center gap-6 px-6 pb-16 pt-8">
        <BrandTitle size={44} sub={false} />
        <span className="gs-eyebrow">{t("room.title")}</span>

        {/* Dos columnas: izquierda Nave de combate · derecha Sala + Escuadrón.
            Si soy artillero no hay selector de nave → una sola columna. */}
        <div className={`grid w-full items-start gap-6 ${isGunner ? "grid-cols-1" : "lg:grid-cols-[440px_minmax(0,1fr)]"}`}>
          {/* Columna izquierda: selección de nave (2 cards por fila, crece vertical) */}
          {!isGunner && (
            <ShipPicker
              selected={me?.shipType || "fighter"}
              onSelect={(type) => roomSend({ type: "selectShip", shipType: type })}
              label={t("room.shipLabel")}
            />
          )}

          {/* Columna derecha: Sala + Escuadrón */}
          <div className="flex w-full flex-col gap-6">
            {/* Sala (título fuera de la card, patrón de Escuadrón) */}
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="gs-eyebrow">{t("room.section")}</span>
              </div>
              <div className="gs-panel flex flex-col gap-4 p-6">
                <div className="flex items-center gap-2.5">
                  {isHost ? (
                    <>
                      <input
                        className="gs-input font-bold"
                        value={name}
                        maxLength={28}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder={t("room.namePlaceholder")}
                      />
                      <button className="gs-btn min-w-[104px]" onClick={() => roomSend({ type: "setRoomName", name: name.trim() })}>
                        {t("common.save")}
                      </button>
                    </>
                  ) : (
                    <div className="text-[18px] font-bold text-white">{room.name || "#" + room.id.slice(0, 6)}</div>
                  )}
                </div>

                {isHost && (
                  <>
                    <div className="grid grid-cols-1 gap-x-7 gap-y-4 sm:grid-cols-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] font-semibold text-gs-rule">{t("room.coopAI")}</span>
                        <span className="ml-auto">
                          <GoldToggle on={!!room.coopMode} onChange={() => roomSend({ type: "toggleCoop" })} label={t("room.coopAI")} />
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] font-semibold text-gs-rule">{t("room.midGameJoin")}</span>
                        <span className="ml-auto">
                          <GoldToggle
                            on={!!room.allowJoinMidGame}
                            onChange={() => roomSend({ type: "toggleMidGameJoin" })}
                            label={t("room.midGameJoin")}
                          />
                        </span>
                      </div>
                      <div className={`flex items-center gap-2.5 ${room.coopMode ? "pointer-events-none opacity-40" : ""}`}>
                        <span className="text-[14px] font-semibold text-gs-rule">{t("room.balancedTeams")}</span>
                        <span className="ml-auto">
                          <GoldToggle
                            on={!!room.enforceBalance}
                            onChange={() => roomSend({ type: "toggleEnforceBalance" })}
                            label={t("room.balancedTeams")}
                          />
                        </span>
                      </div>
                    </div>
                    <hr className="border-0 border-t border-gs-rule/12" />
                    <div>
                      <div className="mb-3 text-[15px] font-semibold text-gs-rule">{t("room.scenarioSize")}</div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {sizes.map((s) => (
                          <SegOption
                            key={s.key}
                            active={(room.worldSize || "medium") === s.key}
                            onClick={() => roomSend({ type: "setWorldSize", size: s.key })}
                            title={
                              <span>
                                {t(s.label)} <span className="text-gs-gold-soft">{s.km}</span>
                              </span>
                            }
                            sub={`${s.ast} ${t("room.asteroids")}`}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cambiar equipo / Go (ready) — entre Sala y Escuadrón, mitad de ancho cada uno */}
            <div className="flex gap-3">
              {!room.coopMode && (
                <button className="gs-btn flex-1 min-h-[52px] text-[16px]" onClick={() => roomSwitchTeam()}>
                  {t("room.switchTeam")}
                </button>
              )}
              <button
                className={`gs-btn flex-1 min-h-[52px] text-[16px] ${me?.ready ? "gs-btn-primary" : "gs-btn-go"}`}
                onClick={() => roomToggleReady()}
              >
                {me?.ready ? t("room.readyOn") : t("room.ready")}
              </button>
            </div>

            {/* Escuadrones */}
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="gs-eyebrow">{t("room.squad")}</span>
                <span className="gs-hud-mono ml-auto text-[13px]">
                  <span className="font-bold text-gs-green">{green.length}</span>
                  <span className="mx-1.5 text-gs-grey-3">vs</span>
                  {room.coopMode ? (
                    <span className="font-bold text-gs-red">{t("room.aiWaves")}</span>
                  ) : (
                    <span className="font-bold text-gs-red">{red.length}</span>
                  )}
                </span>
              </div>
              <div className={`grid gap-3.5 ${room.coopMode ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                <TeamColumn side="green" players={green} room={room} myId={myId} />
                {!room.coopMode && <TeamColumn side="red" players={red} room={room} myId={myId} />}
              </div>
            </div>

            {balanceWarn && (
              <div className="text-center text-[13px] font-semibold text-gs-gold-soft">{t("room.unbalanced")}</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

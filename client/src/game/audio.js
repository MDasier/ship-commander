// Puente de audio: persistencia de volumenes/pista y aplicacion al motor de sonido.
// Lee/escribe localStorage y delega en sounds.js. Extraido de game.js (Fase A modular).
import {
  setEffectsVolume, setMusicVolume, setMusicTrack, setMuted,
} from "../sounds.js";

// Aplica al motor de sonido los volumenes/pista/silencio guardados en localStorage.
function applyStoredVolumes() {
  const effects = parseFloat(localStorage.getItem("vol_effects") ?? "0.8");
  const music = parseFloat(localStorage.getItem("vol_music") ?? "0.5");
  const track = localStorage.getItem("music_track") ?? "A";
  const isMutedStored = localStorage.getItem("audio_muted") === "1";
  setEffectsVolume(effects);
  setMusicVolume(music);
  setMusicTrack(track);
  setMuted(isMutedStored);
}

// ── Ajustes de audio (puente para React, pestaña Ajustes del MobiGlass) ──
function getAudioSettings() {
  return {
    effects: parseFloat(localStorage.getItem("vol_effects") ?? "0.8"),
    music: parseFloat(localStorage.getItem("vol_music") ?? "0.5"),
    track: localStorage.getItem("music_track") ?? "A",
    muted: localStorage.getItem("audio_muted") === "1",
  };
}
function setAudioEffects(v) { setEffectsVolume(v); localStorage.setItem("vol_effects", String(v)); }
function setAudioMusic(v) { setMusicVolume(v); localStorage.setItem("vol_music", String(v)); }
function setAudioTrack(t) { setMusicTrack(t); localStorage.setItem("music_track", t); }
function setAudioMuted(b) { setMuted(b); localStorage.setItem("audio_muted", b ? "1" : "0"); }

export {
  applyStoredVolumes, getAudioSettings,
  setAudioEffects, setAudioMusic, setAudioTrack, setAudioMuted,
};

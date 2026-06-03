let audioCtx = null;
let masterGain = null;   // interruptor de MUTE (0/1) → destino
let musicGain = null;    // envolvente de fundido de la música (no es el volumen de usuario)
let musicVol = null;     // volumen de MÚSICA (slider)
let sfxGain = null;      // volumen de EFECTOS (slider)
let muted = false;
let musicStarted = false;
let musicNodes = [];     // osciladores/LFO de la pista activa (para poder pararlos)
let musicTrack = "A";    // pista seleccionada ("A" original · "B" con más presencia)
let warningActive = false;
let warningTimer = null;
let victoryPlayed = false;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Cadena: [fuentes] → musicGain/sfxGain → masterGain(mute) → destino
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;   // 1 = sonando, 0 = mute
    masterGain.connect(audioCtx.destination);
    // Música: envolvente de fundido (musicGain) → volumen de usuario (musicVol) → master
    musicVol = audioCtx.createGain();
    musicVol.gain.value = 0.5;
    musicVol.connect(masterGain);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(musicVol);
    // Efectos: volumen de usuario → master
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(masterGain);
  } catch (e) {}
}

// Selección de pista de música (se aplica en caliente si ya está sonando)
function setMusicTrack(track) {
  musicTrack = (track === "B") ? "B" : "A";
  if (musicStarted) { stopMusic(); startMusic(); }
}

function startMusic() {
  if (!audioCtx || musicStarted) return;
  musicStarted = true;

  musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
  musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 4);

  if (musicTrack === "B") buildTrackB(); else buildTrackA();
}

function stopMusic() {
  if (!audioCtx || !musicStarted) return;
  musicStarted = false;
  musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
  // Detiene los osciladores de la pista tras el fundido
  const nodes = musicNodes; musicNodes = [];
  const stopAt = audioCtx.currentTime + 1.6;
  nodes.forEach(n => { try { n.stop(stopAt); } catch (e) {} });
}

// ── PISTA A (original — drone ambiental con pings altos) ──
function buildTrackA() {
  [[55, "sine", 1], [82.41, "sine", 0.55], [110, "triangle", 0.3]].forEach(([freq, type, vol], i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.06 + i * 0.04;
    lfoGain.gain.value = 0.9;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    gain.gain.value = vol * 0.35;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    osc.start();
    musicNodes.push(osc, lfo);
  });

  // Pings altos ocasionales
  function ping() {
    if (musicTrack !== "A" || !musicStarted || !audioCtx || audioCtx.state === "closed") return;
    const notes = [440, 523.25, 587.33, 659.25, 783.99];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 2.1);
    setTimeout(ping, 4000 + Math.random() * 6000);
  }
  setTimeout(ping, 6000 + Math.random() * 4000);
}

// ── PISTA B (más presencia — acorde apilado más brillante + pulso de bajo rítmico) ──
function buildTrackB() {
  // Acorde apilado (A1-E2-A2-E3-A3): más voces, más ganancia y filtro más abierto
  [[55, "sine", 1.0], [82.41, "triangle", 0.7], [110, "sine", 0.6],
   [164.81, "triangle", 0.4], [220, "sine", 0.28]].forEach(([freq, type, vol], i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.05 + i * 0.03;
    lfoGain.gain.value = 1.4;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    filter.type = "lowpass";
    filter.frequency.value = 1400;        // más brillo/presencia
    gain.gain.value = vol * 0.5;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    osc.start();
    musicNodes.push(osc, lfo);
  });

  // Pulso de bajo rítmico (presencia): un sub con su ganancia modulada por un LFO cuadrado
  const bass = audioCtx.createOscillator();
  const bassGain = audioCtx.createGain();
  bass.type = "sine";
  bass.frequency.value = 55;
  bassGain.gain.value = 0.0;
  const pulse = audioCtx.createOscillator();
  const pulseAmt = audioCtx.createGain();
  pulse.type = "square";
  pulse.frequency.value = 1.6;            // ~96 ppm
  pulseAmt.gain.value = 0.16;
  pulse.connect(pulseAmt);
  pulseAmt.connect(bassGain.gain);
  pulse.start();
  bass.connect(bassGain);
  bassGain.connect(musicGain);
  bass.start();
  musicNodes.push(bass, pulse);

  // Notas medias ocasionales (más cuerpo que los pings de la pista A)
  function swell() {
    if (musicTrack !== "B" || !musicStarted || !audioCtx || audioCtx.state === "closed") return;
    const notes = [220, 277.18, 329.63, 440];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.5);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 3.6);
    setTimeout(swell, 3500 + Math.random() * 4000);
  }
  setTimeout(swell, 3000 + Math.random() * 3000);
}

function playShootSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.09);
}

// Zumbido eléctrico al quedar el rayo de la Capital totalmente cargado (listo)
function playBeamReadySound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  // Dos osciladores ligeramente desafinados + tremolo rápido → timbre "eléctrico"
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
  out.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  out.connect(sfxGain);

  const trem = audioCtx.createOscillator();
  const tremGain = audioCtx.createGain();
  trem.type = "square";
  trem.frequency.value = 38;            // chisporroteo
  tremGain.gain.value = 0.5;
  trem.connect(tremGain);
  tremGain.connect(out.gain);
  trem.start(t0); trem.stop(t0 + 0.55);

  [620, 624, 1240].forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = i === 2 ? "square" : "sawtooth";
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.linearRampToValueAtTime(f * 1.6, t0 + 0.45);
    g.gain.value = i === 2 ? 0.25 : 0.6;
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + 0.55);
  });
}

// Blip de "habilidad lista" (dos tonos ascendentes, breve y limpio)
function playAbilityReadySound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [660, 990].forEach((f, i) => {
    const t = t0 + i * 0.07;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.13);
  });
}

// Estallido EMP en área (grave + barrido descendente "apagón")
function playEmpSound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.5);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
  // Chisporroteo
  const trem = audioCtx.createOscillator();
  const tg = audioCtx.createGain();
  trem.type = "square"; trem.frequency.value = 60;
  tg.gain.value = 0.4;
  trem.connect(tg); tg.connect(gain.gain);
  osc.connect(gain); gain.connect(sfxGain);
  osc.start(t0); osc.stop(t0 + 0.56);
  trem.start(t0); trem.stop(t0 + 0.56);
}

// Descarga del rayo de la Capital al dispararse
function playBeamFireSound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1200, t0);
  osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.35);
  gain.gain.setValueAtTime(0.22, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
  // Capa de ruido para "crujido" eléctrico
  const sr = audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, sr * 0.3, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const nf = audioCtx.createBiquadFilter();
  nf.type = "bandpass"; nf.frequency.value = 2200;
  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.18, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  noise.connect(nf); nf.connect(ng); ng.connect(sfxGain);
  osc.connect(gain); gain.connect(sfxGain);
  osc.start(t0); osc.stop(t0 + 0.42);
  noise.start(t0);
}

function playExplosionSound() {
  if (!audioCtx) return;
  const sr = audioCtx.sampleRate;
  const dur = 0.55;
  const buf = audioCtx.createBuffer(1, sr * dur, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const source = audioCtx.createBufferSource();
  source.buffer = buf;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.55);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.45, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  source.start();
}

function playMissileSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(160, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(720, audioCtx.currentTime + 0.28);
  gain.gain.setValueAtTime(0.11, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.32);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.33);
}

function setMissileWarning(active) {
  if (!audioCtx) return;
  if (active === warningActive) return;
  warningActive = active;
  if (warningTimer) { clearTimeout(warningTimer); warningTimer = null; }
  if (!active) return;

  function beep() {
    if (!warningActive || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.11);
    warningTimer = setTimeout(beep, 350);
  }
  beep();
}

function playVictorySound() {
  if (!audioCtx || victoryPlayed) return;
  victoryPlayed = true;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const t = audioCtx.currentTime + i * 0.18;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 1);
  });
}

function playSelfDestructBeep(n) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = n <= 2 ? 700 : 440;
  gain.gain.setValueAtTime(0.13, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.23);
}

function resetAudio() {
  victoryPlayed = false;
  warningActive = false;
  if (warningTimer) { clearTimeout(warningTimer); warningTimer = null; }
}

// Volumen de música (slider 0..1) — independiente del fundido y de los efectos
function setMusicVolume(v) {
  if (musicVol) musicVol.gain.value = Math.max(0, Math.min(1, v));
}

// Volumen de efectos (slider 0..1)
function setEffectsVolume(v) {
  if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v));
}

// Mute global (afecta a música y efectos)
function setMuted(on) {
  muted = !!on;
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
}

function isMuted() { return muted; }

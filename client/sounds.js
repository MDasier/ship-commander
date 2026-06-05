let audioCtx = null;
let masterGain = null;   // interruptor de MUTE (0/1) → destino
let musicGain = null;    // envolvente de fundido de la música (no es el volumen de usuario)
let musicVol = null;     // volumen de MÚSICA (slider)
let sfxGain = null;      // volumen de EFECTOS (slider)
let muted = false;
let musicStarted = false;
let musicNodes = [];     // osciladores/LFO de la pista activa (para poder pararlos)
let musicTrack = "A";    // pista seleccionada ("A" drone ambiental · "B" Lo-Fi Chill arcade)
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

// Búfer de ruido blanco (cacheado) para hats, caja y crujido de vinilo
let _noiseBuf = null;
function noiseBuffer() {
  if (_noiseBuf) return _noiseBuf;
  const len = Math.floor(audioCtx.sampleRate * 2);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

// ── PISTA B (Lo-Fi Chill arcade) ──
// Pad de acordes jazzy con progresión y "warble" de cinta + bajo, beat boom-bap
// relajado (kick/caja/hats con swing), crujido de vinilo y melodía dispersa.
function buildTrackB() {
  const liveB = () => musicTrack === "B" && musicStarted && audioCtx && audioCtx.state !== "closed";

  // Progresión lo-fi I–vi–ii–V (Cmaj7 · Am7 · Dm7 · G7). root = bajo, tones = pad.
  const PROG = [
    { root: 65.41,  tones: [130.81, 164.81, 196.00, 246.94] }, // Cmaj7
    { root: 55.00,  tones: [110.00, 130.81, 164.81, 196.00] }, // Am7
    { root: 73.42,  tones: [146.83, 174.61, 220.00, 261.63] }, // Dm7
    { root: 49.00,  tones: [98.00, 123.47, 146.83, 174.61] },  // G7
  ];
  let chordIdx = 0;

  // ── Pad cálido (filtro suave) con warble de cinta por voz ──
  const padFilter = audioCtx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 950;
  padFilter.Q.value = 0.4;
  padFilter.connect(musicGain);

  // LFO lento del filtro para que el pad "respire"
  const fLfo = audioCtx.createOscillator();
  const fLfoGain = audioCtx.createGain();
  fLfo.frequency.value = 0.07;
  fLfoGain.gain.value = 220;
  fLfo.connect(fLfoGain); fLfoGain.connect(padFilter.frequency);
  fLfo.start();
  musicNodes.push(fLfo);

  const padOscs = PROG[0].tones.map((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = i < 2 ? "triangle" : "sine";
    osc.frequency.value = freq;
    gain.gain.value = (i === 0 ? 0.13 : 0.09);
    // Warble de cinta: LFO suave sobre el detune (inestabilidad de tono lo-fi)
    const wob = audioCtx.createOscillator();
    const wobAmt = audioCtx.createGain();
    wob.type = "sine";
    wob.frequency.value = 0.18 + i * 0.05;
    wobAmt.gain.value = 6 + i * 2;          // cents
    wob.connect(wobAmt); wobAmt.connect(osc.detune);
    wob.start();
    osc.connect(gain); gain.connect(padFilter);
    osc.start();
    musicNodes.push(osc, wob);
    return osc;
  });

  // ── Bajo (sigue la raíz del acorde) ──
  const bass = audioCtx.createOscillator();
  const bassFilter = audioCtx.createBiquadFilter();
  const bassGain = audioCtx.createGain();
  bass.type = "sine";
  bass.frequency.value = PROG[0].root;
  bassFilter.type = "lowpass"; bassFilter.frequency.value = 260;
  bassGain.gain.value = 0.22;
  bass.connect(bassFilter); bassFilter.connect(bassGain); bassGain.connect(musicGain);
  bass.start();
  musicNodes.push(bass);

  // Cambio de acorde cada 2 compases (glide suave de pad y bajo)
  function nextChord() {
    if (!liveB()) return;
    chordIdx = (chordIdx + 1) % PROG.length;
    const c = PROG[chordIdx];
    const now = audioCtx.currentTime;
    padOscs.forEach((osc, i) => osc.frequency.setTargetAtTime(c.tones[i], now, 0.15));
    bass.frequency.setTargetAtTime(c.root, now, 0.18);
    setTimeout(nextChord, BAR_MS * 2);
  }

  // ── Beat boom-bap relajado (~72 BPM) con swing ──
  const BPM = 72, beat = 60 / BPM, BAR_MS = beat * 4 * 1000;

  function kick(t) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    f.type = "lowpass"; f.frequency.value = 220;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.25);
  }
  function snare(t) {
    const src = audioCtx.createBufferSource(); src.buffer = noiseBuffer();
    const f = audioCtx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 0.7;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + 0.2);
  }
  function hat(t, vol) {
    const src = audioCtx.createBufferSource(); src.buffer = noiseBuffer();
    const f = audioCtx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7500;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + 0.06);
  }
  function scheduleBar() {
    if (!liveB()) return;
    const t0 = audioCtx.currentTime + 0.06;
    const swing = beat * 0.08;             // arrastre de las corcheas a contratiempo
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      if (b % 2 === 0) kick(tb); else snare(tb);
      hat(tb, 0.05);
      hat(tb + beat * 0.5 + swing, 0.03);
    }
    setTimeout(scheduleBar, BAR_MS - 60);
  }

  // ── Crujido de vinilo (siseo continuo) ──
  const crackle = audioCtx.createBufferSource();
  const cFilter = audioCtx.createBiquadFilter();
  const cGain = audioCtx.createGain();
  crackle.buffer = noiseBuffer(); crackle.loop = true;
  cFilter.type = "highpass"; cFilter.frequency.value = 1600;
  cGain.gain.value = 0.012;
  crackle.connect(cFilter); cFilter.connect(cGain); cGain.connect(musicGain);
  crackle.start();
  musicNodes.push(crackle);

  // ── Melodía dispersa (pentatónica suave) ──
  function melody() {
    if (!liveB()) return;
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // C pentatónica
    const n = 1 + Math.floor(Math.random() * 2);
    let t = audioCtx.currentTime + 0.1;
    for (let k = 0; k < n; k++) {
      const freq = scale[Math.floor(Math.random() * scale.length)];
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      osc.type = "triangle"; osc.frequency.value = freq;
      f.type = "lowpass"; f.frequency.value = 2000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(f); f.connect(g); g.connect(musicGain);
      osc.start(t); osc.stop(t + 1.0);
      t += 0.28 + Math.random() * 0.2;
    }
    setTimeout(melody, 4000 + Math.random() * 6000);
  }

  setTimeout(nextChord, BAR_MS * 2);
  scheduleBar();
  setTimeout(melody, 5000 + Math.random() * 4000);
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

  const t = audioCtx.currentTime;
  const sr = audioCtx.sampleRate;

  // =========================
  // 1. ULTRA SUB RUMBLE 
  // =========================
  const duration = 0.8;

  const buffer = audioCtx.createBuffer(1, sr * duration, sr);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    let n = Math.random() * 2 - 1;

    // suavizado extremo → energía en graves percibida
    n = Math.sign(n) * Math.pow(Math.abs(n), 0.35);

    // envelope largo (sensación de onda de choque)
    const env = Math.pow(1 - i / data.length, 1.5);

    data[i] = n * env;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  // SOLO GRAVES profundos
  const lp = audioCtx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(140, t);

  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(20, t);

  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(44100);

  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / curve.length - 1;

    // saturación suave tipo “terreno comprimido”
    curve[i] = Math.tanh(2.0 * x);
  }

  shaper.curve = curve;
  shaper.oversample = "2x";

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(1.5, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, t + duration);

  noise.connect(hp);
  hp.connect(lp);
  lp.connect(shaper);
  shaper.connect(noiseGain);
  noiseGain.connect(sfxGain);

  // =========================
  // 2. SUB OSC 
  // =========================
  const boom = audioCtx.createOscillator();
  boom.type = "sine";

  boom.frequency.setValueAtTime(70, t);
  boom.frequency.exponentialRampToValueAtTime(28, t + 0.4);

  const boomGain = audioCtx.createGain();
  boomGain.gain.setValueAtTime(2.0, t);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

  boom.connect(boomGain);
  boomGain.connect(sfxGain);

  // =========================
  // 3. FAKE SIDECHAIN
  // =========================
  const duck = audioCtx.createGain();

  // inicio fuerte → luego “aspira aire”
  duck.gain.setValueAtTime(1.0, t);
  duck.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  duck.gain.exponentialRampToValueAtTime(1.0, t + 0.5);

  // aplicamos sidechain a TODO el master
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(1.0, t);

  // routing final con “respiración”
  noiseGain.connect(duck);
  boomGain.connect(duck);

  duck.connect(master);
  master.connect(sfxGain);

  // =========================
  // START
  // =========================
  noise.start(t);
  noise.stop(t + duration);

  boom.start(t);
  boom.stop(t + 0.6);
}
function playExplosionSoundOLD() {
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

// Fanfarria de victoria desactivada (a petición). Se deja como no-op para no
// romper las llamadas existentes.
function playVictorySound() {}

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

// ── Alertas cortas (beeps procedurales) ───────────────────────
// type: "weaponLocked" | "noMissile" | "noFlare" | "denied"
const _alertThrottle = {};
function playAlertSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  // anti-spam: mismo tipo como mucho cada 0.4 s
  if (_alertThrottle[type] && now - _alertThrottle[type] < 0.4) return;
  _alertThrottle[type] = now;

  const blip = (freq, start, dur, type2 = "square", vol = 0.12) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type2;
    osc.frequency.setValueAtTime(freq, now + start);
    gain.gain.setValueAtTime(vol, now + start);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  if (type === "weaponLocked") {
    // Zumbido grave y descendente → arma sobrecalentada/bloqueada
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain); gain.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === "noMissile") {
    // Doble blip grave "denegado"
    blip(240, 0, 0.07, "square", 0.11);
    blip(180, 0.1, 0.09, "square", 0.11);
  } else if (type === "noFlare") {
    blip(300, 0, 0.08, "square", 0.10);
  } else {
    blip(220, 0, 0.08, "square", 0.10);
  }
}

// ── Voz robótica femenina (estilo Star Citizen) para avisos del sistema ──
// Usa Web Speech API; pitch grave para timbre robótico. Localizada (es/en).
const _voiceThrottle = {};
function playVoiceAlert(text, lang) {
  if (muted) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // Red de seguridad: si llega una clave i18n sin traducir (p.ej. "voice.lowFuel"),
  // la convertimos a texto legible ("low fuel") en vez de leer el namespace.
  if (typeof text === "string" && /^[a-z]+\.[a-zA-Z]/.test(text)) {
    text = text.split(".").pop().replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }
  const key = text;
  const now = Date.now();
  // mismo aviso como mucho cada 6 s
  if (_voiceThrottle[key] && now - _voiceThrottle[key] < 6000) return;
  _voiceThrottle[key] = now;

  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-US" : "es-ES";
    u.pitch = 0.6;     // grave → sensación robótica
    u.rate = 0.98;
    u.volume = 0.9;
    const voices = window.speechSynthesis.getVoices() || [];
    // intenta una voz femenina del idioma
    const want = u.lang.slice(0, 2);
    const fem = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(want) &&
      /female|mujer|mónica|monica|sabina|helena|paulina|zira|google/i.test(v.name));
    const any = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(want));
    if (fem) u.voice = fem; else if (any) u.voice = any;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

// Precarga la lista de voces (en algunos navegadores llega de forma asíncrona)
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try { window.speechSynthesis.getVoices(); } catch (e) {}
}

// ── PING del escáner (sonar tipo Star Citizen) ────────────────
// Chirp tonal brillante que sube rápido y resuena, con cola de ecos (delay con
// realimentación) → sensación de "pwiiing" de radar.
function playPingSound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;

  // Bus del ping → filtro pasa-banda (timbre limpio/metálico)
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.24, t0 + 0.012);   // ataque rápido
  out.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.5);   // cola larga

  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1500, t0);
  filter.frequency.exponentialRampToValueAtTime(2200, t0 + 0.4);
  filter.Q.value = 1.1;
  out.connect(filter);

  // Cola de ecos (sonar): delay con realimentación
  const delay = audioCtx.createDelay(0.6);
  delay.delayTime.value = 0.17;
  const fb = audioCtx.createGain();
  fb.gain.value = 0.34;
  filter.connect(sfxGain);          // señal seca
  filter.connect(delay);
  delay.connect(fb); fb.connect(delay);
  delay.connect(sfxGain);           // ecos

  // Parciales: fundamental + armónicos para el brillo; cada uno hace un chirp
  // ascendente y luego se asienta (resonancia).
  const partials = [
    { f: 1320, g: 0.55 },
    { f: 1980, g: 0.30 },   // quinta
    { f: 2640, g: 0.16 },   // octava
  ];
  partials.forEach(p => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(p.f * 0.92, t0);
    osc.frequency.exponentialRampToValueAtTime(p.f * 1.06, t0 + 0.07); // chirp rápido
    osc.frequency.exponentialRampToValueAtTime(p.f, t0 + 0.9);         // se asienta
    g.gain.value = p.g;
    osc.connect(g); g.connect(out);
    osc.start(t0);
    osc.stop(t0 + 1.6);
  });
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

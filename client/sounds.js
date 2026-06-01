let audioCtx = null;
let masterGain = null;
let musicGain = null;
let musicStarted = false;
let warningActive = false;
let warningTimer = null;
let victoryPlayed = false;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(masterGain);
  } catch (e) {}
}

function startMusic() {
  if (!audioCtx || musicStarted) return;
  musicStarted = true;

  musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
  musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 4);

  // Ambient drone: 3 oscillators
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
  });

  // Occasional high ping notes
  function ping() {
    if (!musicStarted || !audioCtx || audioCtx.state === "closed") return;
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

function stopMusic() {
  if (!audioCtx || !musicStarted) return;
  musicStarted = false;
  musicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
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
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.09);
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
  gain.connect(masterGain);
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
  gain.connect(masterGain);
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
    gain.connect(masterGain);
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
    gain.connect(masterGain);
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
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.23);
}

function resetAudio() {
  victoryPlayed = false;
  warningActive = false;
  if (warningTimer) { clearTimeout(warningTimer); warningTimer = null; }
}

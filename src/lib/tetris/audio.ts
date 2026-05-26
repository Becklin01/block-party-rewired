// Tiny WebAudio sfx — no external assets.
let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function beep(freq: number, dur = 0.08, type: OscillatorType = "square", vol = 0.06) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const sfx = {
  move: () => beep(220, 0.03, "square", 0.03),
  rotate: () => beep(440, 0.05, "triangle", 0.04),
  drop: () => beep(110, 0.1, "sawtooth", 0.05),
  hold: () => beep(330, 0.06, "sine", 0.05),
  clear: (n: number) => {
    const base = 440 + n * 80;
    beep(base, 0.1, "square", 0.07);
    setTimeout(() => beep(base * 1.5, 0.12, "square", 0.06), 60);
    if (n >= 4) setTimeout(() => beep(base * 2, 0.18, "sawtooth", 0.07), 130);
  },
  combo: (n: number) => beep(523 + n * 40, 0.08, "triangle", 0.06),
  over: () => {
    beep(220, 0.15, "sawtooth", 0.06);
    setTimeout(() => beep(165, 0.2, "sawtooth", 0.06), 120);
    setTimeout(() => beep(110, 0.3, "sawtooth", 0.06), 280);
  },
  hover: () => beep(660, 0.02, "sine", 0.02),
  bomb: () => {
    beep(80, 0.18, "sawtooth", 0.09);
    setTimeout(() => beep(55, 0.25, "sawtooth", 0.08), 50);
    setTimeout(() => beep(180, 0.12, "square", 0.05), 30);
  },
  freeze: () => {
    beep(880, 0.08, "sine", 0.05);
    setTimeout(() => beep(1320, 0.1, "sine", 0.05), 60);
    setTimeout(() => beep(1760, 0.18, "triangle", 0.04), 130);
  },
  drill: () => {
    for (let i = 0; i < 5; i++) setTimeout(() => beep(160 + i * 30, 0.05, "square", 0.05), i * 35);
  },
  noEnergy: () => beep(140, 0.08, "square", 0.04),
  charge: () => beep(880, 0.04, "triangle", 0.04),
};

// ---------- Background music (procedural Korobeiniki-inspired loop) ----------
let musicTimer: number | null = null;
let musicGain: GainNode | null = null;
let musicStep = 0;
let musicEnabled = true;

// Melody (Korobeiniki, A minor) — [midi, beats]
const MELODY: [number, number][] = [
  [76,2],[71,1],[72,1],[74,2],[72,1],[71,1],
  [69,2],[69,1],[72,1],[76,2],[74,1],[72,1],
  [71,3],[72,1],[74,2],[76,2],
  [72,2],[69,2],[69,2],[0,2],
  [74,2],[77,1],[81,2],[79,1],[77,1],
  [76,3],[72,1],[76,2],[74,1],[72,1],
  [71,2],[71,1],[72,1],[74,2],[76,2],
  [72,2],[69,2],[69,2],[0,2],
];
const BASS: [number, number][] = [
  [45,2],[52,2],[45,2],[52,2],
  [44,2],[51,2],[45,2],[52,2],
  [45,2],[52,2],[45,2],[52,2],
  [44,2],[51,2],[45,2],[40,2],
];

function midiToFreq(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

function playNote(a: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode) {
  if (freq <= 0) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const now = a.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(dest);
  o.start(now);
  o.stop(now + dur + 0.05);
}

export function startMusic(volume = 0.08) {
  if (!musicEnabled) return;
  const a = ac(); if (!a) return;
  if (musicTimer !== null) return; // already playing
  // Resume context (browsers require user gesture)
  if (a.state === "suspended") void a.resume();
  musicGain = a.createGain();
  musicGain.gain.value = volume;
  musicGain.connect(a.destination);

  const bpm = 144;
  const beat = 60 / bpm; // seconds per beat
  let melIdx = 0, bassIdx = 0, melT = 0, bassT = 0;

  const tick = () => {
    if (!musicGain) return;
    const a2 = ac(); if (!a2) return;
    // schedule ~0.5s ahead
    while (melT < 0.5) {
      const [n, b] = MELODY[melIdx % MELODY.length];
      const dur = b * beat;
      setTimeout(() => playNote(a2, midiToFreq(n), Math.min(dur, 0.35), "square", 0.5, musicGain!), melT * 1000);
      melT += dur;
      melIdx++;
    }
    while (bassT < 0.5) {
      const [n, b] = BASS[bassIdx % BASS.length];
      const dur = b * beat;
      setTimeout(() => playNote(a2, midiToFreq(n), Math.min(dur, 0.4), "triangle", 0.7, musicGain!), bassT * 1000);
      bassT += dur;
      bassIdx++;
    }
    melT -= 0.25;
    bassT -= 0.25;
    musicStep++;
  };
  tick();
  musicTimer = window.setInterval(tick, 250);
}

export function stopMusic() {
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
  if (musicGain) {
    const a = ac();
    if (a) {
      musicGain.gain.cancelScheduledValues(a.currentTime);
      musicGain.gain.linearRampToValueAtTime(0, a.currentTime + 0.15);
      const g = musicGain;
      setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 200);
    }
    musicGain = null;
  }
  musicStep = 0;
}

export function setMusicEnabled(on: boolean) {
  musicEnabled = on;
  if (typeof window !== "undefined") localStorage.setItem("tetris.music", on ? "1" : "0");
  if (!on) stopMusic();
}

export function isMusicEnabled() {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem("tetris.music");
  if (v === null) return true;
  musicEnabled = v === "1";
  return musicEnabled;
}


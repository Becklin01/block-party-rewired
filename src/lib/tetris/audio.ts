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

// ---------- Background music (music.ogg loop) ----------
let musicEl: HTMLAudioElement | null = null;
let musicEnabled = true;

export function startMusic(volume = 0.35) {
  if (typeof window === "undefined") return;
  if (!musicEnabled) return;
  if (!musicEl) {
    musicEl = new Audio("/music.ogg");
    musicEl.loop = true;
    musicEl.preload = "auto";
  }
  musicEl.volume = Math.max(0, Math.min(1, volume));
  void musicEl.play().catch(() => { /* awaits user gesture */ });
}

export function stopMusic() {
  if (!musicEl) return;
  try { musicEl.pause(); musicEl.currentTime = 0; } catch { /* */ }
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


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
};

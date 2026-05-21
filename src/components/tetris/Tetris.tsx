import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyBoard, newBag, spawnPiece, tryMove, tryRotate, collides, lockPiece, clearLines,
  ghostPosition, gravityMs, levelForLines, LINE_SCORES, COLORS, TYPE_ID, ROWS, COLS,
  type Board, type Piece, type PieceType,
} from "@/lib/tetris/engine";
import { BoardView, MiniPiece } from "@/components/tetris/Board";
import { ParticleLayer, type Particle } from "@/components/tetris/Particles";
import { sfx } from "@/lib/tetris/audio";

type Ability = "bomb" | "freeze" | "drill";
const ABILITY_COST: Record<Ability, number> = { bomb: 50, freeze: 40, drill: 60 };
const ABILITY_META: Record<Ability, { name: string; key: string; color: string; glyph: string; desc: string }> = {
  bomb:   { name: "BOMB",   key: "1", color: "#f87171", glyph: "✸", desc: "Clear 3×3 around piece" },
  freeze: { name: "FREEZE", key: "2", color: "#22d3ee", glyph: "❄", desc: "Stop gravity 5s" },
  drill:  { name: "DRILL",  key: "3", color: "#fb923c", glyph: "▼", desc: "Clear column below" },
};


type Screen = "menu" | "modes" | "playing" | "paused" | "over" | "leaderboard" | "settings";

export type GameMode = "marathon" | "sprint" | "ultra" | "zen";
const MODE_META: Record<GameMode, { name: string; tag: string; desc: string; color: string }> = {
  marathon: { name: "MARATHON", tag: "endless",  desc: "Survive as long as you can — speed ramps up with level.",     color: "#a855f7" },
  sprint:   { name: "SPRINT",   tag: "40 lines", desc: "Clear 40 lines as fast as possible. Lowest time wins.",       color: "#22d3ee" },
  ultra:    { name: "ULTRA",    tag: "2 min",    desc: "Score as much as possible in 2 minutes.",                     color: "#f59e0b" },
  zen:      { name: "ZEN",      tag: "no fail",  desc: "Relaxed mode — no top-out, no timer. Just play.",             color: "#4ade80" },
};
const SPRINT_GOAL = 40;
const ULTRA_DURATION_MS = 2 * 60 * 1000;

interface Score { name: string; mode: GameMode; score: number; lines: number; level: number; timeMs: number; date: number; }

const STORAGE_KEY = "tetris.scores.v2";

function loadScores(): Score[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveScores(s: Score[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function fmtTime(ms: number) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function rankScores(all: Score[], mode: GameMode): Score[] {
  const filtered = all.filter(s => s.mode === mode);
  if (mode === "sprint") return filtered.sort((a, b) => a.timeMs - b.timeMs).slice(0, 10);
  return filtered.sort((a, b) => b.score - a.score).slice(0, 10);
}


export default function Tetris() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [bag, setBag] = useState<PieceType[]>([]);
  const [next, setNext] = useState<PieceType[]>([]);
  const [hold, setHold] = useState<PieceType | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [combo, setCombo] = useState(0);
  const [flashRows, setFlashRows] = useState<number[]>([]);
  const [shake, setShake] = useState(0);
  const [slowMo, setSlowMo] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatTexts, setFloatTexts] = useState<{ id: number; text: string; x: number; y: number }[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [energy, setEnergy] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [freezeUntil, setFreezeUntil] = useState(0);
  const [mode, setMode] = useState<GameMode>("marathon");
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finalTime, setFinalTime] = useState(0);
  const [, setNow] = useState(0);


  const level = levelForLines(lines);
  const gravity = gravityMs(level) * (slowMo ? 2.5 : 1);

  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const energyRef = useRef(energy);
  boardRef.current = board; pieceRef.current = piece; energyRef.current = energy;


  useEffect(() => { setScores(loadScores()); }, []);

  const drawNext = useCallback((curBag: PieceType[], curNext: PieceType[]) => {
    let b = [...curBag]; let n = [...curNext];
    while (n.length < 5) {
      if (b.length === 0) b = newBag();
      n.push(b.shift()!);
    }
    return { bag: b, next: n };
  }, []);

  const startGame = useCallback((selected: GameMode = mode) => {
    const initialBag = newBag();
    const { bag: b, next: n } = drawNext(initialBag, []);
    const first = n.shift()!;
    const r = drawNext(b, n);
    setMode(selected);
    setBoard(emptyBoard());
    setPiece(spawnPiece(first));
    setBag(r.bag); setNext(r.next);
    setHold(null); setCanHold(true);
    setScore(0); setLines(0); setCombo(0);
    setFlashRows([]); setShake(0); setSlowMo(false);
    setParticles([]); setFloatTexts([]);
    setEnergy(0); setFrozen(false); setFreezeUntil(0);
    setStartedAt(Date.now()); setElapsed(0); setFinalTime(0);
    setScreen("playing");
  }, [drawNext, mode]);

  const finishGame = useCallback((reason: "topout" | "complete" | "timeup" = "topout") => {
    sfx.over();
    const t = Date.now() - startedAt;
    setFinalTime(t);
    setScreen("over");
    if (mode === "zen") return; // no saving in zen
    const s: Score = { name: "YOU", mode, score, lines, level, timeMs: t, date: Date.now() };
    const all = [...loadScores(), s];
    saveScores(all);
    setScores(rankScores(all, mode));
    void reason;
  }, [score, lines, level, mode, startedAt]);

  const spawnNext = useCallback((curBag: PieceType[], curNext: PieceType[], curBoard: Board) => {
    const type = curNext[0];
    const np = spawnPiece(type);
    const rest = curNext.slice(1);
    const r = drawNext(curBag, rest);
    if (collides(curBoard, np)) {
      if (mode === "zen") {
        // Clear bottom 4 rows to keep playing
        const cleaned = curBoard.map((row, i) => i >= ROWS - 4 ? Array(COLS).fill(0) : row);
        const np2 = spawnPiece(type);
        if (collides(cleaned, np2)) { finishGame("topout"); return; }
        setBoard(cleaned);
        setPiece(np2); setBag(r.bag); setNext(r.next); setCanHold(true);
        return;
      }
      finishGame("topout");
      return;
    }
    setPiece(np); setBag(r.bag); setNext(r.next); setCanHold(true);
  }, [drawNext, mode, finishGame]);



  const spawnParticles = useCallback((rows: number[]) => {
    const cellSize = 28;
    const ps: Particle[] = [];
    let id = Date.now();
    for (const r of rows) {
      for (let c = 0; c < 10; c++) {
        const color = COLORS[(boardRef.current[r]?.[c] || 1) as number];
        for (let k = 0; k < 4; k++) {
          ps.push({
            id: id++,
            x: 8 + c * (cellSize + 2) + cellSize / 2,
            y: 8 + r * (cellSize + 2) + cellSize / 2,
            vx: (Math.random() - 0.5) * 300,
            vy: (Math.random() - 1) * 250,
            life: 1,
            color,
            size: 2 + Math.random() * 3,
          });
        }
      }
    }
    setParticles(prev => [...prev, ...ps]);
  }, []);

  const addFloatText = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setFloatTexts(t => [...t, { id, text, x: 140, y: 200 }]);
    setTimeout(() => setFloatTexts(t => t.filter(f => f.id !== id)), 1100);
  }, []);

  const handleLock = useCallback((p: Piece) => {
    const locked = lockPiece(boardRef.current, p);
    const { board: cleared, lines: rows } = clearLines(locked);
    if (rows.length > 0) {
      setFlashRows(rows);
      spawnParticles(rows);
      sfx.clear(rows.length);
      const base = LINE_SCORES[rows.length] * level;
      const newCombo = combo + 1;
      const comboBonus = newCombo > 1 ? 50 * (newCombo - 1) * level : 0;
      setCombo(newCombo);
      setScore(s => s + base + comboBonus);
      setLines(l => {
        const nl = l + rows.length;
        if (mode === "sprint" && l < SPRINT_GOAL && nl >= SPRINT_GOAL) {
          setTimeout(() => finishGame("complete"), 250);
        }
        return nl;
      });
      setEnergy(e => Math.min(100, e + rows.length * 12 + (newCombo > 1 ? 4 : 0)));
      if (rows.length >= 3) setShake(rows.length >= 4 ? 18 : 10);


      if (rows.length === 4) {
        setSlowMo(true);
        setTimeout(() => setSlowMo(false), 420);
        addFloatText("TETRIS!");
      } else if (rows.length === 3) addFloatText("TRIPLE");
      else if (rows.length === 2) addFloatText("DOUBLE");
      if (newCombo > 1) { sfx.combo(newCombo); addFloatText(`COMBO x${newCombo}`); }
      setTimeout(() => {
        setBoard(cleared);
        setFlashRows([]);
        spawnNext(bag, next, cleared);
      }, 180);
    } else {
      setCombo(0);
      setBoard(locked);
      spawnNext(bag, next, locked);
    }
  }, [combo, level, bag, next, spawnNext, spawnParticles, addFloatText, mode, finishGame]);

  // Game timer (ticks every 100ms while playing)
  useEffect(() => {
    if (screen !== "playing") return;
    const t = setInterval(() => {
      const e = Date.now() - startedAt;
      setElapsed(e);
      if (mode === "ultra" && e >= ULTRA_DURATION_MS) finishGame("timeup");
    }, 100);
    return () => clearInterval(t);
  }, [screen, startedAt, mode, finishGame]);


  // Gravity (paused while frozen)
  useEffect(() => {
    if (screen !== "playing" || !piece || frozen) return;
    const t = setInterval(() => {
      const p = pieceRef.current; if (!p) return;
      const moved = tryMove(boardRef.current, p, 1, 0);
      if (moved) setPiece(moved);
      else handleLock(p);
    }, gravity);
    return () => clearInterval(t);
  }, [screen, piece, gravity, handleLock, frozen]);

  // Freeze timer
  useEffect(() => {
    if (!frozen) return;
    const t = setInterval(() => {
      setNow(n => n + 1);
      if (Date.now() >= freezeUntil) setFrozen(false);
    }, 100);
    return () => clearInterval(t);
  }, [frozen, freezeUntil]);

  const spendEnergy = useCallback((cost: number) => {
    if (energyRef.current < cost) { sfx.noEnergy(); return false; }
    setEnergy(e => Math.max(0, e - cost));
    return true;
  }, []);

  // Piece cell offsets for each type/rotation (mirrors engine SHAPES)
  const PIECE_OFFS: Record<PieceType, number[][][]> = useMemo(() => ({
    I:[[[0,0],[0,1],[0,2],[0,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]],[[0,1],[1,1],[2,1],[3,1]]],
    O:[[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]],[[0,1],[0,2],[1,1],[1,2]]],
    T:[[[0,1],[1,0],[1,1],[1,2]],[[0,1],[1,1],[1,2],[2,1]],[[1,0],[1,1],[1,2],[2,1]],[[0,1],[1,0],[1,1],[2,1]]],
    S:[[[0,1],[0,2],[1,0],[1,1]],[[0,1],[1,1],[1,2],[2,2]],[[1,1],[1,2],[2,0],[2,1]],[[0,0],[1,0],[1,1],[2,1]]],
    Z:[[[0,0],[0,1],[1,1],[1,2]],[[0,2],[1,1],[1,2],[2,1]],[[1,0],[1,1],[2,1],[2,2]],[[0,1],[1,0],[1,1],[2,0]]],
    J:[[[0,0],[1,0],[1,1],[1,2]],[[0,1],[0,2],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,0],[2,1]]],
    L:[[[0,2],[1,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[1,2],[2,0]],[[0,0],[0,1],[1,1],[2,1]]],
  }), []);

  const useBomb = useCallback(() => {
    const p = pieceRef.current; if (!p) return;
    if (!spendEnergy(ABILITY_COST.bomb)) return;
    sfx.bomb();
    // 3x3 around piece bbox center
    const offs = PIECE_OFFS[p.type][p.rot];
    let rSum = 0, cSum = 0;
    for (const [r, c] of offs) { rSum += r; cSum += c; }
    const cr = p.r + Math.round(rSum / offs.length);
    const cc = p.c + Math.round(cSum / offs.length);
    const nb = boardRef.current.map(row => [...row]);
    const cleared: [number, number][] = [];
    for (let r = cr - 1; r <= cr + 1; r++) {
      for (let c = cc - 1; c <= cc + 1; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && nb[r][c] !== 0) {
          cleared.push([r, c]);
          nb[r][c] = 0;
        }
      }
    }
    const cellSize = 28;
    const ps: Particle[] = [];
    let id = Date.now();
    for (const [r, c] of cleared) {
      for (let k = 0; k < 6; k++) {
        ps.push({
          id: id++,
          x: 8 + c * (cellSize + 2) + cellSize / 2,
          y: 8 + r * (cellSize + 2) + cellSize / 2,
          vx: (Math.random() - 0.5) * 420,
          vy: (Math.random() - 1) * 320,
          life: 1, color: "#f87171", size: 2 + Math.random() * 3,
        });
      }
    }
    setParticles(prev => [...prev, ...ps]);
    setShake(s => Math.max(s, 14));
    setBoard(nb);
    addFloatText("BOOM!");
  }, [spendEnergy, addFloatText, PIECE_OFFS]);

  const useFreeze = useCallback(() => {
    if (!spendEnergy(ABILITY_COST.freeze)) return;
    sfx.freeze();
    setFrozen(true);
    setFreezeUntil(Date.now() + 5000);
    addFloatText("FREEZE");
  }, [spendEnergy, addFloatText]);

  const useDrill = useCallback(() => {
    const p = pieceRef.current; if (!p) return;
    if (!spendEnergy(ABILITY_COST.drill)) return;
    sfx.drill();
    const cols = new Set<number>();
    for (const [, c] of PIECE_OFFS[p.type][p.rot]) cols.add(p.c + c);
    const nb = boardRef.current.map(row => [...row]);
    const cleared: [number, number][] = [];
    for (const c of cols) {
      for (let r = 0; r < ROWS; r++) {
        if (c >= 0 && c < COLS && nb[r][c] !== 0) {
          cleared.push([r, c]);
          nb[r][c] = 0;
        }
      }
    }
    const cellSize = 28;
    const ps: Particle[] = [];
    let id = Date.now();
    for (const [r, c] of cleared) {
      for (let k = 0; k < 4; k++) {
        ps.push({
          id: id++,
          x: 8 + c * (cellSize + 2) + cellSize / 2,
          y: 8 + r * (cellSize + 2) + cellSize / 2,
          vx: (Math.random() - 0.5) * 200,
          vy: (Math.random() - 2) * 280,
          life: 1, color: "#fb923c", size: 2 + Math.random() * 3,
        });
      }
    }
    setParticles(prev => [...prev, ...ps]);
    setShake(s => Math.max(s, 10));
    setBoard(nb);
    addFloatText("DRILL!");
  }, [spendEnergy, addFloatText, PIECE_OFFS]);

  const useAbility = useCallback((a: Ability) => {
    if (a === "bomb") useBomb();
    else if (a === "freeze") useFreeze();
    else useDrill();
  }, [useBomb, useFreeze, useDrill]);

  // Screen shake decay
  useEffect(() => {
    if (shake <= 0) return;
    const t = setTimeout(() => setShake(s => Math.max(0, s - 2)), 40);
    return () => clearTimeout(t);
  }, [shake]);

  const doHardDrop = useCallback(() => {
    const p = pieceRef.current; if (!p) return;
    const g = ghostPosition(boardRef.current, p);
    setScore(s => s + (g.r - p.r) * 2);
    sfx.drop();
    setShake(s => Math.max(s, 4));
    handleLock(g);
  }, [handleLock]);

  const doHold = useCallback(() => {
    const p = pieceRef.current; if (!p || !canHold) return;
    sfx.hold();
    if (hold) {
      setPiece(spawnPiece(hold));
      setHold(p.type);
    } else {
      setHold(p.type);
      const type = next[0];
      const rest = next.slice(1);
      const r = drawNext(bag, rest);
      setPiece(spawnPiece(type));
      setBag(r.bag); setNext(r.next);
    }
    setCanHold(false);
  }, [hold, next, bag, canHold, drawNext]);

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === "menu" || screen === "modes") {
        if (e.key === "Enter") setScreen("modes");
        return;
      }

      if (e.key === "Escape") {
        if (screen === "playing") setScreen("paused");
        else if (screen === "paused") setScreen("playing");
        return;
      }
      if (screen !== "playing" || !pieceRef.current) return;
      const p = pieceRef.current;
      if (e.key === "ArrowLeft") { const n = tryMove(boardRef.current, p, 0, -1); if (n) { setPiece(n); sfx.move(); } }
      else if (e.key === "ArrowRight") { const n = tryMove(boardRef.current, p, 0, 1); if (n) { setPiece(n); sfx.move(); } }
      else if (e.key === "ArrowDown") { const n = tryMove(boardRef.current, p, 1, 0); if (n) { setPiece(n); setScore(s => s + 1); } }
      else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") { const n = tryRotate(boardRef.current, p, 1); if (n) { setPiece(n); sfx.rotate(); } }
      else if (e.key === "z" || e.key === "Z") { const n = tryRotate(boardRef.current, p, -1); if (n) { setPiece(n); sfx.rotate(); } }
      else if (e.key === " ") { e.preventDefault(); doHardDrop(); }
      else if (e.key === "c" || e.key === "C" || e.key === "Shift") { doHold(); }
      else if (e.key === "1") { useAbility("bomb"); }
      else if (e.key === "2") { useAbility("freeze"); }
      else if (e.key === "3") { useAbility("drill"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, startGame, doHardDrop, doHold, useAbility]);


  const speed = Math.round(1000 / gravity * 10) / 10;

  return (
    <div className="min-h-screen w-full text-white font-mono overflow-hidden relative"
      style={{
        background: "radial-gradient(1200px 800px at 50% -10%, #1e1b4b 0%, #0a0a1a 60%, #050510 100%)",
      }}>
      <BgGrid />

      {screen === "menu" && <Menu onStart={startGame} onLeaderboard={() => setScreen("leaderboard")} onSettings={() => setScreen("settings")} />}
      {screen === "leaderboard" && <Leaderboard scores={scores} onBack={() => setScreen("menu")} />}
      {screen === "settings" && <Settings onBack={() => setScreen("menu")} />}

      {(screen === "playing" || screen === "paused" || screen === "over") && (
        <div
          className="relative z-10 mx-auto flex max-w-6xl items-start justify-center gap-6 p-4 md:p-8"
          style={{
            transform: shake > 0 ? `translate(${(Math.random()-0.5)*shake}px, ${(Math.random()-0.5)*shake}px)` : undefined,
            filter: slowMo ? "saturate(1.4) brightness(1.1)" : undefined,
            transition: slowMo ? "filter 120ms" : undefined,
          }}
        >
          {/* Left panel: Hold + Abilities */}
          <div className="flex flex-col gap-3 w-[180px]">
            <SidePanel title="HOLD">
              <div className="h-20 flex items-center justify-center">
                <MiniPiece type={hold} />
              </div>
            </SidePanel>
            <SidePanel title="ENERGY">
              <EnergyBar value={energy} frozen={frozen} freezeUntil={freezeUntil} />
            </SidePanel>
            <SidePanel title="ABILITIES">
              <div className="flex flex-col gap-2">
                {(["bomb","freeze","drill"] as Ability[]).map(a => (
                  <AbilityButton key={a} ability={a} energy={energy} onUse={() => useAbility(a)} />
                ))}
              </div>
            </SidePanel>
          </div>


          <div className="relative">
            <BoardView board={board} piece={piece} flashRows={flashRows} />
            <ParticleLayer particles={particles} onUpdate={setParticles} />
            {floatTexts.map(f => (
              <div key={f.id}
                className="absolute pointer-events-none text-2xl md:text-4xl font-extrabold tracking-widest"
                style={{
                  left: "50%", top: "30%",
                  transform: "translate(-50%, -50%)",
                  color: "#fff",
                  textShadow: "0 0 20px #a855f7, 0 0 40px #a855f7",
                  animation: "floatUp 1.1s ease-out forwards",
                }}>{f.text}</div>
            ))}
            {screen === "paused" && <Overlay title="PAUSED" subtitle="Press ESC to resume" />}
            {screen === "over" && (
              <Overlay
                title="GAME OVER"
                subtitle={`Score ${score} · Lines ${lines}`}
                actions={
                  <>
                    <NeonButton onClick={startGame}>Retry</NeonButton>
                    <NeonButton onClick={() => setScreen("menu")} variant="ghost">Menu</NeonButton>
                  </>
                }
              />
            )}
          </div>

          <div className="flex flex-col gap-3 w-[180px]">
            <SidePanel title="NEXT">
              <div className="flex flex-col gap-2 items-center">
                {next.slice(0, 4).map((t, i) => <MiniPiece key={i} type={t} cell={14} />)}
              </div>
            </SidePanel>
            <SidePanel title="STATS">
              <Stat label="SCORE" value={score.toLocaleString()} />
              <Stat label="LINES" value={lines} />
              <Stat label="LEVEL" value={level} />
              <Stat label="SPEED" value={`${speed}/s`} />
              <Stat label="COMBO" value={combo > 1 ? `x${combo}` : "—"} highlight={combo > 1} />
            </SidePanel>
            <SidePanel title="CONTROLS">
              <div className="text-[10px] leading-relaxed text-white/60 space-y-1">
                <div>← →  Move</div>
                <div>↓  Soft drop</div>
                <div>↑ / X  Rotate</div>
                <div>Z  Rotate ←</div>
                <div>Space  Hard drop</div>
                <div>C / Shift  Hold</div>
                <div>1 2 3  Abilities</div>
                <div>Esc  Pause</div>
              </div>
            </SidePanel>

          </div>
        </div>
      )}

      <style>{`
        @keyframes floatUp {
          0% { opacity: 0; transform: translate(-50%, -30%) scale(0.7); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          80% { opacity: 1; transform: translate(-50%, -70%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -120%) scale(0.9); }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { text-shadow: 0 0 30px #a855f7, 0 0 60px #a855f7; } 50% { text-shadow: 0 0 50px #ec4899, 0 0 90px #ec4899; } }
      `}</style>
    </div>
  );
}

function BgGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-30"
      style={{
        backgroundImage:
          "linear-gradient(rgba(168,85,247,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.08) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
      }}
    />
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[180px] rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-3 shadow-[0_0_40px_-15px_rgba(168,85,247,0.5)]">
      <div className="text-[10px] tracking-[0.2em] text-purple-300/80 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-white/5 last:border-0">
      <span className="text-[10px] text-white/50 tracking-widest">{label}</span>
      <span className={`text-sm font-bold ${highlight ? "text-pink-400 [text-shadow:_0_0_10px_#ec4899]" : "text-white"}`}>{value}</span>
    </div>
  );
}

function Overlay({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm z-20">
      <div className="text-center p-6">
        <div className="text-4xl font-extrabold tracking-widest mb-2"
          style={{ color: "#fff", textShadow: "0 0 30px #a855f7, 0 0 60px #a855f7", animation: "pulse 2s infinite" }}>
          {title}
        </div>
        {subtitle && <div className="text-white/70 mb-4">{subtitle}</div>}
        {actions && <div className="flex gap-2 justify-center">{actions}</div>}
      </div>
    </div>
  );
}

function NeonButton({ children, onClick, variant = "solid" }: { children: React.ReactNode; onClick?: () => void; variant?: "solid" | "ghost" }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => sfx.hover()}
      className={`px-6 py-3 rounded-xl font-bold tracking-widest text-sm transition-all hover:scale-105 ${
        variant === "solid"
          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:shadow-[0_0_50px_rgba(236,72,153,0.7)]"
          : "border border-white/20 text-white/80 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Menu({ onStart, onLeaderboard, onSettings }: { onStart: () => void; onLeaderboard: () => void; onSettings: () => void }) {
  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8" style={{ animation: "fadeIn .4s ease-out" }}>
      <h1 className="text-7xl md:text-9xl font-extrabold tracking-[0.15em] mb-2"
        style={{
          background: "linear-gradient(180deg, #fff, #a855f7)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textShadow: "0 0 80px rgba(168,85,247,0.5)",
          filter: "drop-shadow(0 0 30px rgba(236,72,153,0.4))",
        }}>
        TETRIS
      </h1>
      <div className="text-purple-300/70 tracking-[0.3em] mb-12 text-sm">NEON · MODERN</div>
      <div className="flex flex-col gap-3 w-64">
        <NeonButton onClick={onStart}>SOLO MODE</NeonButton>
        <NeonButton onClick={() => alert("1v1 multiplayer coming next phase")} variant="ghost">1V1 MULTIPLAYER</NeonButton>
        <NeonButton onClick={onLeaderboard} variant="ghost">LEADERBOARD</NeonButton>
        <NeonButton onClick={onSettings} variant="ghost">SETTINGS</NeonButton>
      </div>
      <div className="absolute bottom-6 text-xs text-white/30 tracking-widest">PRESS ENTER TO PLAY</div>
    </div>
  );
}

function Leaderboard({ scores, onBack }: { scores: Score[]; onBack: () => void }) {
  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8" style={{ animation: "fadeIn .4s ease-out" }}>
      <h2 className="text-5xl font-extrabold tracking-widest mb-8 text-white" style={{ textShadow: "0 0 30px #a855f7" }}>LEADERBOARD</h2>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-6 mb-6">
        {scores.length === 0 ? (
          <div className="text-white/50 text-center py-8">No scores yet. Go play!</div>
        ) : scores.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <span className="text-purple-300 w-8">#{i+1}</span>
            <span className="flex-1 text-white">{s.name}</span>
            <span className="text-white/60 text-sm w-16 text-right">L{s.level}</span>
            <span className="text-pink-400 font-bold w-24 text-right">{s.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <NeonButton onClick={onBack} variant="ghost">BACK</NeonButton>
    </div>
  );
}

function Settings({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8" style={{ animation: "fadeIn .4s ease-out" }}>
      <h2 className="text-5xl font-extrabold tracking-widest mb-8 text-white" style={{ textShadow: "0 0 30px #a855f7" }}>SETTINGS</h2>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-6 mb-6 text-white/70 text-sm space-y-3">
        <div>Audio · synthesized SFX (always on)</div>
        <div>Controls · keyboard (rebinding in next phase)</div>
        <div>Power-ups · Bomb / Freeze / Drill (keys 1·2·3)</div>
        <div>Multiplayer · coming in phase 4</div>
      </div>
      <NeonButton onClick={onBack} variant="ghost">BACK</NeonButton>
    </div>
  );
}

function EnergyBar({ value, frozen, freezeUntil }: { value: number; frozen: boolean; freezeUntil: number }) {
  const remain = frozen ? Math.max(0, Math.ceil((freezeUntil - Date.now()) / 1000)) : 0;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-white/5 overflow-hidden border border-white/10">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-200"
          style={{
            width: `${value}%`,
            background: "linear-gradient(90deg, #a855f7, #ec4899, #f59e0b)",
            boxShadow: "0 0 12px rgba(236,72,153,0.6)",
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] mt-1 text-white/50 tracking-widest">
        <span>{Math.floor(value)}%</span>
        {frozen && <span className="text-cyan-300 [text-shadow:_0_0_8px_#22d3ee]">FROZEN {remain}s</span>}
      </div>
    </div>
  );
}

function AbilityButton({ ability, energy, onUse }: { ability: Ability; energy: number; onUse: () => void }) {
  const meta = ABILITY_META[ability];
  const cost = ABILITY_COST[ability];
  const ready = energy >= cost;
  return (
    <button
      onClick={onUse}
      onMouseEnter={() => sfx.hover()}
      disabled={!ready}
      className={`relative w-full rounded-lg border px-2 py-1.5 text-left transition-all ${
        ready
          ? "border-white/20 bg-white/5 hover:bg-white/10 hover:scale-[1.02] cursor-pointer"
          : "border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed"
      }`}
      style={ready ? { boxShadow: `0 0 14px -4px ${meta.color}88` } : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-lg leading-none w-6 h-6 flex items-center justify-center rounded"
          style={{ color: meta.color, textShadow: ready ? `0 0 10px ${meta.color}` : undefined }}
        >
          {meta.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold tracking-widest text-white">{meta.name}</div>
          <div className="text-[9px] text-white/50 leading-tight truncate">{meta.desc}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/40">[{meta.key}]</div>
          <div className="text-[10px] font-bold" style={{ color: ready ? meta.color : "#888" }}>{cost}</div>
        </div>
      </div>
    </button>
  );
}


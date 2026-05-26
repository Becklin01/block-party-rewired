import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COLS, ROWS, emptyBoard, spawnPiece, tryMove, tryRotate, collides, lockPiece, clearLines,
  ghostPosition, gravityMs, levelForLines, LINE_SCORES, createBagStream, pushGarbage, mulberry32,
  type Board, type Piece, type PieceType,
} from "@/lib/tetris/engine";
import { BoardView, MiniPiece } from "@/components/tetris/Board";
import { sfx } from "@/lib/tetris/audio";
import {
  createRoom, joinRoom, registerPlayer, listPlayers, leaveRoom,
  openChannel, getPlayerId, getPlayerName, setPlayerName, garbageForLines, ROOM_CODE_LENGTH,
  hydratePlayerId,
  type MpChannel, type MpMessage,
} from "@/lib/tetris/multiplayer";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";

type Phase = "lobby" | "playing" | "over";

interface Props { onBack: () => void; }

export default function Multiplayer({ onBack }: Props) {
  const { user, displayName, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [code, setCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [name, setName] = useState(displayName ?? getPlayerName());
  const [seed, setSeed] = useState<number | null>(null);
  const [players, setPlayers] = useState<{ player_id: string; name: string }[]>([]);
  const [presence, setPresence] = useState(0);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void hydratePlayerId(); }, [user?.id]);
  useEffect(() => { if (displayName) setName(displayName); }, [displayName]);

  // game state
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [next, setNext] = useState<PieceType[]>([]);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [pendingGarbage, setPendingGarbage] = useState(0);
  const [winner, setWinner] = useState<"me" | "them" | null>(null);

  // opponent state
  const [oppBoard, setOppBoard] = useState<Board>(emptyBoard);
  const [oppScore, setOppScore] = useState(0);
  const [oppLines, setOppLines] = useState(0);
  const [oppName, setOppName] = useState("Opponent");
  const [ping, setPing] = useState<number | null>(null);

  const chanRef = useRef<MpChannel | null>(null);
  const bagRef = useRef<(() => PieceType) | null>(null);
  const garbRngRef = useRef<(() => number) | null>(null);
  const boardRef = useRef(board); boardRef.current = board;
  const pieceRef = useRef(piece); pieceRef.current = piece;
  const pendingRef = useRef(pendingGarbage); pendingRef.current = pendingGarbage;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const lastSentRef = useRef(0);

  const level = levelForLines(lines);
  const gravity = gravityMs(level);

  const send = useCallback((m: MpMessage) => chanRef.current?.send(m), []);

  // ---------- lobby actions ----------
  const doCreate = async () => {
    setBusy(true); setError(null);
    setPlayerName(name);
    const res = await createRoom();
    if (!res) { setError("Could not create room."); setBusy(false); return; }
    await registerPlayer(res.code, name);
    setCode(res.code); setSeed(res.seed);
    setMode("create");
    setBusy(false);
  };

  const doJoin = async () => {
    const c = joinInput.trim().toUpperCase();
    if (c.length !== ROOM_CODE_LENGTH) { setError(`Enter a ${ROOM_CODE_LENGTH}-character code.`); return; }
    setBusy(true); setError(null);
    setPlayerName(name);
    const res = await joinRoom(c);
    if (!res) { setError("Room not found."); setBusy(false); return; }
    await registerPlayer(c, name);
    setCode(c); setSeed(res.seed);
    setMode("join");
    setBusy(false);
  };

  // Open channel + poll players once code+seed known and lobby
  useEffect(() => {
    if (!code || seed === null || phase !== "lobby") return;
    let cancelled = false;
    const refresh = async () => {
      const list = await listPlayers(code);
      if (!cancelled) {
        setPlayers(list);
        const opp = list.find(p => p.player_id !== getPlayerId());
        if (opp) setOppName(opp.name);
      }
    };
    const ch = openChannel(code, (msg) => {
      handleMessage(msg);
      if (msg.t === "state" || msg.t === "ping") void refresh();
    }, (count) => {
      setPresence(count);
      if (count >= 2) void refresh();
    });
    chanRef.current = ch;
    refresh();
    const t = setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
      ch.close();
      chanRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, seed, phase]);

  // ---------- messaging ----------
  const handleMessage = useCallback((msg: MpMessage) => {
    if (msg.from === getPlayerId()) return;
    if (msg.t === "state") {
      setOppBoard(msg.board);
      setOppScore(msg.score);
      setOppLines(msg.lines);
    } else if (msg.t === "attack") {
      if (phaseRef.current === "playing") {
        setPendingGarbage(g => g + msg.rows);
      }
    } else if (msg.t === "over") {
      if (phaseRef.current === "playing") {
        setWinner("me");
        setPhase("over");
        sfx.clear(4);
      }
    } else if (msg.t === "ping") {
      send({ t: "pong", from: getPlayerId(), ts: msg.ts });
    } else if (msg.t === "pong") {
      setPing(Date.now() - msg.ts);
    } else if (msg.t === "rematch") {
      // opponent wants rematch — auto-restart if we're also over
      // For simplicity, restart immediately
      startGame();
    }
  }, [send]);

  // ---------- start game ----------
  const startGame = useCallback(() => {
    if (seed === null) return;
    const bag = createBagStream(seed);
    bagRef.current = bag;
    garbRngRef.current = mulberry32(seed ^ 0xDEADBEEF);
    const n: PieceType[] = [];
    for (let i = 0; i < 5; i++) n.push(bag());
    const first = n.shift()!;
    setBoard(emptyBoard());
    setPiece(spawnPiece(first));
    setNext([...n, bag()]);
    setScore(0); setLines(0); setPendingGarbage(0); setWinner(null);
    setOppBoard(emptyBoard()); setOppScore(0); setOppLines(0);
    setPhase("playing");
  }, [seed]);

  // Host triggers start when 2 players present
  useEffect(() => {
    if (phase !== "lobby" || seed === null) return;
    if (players.length >= 2 && presence >= 2) {
      // small delay so both clients have channel ready
      const t = setTimeout(() => startGame(), 600);
      return () => clearTimeout(t);
    }
  }, [players.length, presence, phase, seed, startGame]);

  // ---------- game loop ----------
  const spawnNext = useCallback((curBoard: Board, curNext: PieceType[]) => {
    const bag = bagRef.current!;
    const type = curNext[0];
    const np = spawnPiece(type);
    if (collides(curBoard, np)) {
      // top out — we lose
      send({ t: "over", from: getPlayerId() });
      setWinner("them");
      setPhase("over");
      sfx.over();
      return;
    }
    const newNext = [...curNext.slice(1), bag()];
    setPiece(np);
    setNext(newNext);
  }, [send]);

  const handleLock = useCallback((p: Piece) => {
    let nb = lockPiece(boardRef.current, p);
    const { board: cleared, lines: rows } = clearLines(nb);
    let after = cleared;

    if (rows.length > 0) {
      sfx.clear(rows.length);
      const gained = LINE_SCORES[rows.length] * Math.max(1, levelForLines(lines));
      setScore(s => s + gained);
      setLines(l => l + rows.length);

      // send attack
      const atk = garbageForLines(rows.length);
      if (atk > 0) send({ t: "attack", from: getPlayerId(), rows: atk });
    }

    // Absorb pending garbage on lock (only when no clear, to mimic standard versus)
    if (rows.length === 0 && pendingRef.current > 0) {
      const incoming = pendingRef.current;
      setPendingGarbage(0);
      after = pushGarbage(after, incoming, garbRngRef.current!);
    }

    setBoard(after);
    spawnNext(after, next);
  }, [lines, next, send, spawnNext]);

  // gravity
  useEffect(() => {
    if (phase !== "playing" || !piece) return;
    const t = setInterval(() => {
      const p = pieceRef.current; if (!p) return;
      const moved = tryMove(boardRef.current, p, 1, 0);
      if (moved) setPiece(moved);
      else handleLock(p);
    }, gravity);
    return () => clearInterval(t);
  }, [phase, piece, gravity, handleLock]);

  // input
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      const p = pieceRef.current; if (!p) return;
      if (e.key === "ArrowLeft") { const n = tryMove(boardRef.current, p, 0, -1); if (n) { setPiece(n); sfx.move(); } }
      else if (e.key === "ArrowRight") { const n = tryMove(boardRef.current, p, 0, 1); if (n) { setPiece(n); sfx.move(); } }
      else if (e.key === "ArrowDown") { const n = tryMove(boardRef.current, p, 1, 0); if (n) { setPiece(n); setScore(s => s + 1); } }
      else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") { const n = tryRotate(boardRef.current, p, 1); if (n) { setPiece(n); sfx.rotate(); } }
      else if (e.key === "z" || e.key === "Z") { const n = tryRotate(boardRef.current, p, -1); if (n) { setPiece(n); sfx.rotate(); } }
      else if (e.key === " ") {
        e.preventDefault();
        const g = ghostPosition(boardRef.current, p);
        setScore(s => s + (g.r - p.r) * 2);
        sfx.drop();
        handleLock(g);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleLock]);

  // throttled state broadcast
  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => {
      const now = Date.now();
      if (now - lastSentRef.current < 90) return;
      lastSentRef.current = now;
      send({ t: "state", from: getPlayerId(), board: boardRef.current, score, lines });
    }, 100);
    return () => clearInterval(t);
  }, [phase, send, score, lines]);

  // ping every 3s
  useEffect(() => {
    if (!chanRef.current) return;
    const t = setInterval(() => send({ t: "ping", from: getPlayerId(), ts: Date.now() }), 3000);
    return () => clearInterval(t);
  }, [send]);

  // cleanup on unmount
  useEffect(() => {
    return () => { if (code) void leaveRoom(code); };
  }, [code]);

  const rematch = () => {
    send({ t: "rematch", from: getPlayerId() });
    startGame();
  };

  const handleBack = async () => {
    if (code) await leaveRoom(code);
    chanRef.current?.close();
    onBack();
  };

  // ---------- render ----------
  const lobbyChoose = useMemo(() => (
    <div className="flex flex-col gap-4 items-center">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={12}
        placeholder="Your name"
        className="bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-center tracking-widest text-white w-64 focus:outline-none focus:border-purple-400"
      />
      <button
        onClick={doCreate}
        disabled={busy || !name.trim()}
        className="w-64 px-6 py-3 rounded-xl font-bold tracking-widest text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:scale-105 transition disabled:opacity-40"
      >CREATE ROOM</button>
      <div className="flex gap-2 w-64">
        <input
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))}
          placeholder={"CODE".padEnd(ROOM_CODE_LENGTH, " ")}
          maxLength={ROOM_CODE_LENGTH}
          className="flex-1 bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-center tracking-[0.4em] text-white focus:outline-none focus:border-cyan-400 font-mono"
        />
        <button
          onClick={doJoin}
          disabled={busy || joinInput.length !== ROOM_CODE_LENGTH || !name.trim()}
          className="px-4 py-3 rounded-lg border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 transition disabled:opacity-40 text-sm tracking-widest font-bold"
        >JOIN</button>
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
    </div>
  ), [name, joinInput, busy, error]);

  if (phase === "lobby" && mode === "choose") {
    if (!authLoading && !user) {
      return (
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-5xl font-extrabold tracking-widest mb-2 text-white" style={{ textShadow: "0 0 30px #a855f7" }}>VERSUS</h2>
          <div className="text-purple-300/60 tracking-[0.3em] mb-8 text-xs">SIGN IN TO PLAY ONLINE</div>
          <p className="text-white/60 max-w-md mb-6 text-sm">Online multiplayer requires an account so we can match you with friends and protect rooms from tampering.</p>
          <Link to="/auth" className="px-6 py-3 rounded-xl font-bold tracking-widest text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:scale-105 transition">SIGN IN</Link>
          <button onClick={onBack} className="mt-8 text-white/50 text-xs tracking-widest hover:text-white">← BACK</button>
        </div>
      );
    }
    return (
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        <h2 className="text-5xl font-extrabold tracking-widest mb-2 text-white" style={{ textShadow: "0 0 30px #a855f7" }}>VERSUS</h2>
        <div className="text-purple-300/60 tracking-[0.3em] mb-10 text-xs">1V1 ONLINE — INVITE A FRIEND</div>
        {lobbyChoose}
        <button onClick={onBack} className="mt-8 text-white/50 text-xs tracking-widest hover:text-white">← BACK</button>
      </div>
    );
  }

  if (phase === "lobby") {
    const me = getPlayerId();
    const opp = players.find(p => p.player_id !== me);
    return (
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        <h2 className="text-4xl font-extrabold tracking-widest mb-2 text-white" style={{ textShadow: "0 0 30px #a855f7" }}>ROOM</h2>
        <div className="text-purple-300/60 tracking-[0.3em] mb-6 text-xs">SHARE THIS CODE</div>
        <div className="text-7xl font-mono font-extrabold tracking-[0.4em] text-white mb-2"
          style={{ textShadow: "0 0 40px #a855f7, 0 0 80px #ec4899" }}>{code}</div>
        <button
          onClick={() => { void navigator.clipboard?.writeText(code); }}
          className="text-xs text-purple-300 tracking-widest hover:text-white mb-8"
        >COPY CODE</button>

        <div className="flex gap-4 items-center mb-8">
          <PlayerSlot name={name} you />
          <div className="text-white/30 text-2xl">VS</div>
          <PlayerSlot name={opp?.name ?? null} />
        </div>

        <div className="text-white/50 text-sm tracking-widest mb-4">
          {opp ? "STARTING…" : "WAITING FOR OPPONENT…"}
        </div>
        <button onClick={handleBack} className="text-white/50 text-xs tracking-widest hover:text-white">← LEAVE ROOM</button>
      </div>
    );
  }

  // playing / over
  return (
    <div className="relative z-10 mx-auto flex max-w-7xl items-start justify-center gap-6 p-4 md:p-8">
      {/* My side */}
      <PlayerPanel
        title={name}
        you
        board={board}
        piece={piece}
        score={score}
        lines={lines}
        pending={pendingGarbage}
        next={next.slice(0, 3)}
      />

      {/* Center divider */}
      <div className="flex flex-col items-center justify-center gap-2 mt-8">
        <div className="text-purple-300/70 tracking-widest text-xs">VS</div>
        <div className="h-64 w-px bg-gradient-to-b from-transparent via-purple-400/40 to-transparent" />
        {ping !== null && (
          <div className="text-[10px] text-white/40 tracking-widest">{ping}ms</div>
        )}
      </div>

      {/* Opponent side */}
      <PlayerPanel
        title={oppName}
        board={oppBoard}
        piece={null}
        score={oppScore}
        lines={oppLines}
        pending={0}
        next={[]}
      />

      {phase === "over" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center p-8 rounded-2xl border border-white/10 bg-black/60">
            <div className="text-6xl font-extrabold tracking-widest mb-3"
              style={{
                color: winner === "me" ? "#4ade80" : "#f87171",
                textShadow: winner === "me" ? "0 0 40px #4ade80" : "0 0 40px #f87171",
              }}>
              {winner === "me" ? "YOU WIN!" : "DEFEAT"}
            </div>
            <div className="text-white/70 mb-6">{score.toLocaleString()} pts · {lines} lines</div>
            <div className="flex gap-3 justify-center">
              <button onClick={rematch}
                className="px-6 py-3 rounded-xl font-bold tracking-widest text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:scale-105 transition">
                REMATCH
              </button>
              <button onClick={handleBack}
                className="px-6 py-3 rounded-xl border border-white/20 text-white/80 hover:bg-white/5 text-sm tracking-widest font-bold">
                LEAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({ name, you }: { name: string | null; you?: boolean }) {
  return (
    <div className={`w-40 h-24 rounded-2xl border flex flex-col items-center justify-center ${
      name ? "border-white/30 bg-white/5" : "border-dashed border-white/15 bg-white/[0.02]"
    }`}>
      <div className="text-[10px] tracking-[0.25em] text-white/40 mb-1">{you ? "YOU" : "OPPONENT"}</div>
      <div className="text-lg font-bold text-white tracking-wider">{name ?? "—"}</div>
    </div>
  );
}

function PlayerPanel({
  title, you, board, piece, score, lines, pending, next,
}: {
  title: string;
  you?: boolean;
  board: Board;
  piece: Piece | null;
  score: number;
  lines: number;
  pending: number;
  next: PieceType[];
}) {
  const cell = you ? 24 : 16;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-xs tracking-[0.3em] ${you ? "text-purple-300" : "text-cyan-300"}`}>
        {you ? "YOU" : "OPPONENT"}
      </div>
      <div className="text-xl font-bold text-white tracking-widest">{title}</div>
      <div className="flex gap-3 items-start">
        {/* garbage bar (left of board) */}
        <GarbageBar pending={pending} cell={cell} />
        <BoardViewScaled board={board} piece={piece} cell={cell} />
        {next.length > 0 && (
          <div className="flex flex-col gap-2 w-[80px]">
            <div className="text-[9px] tracking-[0.25em] text-white/40">NEXT</div>
            {next.map((t, i) => <MiniPiece key={i} type={t} cell={12} />)}
          </div>
        )}
      </div>
      <div className="flex gap-4 text-sm mt-1">
        <span className="text-white/50">SCORE <span className="text-white font-bold ml-1">{score.toLocaleString()}</span></span>
        <span className="text-white/50">LINES <span className="text-white font-bold ml-1">{lines}</span></span>
      </div>
    </div>
  );
}

function BoardViewScaled({ board, piece, cell }: { board: Board; piece: Piece | null; cell: number }) {
  return <BoardView board={board} piece={piece} cell={cell} />;
}

function GarbageBar({ pending, cell }: { pending: number; cell: number }) {
  const height = ROWS * (cell + 2) + 16;
  const filled = Math.min(ROWS, pending);
  return (
    <div className="flex flex-col-reverse w-3 rounded-md border border-white/10 bg-black/40 overflow-hidden" style={{ height }}>
      {Array.from({ length: ROWS }).map((_, i) => (
        <div key={i} className="flex-1 border-t border-black/40"
          style={{
            background: i < filled
              ? "linear-gradient(180deg, #f87171, #b91c1c)"
              : "transparent",
            boxShadow: i < filled ? "inset 0 0 4px rgba(0,0,0,0.5)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

// suppress unused warning for COLS import (we re-export via tree-shaking)
void COLS;

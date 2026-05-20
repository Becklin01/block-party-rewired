// Classic Tetris engine — pure logic, no rendering.
export const COLS = 10;
export const ROWS = 20;

export type Cell = number; // 0 empty, 1..7 piece color id
export type Board = Cell[][];

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const COLORS: Record<number, string> = {
  1: "#22d3ee", // I cyan
  2: "#facc15", // O yellow
  3: "#a78bfa", // T purple
  4: "#4ade80", // S green
  5: "#f87171", // Z red
  6: "#60a5fa", // J blue
  7: "#fb923c", // L orange
  8: "#ffffff", // flash
};

export const TYPE_ID: Record<PieceType, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

// Shapes defined as rotation states (4) of [r,c] offsets relative to piece origin.
const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]],
    [[0,1],[1,1],[2,1],[3,1]],
  ],
  O: [
    [[0,1],[0,2],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[1,2]],
  ],
  T: [
    [[0,1],[1,0],[1,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,1]],
    [[1,0],[1,1],[1,2],[2,1]],
    [[0,1],[1,0],[1,1],[2,1]],
  ],
  S: [
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,1],[1,2],[2,0],[2,1]],
    [[0,0],[1,0],[1,1],[2,1]],
  ],
  Z: [
    [[0,0],[0,1],[1,1],[1,2]],
    [[0,2],[1,1],[1,2],[2,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[0,1],[1,0],[1,1],[2,0]],
  ],
  J: [
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,0],[2,1]],
  ],
  L: [
    [[0,2],[1,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[1,2],[2,0]],
    [[0,0],[0,1],[1,1],[2,1]],
  ],
};

export interface Piece {
  type: PieceType;
  rot: number;
  r: number;
  c: number;
}

export const ALL_TYPES: PieceType[] = ["I","O","T","S","Z","J","L"];

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function newBag(): PieceType[] {
  const bag = [...ALL_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function spawnPiece(type: PieceType): Piece {
  return { type, rot: 0, r: 0, c: 3 };
}

export function cellsOf(p: Piece): [number, number][] {
  return SHAPES[p.type][p.rot].map(([r, c]) => [p.r + r, p.c + c]);
}

export function collides(board: Board, p: Piece): boolean {
  for (const [r, c] of cellsOf(p)) {
    if (c < 0 || c >= COLS || r >= ROWS) return true;
    if (r >= 0 && board[r][c] !== 0) return true;
  }
  return false;
}

export function tryMove(board: Board, p: Piece, dr: number, dc: number): Piece | null {
  const np = { ...p, r: p.r + dr, c: p.c + dc };
  return collides(board, np) ? null : np;
}

export function tryRotate(board: Board, p: Piece, dir: 1 | -1): Piece | null {
  const np = { ...p, rot: (p.rot + dir + 4) % 4 };
  // Simple wall kicks
  for (const dc of [0, -1, 1, -2, 2]) {
    const cand = { ...np, c: np.c + dc };
    if (!collides(board, cand)) return cand;
  }
  return null;
}

export function lockPiece(board: Board, p: Piece): Board {
  const nb = board.map(row => [...row]);
  for (const [r, c] of cellsOf(p)) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      nb[r][c] = TYPE_ID[p.type];
    }
  }
  return nb;
}

export function clearLines(board: Board): { board: Board; lines: number[] } {
  const lines: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(v => v !== 0)) lines.push(r);
  }
  if (lines.length === 0) return { board, lines };
  const nb = board.filter((_, r) => !lines.includes(r));
  while (nb.length < ROWS) nb.unshift(Array(COLS).fill(0));
  return { board: nb, lines };
}

export function ghostPosition(board: Board, p: Piece): Piece {
  let g = p;
  while (true) {
    const n = tryMove(board, g, 1, 0);
    if (!n) return g;
    g = n;
  }
}

// Score: 100/300/500/800 * level, soft drop +1/cell, hard drop +2/cell.
export const LINE_SCORES = [0, 100, 300, 500, 800];

export function levelForLines(totalLines: number) {
  return Math.floor(totalLines / 10) + 1;
}

export function gravityMs(level: number) {
  // Classic-ish curve, capped.
  return Math.max(60, Math.floor(800 * Math.pow(0.85, level - 1)));
}

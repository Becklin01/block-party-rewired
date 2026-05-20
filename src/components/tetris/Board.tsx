import { COLS, ROWS, COLORS, type Board, type Piece, cellsOf, ghostPosition } from "@/lib/tetris/engine";

interface Props {
  board: Board;
  piece: Piece | null;
  flashRows?: number[];
  cell?: number;
}

export function BoardView({ board, piece, flashRows = [], cell = 28 }: Props) {
  const grid: (number | "ghost")[][] = board.map(row => [...row]);
  if (piece) {
    const ghost = ghostPosition(board, piece);
    for (const [r, c] of cellsOf(ghost)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === 0) grid[r][c] = "ghost";
    }
    for (const [r, c] of cellsOf(piece)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        // store piece id under same numbering; reuse piece type id via mapping
        const id = ({ I:1,O:2,T:3,S:4,Z:5,J:6,L:7 } as const)[piece.type];
        grid[r][c] = id;
      }
    }
  }
  return (
    <div
      className="relative rounded-2xl p-2 border border-white/10 bg-black/40 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${COLS}, ${cell}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${cell}px)`,
        }}
      >
        {grid.flatMap((row, r) =>
          row.map((v, c) => {
            const isFlash = flashRows.includes(r);
            if (v === "ghost") {
              const id = piece ? ({ I:1,O:2,T:3,S:4,Z:5,J:6,L:7 } as const)[piece.type] : 1;
              return (
                <div
                  key={`${r}-${c}`}
                  className="rounded-[4px]"
                  style={{
                    border: `2px dashed ${COLORS[id]}66`,
                    background: "transparent",
                  }}
                />
              );
            }
            const color = v ? COLORS[v as number] : null;
            return (
              <div
                key={`${r}-${c}`}
                className="rounded-[4px] transition-transform"
                style={{
                  background: isFlash
                    ? "white"
                    : color
                    ? `linear-gradient(135deg, ${color}, ${color}aa)`
                    : "rgba(255,255,255,0.03)",
                  boxShadow: color
                    ? `inset 0 0 0 1px rgba(255,255,255,0.25), 0 0 12px ${color}55`
                    : "inset 0 0 0 1px rgba(255,255,255,0.04)",
                  transform: isFlash ? "scale(1.05)" : undefined,
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export function MiniPiece({ type, cell = 18 }: { type: import("@/lib/tetris/engine").PieceType | null; cell?: number }) {
  const SHAPES_PREVIEW: Record<string, number[][]> = {
    I: [[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[1,1,1],[0,1,0]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]],
  };
  if (!type) return <div style={{ width: cell * 4, height: cell * 3 }} />;
  const id = ({ I:1,O:2,T:3,S:4,Z:5,J:6,L:7 } as const)[type];
  const shape = SHAPES_PREVIEW[type];
  const w = shape[0].length;
  const h = shape.length;
  const color = COLORS[id];
  return (
    <div
      className="grid gap-[2px] mx-auto"
      style={{
        gridTemplateColumns: `repeat(${w}, ${cell}px)`,
        gridTemplateRows: `repeat(${h}, ${cell}px)`,
      }}
    >
      {shape.flat().map((v, i) => (
        <div
          key={i}
          className="rounded-[3px]"
          style={{
            background: v ? `linear-gradient(135deg, ${color}, ${color}aa)` : "transparent",
            boxShadow: v ? `inset 0 0 0 1px rgba(255,255,255,0.25), 0 0 8px ${color}55` : undefined,
          }}
        />
      ))}
    </div>
  );
}

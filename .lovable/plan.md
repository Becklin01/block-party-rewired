# Phase 7 — Online 1v1 Multiplayer

Add real-time head-to-head Tetris using Lovable Cloud (Supabase Realtime). No accounts required — players join with a short room code.

## Scope (1v1 only for this phase)

- Create / Join room with 4-char code
- Anonymous identity (auto-generated guest name, editable)
- Real-time board sync between two players
- Garbage line attack: clearing 2/3/4 lines sends 1/2/4 garbage rows to opponent
- Win condition: opponent tops out
- Rematch & leave room
- Connection status + ping indicator

Out of scope (future phases): 3-4 player FFA, ranked matchmaking, accounts, spectators, chat.

## UX flow

```text
Main Menu
  └─ Multiplayer (NEW)
        ├─ Create Room   → shows code, waits for P2
        └─ Join Room     → enter 4-char code
              ↓
        Versus Screen
        ┌──────────────┬──────────────┐
        │  YOU         │  OPPONENT    │
        │  [board]     │  [board]     │
        │  score/lines │  score/lines │
        │  garbage▮▮   │  garbage▮    │
        └──────────────┴──────────────┘
        Winner overlay → Rematch / Leave
```

## Technical approach

**Backend** — Lovable Cloud (enable in step 1):
- Table `mp_rooms` (code PK, status, created_at, seed) — for room discovery
- Table `mp_players` (room_code, player_id, name, ready, joined_at)
- Supabase Realtime **broadcast channel** per room (`room:{code}`) for high-frequency game state — board snapshots, garbage attacks, game-over events. Broadcast is ephemeral and fast; we don't persist every frame.
- RLS: anyone can read/insert rooms; player can only update their own row (player_id stored in localStorage).

**Frontend**:
- New `src/lib/tetris/multiplayer.ts` — channel wrapper (join, send move/board/attack, subscribe)
- New mode `Versus` in `Tetris.tsx` with side-by-side boards
- Both players use **same RNG seed** for fair piece order (deterministic 7-bag with seeded shuffle)
- Throttle board broadcasts to ~10/sec; send attacks immediately
- Garbage queue: incoming lines inserted at bottom on next lock with one random hole column

**Files**:
- `src/integrations/supabase/*` (auto-generated on Cloud enable)
- `src/lib/tetris/multiplayer.ts` (new)
- `src/lib/tetris/engine.ts` (add seeded bag, garbage insertion helper)
- `src/components/tetris/Multiplayer.tsx` (lobby + versus screen)
- `src/components/tetris/Tetris.tsx` (add MP entry point in menu)
- DB migration: 2 small tables + RLS policies

## What you'll see

- New **MULTIPLAYER** button on main menu
- Create room → share 4-character code with a friend
- Both boards visible side-by-side, live updates
- Clearing lines visibly stacks garbage on opponent's board
- First to top out loses

## Notes

- Same-network LAN play and 3+ players are deferred to a later phase.
- Uses Supabase Realtime broadcast (no edge functions needed).
- Should I proceed?
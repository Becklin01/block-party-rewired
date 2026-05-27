# Neon Tetris

A modern, neon-styled Tetris with multiplayer, abilities, and a global leaderboard.
Built with **TanStack Start** (React 19 + Vite), **Tailwind CSS v4**, and **Lovable Cloud** (Supabase) for auth, database, and realtime multiplayer.

## Features

- Single-player modes: **Marathon**, **Sprint** (40 lines), **Ultra** (2 min), **Zen**
- Real-time **multiplayer** with shared piece order and garbage attacks
- **Abilities**: Bomb, Freeze, Drill (powered by an energy meter)
- **Hold** piece (`C` / `Shift`) and **Swap with next** piece (`V`)
- **World leaderboard** with per-user best score, medal badges, and your-rank indicator
- Background music + procedural SFX
- Email + Google authentication

## Controls

| Key | Action |
|---|---|
| ← → | Move |
| ↓ | Soft drop |
| ↑ / X | Rotate clockwise |
| Z | Rotate counter-clockwise |
| Space | Hard drop |
| C / Shift | Hold piece |
| **V** | **Swap current piece with next** |
| 1 / 2 / 3 | Bomb / Freeze / Drill |
| Esc | Pause |

## Running locally from GitHub

### 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 (recommended) **or** Node.js ≥ 20 with npm
- A free [Supabase](https://supabase.com) project (for auth, leaderboard, multiplayer)

### 2. Clone and install

```bash
git clone <your-repo-url>
cd <repo-folder>
bun install         # or: npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
VITE_SUPABASE_PROJECT_ID=YOUR-PROJECT-REF

# Server-only (used by server functions)
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

You can find these in your Supabase dashboard under **Settings → API**.

### 4. Apply database migrations

The SQL migrations live in `supabase/migrations/`. Apply them with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

This creates the `profiles`, `world_scores`, `mp_rooms`, `mp_players` tables
with their RLS policies and the `handle_new_user` trigger.

### 5. (Optional) Enable Google sign-in

In the Supabase dashboard → **Authentication → Providers → Google**, add your
OAuth client ID and secret, then add `http://localhost:3000` and your deploy
URL to the redirect allow-list.

### 6. Start the dev server

```bash
bun run dev         # or: npm run dev
```

Open <http://localhost:3000>.

### 7. Build for production

```bash
bun run build       # or: npm run build
bun run start       # or: npm run start
```

## Project structure

```
src/
├── routes/                 TanStack Router file-based routes
│   ├── __root.tsx          Root layout
│   ├── index.tsx           Home / game shell
│   └── auth.tsx            Sign in / sign up
├── components/tetris/      Game UI (Board, Tetris, Multiplayer, Particles)
├── lib/tetris/             Pure game engine + audio + multiplayer client
├── lib/leaderboard.ts      Leaderboard fetching
├── lib/leaderboard.functions.ts   createServerFn for score submission
├── integrations/supabase/  Auto-generated Supabase clients (do not edit)
└── hooks/use-auth.ts       Session hook
supabase/migrations/        Database schema + RLS policies
public/music.ogg            Background music
```

## Troubleshooting

- **"Missing Supabase environment variable"** — re-check the `.env` file in step 3 and restart the dev server.
- **No background music** — browsers block autoplay until you interact with the page. Click anywhere or press a key.
- **Multiplayer "Unable to enter code"** — make sure you're signed in. RLS policies require an authenticated user to create or join rooms.
- **Leaderboard is empty** — only ranked modes (marathon / sprint / ultra) submit scores; Zen does not. You must be signed in.

## License

MIT


create table public.mp_rooms (
  code text primary key,
  host_id text not null,
  seed bigint not null,
  status text not null default 'waiting',
  created_at timestamptz not null default now()
);

create table public.mp_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.mp_rooms(code) on delete cascade,
  player_id text not null,
  name text not null,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_code, player_id)
);

create index mp_players_room_idx on public.mp_players(room_code);

alter table public.mp_rooms enable row level security;
alter table public.mp_players enable row level security;

create policy "rooms_all" on public.mp_rooms for all using (true) with check (true);
create policy "players_all" on public.mp_players for all using (true) with check (true);

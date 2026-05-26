import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Board } from "./engine";

export type MpMessage =
  | { t: "state"; from: string; board: Board; score: number; lines: number; pieceType?: string | null }
  | { t: "attack"; from: string; rows: number }
  | { t: "over"; from: string }
  | { t: "ping"; from: string; ts: number }
  | { t: "pong"; from: string; ts: number }
  | { t: "rematch"; from: string };

const PLAYER_ID_KEY = "tetris.mp.playerId";
const PLAYER_NAME_KEY = "tetris.mp.playerName";

let _cachedPlayerId: string | null = null;

// Hydrate from current Supabase session. Returns auth.uid() if signed in.
export async function hydratePlayerId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id ?? null;
  _cachedPlayerId = uid;
  if (uid && typeof window !== "undefined") localStorage.setItem(PLAYER_ID_KEY, uid);
  return uid;
}

export function getPlayerId(): string {
  if (_cachedPlayerId) return _cachedPlayerId;
  if (typeof window === "undefined") return "anon";
  const stored = localStorage.getItem(PLAYER_ID_KEY);
  if (stored) { _cachedPlayerId = stored; return stored; }
  return "anon";
}

export function getPlayerName(): string {
  if (typeof window === "undefined") return "Player";
  let n = localStorage.getItem(PLAYER_NAME_KEY);
  if (!n) {
    n = "P" + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem(PLAYER_NAME_KEY, n);
  }
  return n;
}

export function setPlayerName(name: string) {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

export const ROOM_CODE_LENGTH = 5;

export function randomCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

export async function createRoom(): Promise<{ code: string; seed: number } | null> {
  const seed = Math.floor(Math.random() * 2 ** 30);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await supabase.from("mp_rooms").insert({
      code,
      host_id: getPlayerId(),
      seed,
    });
    if (!error) return { code, seed };
  }
  return null;
}

export async function joinRoom(code: string): Promise<{ seed: number } | null> {
  const { data, error } = await supabase
    .from("mp_rooms")
    .select("seed")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return { seed: Number(data.seed) };
}

export async function registerPlayer(code: string, name: string) {
  await supabase
    .from("mp_players")
    .upsert({ room_code: code.toUpperCase(), player_id: getPlayerId(), name }, { onConflict: "room_code,player_id" });
}

export async function listPlayers(code: string) {
  const { data } = await supabase
    .from("mp_players")
    .select("player_id, name, ready")
    .eq("room_code", code.toUpperCase())
    .order("joined_at", { ascending: true });
  return data ?? [];
}

export async function leaveRoom(code: string) {
  await supabase
    .from("mp_players")
    .delete()
    .eq("room_code", code.toUpperCase())
    .eq("player_id", getPlayerId());
}

export interface MpChannel {
  channel: RealtimeChannel;
  send: (msg: MpMessage) => void;
  close: () => void;
}

export function openChannel(code: string, onMessage: (msg: MpMessage) => void, onPresence?: (count: number) => void): MpChannel {
  const me = getPlayerId();
  const channel = supabase.channel(`room:${code.toUpperCase()}`, {
    config: { broadcast: { self: false }, presence: { key: me } },
  });

  channel.on("broadcast", { event: "msg" }, ({ payload }) => {
    onMessage(payload as MpMessage);
  });

  if (onPresence) {
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      onPresence(Object.keys(state).length);
    });
  }

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ id: me, at: Date.now() });
    }
  });

  return {
    channel,
    send: (msg) => {
      channel.send({ type: "broadcast", event: "msg", payload: msg });
    },
    close: () => {
      void supabase.removeChannel(channel);
    },
  };
}

// Garbage scaling: 1->0, 2->1, 3->2, 4->4
export function garbageForLines(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  if (n === 3) return 2;
  return 4;
}

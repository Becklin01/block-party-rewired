import { supabase } from "@/integrations/supabase/client";

export type WorldMode = "marathon" | "sprint" | "ultra";

export interface WorldScoreRow {
  id: string;
  user_id: string;
  mode: WorldMode;
  score: number;
  lines: number;
  level: number;
  time_ms: number;
  created_at: string;
  display_name: string;
}

export async function submitWorldScore(input: {
  mode: WorldMode;
  score: number;
  lines: number;
  level: number;
  timeMs: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: "not_authenticated" };
  const { error } = await supabase.from("world_scores").insert({
    user_id: user.id,
    mode: input.mode,
    score: input.score,
    lines: input.lines,
    level: input.level,
    time_ms: input.timeMs,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchWorldTop(mode: WorldMode, limit = 25): Promise<WorldScoreRow[]> {
  const orderCol = mode === "sprint" ? "time_ms" : "score";
  const asc = mode === "sprint";
  const { data: scores, error } = await supabase
    .from("world_scores")
    .select("id,user_id,mode,score,lines,level,time_ms,created_at")
    .eq("mode", mode)
    .order(orderCol, { ascending: asc })
    .limit(limit * 3); // overfetch then dedupe by user
  if (error || !scores) return [];

  // Keep top entry per user
  const bestByUser = new Map<string, typeof scores[number]>();
  for (const s of scores) {
    const cur = bestByUser.get(s.user_id);
    if (!cur) { bestByUser.set(s.user_id, s); continue; }
    if (asc ? s.time_ms < cur.time_ms : s.score > cur.score) bestByUser.set(s.user_id, s);
  }
  const top = Array.from(bestByUser.values())
    .sort((a, b) => asc ? a.time_ms - b.time_ms : b.score - a.score)
    .slice(0, limit);

  const ids = Array.from(new Set(top.map(s => s.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", ids);
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]));

  return top.map(s => ({
    ...s,
    mode: s.mode as WorldMode,
    display_name: nameById.get(s.user_id) ?? "Player",
  }));
}

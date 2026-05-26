import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  mode: z.enum(["marathon", "sprint", "ultra"]),
  score: z.number().int().min(0).max(10_000_000),
  lines: z.number().int().min(0).max(10_000),
  level: z.number().int().min(1).max(30),
  timeMs: z.number().int().min(500).max(24 * 60 * 60 * 1000),
});

export const submitWorldScoreFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("world_scores").insert({
      user_id: userId,
      mode: data.mode,
      score: data.score,
      lines: data.lines,
      level: data.level,
      time_ms: data.timeMs,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

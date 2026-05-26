import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    // Sanity: max ~1000 points per line cleared (very generous upper bound).
    if (data.lines > 0 && data.score > data.lines * 1000 + 100_000) {
      throw new Error("Implausible score for line count");
    }
    if (data.mode === "sprint" && data.lines < 40 && data.score > 0) {
      throw new Error("Sprint requires 40 lines");
    }
    const { error } = await supabaseAdmin.from("world_scores").insert({
      user_id: context.userId,
      mode: data.mode,
      score: data.score,
      lines: data.lines,
      level: data.level,
      time_ms: data.timeMs,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

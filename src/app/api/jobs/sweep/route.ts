import { loadServerConfig } from "@/lib/config/env";
import { bearerToken, json, secretsMatch } from "@/lib/server/http";
import { createServiceClient } from "@/lib/server/supabase";
import { runSweepForAllDue } from "@/lib/server/sweep-runner";

/**
 * The scheduler tick. Called every 15 minutes by Supabase Cron (pg_cron +
 * pg_net) or Vercel Cron with `Authorization: Bearer <JOBS_SECRET>`.
 * Safe to call more often or twice at once: claims are atomic.
 */
async function handle(request: Request): Promise<Response> {
  const config = loadServerConfig();
  if (!config.jobsSecret) return json({ error: "JOBS_SECRET is not configured" }, 503);
  if (!secretsMatch(bearerToken(request), config.jobsSecret)) return json({ error: "Unauthorized" }, 401);

  try {
    const report = await runSweepForAllDue(createServiceClient(), config);
    return json({ ok: true, ...report });
  } catch (error) {
    console.error("[sweep]", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "sweep failed" }, 500);
  }
}

export const GET = handle;
export const POST = handle;

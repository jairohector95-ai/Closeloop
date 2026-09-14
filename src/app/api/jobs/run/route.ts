import { loadServerConfig } from "@/lib/config/env";
import { requireSession } from "@/lib/server/auth";
import { loadAccount } from "@/lib/server/account";
import { errorResponse, json } from "@/lib/server/http";
import { createServiceClient } from "@/lib/server/supabase";
import { runSweepForBusiness } from "@/lib/server/sweep-runner";

const MIN_SECONDS_BETWEEN_MANUAL_RUNS = 30;

/** "Check now" from the dashboard: runs the scheduler for the caller's own business only. */
export async function POST() {
  try {
    const { client, user } = await requireSession();
    const account = await loadAccount(client, user);
    if (!account) return json({ error: "Complete onboarding first" }, 409);

    const service = createServiceClient();
    const recent = await service
      .from("sweep_runs")
      .select("ran_at")
      .eq("business_id", account.business.id)
      .eq("trigger", "manual")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent.data && Date.now() - new Date(String(recent.data.ran_at)).getTime() < MIN_SECONDS_BETWEEN_MANUAL_RUNS * 1000) {
      return json({ error: "Please wait a moment before checking again" }, 429);
    }

    const report = await runSweepForBusiness(service, account.business.id, "manual", loadServerConfig());
    return json({ ok: true, ...report, ranAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}

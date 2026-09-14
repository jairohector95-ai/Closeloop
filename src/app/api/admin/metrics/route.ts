import { isAdminEmail, requireSession } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { createServiceClient } from "@/lib/server/supabase";
import { planById } from "@/lib/constants";
import type { AdminMetrics } from "@/lib/metrics";

/** Owner-only platform metrics. Gated by ADMIN_EMAILS. */
export async function GET() {
  try {
    const { user } = await requireSession();
    if (!isAdminEmail(user.email)) return json({ error: "Admins only" }, 403);

    const service = createServiceClient();
    const [subs, quotes, followUps, lastSweep, businesses] = await Promise.all([
      service.from("subscriptions").select("plan, status"),
      service.from("quotes").select("status, amount, follow_ups_sent, is_demo"),
      service.from("follow_ups").select("status", { count: "exact", head: true }).eq("status", "sent"),
      service.from("sweep_runs").select("ran_at, sent, failed, errors").is("business_id", null).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("businesses").select("id, name, owner_name, email, type, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (subs.error || quotes.error || followUps.error || businesses.error) throw new Error("admin metrics query failed");

    const rows = subs.data as Array<{ plan: string; status: string }>;
    const paid = rows.filter((s) => s.status === "active" && s.plan !== "trial");
    const trials = rows.filter((s) => s.status === "trialing");
    const q = (quotes.data as Array<{ status: string; amount: number; follow_ups_sent: number; is_demo: boolean }>).filter((x) => !x.is_demo);
    const recovered = q.filter((x) => x.status === "won" && x.follow_ups_sent > 0);
    const metrics: AdminMetrics = {
      totalUsers: rows.length,
      activeQuotes: q.filter((x) => x.status === "follow_up_scheduled" || x.status === "awaiting_reply").length,
      quotesWon: q.filter((x) => x.status === "won").length,
      mrr: paid.reduce((sum, s) => sum + planById(s.plan as "trial" | "starter" | "pro").priceMonthly, 0),
      trialUsers: trials.length,
      paidUsers: paid.length,
      conversionRate: rows.length ? paid.length / rows.length : 0,
      followUpsSent: followUps.count ?? 0,
      jobsRecovered: recovered.length,
      recoveredRevenue: recovered.reduce((sum, x) => sum + Number(x.amount), 0),
    };
    return json({ metrics, lastSweep: lastSweep.data ?? null, businesses: businesses.data });
  } catch (error) {
    return errorResponse(error);
  }
}

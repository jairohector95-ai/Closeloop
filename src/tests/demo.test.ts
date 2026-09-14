import { describe, expect, it } from "vitest";
import { buildDemoWorkspace, buildDemoPlatformAccounts } from "@/lib/demo/seed";
import { computeAdminMetrics } from "@/lib/metrics";
import { account, TODAY } from "./helpers";

describe("demo data", () => {
  it("builds a workspace with quotes in every status and consistent follow-up counts", () => {
    const data = buildDemoWorkspace(account, TODAY);
    const statuses = new Set(data.quotes.map((q) => q.status));
    for (const s of ["follow_up_scheduled", "awaiting_reply", "replied", "won", "lost", "paused"]) {
      expect(statuses.has(s as never)).toBe(true);
    }
    for (const quote of data.quotes) {
      const sent = data.followUps.filter((f) => f.quoteId === quote.id && f.status === "sent").length;
      expect(quote.followUpsSent).toBe(sent);
      expect(quote.isDemo).toBe(true);
    }
    expect(data.quotes.some((q) => q.status === "won" && q.followUpsSent > 0)).toBe(true);
  });

  it("produces admin metrics from demo accounts", () => {
    const demoAccounts = buildDemoPlatformAccounts(TODAY);
    const metrics = computeAdminMetrics(account, demoAccounts, buildDemoWorkspace(account, TODAY));
    expect(metrics.totalUsers).toBe(demoAccounts.length + 1);
    expect(metrics.paidUsers).toBeGreaterThan(0);
    expect(metrics.mrr).toBeGreaterThan(0);
    expect(metrics.conversionRate).toBeGreaterThan(0);
    expect(metrics.conversionRate).toBeLessThanOrEqual(1);
  });
});

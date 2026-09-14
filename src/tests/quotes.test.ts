import { describe, expect, it } from "vitest";
import { addQuote, deleteQuote, normalizeSchedule, updateQuote } from "@/lib/domain/quotes";
import { runAutomation } from "@/lib/domain/automation";
import { markWon, reopenQuote } from "@/lib/domain/status";
import { computeDashboardMetrics } from "@/lib/metrics";
import { ctxOn, empty, followUpsOf, quoteOf, sampleInput, seedQuote, TODAY } from "./helpers";
import { addDays } from "@/lib/utils/date";

describe("quotes", () => {
  it("normalizes schedules: sorts, dedupes, drops invalid values, caps length", () => {
    expect(normalizeSchedule([10, 2, 5, 5, 0, -1, 2.4])).toEqual([2, 5, 10]);
    expect(normalizeSchedule([1, 2, 3, 4, 5, 6, 7])).toHaveLength(5);
  });

  it("reuses a customer with the same email", () => {
    const first = addQuote(empty, sampleInput(), ctxOn(TODAY));
    const second = addQuote(first.data, sampleInput({ quoteNumber: "EST-1002", customerEmail: "SARAH@example.com" }), ctxOn(TODAY));
    expect(second.data.customers).toHaveLength(1);
    expect(second.data.quotes).toHaveLength(2);
  });

  it("rebuilds only unsent follow-ups when the schedule changes", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const afterFirst = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    const updated = updateQuote(afterFirst.data, quoteId, sampleInput({ schedule: [2, 7, 14] }), ctxOn(addDays(TODAY, 3)));
    const followUps = followUpsOf(updated, quoteId);
    expect(followUps.filter((f) => f.status === "sent")).toHaveLength(1);
    expect(followUps.filter((f) => f.status === "scheduled").map((f) => f.scheduledFor)).toEqual(["2026-09-21", "2026-09-28"]);
    expect(quoteOf(updated, quoteId).schedule).toEqual([2, 7, 14]);
  });

  it("deletes a quote along with its follow-ups, events and orphaned customer", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const deleted = deleteQuote(data, quoteId);
    expect(deleted.quotes).toHaveLength(0);
    expect(deleted.followUps).toHaveLength(0);
    expect(deleted.timeline).toHaveLength(0);
    expect(deleted.customers).toHaveLength(0);
  });

  it("can reopen a won quote back to replied", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const won = markWon(data, quoteId, ctxOn(TODAY));
    const reopened = reopenQuote(won, quoteId, ctxOn(TODAY));
    expect(quoteOf(reopened, quoteId).status).toBe("replied");
    expect(quoteOf(reopened, quoteId).wonAt).toBeNull();
  });

  it("computes dashboard metrics including recovered revenue", () => {
    const a = addQuote(empty, sampleInput({ amount: 1000 }), ctxOn(TODAY));
    const b = addQuote(a.data, sampleInput({ quoteNumber: "EST-2", customerEmail: "b@example.com", amount: 500 }), ctxOn(TODAY));
    // Quote B is won right away (no follow-ups): not recovered.
    // Quote A gets one follow-up and is then won: recovered.
    const bWon = markWon(b.data, b.quote.id, ctxOn(addDays(TODAY, 1)));
    const ran = runAutomation(bWon, ctxOn(addDays(TODAY, 2)));
    const data = markWon(ran.data, a.quote.id, ctxOn(addDays(TODAY, 3)));
    const metrics = computeDashboardMetrics(data);
    expect(metrics.jobsWon).toBe(2);
    expect(metrics.recoveredRevenue).toBe(1000);
    expect(metrics.followUpsSent).toBe(1);
    expect(metrics.awaitingResponse).toBe(0);
    expect(metrics.totalQuoteValue).toBe(1500);
  });
});

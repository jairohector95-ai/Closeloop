import { describe, expect, it } from "vitest";
import { runAutomation, countDue } from "@/lib/domain/automation";
import { markLost, markReplied, markWon, pauseQuote, resumeQuote } from "@/lib/domain/status";
import { ctxOn, followUpsOf, quoteOf, runDaily, seedQuote, TODAY } from "./helpers";
import { addDays } from "@/lib/utils/date";

describe("automation engine", () => {
  it("schedules follow-ups at the configured offsets when a quote is added", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const followUps = followUpsOf(data, quoteId);
    expect(followUps.map((f) => f.scheduledFor)).toEqual(["2026-09-16", "2026-09-19", "2026-09-24"]);
    expect(followUps.every((f) => f.status === "scheduled")).toBe(true);
    expect(quoteOf(data, quoteId).status).toBe("follow_up_scheduled");
    expect(data.timeline.filter((e) => e.quoteId === quoteId)).toHaveLength(4);
  });

  it("fires a scheduled follow-up when it is due", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const result = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].followUp.sequenceNumber).toBe(1);
    expect(result.fired[0].message.to).toBe("sarah@example.com");
    expect(result.fired[0].message.subject.length).toBeGreaterThan(0);
    const quote = quoteOf(result.data, quoteId);
    expect(quote.followUpsSent).toBe(1);
    expect(quote.status).toBe("follow_up_scheduled");
    expect(followUpsOf(result.data, quoteId)[0].status).toBe("sent");
    expect(followUpsOf(result.data, quoteId)[0].body).toContain("Sarah");
    expect(result.data.timeline.some((e) => e.type === "follow_up_sent" && e.quoteId === quoteId)).toBe(true);
  });

  it("does not fire a follow-up early", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const day0 = runAutomation(data, ctxOn(TODAY));
    const day1 = runAutomation(day0.data, ctxOn(addDays(TODAY, 1)));
    expect(day0.fired).toHaveLength(0);
    expect(day1.fired).toHaveLength(0);
    expect(quoteOf(day1.data, quoteId).followUpsSent).toBe(0);
    expect(countDue(day1.data, ctxOn(addDays(TODAY, 1)))).toBe(0);
  });

  it("fires an overdue follow-up on the next run instead of skipping it", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const result = runAutomation(data, ctxOn(addDays(TODAY, 4)));
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].followUp.sequenceNumber).toBe(1);
    expect(quoteOf(result.data, quoteId).followUpsSent).toBe(1);
  });

  it("never creates a duplicate follow-up when the engine runs twice on the same day", () => {
    const { data } = seedQuote(TODAY);
    const day2 = addDays(TODAY, 2);
    const first = runAutomation(data, ctxOn(day2));
    const second = runAutomation(first.data, ctxOn(day2));
    const third = runAutomation(second.data, ctxOn(day2));
    expect(first.fired).toHaveLength(1);
    expect(second.fired).toHaveLength(0);
    expect(third.fired).toHaveLength(0);
    expect(third.data.followUps.filter((f) => f.status === "sent")).toHaveLength(1);
  });

  it("sends at most one follow-up per quote per day even when several are overdue", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const lateDay = addDays(TODAY, 30);
    const run1 = runAutomation(data, ctxOn(lateDay));
    const run1Again = runAutomation(run1.data, ctxOn(lateDay));
    expect(run1.fired).toHaveLength(1);
    expect(run1Again.fired).toHaveLength(0);
    expect(quoteOf(run1Again.data, quoteId).followUpsSent).toBe(1);
    const run2 = runAutomation(run1Again.data, ctxOn(addDays(lateDay, 1)));
    expect(run2.fired).toHaveLength(1);
    expect(run2.fired[0].followUp.sequenceNumber).toBe(2);
  });

  it("stops automation when the customer replies", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const replied = markReplied(data, quoteId, ctxOn(addDays(TODAY, 1)));
    expect(quoteOf(replied, quoteId).status).toBe("replied");
    expect(followUpsOf(replied, quoteId).every((f) => f.status === "cancelled")).toBe(true);
    const { firedTotal, data: after } = runDaily(replied, TODAY, addDays(TODAY, 15));
    expect(firedTotal).toBe(0);
    expect(quoteOf(after, quoteId).followUpsSent).toBe(0);
  });

  it("stops automation when the quote is won", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const afterFirst = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    const won = markWon(afterFirst.data, quoteId, ctxOn(addDays(TODAY, 3)));
    expect(quoteOf(won, quoteId).status).toBe("won");
    expect(quoteOf(won, quoteId).repliedAt).not.toBeNull();
    const { firedTotal, data: after } = runDaily(won, addDays(TODAY, 3), addDays(TODAY, 15));
    expect(firedTotal).toBe(0);
    expect(quoteOf(after, quoteId).followUpsSent).toBe(1);
  });

  it("stops automation when the quote is lost", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const lost = markLost(data, quoteId, ctxOn(TODAY));
    expect(quoteOf(lost, quoteId).status).toBe("lost");
    const { firedTotal } = runDaily(lost, TODAY, addDays(TODAY, 15));
    expect(firedTotal).toBe(0);
  });

  it("stops automation while the quote is paused", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const paused = pauseQuote(data, quoteId, ctxOn(addDays(TODAY, 1)));
    expect(quoteOf(paused, quoteId).status).toBe("paused");
    // Pending follow-ups are kept, not cancelled, so they can resume.
    expect(followUpsOf(paused, quoteId).every((f) => f.status === "scheduled")).toBe(true);
    const { firedTotal } = runDaily(paused, addDays(TODAY, 1), addDays(TODAY, 15));
    expect(firedTotal).toBe(0);
  });

  it("resumes correctly and shifts overdue follow-ups forward while keeping the spacing", () => {
    const { data, quoteId } = seedQuote(TODAY);
    // First follow-up fires on day 2, then the customer asks us to hold off.
    const afterFirst = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    const paused = pauseQuote(afterFirst.data, quoteId, ctxOn(addDays(TODAY, 3)));
    // Resume on day 9: follow-up #2 (day 5) is 4 days overdue.
    const resumeDay = addDays(TODAY, 9);
    const resumed = resumeQuote(paused, quoteId, ctxOn(resumeDay));
    expect(quoteOf(resumed, quoteId).status).toBe("follow_up_scheduled");
    const pending = followUpsOf(resumed, quoteId).filter((f) => f.status === "scheduled");
    expect(pending.map((f) => f.scheduledFor)).toEqual([resumeDay, addDays(resumeDay, 5)]);
    // It fires on the resume day and not before that (paused days produced nothing).
    const run = runAutomation(resumed, ctxOn(resumeDay));
    expect(run.fired).toHaveLength(1);
    expect(run.fired[0].followUp.sequenceNumber).toBe(2);
  });

  it("resuming a quote whose follow-ups are all in the future changes nothing about the dates", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const paused = pauseQuote(data, quoteId, ctxOn(TODAY));
    const resumed = resumeQuote(paused, quoteId, ctxOn(addDays(TODAY, 1)));
    expect(followUpsOf(resumed, quoteId).map((f) => f.scheduledFor)).toEqual(["2026-09-16", "2026-09-19", "2026-09-24"]);
  });

  it("terminates after the final follow-up and never sends more", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const { data: after, firedTotal } = runDaily(data, TODAY, addDays(TODAY, 60));
    expect(firedTotal).toBe(3);
    const quote = quoteOf(after, quoteId);
    expect(quote.followUpsSent).toBe(3);
    expect(quote.status).toBe("awaiting_reply");
    expect(followUpsOf(after, quoteId).map((f) => f.status)).toEqual(["sent", "sent", "sent"]);
    expect(followUpsOf(after, quoteId).map((f) => f.sentAt?.slice(0, 10))).toEqual(["2026-09-16", "2026-09-19", "2026-09-24"]);
    expect(countDue(after, ctxOn(addDays(TODAY, 61)))).toBe(0);
  });

  it("only touches quotes belonging to the business in context", () => {
    const { data } = seedQuote(TODAY);
    const otherBusinessCtx = { ...ctxOn(addDays(TODAY, 2)), business: { ...ctxOn(TODAY).business, id: "biz_other" } };
    expect(runAutomation(data, otherBusinessCtx).fired).toHaveLength(0);
  });
});

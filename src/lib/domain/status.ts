import type { Quote, QuoteStatus, WorkspaceData } from "../types";
import { addDays, diffDays } from "../utils/date";
import type { DomainContext } from "./context";
import { deriveActiveStatus, makeEvent, pendingFollowUps } from "./quotes";

export const ACTIVE_STATUSES: QuoteStatus[] = ["follow_up_scheduled", "awaiting_reply"];
export const STOPPED_STATUSES: QuoteStatus[] = ["replied", "won", "lost", "paused"];

export function isActive(status: QuoteStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Automation only ever runs for quotes whose status is active. */
export function automationAllowed(quote: Quote): boolean {
  return isActive(quote.status);
}

function cancelPending(data: WorkspaceData, quoteId: string): WorkspaceData {
  return {
    ...data,
    followUps: data.followUps.map((f) =>
      f.quoteId === quoteId && f.status === "scheduled" ? { ...f, status: "cancelled" as const } : f,
    ),
  };
}

function patchQuote(data: WorkspaceData, quoteId: string, patch: Partial<Quote>, ctx: DomainContext): WorkspaceData {
  return {
    ...data,
    quotes: data.quotes.map((q) => (q.id === quoteId ? { ...q, ...patch, updatedAt: ctx.now } : q)),
  };
}

export function markReplied(
  data: WorkspaceData,
  quoteId: string,
  ctx: DomainContext,
  options: { description?: string; title?: string } = {},
): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status === "replied") return data;
  let next = cancelPending(data, quoteId);
  next = patchQuote(next, quoteId, { status: "replied", repliedAt: quote.repliedAt ?? ctx.now, pausedAt: null }, ctx);
  return {
    ...next,
    timeline: [
      ...next.timeline,
      makeEvent(quoteId, "replied", options.title ?? "Customer replied", ctx.now, {
        description: options.description ?? "Follow-ups stopped.",
      }),
    ],
  };
}

export function markWon(data: WorkspaceData, quoteId: string, ctx: DomainContext): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status === "won") return data;
  let next = cancelPending(data, quoteId);
  next = patchQuote(
    next,
    quoteId,
    { status: "won", wonAt: ctx.now, repliedAt: quote.repliedAt ?? ctx.now, lostAt: null, pausedAt: null },
    ctx,
  );
  return {
    ...next,
    timeline: [...next.timeline, makeEvent(quoteId, "won", "Job won", ctx.now, { description: "Nice work. Follow-ups stopped." })],
  };
}

export function markLost(data: WorkspaceData, quoteId: string, ctx: DomainContext): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status === "lost") return data;
  let next = cancelPending(data, quoteId);
  next = patchQuote(next, quoteId, { status: "lost", lostAt: ctx.now, wonAt: null, pausedAt: null }, ctx);
  return {
    ...next,
    timeline: [...next.timeline, makeEvent(quoteId, "lost", "Marked as lost", ctx.now, { description: "Follow-ups stopped." })],
  };
}

/** Pauses automation. Pending follow-ups are kept so they can resume later. */
export function pauseQuote(data: WorkspaceData, quoteId: string, ctx: DomainContext): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || !isActive(quote.status)) return data;
  const next = patchQuote(data, quoteId, { status: "paused", pausedAt: ctx.now }, ctx);
  return {
    ...next,
    timeline: [...next.timeline, makeEvent(quoteId, "paused", "Follow-ups paused", ctx.now)],
  };
}

/**
 * Resumes a paused quote. Any pending follow-ups that fell into the past while
 * paused are shifted forward together so the original spacing is preserved and
 * the customer is not hit with a burst of emails.
 */
export function resumeQuote(data: WorkspaceData, quoteId: string, ctx: DomainContext): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "paused") return data;

  const pending = pendingFollowUps(data, quoteId);
  const earliest = pending[0];
  const shift = earliest ? Math.max(0, diffDays(earliest.scheduledFor, ctx.today)) : 0;

  let next: WorkspaceData = {
    ...data,
    followUps:
      shift > 0
        ? data.followUps.map((f) =>
            f.quoteId === quoteId && f.status === "scheduled"
              ? { ...f, scheduledFor: addDays(f.scheduledFor, shift) }
              : f,
          )
        : data.followUps,
  };

  next = patchQuote(next, quoteId, { status: deriveActiveStatus(next, quoteId), pausedAt: null }, ctx);

  const description =
    pending.length === 0
      ? "No follow-ups left in the sequence."
      : shift > 0
        ? `Remaining follow-ups moved forward ${shift} day${shift === 1 ? "" : "s"}.`
        : null;

  return {
    ...next,
    timeline: [...next.timeline, makeEvent(quoteId, "resumed", "Follow-ups resumed", ctx.now, { description })],
  };
}

/** Moves a won/lost quote back to "replied" so it can be re-decided. */
export function reopenQuote(data: WorkspaceData, quoteId: string, ctx: DomainContext): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote || (quote.status !== "won" && quote.status !== "lost")) return data;
  const next = patchQuote(data, quoteId, { status: "replied", wonAt: null, lostAt: null, repliedAt: quote.repliedAt ?? ctx.now }, ctx);
  return {
    ...next,
    timeline: [...next.timeline, makeEvent(quoteId, "reopened", "Moved back to Replied", ctx.now)],
  };
}

import type { Customer, EmailMessage, FollowUp, Quote, WorkspaceData } from "../types";
import type { EmailContext } from "../email/templates";
import { defaultEmailGenerator, type EmailGenerator } from "../email/generator";
import { CLAIM_TIMEOUT_MINUTES, MAX_SEND_ATTEMPTS, RETRY_BACKOFF_MINUTES } from "../constants";
import type { DomainContext } from "./context";
import { deriveActiveStatus, makeEvent, pendingFollowUps, sentFollowUps } from "./quotes";
import { automationAllowed } from "./status";
import { renderEmailHtml } from "../email/html";
import { replyAddressFor } from "../email/routing";

/**
 * The automation engine.
 *
 * Every function here is pure: it takes the workspace plus a context (who,
 * when) and returns a new workspace. The same functions drive the Phase 1
 * simulator (`runAutomation`) and the production sweep in ../jobs/sweep.ts.
 *
 * Delivery is a small state machine per follow-up:
 *
 *   scheduled ──claim──▶ sending ──delivered──▶ sent
 *                          │
 *                          └──failure──▶ scheduled (retry later) … ▶ failed
 *
 * Rules (see tests/automation.test.ts):
 *  - A follow-up is due when its scheduled date is today or earlier.
 *  - It never fires early.
 *  - At most one follow-up per quote per calendar day.
 *  - Quotes that are replied / won / lost / paused are skipped entirely.
 *  - A follow-up that is already claimed ("sending") is never claimed again
 *    unless the claim is stale (worker died), so two workers cannot both send it.
 *  - The provider always receives the follow-up's idempotency key.
 *  - After the final follow-up is sent, the quote becomes "awaiting reply".
 */

export interface DueFollowUp {
  quote: Quote;
  customer: Customer;
  followUp: FollowUp;
}

export interface DeliveryResult {
  providerMessageId: string | null;
  messageId: string | null;
  threadId: string | null;
  subject: string;
  body: string;
  recipientEmail?: string | null;
}

/** Releases a claimed follow-up without sending (the quote stopped between claim and send). */
export function cancelClaimedFollowUp(data: WorkspaceData, followUpId: string): WorkspaceData {
  return {
    ...data,
    followUps: data.followUps.map((f) => (f.id === followUpId && f.status === "sending" ? { ...f, status: "cancelled" as const, claimedAt: null } : f)),
  };
}

export interface FiredFollowUp {
  quote: Quote;
  customer: Customer;
  followUp: FollowUp;
  message: EmailMessage;
}

export interface AutomationRunResult {
  data: WorkspaceData;
  fired: FiredFollowUp[];
  /** Quotes that were checked but had nothing due. */
  checked: number;
}

export function buildEmailContext(quote: Quote, customer: Customer, ctx: DomainContext, sequenceNumber: number): EmailContext {
  return {
    customerName: customer.name,
    businessName: ctx.business.name,
    ownerName: ctx.business.ownerName,
    serviceDescription: quote.serviceDescription,
    amount: quote.amount,
    quoteNumber: quote.quoteNumber,
    sequenceNumber,
    sequenceLength: quote.schedule.length,
    tone: quote.tone,
    signature: ctx.settings.signature,
  };
}

/** Builds the outbound message for a follow-up, threading it onto earlier emails for the same quote. */
export function buildOutboundMessage(data: WorkspaceData, quote: Quote, customer: Customer, followUp: FollowUp, ctx: DomainContext, generator: EmailGenerator): EmailMessage {
  const email = generator.generate(buildEmailContext(quote, customer, ctx, followUp.sequenceNumber));
  const earlier = sentFollowUps(data, quote.id).filter((f) => f.messageId);
  const references = earlier.map((f) => f.messageId as string);
  return {
    to: customer.email,
    toName: customer.name,
    fromName: `${ctx.business.name} ${ctx.email.brandSuffix}`.trim(),
    fromAddress: ctx.email.fromAddress,
    replyTo: replyAddressFor(quote.replyToken, ctx.email.replyDomain),
    subject: email.subject,
    body: email.body,
    html: renderEmailHtml(email.body),
    idempotencyKey: followUp.idempotencyKey,
    inReplyTo: references.length ? references[references.length - 1] : null,
    references,
    threadId: quote.emailThreadId,
    tags: { quoteId: quote.id, followUpId: followUp.id, businessId: quote.businessId },
  };
}

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

export function isDue(followUp: FollowUp, ctx: DomainContext): boolean {
  if (followUp.status === "scheduled") {
    if (followUp.scheduledFor > ctx.today) return false;
    if (followUp.nextAttemptAt && followUp.nextAttemptAt > ctx.now) return false;
    return true;
  }
  if (followUp.status === "sending") {
    // Stale claim: the worker that claimed it never reported back.
    return followUp.claimedAt !== null && minutesBetween(followUp.claimedAt, ctx.now) >= CLAIM_TIMEOUT_MINUTES;
  }
  return false;
}

/** Everything that should go out right now, at most one follow-up per quote. */
export function selectDueFollowUps(data: WorkspaceData, ctx: DomainContext): DueFollowUp[] {
  const due: DueFollowUp[] = [];
  for (const quote of data.quotes) {
    if (quote.businessId !== ctx.business.id) continue;
    if (!automationAllowed(quote)) continue;
    if (quote.lastFollowUpSentOn === ctx.today) continue;
    const followUp = pendingFollowUps(data, quote.id).find((f) => isDue(f, ctx));
    if (!followUp) continue;
    const customer = data.customers.find((c) => c.id === quote.customerId);
    if (!customer) continue;
    due.push({ quote, customer, followUp });
  }
  return due;
}

/** Number of follow-ups that would fire if the engine ran now. */
export function countDue(data: WorkspaceData, ctx: DomainContext): number {
  return selectDueFollowUps(data, ctx).length;
}

/**
 * Marks a follow-up as "sending". Returns null if it cannot be claimed (already
 * sent, cancelled, or freshly claimed by someone else), which is the in-memory
 * equivalent of a conditional UPDATE in the database.
 */
export function claimFollowUp(data: WorkspaceData, followUpId: string, ctx: DomainContext): WorkspaceData | null {
  const followUp = data.followUps.find((f) => f.id === followUpId);
  if (!followUp || !isDue(followUp, ctx)) return null;
  const quote = data.quotes.find((q) => q.id === followUp.quoteId);
  if (!quote || !automationAllowed(quote) || quote.lastFollowUpSentOn === ctx.today) return null;
  return {
    ...data,
    followUps: data.followUps.map((f) =>
      f.id === followUpId ? { ...f, status: "sending" as const, claimedAt: ctx.now, attempts: f.attempts + 1, nextAttemptAt: null } : f,
    ),
  };
}

/** Records a successful send: snapshot of the email, provider ids, quote counters, timeline. */
export function recordDelivery(data: WorkspaceData, followUpId: string, result: DeliveryResult, ctx: DomainContext): WorkspaceData {
  const followUp = data.followUps.find((f) => f.id === followUpId);
  if (!followUp || followUp.status === "sent") return data;
  const quote = data.quotes.find((q) => q.id === followUp.quoteId);
  if (!quote) return data;
  const customer = data.customers.find((c) => c.id === quote.customerId);

  const sent: FollowUp = {
    ...followUp,
    status: "sent",
    sentAt: ctx.now,
    claimedAt: null,
    nextAttemptAt: null,
    lastError: null,
    subject: result.subject,
    body: result.body,
    recipientEmail: result.recipientEmail ?? customer?.email ?? null,
    providerMessageId: result.providerMessageId,
    messageId: result.messageId,
  };

  const next: WorkspaceData = {
    ...data,
    followUps: data.followUps.map((f) => (f.id === followUpId ? sent : f)),
  };

  const updatedQuote: Quote = {
    ...quote,
    followUpsSent: quote.followUpsSent + 1,
    lastFollowUpSentOn: ctx.today,
    emailThreadId: quote.emailThreadId ?? result.threadId,
    updatedAt: ctx.now,
  };
  next.quotes = next.quotes.map((q) => (q.id === quote.id ? updatedQuote : q));

  // A quote that was stopped while the send was in flight keeps its stopped status.
  if (automationAllowed(updatedQuote)) {
    const status = deriveActiveStatus(next, quote.id);
    next.quotes = next.quotes.map((q) => (q.id === quote.id ? { ...q, status } : q));
  }

  next.timeline = [
    ...next.timeline,
    makeEvent(quote.id, "follow_up_sent", `Follow-up #${followUp.sequenceNumber} sent`, ctx.now, {
      description: result.subject,
      followUpId: followUp.id,
    }),
  ];
  return next;
}

/** Records a failed send attempt. Retries with backoff until MAX_SEND_ATTEMPTS, then marks the follow-up failed. */
export function recordFailure(data: WorkspaceData, followUpId: string, error: string, ctx: DomainContext): WorkspaceData {
  const followUp = data.followUps.find((f) => f.id === followUpId);
  if (!followUp || followUp.status !== "sending") return data;
  const exhausted = followUp.attempts >= MAX_SEND_ATTEMPTS;
  const backoff = RETRY_BACKOFF_MINUTES[Math.min(followUp.attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)];
  const nextAttemptAt = new Date(new Date(ctx.now).getTime() + backoff * 60_000).toISOString();

  const updated: FollowUp = exhausted
    ? { ...followUp, status: "failed", claimedAt: null, nextAttemptAt: null, lastError: error }
    : { ...followUp, status: "scheduled", claimedAt: null, nextAttemptAt, lastError: error };

  const next: WorkspaceData = { ...data, followUps: data.followUps.map((f) => (f.id === followUpId ? updated : f)) };
  if (exhausted) {
    next.timeline = [
      ...next.timeline,
      makeEvent(followUp.quoteId, "follow_up_failed", `Follow-up #${followUp.sequenceNumber} could not be sent`, ctx.now, {
        description: `Gave up after ${followUp.attempts} attempts. ${error}`,
        followUpId: followUp.id,
      }),
    ];
    // Nothing else can go out for this quote until the owner intervenes; surface it as awaiting reply.
    const quote = next.quotes.find((q) => q.id === followUp.quoteId);
    if (quote && automationAllowed(quote)) {
      const status = deriveActiveStatus(next, quote.id);
      next.quotes = next.quotes.map((q) => (q.id === quote.id ? { ...q, status, updatedAt: ctx.now } : q));
    }
  }
  return next;
}

/** Puts a failed follow-up back in the queue (owner clicked "retry"). */
export function retryFollowUp(data: WorkspaceData, followUpId: string, ctx: DomainContext): WorkspaceData {
  const followUp = data.followUps.find((f) => f.id === followUpId);
  if (!followUp || followUp.status !== "failed") return data;
  const next: WorkspaceData = {
    ...data,
    followUps: data.followUps.map((f) =>
      f.id === followUpId ? { ...f, status: "scheduled" as const, attempts: 0, nextAttemptAt: null, lastError: null, scheduledFor: ctx.today } : f,
    ),
  };
  const quote = next.quotes.find((q) => q.id === followUp.quoteId);
  if (quote && automationAllowed(quote)) {
    next.quotes = next.quotes.map((q) => (q.id === quote.id ? { ...q, status: deriveActiveStatus(next, quote.id), updatedAt: ctx.now } : q));
  }
  return next;
}

/**
 * Phase 1 simulator: claims and "delivers" every due follow-up synchronously.
 * Production uses the same claim/deliver functions across an async provider
 * (see ../jobs/sweep.ts).
 */
export function runAutomation(
  data: WorkspaceData,
  ctx: DomainContext,
  generator: EmailGenerator = defaultEmailGenerator,
): AutomationRunResult {
  let next = data;
  const fired: FiredFollowUp[] = [];
  const checked = data.quotes.filter((q) => q.businessId === ctx.business.id && automationAllowed(q)).length;

  for (const due of selectDueFollowUps(data, ctx)) {
    const claimed = claimFollowUp(next, due.followUp.id, ctx);
    if (!claimed) continue;
    next = claimed;

    const message = buildOutboundMessage(next, due.quote, due.customer, due.followUp, ctx, generator);
    const messageId = `<${due.followUp.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "")}@closeloop.local>`;
    next = recordDelivery(
      next,
      due.followUp.id,
      {
        providerMessageId: `sim_${due.followUp.id}`,
        messageId,
        threadId: due.quote.emailThreadId ?? `thread_${due.quote.id}`,
        subject: message.subject,
        body: message.body,
      },
      ctx,
    );

    const finalQuote = next.quotes.find((q) => q.id === due.quote.id) ?? due.quote;
    const finalFollowUp = next.followUps.find((f) => f.id === due.followUp.id) ?? due.followUp;
    fired.push({ quote: finalQuote, customer: due.customer, followUp: finalFollowUp, message });
  }

  return { data: next, fired, checked };
}

import type { Customer, FollowUp, Quote, QuoteInput, TimelineEvent, TimelineEventType, WorkspaceData } from "../types";
import { addDays } from "../utils/date";
import { createId } from "../utils/id";
import { MAX_FOLLOW_UPS } from "../constants";
import type { DomainContext } from "./context";

/** Normalizes a follow-up schedule: positive integers, unique, ascending, capped. */
export function normalizeSchedule(schedule: number[]): number[] {
  const cleaned = schedule
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(cleaned)).sort((a, b) => a - b).slice(0, MAX_FOLLOW_UPS);
}

export function makeEvent(
  quoteId: string,
  type: TimelineEventType,
  title: string,
  occurredAt: string,
  extra: Partial<Pick<TimelineEvent, "description" | "followUpId">> = {},
): TimelineEvent {
  return {
    id: createId("evt"),
    quoteId,
    type,
    title,
    description: extra.description ?? null,
    occurredAt,
    followUpId: extra.followUpId ?? null,
  };
}

function findOrCreateCustomer(data: WorkspaceData, input: QuoteInput, ctx: DomainContext): { customers: Customer[]; customer: Customer } {
  const email = input.customerEmail.trim().toLowerCase();
  const existing = data.customers.find((c) => c.businessId === ctx.business.id && c.email.toLowerCase() === email);
  if (existing) {
    const updated: Customer = {
      ...existing,
      name: input.customerName.trim(),
      phone: input.customerPhone.trim() || null,
    };
    return { customers: data.customers.map((c) => (c.id === existing.id ? updated : c)), customer: updated };
  }
  const customer: Customer = {
    id: createId("cust"),
    businessId: ctx.business.id,
    name: input.customerName.trim(),
    email,
    phone: input.customerPhone.trim() || null,
    createdAt: ctx.now,
  };
  return { customers: [...data.customers, customer], customer };
}

/** Builds scheduled follow-ups for the offsets whose sequence number is greater than `alreadySent`. */
export function buildFollowUps(quote: Pick<Quote, "id" | "sentAt" | "schedule">, alreadySent = 0): FollowUp[] {
  return quote.schedule
    .map((offset, index) => ({ offset, sequenceNumber: index + 1 }))
    .filter(({ sequenceNumber }) => sequenceNumber > alreadySent)
    .map(({ offset, sequenceNumber }) => ({
      id: createId("fu"),
      quoteId: quote.id,
      sequenceNumber,
      scheduledFor: addDays(quote.sentAt, offset),
      status: "scheduled" as const,
      sentAt: null,
      subject: null,
      body: null,
    }));
}

export function pendingFollowUps(data: WorkspaceData, quoteId: string): FollowUp[] {
  return data.followUps
    .filter((f) => f.quoteId === quoteId && f.status === "scheduled")
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export function nextFollowUp(data: WorkspaceData, quoteId: string): FollowUp | null {
  return pendingFollowUps(data, quoteId)[0] ?? null;
}

/** Active status derived from whether anything is still scheduled. */
export function deriveActiveStatus(data: WorkspaceData, quoteId: string): "follow_up_scheduled" | "awaiting_reply" {
  return pendingFollowUps(data, quoteId).length > 0 ? "follow_up_scheduled" : "awaiting_reply";
}

export interface AddQuoteResult {
  data: WorkspaceData;
  quote: Quote;
}

export function addQuote(data: WorkspaceData, input: QuoteInput, ctx: DomainContext, options: { isDemo?: boolean } = {}): AddQuoteResult {
  const { customers, customer } = findOrCreateCustomer(data, input, ctx);
  const schedule = normalizeSchedule(input.schedule);
  const quoteId = createId("quote");

  const followUps = buildFollowUps({ id: quoteId, sentAt: input.sentAt, schedule });

  const quote: Quote = {
    id: quoteId,
    businessId: ctx.business.id,
    customerId: customer.id,
    quoteNumber: input.quoteNumber.trim(),
    serviceDescription: input.serviceDescription.trim(),
    amount: input.amount,
    sentAt: input.sentAt,
    notes: input.notes.trim(),
    status: followUps.length > 0 ? "follow_up_scheduled" : "awaiting_reply",
    schedule,
    tone: input.tone,
    followUpsSent: 0,
    lastFollowUpSentOn: null,
    repliedAt: null,
    wonAt: null,
    lostAt: null,
    pausedAt: null,
    isDemo: options.isDemo ?? false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };

  const events: TimelineEvent[] = [
    makeEvent(quoteId, "quote_added", "Quote added", ctx.now, {
      description: `${quote.quoteNumber} sent to ${customer.name}`,
    }),
    ...followUps.map((f) =>
      makeEvent(quoteId, "follow_up_scheduled", `Follow-up #${f.sequenceNumber} scheduled`, ctx.now, {
        followUpId: f.id,
      }),
    ),
  ];

  return {
    data: {
      customers,
      quotes: [...data.quotes, quote],
      followUps: [...data.followUps, ...followUps],
      timeline: [...data.timeline, ...events],
    },
    quote,
  };
}

/**
 * Updates an existing quote. Follow-ups that have not been sent yet are
 * rebuilt from the (possibly changed) schedule and sent date. Sent follow-ups
 * are never touched, and the sequence resumes after them.
 */
export function updateQuote(data: WorkspaceData, quoteId: string, input: QuoteInput, ctx: DomainContext): WorkspaceData {
  const existing = data.quotes.find((q) => q.id === quoteId);
  if (!existing) return data;

  const { customers, customer } = findOrCreateCustomer(data, input, ctx);
  const schedule = normalizeSchedule(input.schedule);
  const scheduleChanged =
    existing.sentAt !== input.sentAt || schedule.join(",") !== existing.schedule.join(",");

  const quote: Quote = {
    ...existing,
    customerId: customer.id,
    quoteNumber: input.quoteNumber.trim(),
    serviceDescription: input.serviceDescription.trim(),
    amount: input.amount,
    sentAt: input.sentAt,
    notes: input.notes.trim(),
    schedule,
    tone: input.tone,
    updatedAt: ctx.now,
  };

  let followUps = data.followUps;
  const events: TimelineEvent[] = [makeEvent(quoteId, "quote_updated", "Quote updated", ctx.now)];

  if (scheduleChanged) {
    const kept = followUps.filter((f) => f.quoteId !== quoteId || f.status !== "scheduled");
    const rebuilt = buildFollowUps(quote, quote.followUpsSent);
    followUps = [...kept, ...rebuilt];
    if (rebuilt.length > 0) {
      events.push(
        makeEvent(quoteId, "follow_up_rescheduled", "Follow-up schedule updated", ctx.now, {
          description: rebuilt.map((f) => `#${f.sequenceNumber} on ${f.scheduledFor}`).join(", "),
        }),
      );
    }
  }

  const next: WorkspaceData = {
    customers,
    quotes: data.quotes.map((q) => (q.id === quoteId ? quote : q)),
    followUps,
    timeline: [...data.timeline, ...events],
  };

  // Keep active status consistent with the rebuilt follow-ups.
  if (quote.status === "follow_up_scheduled" || quote.status === "awaiting_reply") {
    const status = deriveActiveStatus(next, quoteId);
    next.quotes = next.quotes.map((q) => (q.id === quoteId ? { ...q, status } : q));
  }

  return pruneOrphanCustomers(next, existing.customerId);
}

export function deleteQuote(data: WorkspaceData, quoteId: string): WorkspaceData {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote) return data;
  const next: WorkspaceData = {
    customers: data.customers,
    quotes: data.quotes.filter((q) => q.id !== quoteId),
    followUps: data.followUps.filter((f) => f.quoteId !== quoteId),
    timeline: data.timeline.filter((e) => e.quoteId !== quoteId),
  };
  return pruneOrphanCustomers(next, quote.customerId);
}

function pruneOrphanCustomers(data: WorkspaceData, customerId: string): WorkspaceData {
  const stillUsed = data.quotes.some((q) => q.customerId === customerId);
  if (stillUsed) return data;
  return { ...data, customers: data.customers.filter((c) => c.id !== customerId) };
}

import type { Account, QuoteInput, WorkspaceData } from "@/lib/types";
import { createContext, type DomainContext } from "@/lib/domain/context";
import { addQuote } from "@/lib/domain/quotes";
import { runAutomation } from "@/lib/domain/automation";
import { addDays } from "@/lib/utils/date";

export const TODAY = "2026-09-14";

export const account: Account = {
  user: { id: "user_1", name: "Mike Turner", email: "mike@abcpainting.com", createdAt: "2026-09-01T12:00:00.000Z" },
  business: {
    id: "biz_1",
    ownerUserId: "user_1",
    name: "ABC Painting",
    ownerName: "Mike",
    email: "mike@abcpainting.com",
    type: "painting",
    createdAt: "2026-09-01T12:00:00.000Z",
  },
  settings: { businessId: "biz_1", defaultSchedule: [2, 5, 10], defaultTone: "friendly", signature: "" },
  subscription: {
    id: "sub_1",
    businessId: "biz_1",
    plan: "trial",
    status: "trialing",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
  },
};

export const empty: WorkspaceData = { customers: [], quotes: [], followUps: [], timeline: [] };

export function ctxOn(date: string): DomainContext {
  return createContext(account.business, account.settings, date);
}

export function sampleInput(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    customerName: "Sarah Mitchell",
    customerEmail: "sarah@example.com",
    customerPhone: "",
    quoteNumber: "EST-1001",
    serviceDescription: "Interior painting",
    amount: 2850,
    sentAt: TODAY,
    notes: "",
    schedule: [2, 5, 10],
    tone: "friendly",
    ...overrides,
  };
}

/** Adds a quote sent on `sentAt` and returns the workspace + quote id. */
export function seedQuote(sentAt = TODAY, overrides: Partial<QuoteInput> = {}) {
  const result = addQuote(empty, sampleInput({ sentAt, ...overrides }), ctxOn(sentAt));
  return { data: result.data, quoteId: result.quote.id };
}

/** Runs the engine once per day from `from` through `to` inclusive. */
export function runDaily(data: WorkspaceData, from: string, to: string): { data: WorkspaceData; firedTotal: number } {
  let firedTotal = 0;
  let current = from;
  while (current <= to) {
    const result = runAutomation(data, ctxOn(current));
    data = result.data;
    firedTotal += result.fired.length;
    current = addDays(current, 1);
  }
  return { data, firedTotal };
}

export function quoteOf(data: WorkspaceData, id: string) {
  const quote = data.quotes.find((q) => q.id === id);
  if (!quote) throw new Error("quote missing");
  return quote;
}

export function followUpsOf(data: WorkspaceData, id: string) {
  return data.followUps.filter((f) => f.quoteId === id).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

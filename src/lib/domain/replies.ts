import type { InboundEmail, InboundSource, WorkspaceData } from "../types";
import { createId } from "../utils/id";
import type { DomainContext } from "./context";
import { makeEvent } from "./quotes";
import { markReplied } from "./status";

/**
 * Reply detection.
 *
 * Any inbound channel (Postmark/Resend inbound webhook, Gmail watch, Graph
 * change notification, or the owner logging a reply by hand) normalizes the
 * email into `InboundEmailInput` and calls `recordInboundEmail`. Matching is
 * done here, in one place, in this order:
 *
 *  1. In-Reply-To / References header matches the Message-ID of a follow-up we sent.
 *  2. Thread id matches the quote's provider thread.
 *  3. Sender email matches a customer with exactly one quote that is still
 *     active or paused (most recently sent wins if several).
 *
 * A matched reply stops the sequence immediately via `markReplied`.
 */

export interface InboundEmailInput {
  source: InboundSource;
  fromEmail: string;
  fromName?: string | null;
  subject?: string | null;
  text?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  threadId?: string | null;
  receivedAt?: string;
}

export type MatchReason = "in_reply_to" | "thread" | "sender" | "none";

export interface ReplyMatch {
  quoteId: string | null;
  reason: MatchReason;
}

function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

export function matchInboundEmail(data: WorkspaceData, input: InboundEmailInput, businessId: string): ReplyMatch {
  const candidates = new Set<string>();
  const inReplyTo = normalizeMessageId(input.inReplyTo);
  if (inReplyTo) candidates.add(inReplyTo);
  for (const ref of input.references ?? []) {
    const n = normalizeMessageId(ref);
    if (n) candidates.add(n);
  }
  if (candidates.size > 0) {
    const hit = data.followUps.find((f) => f.messageId && candidates.has(normalizeMessageId(f.messageId) as string));
    if (hit) {
      const quote = data.quotes.find((q) => q.id === hit.quoteId && q.businessId === businessId);
      if (quote) return { quoteId: quote.id, reason: "in_reply_to" };
    }
  }

  if (input.threadId) {
    const quote = data.quotes.find((q) => q.businessId === businessId && q.emailThreadId === input.threadId);
    if (quote) return { quoteId: quote.id, reason: "thread" };
  }

  const email = input.fromEmail.trim().toLowerCase();
  const customerIds = new Set(data.customers.filter((c) => c.businessId === businessId && c.email.toLowerCase() === email).map((c) => c.id));
  if (customerIds.size > 0) {
    const open = data.quotes
      .filter((q) => q.businessId === businessId && customerIds.has(q.customerId) && (q.status === "follow_up_scheduled" || q.status === "awaiting_reply" || q.status === "paused"))
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
    if (open[0]) return { quoteId: open[0].id, reason: "sender" };
  }

  return { quoteId: null, reason: "none" };
}

/**
 * Strips quoted history and signatures from a reply so we can show the
 * customer's own words. Deliberately simple; a full parser (e.g.
 * email-reply-parser, MIT) can replace this in Phase 5.
 */
export function extractReplyText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^on .+ wrote:$/i.test(t)) break;
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(t)) break;
    if (/^from:\s.+$/i.test(t) && kept.length > 0) break;
    if (/^(sent from my|--\s*$)/i.test(t)) break;
    if (t.startsWith(">")) continue;
    kept.push(line);
  }
  const result = kept.join("\n").trim();
  return result.length > 0 ? result.slice(0, 2000) : null;
}

export interface RecordInboundResult {
  data: WorkspaceData;
  inbound: InboundEmail;
  match: ReplyMatch;
  /** True when this email changed a quote to "replied". */
  stoppedSequence: boolean;
}

export function recordInboundEmail(data: WorkspaceData, input: InboundEmailInput, ctx: DomainContext): RecordInboundResult {
  const businessId = ctx.business.id;
  const messageId = normalizeMessageId(input.messageId);

  // Idempotent on Message-ID: webhooks and pollers may deliver the same email twice.
  if (messageId) {
    const existing = data.inbound.find((i) => i.businessId === businessId && i.messageId === messageId);
    if (existing) return { data, inbound: existing, match: { quoteId: existing.quoteId, reason: existing.quoteId ? "in_reply_to" : "none" }, stoppedSequence: false };
  }

  const match = matchInboundEmail(data, input, businessId);
  const inbound: InboundEmail = {
    id: createId("in"),
    businessId,
    quoteId: match.quoteId,
    source: input.source,
    fromEmail: input.fromEmail.trim().toLowerCase(),
    fromName: input.fromName ?? null,
    subject: input.subject ?? null,
    snippet: extractReplyText(input.text),
    messageId,
    inReplyTo: normalizeMessageId(input.inReplyTo),
    references: (input.references ?? []).map((r) => normalizeMessageId(r)).filter((r): r is string => r !== null),
    threadId: input.threadId ?? null,
    receivedAt: input.receivedAt ?? ctx.now,
  };

  let next: WorkspaceData = { ...data, inbound: [...data.inbound, inbound] };
  let stoppedSequence = false;

  if (match.quoteId) {
    const quote = next.quotes.find((q) => q.id === match.quoteId);
    const wasStoppable = quote && (quote.status === "follow_up_scheduled" || quote.status === "awaiting_reply" || quote.status === "paused");
    if (wasStoppable) {
      next = markReplied(next, match.quoteId, ctx, {
        title: "Customer replied",
        description: inbound.snippet ? `“${inbound.snippet.slice(0, 140)}${inbound.snippet.length > 140 ? "…" : ""}” Follow-ups stopped.` : "Reply detected. Follow-ups stopped.",
      });
      stoppedSequence = true;
    } else {
      next = {
        ...next,
        timeline: [
          ...next.timeline,
          makeEvent(match.quoteId, "reply_detected", "New email from customer", ctx.now, {
            description: inbound.snippet ? inbound.snippet.slice(0, 140) : inbound.subject,
          }),
        ],
      };
    }
  }

  return { data: next, inbound, match, stoppedSequence };
}

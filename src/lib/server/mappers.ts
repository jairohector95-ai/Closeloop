import type { Account, Business, Customer, FollowUp, InboundEmail, Quote, Settings, Subscription, TimelineEvent, User, WorkspaceData } from "../types";

/**
 * Postgres rows (snake_case, as returned by load_workspace / selects) → domain
 * objects (camelCase). Writes go the other way through apply_workspace_changes,
 * which reads camelCase JSON directly, so no reverse mapping is needed.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const nstr = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const bool = (v: unknown): boolean => v === true || v === "true";
const date = (v: unknown): string => (v == null ? "" : String(v).slice(0, 10));
const ts = (v: unknown): string => (v == null ? new Date(0).toISOString() : new Date(String(v)).toISOString());
const nts = (v: unknown): string | null => (v == null ? null : new Date(String(v)).toISOString());
const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function rowToCustomer(r: Row): Customer {
  return { id: str(r.id), businessId: str(r.business_id), name: str(r.name), email: str(r.email), phone: nstr(r.phone), createdAt: ts(r.created_at) };
}

export function rowToQuote(r: Row): Quote {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    customerId: str(r.customer_id),
    quoteNumber: str(r.quote_number),
    serviceDescription: str(r.service_description),
    amount: num(r.amount),
    sentAt: date(r.sent_at),
    notes: str(r.notes),
    status: str(r.status) as Quote["status"],
    schedule: ints(r.schedule),
    tone: str(r.tone) as Quote["tone"],
    followUpsSent: num(r.follow_ups_sent),
    lastFollowUpSentOn: r.last_follow_up_sent_on == null ? null : date(r.last_follow_up_sent_on),
    emailThreadId: nstr(r.email_thread_id),
    replyToken: str(r.reply_token),
    repliedAt: nts(r.replied_at),
    wonAt: nts(r.won_at),
    lostAt: nts(r.lost_at),
    pausedAt: nts(r.paused_at),
    isDemo: bool(r.is_demo),
    createdAt: ts(r.created_at),
    updatedAt: ts(r.updated_at),
  };
}

export function rowToFollowUp(r: Row): FollowUp {
  return {
    id: str(r.id),
    quoteId: str(r.quote_id),
    sequenceNumber: num(r.sequence_number),
    scheduledFor: date(r.scheduled_for),
    status: str(r.status) as FollowUp["status"],
    sentAt: nts(r.sent_at),
    subject: nstr(r.subject),
    body: nstr(r.body),
    recipientEmail: nstr(r.recipient_email),
    idempotencyKey: str(r.idempotency_key),
    attempts: num(r.attempts),
    claimedAt: nts(r.claimed_at),
    nextAttemptAt: nts(r.next_attempt_at),
    lastError: nstr(r.last_error),
    providerMessageId: nstr(r.provider_message_id),
    messageId: nstr(r.message_id),
  };
}

export function rowToTimelineEvent(r: Row): TimelineEvent {
  return {
    id: str(r.id),
    quoteId: str(r.quote_id),
    type: str(r.type) as TimelineEvent["type"],
    title: str(r.title),
    description: nstr(r.description),
    occurredAt: ts(r.occurred_at),
    followUpId: nstr(r.follow_up_id),
  };
}

export function rowToInbound(r: Row): InboundEmail {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    quoteId: nstr(r.quote_id),
    source: str(r.source) as InboundEmail["source"],
    fromEmail: str(r.from_email),
    fromName: nstr(r.from_name),
    subject: nstr(r.subject),
    snippet: nstr(r.snippet),
    messageId: nstr(r.message_id),
    inReplyTo: nstr(r.in_reply_to),
    references: strs(r.refs),
    threadId: nstr(r.thread_id),
    receivedAt: ts(r.received_at),
  };
}

export function rowsToWorkspace(payload: Row | null): WorkspaceData {
  const rows = (key: string): Row[] => (Array.isArray(payload?.[key]) ? (payload![key] as Row[]) : []);
  return {
    customers: rows("customers").map(rowToCustomer),
    quotes: rows("quotes").map(rowToQuote),
    followUps: rows("followUps").map(rowToFollowUp),
    timeline: rows("timeline").map(rowToTimelineEvent),
    inbound: rows("inbound").map(rowToInbound),
  };
}

export function rowToBusiness(r: Row): Business {
  return { id: str(r.id), ownerUserId: str(r.owner_user_id), name: str(r.name), ownerName: str(r.owner_name), email: str(r.email), type: str(r.type) as Business["type"], createdAt: ts(r.created_at) };
}

export function rowToSettings(r: Row): Settings {
  return { businessId: str(r.business_id), defaultSchedule: ints(r.default_schedule), defaultTone: str(r.default_tone) as Settings["defaultTone"], signature: str(r.signature) };
}

export function rowToSubscription(r: Row): Subscription {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    plan: str(r.plan) as Subscription["plan"],
    status: str(r.status) as Subscription["status"],
    stripeCustomerId: nstr(r.stripe_customer_id),
    stripeSubscriptionId: nstr(r.stripe_subscription_id),
    trialEndsAt: nts(r.trial_ends_at),
    createdAt: ts(r.created_at),
  };
}

export function buildAccount(user: User, business: Row, settings: Row, subscription: Row): Account {
  return { user, business: rowToBusiness(business), settings: rowToSettings(settings), subscription: rowToSubscription(subscription) };
}

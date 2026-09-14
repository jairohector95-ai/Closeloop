/**
 * CloseLoop data model.
 *
 * These types are shaped so they can map 1:1 onto Postgres/Supabase tables in
 * Phase 2. Every entity has an `id`, foreign keys are plain string ids, and
 * dates are ISO strings (calendar dates as `YYYY-MM-DD`, instants as full ISO).
 */

export type Tone = "friendly" | "professional" | "direct";

export type BusinessType =
  | "painting"
  | "pressure_washing"
  | "landscaping"
  | "cleaning"
  | "pool"
  | "roofing"
  | "handyman"
  | "flooring"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "remodeling"
  | "other";

export type QuoteStatus =
  | "awaiting_reply" // active, all scheduled follow-ups already sent
  | "follow_up_scheduled" // active, at least one follow-up still pending
  | "replied"
  | "won"
  | "lost"
  | "paused";

/**
 * scheduled → sending (claimed by a worker) → sent | failed
 * scheduled → cancelled (quote stopped)
 * A follow-up that fails a transient send goes back to "scheduled" with a
 * `nextAttemptAt`; after MAX_SEND_ATTEMPTS it becomes "failed".
 */
export type FollowUpStatus = "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export type TimelineEventType =
  | "quote_added"
  | "quote_updated"
  | "follow_up_scheduled"
  | "follow_up_sent"
  | "follow_up_rescheduled"
  | "follow_up_failed"
  | "reply_detected"
  | "replied"
  | "won"
  | "lost"
  | "paused"
  | "resumed"
  | "reopened";

export type PlanId = "trial" | "starter" | "pro";

export type MailboxProviderId = "gmail" | "outlook";
export type MailboxConnectionStatus = "connected" | "needs_reauth" | "disconnected";
export type InboundSource = "manual" | "provider_webhook" | "gmail" | "outlook";

export type SubscriptionStatus = "inactive" | "trialing" | "active" | "past_due" | "cancelled";

/** ISO calendar date, e.g. "2026-09-14". */
export type ISODate = string;
/** ISO instant, e.g. "2026-09-14T15:04:05.000Z". */
export type ISODateTime = string;

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: ISODateTime;
}

export interface Business {
  id: string;
  ownerUserId: string;
  name: string;
  ownerName: string;
  email: string;
  type: BusinessType;
  createdAt: ISODateTime;
}

export interface Settings {
  businessId: string;
  /** Day offsets after the quote was sent, e.g. [2, 5, 10]. */
  defaultSchedule: number[];
  defaultTone: Tone;
  /** Optional sign-off line appended to emails, e.g. a phone number. */
  signature: string;
}

export interface Subscription {
  id: string;
  businessId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  /** Stripe ids stay null until Phase 2. */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: ISODateTime;
}

export interface Quote {
  id: string;
  businessId: string;
  customerId: string;
  quoteNumber: string;
  serviceDescription: string;
  amount: number;
  sentAt: ISODate;
  notes: string;
  status: QuoteStatus;
  /** Day offsets for this quote's follow-up sequence. */
  schedule: number[];
  /** Tone used for this quote's emails. Defaults to the business tone. */
  tone: Tone;
  followUpsSent: number;
  /** Calendar date of the most recent follow-up sent. Guards against double sends. */
  lastFollowUpSentOn: ISODate | null;
  /** Provider thread id (Gmail threadId / Graph conversationId) once the first email is out. */
  emailThreadId: string | null;
  repliedAt: ISODateTime | null;
  wonAt: ISODateTime | null;
  lostAt: ISODateTime | null;
  pausedAt: ISODateTime | null;
  isDemo: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FollowUp {
  id: string;
  quoteId: string;
  sequenceNumber: number;
  scheduledFor: ISODate;
  status: FollowUpStatus;
  sentAt: ISODateTime | null;
  /** Snapshot of the email that was actually sent (null until sent). */
  subject: string | null;
  body: string | null;
  /** Stable key handed to the email provider so a retried send can never duplicate. */
  idempotencyKey: string;
  /** Delivery bookkeeping. */
  attempts: number;
  claimedAt: ISODateTime | null;
  nextAttemptAt: ISODateTime | null;
  lastError: string | null;
  /** Ids returned by the provider after a successful send. */
  providerMessageId: string | null;
  /** RFC 5322 Message-ID of the sent email, used to match replies. */
  messageId: string | null;
}

/** An email that came back from a customer (or was logged manually). */
export interface InboundEmail {
  id: string;
  businessId: string;
  /** Null when we could not match it to a quote. */
  quoteId: string | null;
  source: InboundSource;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  /** Reply text with quoted history stripped. */
  snippet: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  threadId: string | null;
  receivedAt: ISODateTime;
}

/** A contractor's connected mailbox. Tokens are never stored in this record; see mailbox_credentials in the DB schema. */
export interface MailboxConnection {
  id: string;
  businessId: string;
  provider: MailboxProviderId;
  emailAddress: string;
  status: MailboxConnectionStatus;
  scopes: string[];
  /** Provider-specific watch/subscription id for reply notifications. */
  watchId: string | null;
  watchExpiresAt: ISODateTime | null;
  connectedAt: ISODateTime;
  lastSyncedAt: ISODateTime | null;
  lastError: string | null;
}

export interface TimelineEvent {
  id: string;
  quoteId: string;
  type: TimelineEventType;
  title: string;
  description: string | null;
  occurredAt: ISODateTime;
  followUpId: string | null;
}

/** All per-business operational data. Tests and the automation engine work on this shape. */
export interface WorkspaceData {
  customers: Customer[];
  quotes: Quote[];
  followUps: FollowUp[];
  timeline: TimelineEvent[];
  inbound: InboundEmail[];
}

export interface Account {
  user: User;
  business: Business;
  settings: Settings;
  subscription: Subscription;
}

export interface EmailMessage {
  to: string;
  toName: string;
  fromName: string;
  replyTo: string;
  subject: string;
  body: string;
  /** Provider idempotency key (same as FollowUp.idempotencyKey). */
  idempotencyKey: string;
  /** Threading headers so follow-ups land in the same conversation. */
  inReplyTo: string | null;
  references: string[];
  threadId: string | null;
  /** Free-form tags for provider metadata / webhooks (e.g. quoteId, followUpId). */
  tags: Record<string, string>;
}

export interface QuoteInput {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quoteNumber: string;
  serviceDescription: string;
  amount: number;
  sentAt: ISODate;
  notes: string;
  schedule: number[];
  tone: Tone;
}

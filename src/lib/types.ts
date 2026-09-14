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

export type FollowUpStatus = "scheduled" | "sent" | "cancelled";

export type TimelineEventType =
  | "quote_added"
  | "quote_updated"
  | "follow_up_scheduled"
  | "follow_up_sent"
  | "follow_up_rescheduled"
  | "replied"
  | "won"
  | "lost"
  | "paused"
  | "resumed"
  | "reopened";

export type PlanId = "trial" | "starter" | "pro";

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

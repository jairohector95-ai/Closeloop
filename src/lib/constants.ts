import type { BusinessType, PlanId, Tone } from "./types";

export const APP_NAME = "CloseLoop";
export const TAGLINE = "Stop losing jobs because you forgot to follow up.";

export const DEFAULT_SCHEDULE = [2, 5, 10];
export const MAX_FOLLOW_UPS = 5;
export const DEFAULT_TONE: Tone = "friendly";

export const TONES: { id: Tone; label: string; description: string }[] = [
  { id: "friendly", label: "Friendly", description: "Warm and casual, like a neighbor checking in." },
  { id: "professional", label: "Professional", description: "Polite and polished, no fluff." },
  { id: "direct", label: "Direct", description: "Short and to the point." },
];

export const BUSINESS_TYPES: { id: BusinessType; label: string }[] = [
  { id: "painting", label: "Painting" },
  { id: "pressure_washing", label: "Pressure washing" },
  { id: "landscaping", label: "Landscaping" },
  { id: "cleaning", label: "Cleaning" },
  { id: "pool", label: "Pool service" },
  { id: "roofing", label: "Roofing" },
  { id: "handyman", label: "Handyman" },
  { id: "flooring", label: "Flooring" },
  { id: "hvac", label: "HVAC" },
  { id: "plumbing", label: "Plumbing" },
  { id: "electrical", label: "Electrical" },
  { id: "remodeling", label: "Remodeling" },
  { id: "other", label: "Other service business" },
];

export function businessTypeLabel(type: BusinessType): string {
  return BUSINESS_TYPES.find((t) => t.id === type)?.label ?? "Service business";
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  activeFollowUpLimit: number | null;
  description: string;
  features: string[];
}

/** Provisional pricing. Change here and the marketing page, settings and admin all update. */
export const PLANS: Plan[] = [
  {
    id: "trial",
    name: "Free trial",
    priceMonthly: 0,
    activeFollowUpLimit: 10,
    description: "Try CloseLoop on your next few estimates. No card needed.",
    features: ["14 days free", "Up to 10 active follow-ups", "All three email tones", "Full quote pipeline"],
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 19,
    activeFollowUpLimit: 25,
    description: "For solo operators and small crews.",
    features: ["Up to 25 active follow-ups", "Automatic 3-step sequences", "Reply detection", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 39,
    activeFollowUpLimit: 100,
    description: "For busy shops sending estimates every day.",
    features: ["Up to 100 active follow-ups", "Custom sequences per quote", "Team inbox (coming soon)", "Priority support"],
  },
];

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export const TRIAL_DAYS = 14;

export const STORAGE_KEY = "closeloop:workspace:v1";

/** How many times we try to hand a follow-up to the email provider before marking it failed. */
export const MAX_SEND_ATTEMPTS = 5;
/** Minutes to wait before retrying a failed send, per attempt (1st retry, 2nd, ...). */
export const RETRY_BACKOFF_MINUTES = [5, 15, 60, 240];
/** A "sending" claim older than this is considered abandoned (worker crashed) and may be retried. */
export const CLAIM_TIMEOUT_MINUTES = 15;

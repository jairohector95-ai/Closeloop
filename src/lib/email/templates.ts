import type { Tone } from "../types";
import { formatMoney } from "../utils/money";
import { firstName } from "../utils/text";

/**
 * Template-based follow-up email generation.
 *
 * Phase 1 uses hand-written templates per tone and sequence position so the
 * emails sound human without calling an AI API. Phase 2 can swap the
 * `EmailGenerator` in ./generator.ts for an OpenAI-backed implementation while
 * keeping these templates as the fallback.
 */

export interface EmailContext {
  customerName: string;
  businessName: string;
  ownerName: string;
  serviceDescription: string;
  amount: number;
  quoteNumber: string;
  /** 1-based position in the sequence. */
  sequenceNumber: number;
  /** Total follow-ups in the sequence. */
  sequenceLength: number;
  tone: Tone;
  signature?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

type TemplateFn = (ctx: EmailContext) => GeneratedEmail;

function signOff(ctx: EmailContext, closing: string): string {
  const lines = [closing, ctx.ownerName, ctx.businessName];
  if (ctx.signature?.trim()) lines.push(ctx.signature.trim());
  return lines.join("\n");
}

function service(ctx: EmailContext): string {
  return ctx.serviceDescription.trim().replace(/\.$/, "").toLowerCase();
}

const friendly: Record<"first" | "middle" | "last", TemplateFn> = {
  first: (ctx) => ({
    subject: "Quick follow-up on your estimate",
    body: `Hi ${firstName(ctx.customerName)},

Just wanted to follow up on the estimate we sent over for your ${service(ctx)}.

If you have any questions or would like to move forward, just reply to this email and let me know. Happy to walk through anything.

${signOff(ctx, "Thanks,")}`,
  }),
  middle: (ctx) => ({
    subject: `Checking in on your ${service(ctx)} estimate`,
    body: `Hi ${firstName(ctx.customerName)},

Hope your week is going well. I wanted to check in on the estimate for your ${service(ctx)} (${formatMoney(ctx.amount)}).

No pressure at all. If the timing isn't right, that's completely fine. If you'd like to get it on the calendar or tweak anything in the estimate, just reply here.

${signOff(ctx, "Talk soon,")}`,
  }),
  last: (ctx) => ({
    subject: "Still interested? No worries either way",
    body: `Hi ${firstName(ctx.customerName)},

This is my last note about the ${service(ctx)} estimate. I don't want to clutter your inbox.

If you'd still like to go ahead, reply anytime and we'll get you scheduled. If you went another direction, no hard feelings, and thanks for considering us.

${signOff(ctx, "All the best,")}`,
  }),
};

const professional: Record<"first" | "middle" | "last", TemplateFn> = {
  first: (ctx) => ({
    subject: `Following up on estimate ${ctx.quoteNumber}`,
    body: `Hello ${firstName(ctx.customerName)},

I'm following up on estimate ${ctx.quoteNumber} for your ${service(ctx)}, which we sent recently.

Please let me know if you have any questions about the scope or pricing. If you would like to proceed, simply reply to this email and we will confirm a start date.

${signOff(ctx, "Kind regards,")}`,
  }),
  middle: (ctx) => ({
    subject: `Estimate ${ctx.quoteNumber}: any questions?`,
    body: `Hello ${firstName(ctx.customerName)},

I wanted to check whether you have had a chance to review the estimate for your ${service(ctx)} (${formatMoney(ctx.amount)}).

If anything needs adjusting, I am glad to revise it. Otherwise, a quick reply is all we need to reserve a spot on our schedule.

${signOff(ctx, "Kind regards,")}`,
  }),
  last: (ctx) => ({
    subject: `Final follow-up on estimate ${ctx.quoteNumber}`,
    body: `Hello ${firstName(ctx.customerName)},

This is my final follow-up regarding estimate ${ctx.quoteNumber} for your ${service(ctx)}.

If you would like to move forward, please reply and we will get you scheduled. If your plans have changed, thank you for considering ${ctx.businessName}. We would be glad to help in the future.

${signOff(ctx, "Kind regards,")}`,
  }),
};

const direct: Record<"first" | "middle" | "last", TemplateFn> = {
  first: (ctx) => ({
    subject: `Your ${service(ctx)} estimate`,
    body: `Hi ${firstName(ctx.customerName)},

Quick follow-up on the ${service(ctx)} estimate (${formatMoney(ctx.amount)}).

Ready to book, or have questions? Reply and let me know.

${signOff(ctx, "Thanks,")}`,
  }),
  middle: (ctx) => ({
    subject: `Still want to schedule the ${service(ctx)}?`,
    body: `Hi ${firstName(ctx.customerName)},

Checking in on the estimate for your ${service(ctx)}.

Our calendar is filling up. If you want the work done soon, reply and I'll hold a spot for you.

${signOff(ctx, "Thanks,")}`,
  }),
  last: (ctx) => ({
    subject: "Last check-in on your estimate",
    body: `Hi ${firstName(ctx.customerName)},

Last note from me on the ${service(ctx)} estimate.

Reply if you'd like to go ahead. If not, no problem, and thanks for considering us.

${signOff(ctx, "Thanks,")}`,
  }),
};

const TEMPLATES: Record<Tone, Record<"first" | "middle" | "last", TemplateFn>> = {
  friendly,
  professional,
  direct,
};

function positionOf(ctx: EmailContext): "first" | "middle" | "last" {
  if (ctx.sequenceNumber <= 1) return "first";
  if (ctx.sequenceNumber >= ctx.sequenceLength) return "last";
  return "middle";
}

export function renderFollowUpEmail(ctx: EmailContext): GeneratedEmail {
  const template = TEMPLATES[ctx.tone] ?? TEMPLATES.friendly;
  return template[positionOf(ctx)](ctx);
}

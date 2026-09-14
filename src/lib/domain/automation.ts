import type { Customer, EmailMessage, FollowUp, Quote, WorkspaceData } from "../types";
import type { EmailContext } from "../email/templates";
import { defaultEmailGenerator, type EmailGenerator } from "../email/generator";
import type { DomainContext } from "./context";
import { deriveActiveStatus, makeEvent, pendingFollowUps } from "./quotes";
import { automationAllowed } from "./status";

/**
 * The automation engine.
 *
 * `runAutomation` is a pure function: given the workspace and a date, it
 * returns the new workspace plus the follow-ups that fired. The store (Phase 1)
 * or a scheduled job (Phase 2) calls it and hands the results to an
 * `EmailProvider`.
 *
 * Rules (see tests/automation.test.ts):
 *  - A follow-up fires when its scheduled date is today or earlier.
 *  - It never fires early.
 *  - At most one follow-up per quote per calendar day, so a quote can never
 *    receive duplicate or bunched-up emails, even if the engine runs many times.
 *  - Quotes that are replied / won / lost / paused are skipped entirely.
 *  - After the final follow-up fires, the quote becomes "awaiting reply" and
 *    nothing else is scheduled.
 */

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

export function isDue(followUp: FollowUp, today: string): boolean {
  return followUp.status === "scheduled" && followUp.scheduledFor <= today;
}

export function runAutomation(
  data: WorkspaceData,
  ctx: DomainContext,
  generator: EmailGenerator = defaultEmailGenerator,
): AutomationRunResult {
  const next: WorkspaceData = { ...data, quotes: [...data.quotes], followUps: [...data.followUps], timeline: [...data.timeline] };
  const fired: FiredFollowUp[] = [];
  let checked = 0;

  for (const quote of data.quotes) {
    if (quote.businessId !== ctx.business.id) continue;
    if (!automationAllowed(quote)) continue;
    checked += 1;

    // Guard: never send two follow-ups to the same customer on the same day.
    if (quote.lastFollowUpSentOn === ctx.today) continue;

    const due = pendingFollowUps(next, quote.id).find((f) => isDue(f, ctx.today));
    if (!due) continue;

    const customer = next.customers.find((c) => c.id === quote.customerId);
    if (!customer) continue;

    const email = generator.generate(buildEmailContext(quote, customer, ctx, due.sequenceNumber));

    const sentFollowUp: FollowUp = {
      ...due,
      status: "sent",
      sentAt: ctx.now,
      subject: email.subject,
      body: email.body,
    };
    next.followUps = next.followUps.map((f) => (f.id === due.id ? sentFollowUp : f));

    const updatedQuote: Quote = {
      ...quote,
      followUpsSent: quote.followUpsSent + 1,
      lastFollowUpSentOn: ctx.today,
      updatedAt: ctx.now,
    };
    next.quotes = next.quotes.map((q) => (q.id === quote.id ? updatedQuote : q));

    const status = deriveActiveStatus(next, quote.id);
    const finalQuote = { ...updatedQuote, status };
    next.quotes = next.quotes.map((q) => (q.id === quote.id ? finalQuote : q));

    next.timeline.push(
      makeEvent(quote.id, "follow_up_sent", `Follow-up #${due.sequenceNumber} sent`, ctx.now, {
        description: email.subject,
        followUpId: due.id,
      }),
    );

    fired.push({
      quote: finalQuote,
      customer,
      followUp: sentFollowUp,
      message: {
        to: customer.email,
        toName: customer.name,
        fromName: `${ctx.business.ownerName} at ${ctx.business.name}`,
        replyTo: ctx.business.email,
        subject: email.subject,
        body: email.body,
      },
    });
  }

  return { data: next, fired, checked };
}

/** Number of follow-ups that would fire if the engine ran today. */
export function countDue(data: WorkspaceData, ctx: DomainContext): number {
  return data.quotes.filter(
    (q) =>
      q.businessId === ctx.business.id &&
      automationAllowed(q) &&
      q.lastFollowUpSentOn !== ctx.today &&
      pendingFollowUps(data, q.id).some((f) => isDue(f, ctx.today)),
  ).length;
}

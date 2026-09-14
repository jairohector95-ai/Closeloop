import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "../domain/context";
import { makeEvent } from "../domain/quotes";
import { recordInboundEmail, type InboundEmailInput } from "../domain/replies";
import { renderEmailHtml } from "../email/html";
import { formatAddress } from "../email/provider";
import { todayISO } from "../utils/date";
import { emailRoutingFrom, type ServerConfig } from "../config/env";
import type { ResendReceivedEvent } from "../integrations/resend";
import { fromResendReceived, ResendApi } from "../integrations/resend";
import { rowToBusiness, rowToSettings } from "./mappers";
import { SupabaseWorkspaceRepository } from "./repository";
import { providerFor } from "./sweep-runner";

/**
 * Inbound reply pipeline (Resend Inbound → webhook → here).
 *
 *  1. Fetch the full message from Resend (the webhook carries metadata only).
 *  2. Find the business: by reply token (authoritative), else by the
 *     Message-ID of a follow-up we sent. Anything else is unmatched; we never
 *     guess across businesses.
 *  3. Load that business's workspace, run recordInboundEmail (which matches
 *     the quote and stops the sequence), save in one transaction.
 *  4. Forward the customer's words to the contractor so they can answer from
 *     their normal inbox.
 */

export interface InboundOutcome {
  status: "matched" | "unmatched" | "duplicate" | "ignored";
  businessId?: string;
  quoteId?: string | null;
  reason?: string;
}

async function resolveBusiness(service: SupabaseClient, input: InboundEmailInput): Promise<{ businessId: string } | null> {
  if (input.replyToken) {
    const { data } = await service.from("quotes").select("business_id").eq("reply_token", input.replyToken).maybeSingle();
    if (data?.business_id) return { businessId: String(data.business_id) };
  }
  const ids = [input.inReplyTo, ...(input.references ?? [])].filter((v): v is string => !!v);
  if (ids.length) {
    const { data } = await service.from("follow_ups").select("business_id").in("message_id", ids).limit(1).maybeSingle();
    if (data?.business_id) return { businessId: String(data.business_id) };
  }
  return null;
}

export async function handleResendReceived(service: SupabaseClient, config: ServerConfig, event: ResendReceivedEvent, api: ResendApi): Promise<InboundOutcome> {
  if (event.type !== "email.received") return { status: "ignored", reason: `event ${event.type}` };

  const email = await api.getReceivedEmail(event.data.email_id);
  const input = fromResendReceived(email, config.replyDomain);
  return processInbound(service, config, input);
}

/** Provider-agnostic core; also used by tests with a fake client. */
export async function processInbound(service: SupabaseClient, config: ServerConfig, input: InboundEmailInput): Promise<InboundOutcome> {
  const resolved = await resolveBusiness(service, input);
  if (!resolved) return { status: "unmatched", reason: "no reply token or known message id" };
  const { businessId } = resolved;

  const [business, settings] = await Promise.all([
    service.from("businesses").select("*").eq("id", businessId).single(),
    service.from("settings").select("*").eq("business_id", businessId).single(),
  ]);
  if (business.error || settings.error) throw new Error(`inbound: business ${businessId} not loadable`);
  const biz = rowToBusiness(business.data);
  const ctx = createContext(biz, rowToSettings(settings.data), todayISO(), emailRoutingFrom(config));

  const repository = new SupabaseWorkspaceRepository(service, businessId);
  const data = await repository.load();
  const result = recordInboundEmail(data, input, ctx);
  if (result.duplicate) return { status: "duplicate", businessId, quoteId: result.inbound.quoteId };

  let next = result.data;

  // Forward to the contractor so the conversation continues in their inbox.
  const provider = providerFor(config);
  if (result.match.quoteId && provider) {
    const customerName = result.inbound.fromName ?? result.inbound.fromEmail;
    const quote = next.quotes.find((q) => q.id === result.match.quoteId);
    const subject = result.inbound.subject && /^re:/i.test(result.inbound.subject) ? result.inbound.subject : `Re: ${result.inbound.subject ?? quote?.serviceDescription ?? "your estimate"}`;
    const body = `${input.text?.trim() || "(no text in reply)"}\n\n—\nReply from ${customerName} <${result.inbound.fromEmail}> about ${quote?.quoteNumber ?? "your quote"}. Reply to this email to answer them directly. CloseLoop has stopped the automatic follow-ups.`;
    const send = await provider.send({
      to: biz.email,
      toName: biz.ownerName,
      fromName: `${customerName} ${ctx.email.brandSuffix}`,
      fromAddress: ctx.email.fromAddress,
      replyTo: formatAddress(customerName, result.inbound.fromEmail),
      subject,
      body,
      html: renderEmailHtml(body),
      idempotencyKey: `fwd:${result.inbound.id}`,
      inReplyTo: result.inbound.messageId,
      references: result.inbound.messageId ? [result.inbound.messageId] : [],
      threadId: null,
      tags: { businessId, quoteId: result.match.quoteId, inboundId: result.inbound.id },
    });
    next = {
      ...next,
      timeline: [
        ...next.timeline,
        makeEvent(result.match.quoteId, "reply_detected", send.ok ? `Reply forwarded to ${biz.email}` : "Reply received (forwarding failed)", ctx.now, {
          description: send.ok ? null : send.error ?? null,
        }),
      ],
    };
  }

  await repository.save(next, data);
  return { status: result.match.quoteId ? "matched" : "unmatched", businessId, quoteId: result.match.quoteId, reason: result.match.reason };
}

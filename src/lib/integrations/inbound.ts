import type { InboundEmailInput } from "../domain/replies";

/**
 * Normalizers for inbound-email webhooks (Phase 5a: replies routed to a
 * CloseLoop address via the email provider). Each returns the common
 * `InboundEmailInput` shape consumed by `recordInboundEmail`.
 */

/** https://postmarkapp.com/developer/webhooks/inbound-webhook */
export interface PostmarkInboundPayload {
  From: string;
  FromName?: string;
  FromFull?: { Email: string; Name?: string };
  Subject?: string;
  TextBody?: string;
  StrippedTextReply?: string;
  MessageID?: string;
  Date?: string;
  Headers?: Array<{ Name: string; Value: string }>;
}

export function fromPostmarkInbound(payload: PostmarkInboundPayload): InboundEmailInput {
  const hdr = (name: string) => payload.Headers?.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? null;
  return {
    source: "provider_webhook",
    fromEmail: payload.FromFull?.Email ?? payload.From,
    fromName: payload.FromFull?.Name ?? payload.FromName ?? null,
    subject: payload.Subject ?? null,
    text: payload.StrippedTextReply ?? payload.TextBody ?? null,
    messageId: hdr("Message-ID") ?? (payload.MessageID ? `<${payload.MessageID}>` : null),
    inReplyTo: hdr("In-Reply-To"),
    references: (hdr("References") ?? "").split(/\s+/).filter(Boolean),
    threadId: null,
    receivedAt: payload.Date ? new Date(payload.Date).toISOString() : undefined,
  };
}

/** https://resend.com/docs/dashboard/receiving/introduction (email.received event + fetched message) */
export interface ResendInboundPayload {
  from: string;
  subject?: string;
  text?: string;
  headers?: Record<string, string>;
  message_id?: string;
  created_at?: string;
}

export function fromResendInbound(payload: ResendInboundPayload): InboundEmailInput {
  const headers = Object.fromEntries(Object.entries(payload.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const match = /<([^>]+)>/.exec(payload.from);
  return {
    source: "provider_webhook",
    fromEmail: match ? match[1] : payload.from,
    fromName: match ? payload.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null : null,
    subject: payload.subject ?? null,
    text: payload.text ?? null,
    messageId: headers["message-id"] ?? payload.message_id ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: (headers.references ?? "").split(/\s+/).filter(Boolean),
    threadId: null,
    receivedAt: payload.created_at ? new Date(payload.created_at).toISOString() : undefined,
  };
}

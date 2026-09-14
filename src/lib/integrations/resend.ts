import type { InboundEmailInput } from "../domain/replies";
import { bareAddress, extractReplyToken } from "../email/routing";

/**
 * Resend-specific pieces: webhook signature verification (Svix format) and
 * normalisation of a received email. Both are pure so they can be unit tested
 * without network access.
 *
 * Webhook docs: resend.com/docs/webhooks/verify-webhooks-requests
 * Receiving docs: resend.com/docs/dashboard/receiving/introduction
 */

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Computes the Svix v1 signature for a payload. Exported so tests can sign fixtures. */
export async function signSvixPayload(secret: string, id: string, timestamp: string, rawBody: string): Promise<string> {
  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * Verifies a Resend/Svix webhook. `rawBody` must be the exact bytes received
 * (do not JSON-parse and re-stringify). Rejects deliveries older than 5 minutes.
 */
export async function verifySvixSignature(secret: string, headers: SvixHeaders, rawBody: string, now: Date = new Date()): Promise<VerifyResult> {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };
  const skew = Math.abs(now.getTime() / 1000 - ts);
  if (skew > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };

  const expected = await signSvixPayload(secret, headers.id, headers.timestamp, rawBody);
  const provided = headers.signature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(",") ? part.split(",", 2) : ["v1", part]))
    .filter(([version]) => version === "v1")
    .map(([, sig]) => sig);

  if (provided.some((sig) => timingSafeEqual(sig, expected))) return { ok: true };
  return { ok: false, reason: "signature mismatch" };
}

/** Shape of the `email.received` webhook event. */
export interface ResendReceivedEvent {
  type: string;
  created_at?: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
}

/** Shape of GET /emails/receiving/{id} (fields we use). */
export interface ResendReceivedEmail {
  id: string;
  from: string;
  to: string[];
  received_for?: string[] | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  message_id: string | null;
  created_at: string;
}

function header(headers: Record<string, string> | null, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

/** Normalises a received email into the domain's inbound shape and pulls out the reply token. */
export function fromResendReceived(email: ResendReceivedEmail, replyDomain?: string | null): InboundEmailInput {
  const delivered = [...(email.received_for ?? []), ...(email.to ?? [])];
  const from = email.from ?? "";
  const nameMatch = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
  return {
    source: "provider_webhook",
    replyToken: extractReplyToken(delivered, replyDomain),
    fromEmail: bareAddress(from).toLowerCase(),
    fromName: nameMatch?.[1]?.trim() || null,
    subject: email.subject,
    text: email.text ?? (email.html ? stripHtml(email.html) : null),
    messageId: header(email.headers, "Message-ID") ?? (email.message_id ? (email.message_id.startsWith("<") ? email.message_id : `<${email.message_id}>`) : null),
    inReplyTo: header(email.headers, "In-Reply-To"),
    references: (header(email.headers, "References") ?? "").split(/\s+/).filter(Boolean),
    threadId: null,
    receivedAt: email.created_at ? new Date(email.created_at).toISOString() : undefined,
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minimal Resend REST client for the two calls the server makes outside the provider adapter. */
export class ResendApi {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getReceivedEmail(emailId: string): Promise<ResendReceivedEmail> {
    const res = await this.fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Resend receiving ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return (await res.json()) as ResendReceivedEmail;
  }
}

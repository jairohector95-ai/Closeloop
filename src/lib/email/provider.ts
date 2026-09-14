import type { EmailMessage } from "../types";

/**
 * Outbound email boundary.
 *
 * Phase 1 uses the simulated provider. Phase 3 ("real outbound email") turns
 * on Resend or Postmark by setting EMAIL_PROVIDER plus the matching API key;
 * nothing else in the app changes. Both real adapters talk to the vendors'
 * REST APIs directly with `fetch`, so there is no SDK to install.
 *
 * Every provider receives the follow-up's idempotency key. Resend enforces it
 * server-side; for Postmark we rely on the claim step in the engine (a
 * follow-up is only handed to the provider once per claim).
 */

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  /** RFC 5322 Message-ID the provider assigned (or that we set), used for reply matching. */
  messageId: string | null;
  threadId: string | null;
  error?: string;
  /** True for errors worth retrying (network, 5xx, rate limit). */
  retryable?: boolean;
}

export interface SendOptions {
  /** Verified sender address the provider is allowed to send from. */
  from: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, options: SendOptions): Promise<SendResult>;
}

/** Deterministic Message-ID derived from the idempotency key, so retries reuse the same id. */
export function messageIdFor(message: EmailMessage, domain: string): string {
  const safe = message.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "");
  return `<${safe}@${domain}>`;
}

export function formatAddress(name: string, email: string): string {
  const clean = name.replace(/["<>]/g, "").trim();
  return clean ? `"${clean}" <${email}>` : email;
}

export class SimulatedEmailProvider implements EmailProvider {
  readonly name = "simulated";
  readonly outbox: Array<EmailMessage & { from: string }> = [];

  async send(message: EmailMessage, options: SendOptions): Promise<SendResult> {
    this.outbox.push({ ...message, from: options.from });
    return {
      ok: true,
      providerMessageId: `sim_${this.outbox.length}`,
      messageId: messageIdFor(message, "closeloop.local"),
      threadId: message.threadId ?? `thread_${message.tags.quoteId ?? this.outbox.length}`,
    };
  }
}

type Fetch = typeof fetch;

/** https://resend.com/docs/api-reference/emails/send-email */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send(message: EmailMessage, options: SendOptions): Promise<SendResult> {
    const messageId = messageIdFor(message, options.from.split("@")[1] ?? "closeloop.app");
    const headers: Record<string, string> = { "Message-ID": messageId };
    if (message.inReplyTo) headers["In-Reply-To"] = message.inReplyTo;
    if (message.references.length) headers.References = message.references.join(" ");

    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: formatAddress(message.fromName, options.from),
          to: [formatAddress(message.toName, message.to)],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.body,
          headers,
          tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: `Resend ${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 || res.status === 429 };
      }
      const json = (await res.json()) as { id?: string };
      return { ok: true, providerMessageId: json.id ?? null, messageId, threadId: message.threadId };
    } catch (error) {
      return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: String(error), retryable: true };
    }
  }
}

/** https://postmarkapp.com/developer/api/email-api */
export class PostmarkEmailProvider implements EmailProvider {
  readonly name = "postmark";
  constructor(
    private readonly serverToken: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly messageStream = "outbound",
  ) {}

  async send(message: EmailMessage, options: SendOptions): Promise<SendResult> {
    const messageId = messageIdFor(message, options.from.split("@")[1] ?? "closeloop.app");
    const headers: Array<{ Name: string; Value: string }> = [{ Name: "Message-ID", Value: messageId }];
    if (message.inReplyTo) headers.push({ Name: "In-Reply-To", Value: message.inReplyTo });
    if (message.references.length) headers.push({ Name: "References", Value: message.references.join(" ") });

    try {
      const res = await this.fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": this.serverToken },
        body: JSON.stringify({
          From: formatAddress(message.fromName, options.from),
          To: formatAddress(message.toName, message.to),
          ReplyTo: message.replyTo,
          Subject: message.subject,
          TextBody: message.body,
          MessageStream: this.messageStream,
          Headers: headers,
          Tag: message.tags.followUpId ?? undefined,
          Metadata: message.tags,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: `Postmark ${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 || res.status === 429 };
      }
      const json = (await res.json()) as { MessageID?: string };
      return { ok: true, providerMessageId: json.MessageID ?? null, messageId, threadId: message.threadId };
    } catch (error) {
      return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: String(error), retryable: true };
    }
  }
}

export interface ProviderSelection {
  emailProvider: "simulated" | "resend" | "postmark";
  resendApiKey: string | null;
  postmarkServerToken: string | null;
}

/** Picks the provider from configuration. Falls back to simulated when keys are missing. */
export function createEmailProvider(config: ProviderSelection, fetchImpl: Fetch = fetch): EmailProvider {
  if (config.emailProvider === "resend" && config.resendApiKey) return new ResendEmailProvider(config.resendApiKey, fetchImpl);
  if (config.emailProvider === "postmark" && config.postmarkServerToken) return new PostmarkEmailProvider(config.postmarkServerToken, fetchImpl);
  return new SimulatedEmailProvider();
}

/** Phase 1 default for the in-browser store. */
export function getEmailProvider(): EmailProvider {
  return new SimulatedEmailProvider();
}

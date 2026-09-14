import type { EmailMessage } from "../../types";
import type { InboundEmailInput } from "../../domain/replies";
import { messageIdFor } from "../../email/provider";
import type { MailboxProvider, MailboxSendResult, OAuthTokens, ReplySyncResult, WatchResult } from "./types";

/**
 * Microsoft 365 / Outlook.com via Microsoft Graph (REST, no SDK).
 *
 * Endpoints used:
 *  - POST /me/messages  then  POST /me/messages/{id}/send     (Mail.Send)
 *    (two steps so we can read back internetMessageId/conversationId)
 *  - POST /me/messages/{id}/reply                              (threads onto an existing conversation)
 *  - GET  /me/mailFolders/inbox/messages/delta                 (Mail.ReadBasic; incremental sync)
 *  - POST /subscriptions                                       (change notifications, ≤ ~3 days, renew via job)
 *
 * NOT yet exercised against a live tenant (needs an Entra app registration).
 */

type Fetch = typeof fetch;
const BASE = "https://graph.microsoft.com/v1.0";

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

export class OutlookMailboxProvider implements MailboxProvider {
  readonly id = "outlook" as const;
  constructor(private readonly fetchImpl: Fetch = fetch) {}

  private async call<T>(tokens: OAuthTokens, url: string, init: RequestInit = {}): Promise<{ ok: true; json: T; status: number } | { ok: false; status: number; text: string }> {
    const res = await this.fetchImpl(url.startsWith("http") ? url : `${BASE}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => "") };
    const text = await res.text();
    return { ok: true, status: res.status, json: (text ? JSON.parse(text) : {}) as T };
  }

  async send(tokens: OAuthTokens, message: EmailMessage, fromAddress: string): Promise<MailboxSendResult> {
    const messageId = messageIdFor(message, fromAddress.split("@")[1] ?? "outlook.com");
    const headers = [{ name: "X-CloseLoop-Key", value: message.idempotencyKey }];
    if (message.inReplyTo) headers.push({ name: "In-Reply-To", value: message.inReplyTo });
    if (message.references.length) headers.push({ name: "References", value: message.references.join(" ") });

    // 1. Create a draft so Graph assigns internetMessageId + conversationId.
    const draft = await this.call<GraphMessage>(tokens, "/me/messages", {
      method: "POST",
      body: JSON.stringify({
        subject: message.subject,
        body: { contentType: "Text", content: message.body },
        toRecipients: [{ emailAddress: { address: message.to, name: message.toName } }],
        replyTo: [{ emailAddress: { address: message.replyTo } }],
        internetMessageHeaders: headers,
        internetMessageId: messageId,
      }),
    });
    if (!draft.ok) return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: `Graph ${draft.status}: ${draft.text.slice(0, 200)}`, needsReauth: draft.status === 401 };

    // 2. Send it.
    const sent = await this.call(tokens, `/me/messages/${draft.json.id}/send`, { method: "POST" });
    if (!sent.ok) return { ok: false, providerMessageId: draft.json.id, messageId: null, threadId: null, error: `Graph send ${sent.status}: ${sent.text.slice(0, 200)}`, needsReauth: sent.status === 401 };

    return { ok: true, providerMessageId: draft.json.id, messageId: draft.json.internetMessageId ?? messageId, threadId: draft.json.conversationId ?? message.threadId };
  }

  async syncReplies(tokens: OAuthTokens, args: { cursor: string | null; sinceIso: string; ownAddress: string }): Promise<ReplySyncResult> {
    const select = "id,internetMessageId,conversationId,subject,bodyPreview,receivedDateTime,from,internetMessageHeaders";
    let url = args.cursor ?? `/me/mailFolders/inbox/messages/delta?$select=${select}&$filter=receivedDateTime ge ${args.sinceIso}`;
    const replies: InboundEmailInput[] = [];
    let cursor: string | null = args.cursor;

    for (let page = 0; page < 20; page += 1) {
      const res = await this.call<{ value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }>(tokens, url);
      if (!res.ok) return { replies, cursor, needsReauth: res.status === 401, error: `Graph delta ${res.status}` };
      for (const m of res.json.value ?? []) {
        const from = m.from?.emailAddress?.address?.toLowerCase();
        if (!from || from === args.ownAddress.toLowerCase()) continue;
        const hdr = (name: string) => m.internetMessageHeaders?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
        replies.push({
          source: "outlook",
          fromEmail: from,
          fromName: m.from?.emailAddress?.name ?? null,
          subject: m.subject ?? null,
          text: m.bodyPreview ?? null,
          messageId: m.internetMessageId ?? null,
          inReplyTo: hdr("In-Reply-To"),
          references: (hdr("References") ?? "").split(/\s+/).filter(Boolean),
          threadId: m.conversationId ?? null,
          receivedAt: m.receivedDateTime,
        });
      }
      if (res.json["@odata.nextLink"]) {
        url = res.json["@odata.nextLink"];
        continue;
      }
      cursor = res.json["@odata.deltaLink"] ?? cursor;
      break;
    }
    return { replies, cursor };
  }

  async watch(tokens: OAuthTokens, args: { callbackUrl: string; clientState: string }): Promise<WatchResult> {
    // Graph mail subscriptions live at most ~3 days (4230 minutes); a job renews them.
    const expiration = new Date(Date.now() + 4200 * 60_000).toISOString();
    const res = await this.call<{ id: string; expirationDateTime: string }>(tokens, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: args.callbackUrl,
        resource: "/me/mailFolders('inbox')/messages",
        expirationDateTime: expiration,
        clientState: args.clientState,
      }),
    });
    if (!res.ok) return { watchId: null, expiresAt: null, error: `Graph subscription ${res.status}: ${res.text.slice(0, 200)}` };
    return { watchId: res.json.id, expiresAt: res.json.expirationDateTime };
  }

  async unwatch(tokens: OAuthTokens, watchId: string | null): Promise<void> {
    if (!watchId) return;
    await this.call(tokens, `/subscriptions/${watchId}`, { method: "DELETE" });
  }
}

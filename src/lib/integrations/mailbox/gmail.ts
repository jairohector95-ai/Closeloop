import type { EmailMessage } from "../../types";
import type { InboundEmailInput } from "../../domain/replies";
import { messageIdFor } from "../../email/provider";
import { buildRawMime, parseAddress, toBase64Url } from "./mime";
import type { MailboxProvider, MailboxSendResult, OAuthTokens, ReplySyncResult, WatchResult } from "./types";

/**
 * Gmail via the REST API (no SDK needed).
 *
 * Endpoints used:
 *  - POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send   (scope gmail.send)
 *  - GET  https://gmail.googleapis.com/gmail/v1/users/me/history          (scope gmail.metadata)
 *  - GET  https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=metadata
 *  - POST https://gmail.googleapis.com/gmail/v1/users/me/watch            (Pub/Sub push; expires ≤7 days)
 *
 * NOT yet exercised against a live account (needs a Google Cloud project and
 * OAuth verification). See docs/production-roadmap.md, Phase 5.
 */

type Fetch = typeof fetch;
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export class GmailMailboxProvider implements MailboxProvider {
  readonly id = "gmail" as const;
  constructor(
    private readonly fetchImpl: Fetch = fetch,
    private readonly pubsubTopic: string | null = null,
  ) {}

  private async call<T>(tokens: OAuthTokens, path: string, init: RequestInit = {}): Promise<{ ok: true; json: T } | { ok: false; status: number; text: string }> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => "") };
    return { ok: true, json: (await res.json()) as T };
  }

  async send(tokens: OAuthTokens, message: EmailMessage, fromAddress: string): Promise<MailboxSendResult> {
    const messageId = messageIdFor(message, fromAddress.split("@")[1] ?? "gmail.com");
    const raw = toBase64Url(buildRawMime(message, fromAddress, messageId));
    const body: { raw: string; threadId?: string } = { raw };
    if (message.threadId) body.threadId = message.threadId;
    const res = await this.call<{ id: string; threadId: string }>(tokens, "/messages/send", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: `Gmail ${res.status}: ${res.text.slice(0, 200)}`, needsReauth: res.status === 401 };
    return { ok: true, providerMessageId: res.json.id, messageId, threadId: res.json.threadId };
  }

  async syncReplies(tokens: OAuthTokens, args: { cursor: string | null; sinceIso: string; ownAddress: string }): Promise<ReplySyncResult> {
    // First sync: list recent inbox messages. Later syncs: incremental history since cursor.
    let ids: string[] = [];
    let cursor = args.cursor;
    if (cursor) {
      const res = await this.call<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId?: string }>(
        tokens,
        `/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX`,
      );
      if (!res.ok) return { replies: [], cursor, needsReauth: res.status === 401, error: `Gmail history ${res.status}` };
      ids = (res.json.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((m) => m.message.id));
      cursor = res.json.historyId ?? cursor;
    } else {
      // First sync. The gmail.metadata scope does not allow the `q` search
      // parameter, so filter by label and drop old messages by internalDate.
      const profile = await this.call<{ historyId?: string }>(tokens, "/profile");
      if (!profile.ok) return { replies: [], cursor: null, needsReauth: profile.status === 401, error: `Gmail profile ${profile.status}` };
      cursor = profile.json.historyId ?? null;
      const res = await this.call<{ messages?: Array<{ id: string }> }>(tokens, `/messages?labelIds=INBOX&maxResults=50`);
      if (!res.ok) return { replies: [], cursor, needsReauth: res.status === 401, error: `Gmail list ${res.status}` };
      ids = (res.json.messages ?? []).map((m) => m.id);
    }

    const sinceMs = new Date(args.sinceIso).getTime();

    const replies: InboundEmailInput[] = [];
    for (const id of ids) {
      const res = await this.call<GmailMessage>(tokens, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`);
      if (!res.ok) continue;
      const m = res.json;
      if (m.internalDate && Number(m.internalDate) < sinceMs) continue;
      const from = parseAddress(header(m.payload?.headers, "From") ?? "");
      if (!from.email || from.email === args.ownAddress.toLowerCase()) continue;
      replies.push({
        source: "gmail",
        fromEmail: from.email,
        fromName: from.name,
        subject: header(m.payload?.headers, "Subject"),
        text: m.snippet ?? null,
        messageId: header(m.payload?.headers, "Message-ID"),
        inReplyTo: header(m.payload?.headers, "In-Reply-To"),
        references: (header(m.payload?.headers, "References") ?? "").split(/\s+/).filter(Boolean),
        threadId: m.threadId,
        receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : undefined,
      });
    }
    return { replies, cursor };
  }

  async watch(tokens: OAuthTokens): Promise<WatchResult> {
    if (!this.pubsubTopic) return { watchId: null, expiresAt: null, error: "No Pub/Sub topic configured; falling back to polling." };
    const res = await this.call<{ historyId: string; expiration: string }>(tokens, "/watch", {
      method: "POST",
      body: JSON.stringify({ topicName: this.pubsubTopic, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
    });
    if (!res.ok) return { watchId: null, expiresAt: null, error: `Gmail watch ${res.status}` };
    return { watchId: res.json.historyId, expiresAt: new Date(Number(res.json.expiration)).toISOString() };
  }

  async unwatch(tokens: OAuthTokens): Promise<void> {
    await this.call(tokens, "/stop", { method: "POST" });
  }
}

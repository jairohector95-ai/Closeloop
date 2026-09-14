import type { EmailMessage, MailboxProviderId } from "../../types";
import type { InboundEmailInput } from "../../domain/replies";

/**
 * "Connect your Gmail / Outlook" boundary (Phases 5b/5c).
 *
 * A MailboxProvider sends from the contractor's own mailbox and reports
 * replies. Tokens live server-side only (see supabase/migrations, table
 * mailbox_credentials) and are passed in per call; this module never stores them.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO instant when the access token expires. */
  expiresAt: string;
  scopes: string[];
}

export interface MailboxSendResult {
  ok: boolean;
  providerMessageId: string | null;
  messageId: string | null;
  threadId: string | null;
  error?: string;
  /** Set when the provider says the token is invalid; caller marks the connection needs_reauth. */
  needsReauth?: boolean;
}

export interface ReplySyncResult {
  replies: InboundEmailInput[];
  /** Opaque cursor (Gmail historyId / Graph deltaLink) to persist for the next sync. */
  cursor: string | null;
  needsReauth?: boolean;
  error?: string;
}

export interface WatchResult {
  watchId: string | null;
  expiresAt: string | null;
  error?: string;
}

export interface MailboxProvider {
  readonly id: MailboxProviderId;
  /** Sends `message` from the connected mailbox, threading onto `message.threadId` when set. */
  send(tokens: OAuthTokens, message: EmailMessage, fromAddress: string): Promise<MailboxSendResult>;
  /** Returns customer emails received since `cursor` (or since `sinceIso` on first sync). */
  syncReplies(tokens: OAuthTokens, args: { cursor: string | null; sinceIso: string; ownAddress: string }): Promise<ReplySyncResult>;
  /** Registers push notifications for new mail where supported; returns expiry so a job can renew it. */
  watch(tokens: OAuthTokens, args: { callbackUrl: string; clientState: string }): Promise<WatchResult>;
  unwatch(tokens: OAuthTokens, watchId: string | null): Promise<void>;
}

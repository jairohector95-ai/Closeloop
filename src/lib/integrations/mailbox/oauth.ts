import type { MailboxProviderId } from "../../types";

/**
 * OAuth configuration for mailbox connections. Pure helpers only: building
 * authorization URLs and token-exchange requests. Secrets come from
 * ServerConfig at call time and are never bundled into the client.
 *
 * Scope policy (deliberately minimal):
 *  - Gmail:   gmail.send (send as the user) + gmail.metadata (see headers of
 *             incoming mail to spot replies, never read bodies). Both are
 *             Google "restricted" scopes for public apps, which means Google's
 *             OAuth verification and an annual CASA security assessment.
 *             See docs/production-roadmap.md, Phase 5.
 *  - Outlook: Mail.Send + Mail.ReadBasic (headers/metadata only) + offline_access.
 */

export const GMAIL_SCOPES = {
  send: "https://www.googleapis.com/auth/gmail.send",
  metadata: "https://www.googleapis.com/auth/gmail.metadata",
  email: "https://www.googleapis.com/auth/userinfo.email",
} as const;

export const OUTLOOK_SCOPES = {
  send: "Mail.Send",
  readBasic: "Mail.ReadBasic",
  offline: "offline_access",
  user: "User.Read",
} as const;

export const REQUESTED_SCOPES: Record<MailboxProviderId, string[]> = {
  gmail: [GMAIL_SCOPES.email, GMAIL_SCOPES.send, GMAIL_SCOPES.metadata],
  outlook: [OUTLOOK_SCOPES.user, OUTLOOK_SCOPES.send, OUTLOOK_SCOPES.readBasic, OUTLOOK_SCOPES.offline],
};

export interface AuthorizationUrlInput {
  provider: MailboxProviderId;
  clientId: string;
  redirectUri: string;
  /** CSRF token bound to the user's session; verify it on callback. */
  state: string;
  /** PKCE code challenge (S256). */
  codeChallenge: string;
  /** Pre-fill the account picker with the business email. */
  loginHint?: string;
  /** Microsoft tenant: "common" for any account, "organizations", "consumers", or a tenant id. */
  tenant?: string;
}

export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const scopes = REQUESTED_SCOPES[input.provider].join(" ");
  if (input.provider === "gmail") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("access_type", "offline"); // refresh token
    url.searchParams.set("prompt", "consent"); // always return a refresh token
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
    return url.toString();
  }
  const tenant = input.tenant ?? "common";
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export interface TokenRequest {
  url: string;
  body: URLSearchParams;
}

/** Builds the code→token exchange request. The caller POSTs it with `Content-Type: application/x-www-form-urlencoded`. */
export function buildTokenExchange(input: {
  provider: MailboxProviderId;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  tenant?: string;
}): TokenRequest {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  if (input.provider === "gmail") return { url: "https://oauth2.googleapis.com/token", body };
  body.set("scope", REQUESTED_SCOPES.outlook.join(" "));
  return { url: `https://login.microsoftonline.com/${input.tenant ?? "common"}/oauth2/v2.0/token`, body };
}

export function buildRefreshRequest(input: { provider: MailboxProviderId; clientId: string; clientSecret: string; refreshToken: string; tenant?: string }): TokenRequest {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  if (input.provider === "gmail") return { url: "https://oauth2.googleapis.com/token", body };
  body.set("scope", REQUESTED_SCOPES.outlook.join(" "));
  return { url: `https://login.microsoftonline.com/${input.tenant ?? "common"}/oauth2/v2.0/token`, body };
}

/** PKCE helpers (Web Crypto, works in Node 18+ and edge runtimes). */
export function randomUrlSafe(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64Url(arr);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Interprets a token-endpoint error: which ones mean "the user must reconnect". */
export function isReauthError(status: number, body: { error?: string } | null): boolean {
  if (status === 400 || status === 401) {
    const code = body?.error ?? "";
    return code === "invalid_grant" || code === "invalid_client" || code === "interaction_required" || code === "unauthorized_client";
  }
  return false;
}

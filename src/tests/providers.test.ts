import { describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/types";
import { PostmarkEmailProvider, ResendEmailProvider, createEmailProvider, formatAddress, messageIdFor } from "@/lib/email/provider";
import { loadServerConfig } from "@/lib/config/env";
import { fromPostmarkInbound, fromResendInbound } from "@/lib/integrations/inbound";
import { buildAuthorizationUrl, buildRefreshRequest, buildTokenExchange, isReauthError, pkceChallenge, randomUrlSafe, REQUESTED_SCOPES } from "@/lib/integrations/mailbox/oauth";
import { buildRawMime, encodeHeader, parseAddress, toBase64Url } from "@/lib/integrations/mailbox/mime";

const message: EmailMessage = {
  to: "sarah@example.com",
  toName: "Sarah Mitchell",
  fromName: "Mike at ABC Painting",
  replyTo: "mike@abcpainting.com",
  subject: "Quick follow-up on your estimate",
  body: "Hi Sarah,\n\nJust checking in.",
  idempotencyKey: "quote_1:1:fu_1",
  inReplyTo: "<first@mail.closeloop.app>",
  references: ["<first@mail.closeloop.app>"],
  threadId: null,
  tags: { quoteId: "quote_1", followUpId: "fu_1", businessId: "biz_1" },
};

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("email provider adapters", () => {
  it("Resend: sends the right request with idempotency and threading headers", async () => {
    const { fetchImpl, calls } = fakeFetch(200, { id: "re_123" });
    const result = await new ResendEmailProvider("re_key", fetchImpl).send(message, { from: "follow-ups@mail.closeloop.app" });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("re_123");
    expect(result.messageId).toBe(messageIdFor(message, "mail.closeloop.app"));
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("quote_1:1:fu_1");
    expect(headers.Authorization).toBe("Bearer re_key");
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.headers["In-Reply-To"]).toBe("<first@mail.closeloop.app>");
    expect(payload.to).toEqual(['"Sarah Mitchell" <sarah@example.com>']);
    expect(payload.reply_to).toBe("mike@abcpainting.com");
  });

  it("Resend: marks 5xx as retryable and 4xx as not", async () => {
    const bad = await new ResendEmailProvider("k", fakeFetch(503, { message: "down" }).fetchImpl).send(message, { from: "a@b.co" });
    expect(bad.ok).toBe(false);
    expect(bad.retryable).toBe(true);
    const rejected = await new ResendEmailProvider("k", fakeFetch(422, { message: "bad" }).fetchImpl).send(message, { from: "a@b.co" });
    expect(rejected.retryable).toBe(false);
  });

  it("Postmark: sends with server token and metadata", async () => {
    const { fetchImpl, calls } = fakeFetch(200, { MessageID: "pm-1" });
    const result = await new PostmarkEmailProvider("pm_token", fetchImpl).send(message, { from: "follow-ups@mail.closeloop.app" });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("pm-1");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Postmark-Server-Token"]).toBe("pm_token");
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.Metadata.quoteId).toBe("quote_1");
    expect(payload.Headers.some((h: { Name: string }) => h.Name === "Message-ID")).toBe(true);
  });

  it("falls back to the simulated provider when keys are missing", () => {
    expect(createEmailProvider({ emailProvider: "resend", resendApiKey: null, postmarkServerToken: null }).name).toBe("simulated");
    expect(createEmailProvider({ emailProvider: "postmark", resendApiKey: null, postmarkServerToken: "x" }).name).toBe("postmark");
    const config = loadServerConfig({ EMAIL_PROVIDER: "resend" } as unknown as NodeJS.ProcessEnv);
    expect(config.emailProvider).toBe("simulated");
    expect(loadServerConfig({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" } as unknown as NodeJS.ProcessEnv).emailProvider).toBe("resend");
  });

  it("formats addresses safely", () => {
    expect(formatAddress('Sarah "Q" <x>', "s@x.com")).toBe('"Sarah Q x" <s@x.com>');
    expect(formatAddress("", "s@x.com")).toBe("s@x.com");
  });
});

describe("inbound webhook normalizers", () => {
  it("normalizes a Postmark inbound payload", () => {
    const input = fromPostmarkInbound({
      From: "sarah@example.com",
      FromFull: { Email: "sarah@example.com", Name: "Sarah" },
      Subject: "Re: estimate",
      StrippedTextReply: "Yes please",
      TextBody: "Yes please\n> quoted",
      MessageID: "abc",
      Headers: [{ Name: "In-Reply-To", Value: "<first@mail.closeloop.app>" }],
    });
    expect(input.fromEmail).toBe("sarah@example.com");
    expect(input.inReplyTo).toBe("<first@mail.closeloop.app>");
    expect(input.text).toBe("Yes please");
    expect(input.messageId).toBe("<abc>");
  });

  it("normalizes a Resend inbound payload", () => {
    const input = fromResendInbound({ from: "Sarah <sarah@example.com>", subject: "Re", text: "ok", headers: { "In-Reply-To": "<x@y>" } });
    expect(input.fromEmail).toBe("sarah@example.com");
    expect(input.fromName).toBe("Sarah");
    expect(input.inReplyTo).toBe("<x@y>");
  });
});

describe("mailbox OAuth helpers", () => {
  it("builds Google and Microsoft authorization URLs with minimal scopes and PKCE", async () => {
    const verifier = randomUrlSafe();
    const challenge = await pkceChallenge(verifier);
    const google = new URL(buildAuthorizationUrl({ provider: "gmail", clientId: "cid", redirectUri: "https://app/cb", state: "s1", codeChallenge: challenge }));
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("scope")).toBe(REQUESTED_SCOPES.gmail.join(" "));
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
    expect(REQUESTED_SCOPES.gmail).not.toContain("https://mail.google.com/");

    const ms = new URL(buildAuthorizationUrl({ provider: "outlook", clientId: "cid", redirectUri: "https://app/cb", state: "s1", codeChallenge: challenge }));
    expect(ms.pathname).toBe("/common/oauth2/v2.0/authorize");
    expect(ms.searchParams.get("scope")).toContain("Mail.Send");
    expect(ms.searchParams.get("scope")).toContain("offline_access");
    expect(ms.searchParams.get("scope")).not.toContain("Mail.ReadWrite");
  });

  it("builds token exchange and refresh requests", () => {
    const exchange = buildTokenExchange({ provider: "gmail", clientId: "c", clientSecret: "s", redirectUri: "r", code: "code", codeVerifier: "v" });
    expect(exchange.url).toBe("https://oauth2.googleapis.com/token");
    expect(exchange.body.get("grant_type")).toBe("authorization_code");
    const refresh = buildRefreshRequest({ provider: "outlook", clientId: "c", clientSecret: "s", refreshToken: "rt" });
    expect(refresh.url).toContain("login.microsoftonline.com/common");
    expect(refresh.body.get("refresh_token")).toBe("rt");
    expect(isReauthError(400, { error: "invalid_grant" })).toBe(true);
    expect(isReauthError(500, { error: "server_error" })).toBe(false);
  });
});

describe("MIME builder", () => {
  it("produces a threaded RFC 5322 message", () => {
    const raw = buildRawMime(message, "mike@abcpainting.com", "<k1@abcpainting.com>", new Date("2026-09-14T12:00:00Z"));
    expect(raw).toContain("From: \"Mike at ABC Painting\" <mike@abcpainting.com>");
    expect(raw).toContain("In-Reply-To: <first@mail.closeloop.app>");
    expect(raw).toContain("Message-ID: <k1@abcpainting.com>");
    expect(raw.slice(raw.indexOf("\r\n\r\n") + 4)).toBe("Hi Sarah,\r\n\r\nJust checking in.");
    expect(encodeHeader("Café")).toMatch(/^=\?UTF-8\?B\?/);
    expect(toBase64Url("hi")).toBe("aGk");
    expect(parseAddress('"Sarah M" <SARAH@example.com>')).toEqual({ name: "Sarah M", email: "sarah@example.com" });
    expect(parseAddress("x@y.com")).toEqual({ name: null, email: "x@y.com" });
  });
});

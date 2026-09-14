import { describe, expect, it } from "vitest";
import type { EmailMessage, WorkspaceData } from "@/lib/types";
import { runFollowUpSweep } from "@/lib/jobs/sweep";
import { InMemoryWorkspaceRepository } from "@/lib/persistence/repository";
import type { EmailProvider, SendResult } from "@/lib/email/provider";
import { buildOutboundMessage, selectDueFollowUps } from "@/lib/domain/automation";
import { matchInboundEmail, recordInboundEmail } from "@/lib/domain/replies";
import { markReplied } from "@/lib/domain/status";
import { addQuote } from "@/lib/domain/quotes";
import { createContext, type DomainContext } from "@/lib/domain/context";
import { renderEmailHtml } from "@/lib/email/html";
import { extractReplyToken, replyAddressFor } from "@/lib/email/routing";
import { createSecureToken } from "@/lib/utils/id";
import { fromResendReceived, signSvixPayload, verifySvixSignature, type ResendReceivedEmail } from "@/lib/integrations/resend";
import { validateChangeSet } from "@/lib/server/changeset";
import { rowsToWorkspace } from "@/lib/server/mappers";
import { validateOnboarding } from "@/lib/validation";
import { addDays } from "@/lib/utils/date";
import { account, ctxOn, empty, followUpsOf, quoteOf, sampleInput, seedQuote, TODAY } from "./helpers";

const ROUTING = { fromAddress: "followup@mail.closeloop.app", replyDomain: "reply.closeloop.app", brandSuffix: "via CloseLoop" };
const cloudCtx = (day: string): DomainContext => createContext(account.business, account.settings, day, ROUTING);

class FakeProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { ok: true, providerMessageId: `p_${this.sent.length}`, messageId: `<${this.sent.length}@mail.closeloop.app>`, threadId: null };
  }
}

describe("reply routing", () => {
  it("gives every quote an unguessable reply token", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createSecureToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const { data, quoteId } = seedQuote(TODAY);
    expect(quoteOf(data, quoteId).replyToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("addresses outbound email professionally with a per-quote Reply-To", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const quote = quoteOf(data, quoteId);
    const customer = data.customers[0];
    const message = buildOutboundMessage(data, quote, customer, followUpsOf(data, quoteId)[0], cloudCtx(TODAY), { generate: (c) => ({ subject: `Hi ${c.customerName}`, body: "Hello\n\nWorld" }) });
    expect(message.fromName).toBe("ABC Painting via CloseLoop");
    expect(message.fromAddress).toBe("followup@mail.closeloop.app");
    expect(message.replyTo).toBe(`reply+${quote.replyToken}@reply.closeloop.app`);
    expect(message.html).toContain("<p");
    expect(message.html).toContain("Hello");
    expect(message.body).toBe("Hello\n\nWorld");
  });

  it("extracts the token only from the configured reply domain", () => {
    const token = createSecureToken();
    const addr = replyAddressFor(token, "reply.closeloop.app");
    expect(extractReplyToken([addr], "reply.closeloop.app")).toBe(token);
    expect(extractReplyToken([`Sarah <${addr}>`], "reply.closeloop.app")).toBe(token);
    expect(extractReplyToken([`reply+${token}@evil.example`], "reply.closeloop.app")).toBeNull();
    expect(extractReplyToken(["mike@abcpainting.com"], "reply.closeloop.app")).toBeNull();
    expect(extractReplyToken(["reply+short@reply.closeloop.app"], "reply.closeloop.app")).toBeNull();
  });

  it("matches a reply by token before anything else, even from an unknown sender", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const token = quoteOf(data, quoteId).replyToken;
    expect(matchInboundEmail(data, { source: "provider_webhook", replyToken: token, fromEmail: "other-address@example.com" }, "biz_1")).toEqual({ quoteId, reason: "reply_token" });
    const result = recordInboundEmail(data, { source: "provider_webhook", replyToken: token, fromEmail: "sarah@example.com", messageId: "<r1@x>", text: "Sounds good" }, ctxOn(TODAY));
    expect(result.stoppedSequence).toBe(true);
    expect(quoteOf(result.data, quoteId).status).toBe("replied");
  });

  it("refuses to guess when a sender has several open quotes", () => {
    const first = addQuote(empty, sampleInput(), ctxOn(TODAY));
    const second = addQuote(first.data, sampleInput({ quoteNumber: "EST-2" }), ctxOn(TODAY));
    const match = matchInboundEmail(second.data, { source: "provider_webhook", fromEmail: "sarah@example.com" }, "biz_1");
    expect(match).toEqual({ quoteId: null, reason: "ambiguous" });
    const result = recordInboundEmail(second.data, { source: "provider_webhook", fromEmail: "sarah@example.com", messageId: "<amb@x>" }, ctxOn(TODAY));
    expect(result.stoppedSequence).toBe(false);
    expect(result.data.quotes.every((q) => q.status === "follow_up_scheduled")).toBe(true);
    expect(result.data.inbound[0].quoteId).toBeNull();
  });

  it("a token from another business never matches", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const token = quoteOf(data, quoteId).replyToken;
    expect(matchInboundEmail(data, { source: "provider_webhook", replyToken: token, fromEmail: "sarah@example.com" }, "biz_other").quoteId).toBeNull();
  });
});

describe("Resend webhook verification", () => {
  const secret = "whsec_" + Buffer.from("supersecretkey_supersecretkey_32").toString("base64");
  const body = JSON.stringify({ type: "email.received", data: { email_id: "em_1" } });

  it("accepts a correctly signed, fresh delivery", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSvixPayload(secret, "msg_1", ts, body);
    const result = await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body);
    expect(result).toEqual({ ok: true });
    // Multiple signatures (key rotation): any valid one passes.
    expect((await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,bogus v1,${sig}` }, body)).ok).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, missing headers and old timestamps", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSvixPayload(secret, "msg_1", ts, body);
    expect((await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body + " ")).ok).toBe(false);
    expect((await verifySvixSignature("whsec_" + Buffer.from("another_secret_key_another_secret").toString("base64"), { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body)).ok).toBe(false);
    expect((await verifySvixSignature(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body)).ok).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const oldSig = await signSvixPayload(secret, "msg_1", old, body);
    expect((await verifySvixSignature(secret, { id: "msg_1", timestamp: old, signature: `v1,${oldSig}` }, body)).ok).toBe(false);
  });

  it("normalises a received email and pulls the token from the delivered-to address", () => {
    const email: ResendReceivedEmail = {
      id: "em_1",
      from: "Sarah Mitchell <sarah@example.com>",
      to: ["reply+abcdefghijklmnopqrstuvwxyz012345@reply.closeloop.app"],
      received_for: ["reply+abcdefghijklmnopqrstuvwxyz012345@reply.closeloop.app"],
      subject: "Re: Quick follow-up on your estimate",
      text: "Yes, let's go ahead.\n\nOn Tue, ABC Painting wrote:\n> Hi Sarah",
      html: null,
      headers: { "Message-ID": "<c1@mail.example.com>", "In-Reply-To": "<1@mail.closeloop.app>", References: "<1@mail.closeloop.app>" },
      message_id: "c1@mail.example.com",
      created_at: "2026-09-16T10:00:00Z",
    };
    const input = fromResendReceived(email, "reply.closeloop.app");
    expect(input.replyToken).toBe("abcdefghijklmnopqrstuvwxyz012345");
    expect(input.fromEmail).toBe("sarah@example.com");
    expect(input.fromName).toBe("Sarah Mitchell");
    expect(input.inReplyTo).toBe("<1@mail.closeloop.app>");
    expect(input.messageId).toBe("<c1@mail.example.com>");
    expect(input.receivedAt).toBe("2026-09-16T10:00:00.000Z");
  });
});

describe("scheduler vs reply race", () => {
  it("a reply that lands after the claim but before the send cancels the send", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const day2 = addDays(TODAY, 2);
    const provider = new FakeProvider();

    // Repository whose second `load` (the post-claim re-read) sees the reply arriving.
    class RacyRepo extends InMemoryWorkspaceRepository {
      loads = 0;
      async load(): Promise<WorkspaceData> {
        this.loads += 1;
        if (this.loads === 2) {
          const current = await super.load();
          await this.save(markReplied(current, quoteId, cloudCtx(day2)), current);
        }
        return super.load();
      }
    }
    const repo = new RacyRepo(data);
    const report = await runFollowUpSweep({ repository: repo, provider, contextFor: () => cloudCtx(day2) });
    expect(provider.sent).toHaveLength(0);
    expect(report.skipped).toBe(1);
    const after = await repo.load();
    expect(quoteOf(after, quoteId).status).toBe("replied");
    expect(followUpsOf(after, quoteId).every((f) => f.status === "cancelled")).toBe(true);
    // Nothing is ever selectable again.
    expect(selectDueFollowUps(after, cloudCtx(addDays(TODAY, 30)))).toHaveLength(0);
  });

  it("demo quotes are never handed to a real provider", async () => {
    const demo = addQuote(empty, sampleInput(), ctxOn(TODAY), { isDemo: true });
    const provider = new FakeProvider();
    const report = await runFollowUpSweep({ repository: new InMemoryWorkspaceRepository(demo.data), provider, contextFor: () => cloudCtx(addDays(TODAY, 2)), skipDemoQuotes: true });
    expect(provider.sent).toHaveLength(0);
    expect(report.attempted).toBe(0);
  });

  it("records recipient, provider id and message id on the sent follow-up", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const provider = new FakeProvider();
    const repo = new InMemoryWorkspaceRepository(data);
    await runFollowUpSweep({ repository: repo, provider, contextFor: () => cloudCtx(addDays(TODAY, 2)) });
    const sent = followUpsOf(await repo.load(), quoteId)[0];
    expect(sent.status).toBe("sent");
    expect(sent.recipientEmail).toBe("sarah@example.com");
    expect(sent.providerMessageId).toBe("p_1");
    expect(sent.messageId).toBe("<1@mail.closeloop.app>");
    expect(sent.sentAt).not.toBeNull();
    expect(provider.sent[0].replyTo).toContain("@reply.closeloop.app");
  });
});

describe("server-side guards", () => {
  it("rejects change sets that reference another business", () => {
    const ok = validateChangeSet({ upserts: { quotes: [{ id: "q1", businessId: "biz_1" }] }, deletes: { quotes: ["q2"] } }, "biz_1");
    expect(ok.ok).toBe(true);
    const bad = validateChangeSet({ upserts: { customers: [{ id: "c1", businessId: "biz_2" }] } }, "biz_1");
    expect(bad.ok).toBe(false);
    expect(validateChangeSet("nope", "biz_1").ok).toBe(false);
    expect(validateChangeSet({ upserts: { quotes: [{ name: "no id" }] } }, "biz_1").ok).toBe(false);
    expect(validateChangeSet({ deletes: { quotes: [1, 2] } }, "biz_1").ok).toBe(false);
  });

  it("validates onboarding input for business creation", () => {
    expect(validateOnboarding({ businessName: "", ownerName: "Mike", email: "mike@x.com" }).businessName).toBeTruthy();
    expect(validateOnboarding({ businessName: "ABC", ownerName: "Mike", email: "nope" }).email).toBeTruthy();
    expect(validateOnboarding({ businessName: "ABC", ownerName: "Mike", email: "mike@abc.com" })).toEqual({});
  });

  it("maps database rows back into domain objects", () => {
    const ws = rowsToWorkspace({
      customers: [{ id: "c1", business_id: "b1", name: "Sarah", email: "s@x.com", phone: null, created_at: "2026-09-14T00:00:00Z" }],
      quotes: [{ id: "q1", business_id: "b1", customer_id: "c1", quote_number: "EST-1", service_description: "Paint", amount: "2850.00", sent_at: "2026-09-14", notes: "", status: "follow_up_scheduled", schedule: [2, 5, 10], tone: "friendly", follow_ups_sent: 0, last_follow_up_sent_on: null, email_thread_id: null, reply_token: "t".repeat(32), replied_at: null, won_at: null, lost_at: null, paused_at: null, is_demo: false, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z" }],
      followUps: [{ id: "f1", quote_id: "q1", business_id: "b1", sequence_number: 1, scheduled_for: "2026-09-16", status: "scheduled", sent_at: null, subject: null, body: null, recipient_email: null, idempotency_key: "k", attempts: 0, claimed_at: null, next_attempt_at: null, last_error: null, provider_message_id: null, message_id: null }],
      timeline: [],
      inbound: [],
    });
    expect(ws.quotes[0].amount).toBe(2850);
    expect(ws.quotes[0].schedule).toEqual([2, 5, 10]);
    expect(ws.quotes[0].sentAt).toBe("2026-09-14");
    expect(ws.followUps[0].scheduledFor).toBe("2026-09-16");
    expect(ws.customers[0].createdAt).toBe("2026-09-14T00:00:00.000Z");
    expect(selectDueFollowUps(ws, createContext({ ...account.business, id: "b1" }, account.settings, "2026-09-16"))).toHaveLength(1);
  });

  it("renders plain HTML without markup injection", () => {
    const html = renderEmailHtml("Hi <b>Sarah</b>,\n\nSee you & thanks.");
    expect(html).toContain("Hi &lt;b&gt;Sarah&lt;/b&gt;,");
    expect(html).toContain("See you &amp; thanks.");
    expect(html).not.toContain("<img");
  });
});

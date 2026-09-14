import { describe, expect, it } from "vitest";
import { runAutomation } from "@/lib/domain/automation";
import { extractReplyText, matchInboundEmail, recordInboundEmail } from "@/lib/domain/replies";
import { markWon } from "@/lib/domain/status";
import { addDays } from "@/lib/utils/date";
import { ctxOn, followUpsOf, quoteOf, runDaily, seedQuote, TODAY } from "./helpers";

describe("reply detection", () => {
  it("matches a reply by In-Reply-To and stops the sequence", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const sent = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    const messageId = followUpsOf(sent.data, quoteId)[0].messageId as string;
    const result = recordInboundEmail(
      sent.data,
      { source: "provider_webhook", fromEmail: "someone-else@example.com", inReplyTo: messageId, text: "Yes let's do it!\n\nOn Tue, Mike wrote:\n> Just wanted to follow up" },
      ctxOn(addDays(TODAY, 3)),
    );
    expect(result.match).toEqual({ quoteId, reason: "in_reply_to" });
    expect(result.stoppedSequence).toBe(true);
    expect(quoteOf(result.data, quoteId).status).toBe("replied");
    expect(result.inbound.snippet).toBe("Yes let's do it!");
    expect(runDaily(result.data, addDays(TODAY, 3), addDays(TODAY, 30)).firedTotal).toBe(0);
    expect(result.data.timeline.some((e) => e.type === "replied" && e.description?.includes("Yes let's do it!"))).toBe(true);
  });

  it("matches by thread id when headers are missing", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const sent = runAutomation(data, ctxOn(addDays(TODAY, 2)));
    const threadId = quoteOf(sent.data, quoteId).emailThreadId as string;
    const match = matchInboundEmail(sent.data, { source: "gmail", fromEmail: "x@y.com", threadId }, "biz_1");
    expect(match).toEqual({ quoteId, reason: "thread" });
  });

  it("falls back to the sender's most recent open quote", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const match = matchInboundEmail(data, { source: "manual", fromEmail: "SARAH@example.com", subject: "Re: estimate" }, "biz_1");
    expect(match).toEqual({ quoteId, reason: "sender" });
  });

  it("does not match unknown senders and records the email for review", () => {
    const { data } = seedQuote(TODAY);
    const result = recordInboundEmail(data, { source: "provider_webhook", fromEmail: "stranger@example.com", messageId: "<abc@x>" }, ctxOn(TODAY));
    expect(result.match.quoteId).toBeNull();
    expect(result.data.inbound).toHaveLength(1);
    expect(result.stoppedSequence).toBe(false);
  });

  it("is idempotent on Message-ID so a webhook delivered twice records once", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const input = { source: "provider_webhook" as const, fromEmail: "sarah@example.com", messageId: "abc@customer" };
    const first = recordInboundEmail(data, input, ctxOn(TODAY));
    const second = recordInboundEmail(first.data, input, ctxOn(TODAY));
    expect(second.data.inbound).toHaveLength(1);
    expect(second.data.timeline.filter((e) => e.type === "replied" && e.quoteId === quoteId)).toHaveLength(1);
  });

  it("does not reopen a won quote when a later email arrives, but notes it on the timeline", () => {
    const { data, quoteId } = seedQuote(TODAY);
    const won = markWon(data, quoteId, ctxOn(TODAY));
    const result = recordInboundEmail(won, { source: "manual", fromEmail: "sarah@example.com", text: "Thanks again!" }, ctxOn(addDays(TODAY, 1)));
    expect(result.match.quoteId).toBeNull(); // won quotes are not "open" for sender matching
    expect(quoteOf(result.data, quoteId).status).toBe("won");
  });

  it("strips quoted history and signatures from reply text", () => {
    expect(extractReplyText("Sounds good.\n> quoted\n> more\nOn Mon, X wrote:\n> old")).toBe("Sounds good.");
    expect(extractReplyText("Ok\n-- \nMike\nABC")).toBe("Ok");
    expect(extractReplyText("   ")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/types";
import { runFollowUpSweep } from "@/lib/jobs/sweep";
import { InMemoryWorkspaceRepository, diffWorkspace, applyChangeSet, isEmptyChangeSet } from "@/lib/persistence/repository";
import type { EmailProvider, SendResult } from "@/lib/email/provider";
import { addDays } from "@/lib/utils/date";
import { ctxOn, followUpsOf, quoteOf, seedQuote, TODAY } from "./helpers";
import { markReplied } from "@/lib/domain/status";

class FakeProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];
  failNext = 0;
  async send(message: EmailMessage): Promise<SendResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return { ok: false, providerMessageId: null, messageId: null, threadId: null, error: "503 from provider", retryable: true };
    }
    this.sent.push(message);
    return { ok: true, providerMessageId: `p_${this.sent.length}`, messageId: `<${this.sent.length}@test>`, threadId: message.threadId ?? "t1" };
  }
}

function deps(repo: InMemoryWorkspaceRepository, provider: FakeProvider, day: string) {
  return { repository: repo, provider, contextFor: () => ctxOn(day) };
}

describe("follow-up sweep (production job)", () => {
  it("sends due follow-ups with the idempotency key and records delivery", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const repo = new InMemoryWorkspaceRepository(data);
    const provider = new FakeProvider();
    const report = await runFollowUpSweep(deps(repo, provider, addDays(TODAY, 2)));
    expect(report).toMatchObject({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
    expect(provider.sent[0].idempotencyKey).toBe(followUpsOf(data, quoteId)[0].idempotencyKey);
    expect(provider.sent[0].fromAddress).toBe("followup@closeloop.local");
    const after = await repo.load();
    expect(followUpsOf(after, quoteId)[0].status).toBe("sent");
    expect(followUpsOf(after, quoteId)[0].providerMessageId).toBe("p_1");
    expect(quoteOf(after, quoteId).followUpsSent).toBe(1);
  });

  it("running the sweep twice (or concurrently) never sends twice", async () => {
    const { data } = seedQuote(TODAY);
    const repo = new InMemoryWorkspaceRepository(data);
    const provider = new FakeProvider();
    const day2 = addDays(TODAY, 2);
    await Promise.all([runFollowUpSweep(deps(repo, provider, day2)), runFollowUpSweep(deps(repo, provider, day2))]);
    await runFollowUpSweep(deps(repo, provider, day2));
    expect(provider.sent).toHaveLength(1);
  });

  it("retries a transient provider failure on a later sweep", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const repo = new InMemoryWorkspaceRepository(data);
    const provider = new FakeProvider();
    provider.failNext = 1;
    const day2 = addDays(TODAY, 2);
    const first = await runFollowUpSweep(deps(repo, provider, day2));
    expect(first.failed).toBe(1);
    expect(followUpsOf(await repo.load(), quoteId)[0].status).toBe("scheduled");
    // Immediately after: still in backoff, nothing sent.
    const second = await runFollowUpSweep(deps(repo, provider, day2));
    expect(second.attempted).toBe(0);
    // Ten minutes later the retry goes out.
    const later = { ...ctxOn(day2), now: new Date(new Date(ctxOn(day2).now).getTime() + 10 * 60_000).toISOString() };
    const third = await runFollowUpSweep({ ...deps(repo, provider, day2), contextFor: () => later });
    expect(third.sent).toBe(1);
    expect(provider.sent).toHaveLength(1);
  });

  it("skips quotes that were stopped between sweeps", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const repo = new InMemoryWorkspaceRepository(data);
    const provider = new FakeProvider();
    const stopped = markReplied(await repo.load(), quoteId, ctxOn(addDays(TODAY, 1)));
    await repo.save(stopped, data);
    const report = await runFollowUpSweep(deps(repo, provider, addDays(TODAY, 2)));
    expect(report.attempted).toBe(0);
    expect(provider.sent).toHaveLength(0);
  });
});

describe("workspace change sets", () => {
  it("produces row-level upserts and deletes and applies them back", async () => {
    const { data, quoteId } = seedQuote(TODAY);
    const ctx = ctxOn(addDays(TODAY, 2));
    const repo = new InMemoryWorkspaceRepository(data);
    const provider = new FakeProvider();
    await runFollowUpSweep(deps(repo, provider, ctx.today));
    const after = await repo.load();
    const changes = diffWorkspace(data, after);
    expect(changes.upserts.followUps.map((f) => f.status)).toEqual(["sent"]);
    expect(changes.upserts.quotes.map((q) => q.id)).toEqual([quoteId]);
    expect(changes.upserts.timeline).toHaveLength(1);
    expect(changes.upserts.customers).toHaveLength(0);
    expect(changes.deletes.followUps).toHaveLength(0);
    expect(applyChangeSet(data, changes)).toEqual(after);
    expect(isEmptyChangeSet(diffWorkspace(after, after))).toBe(true);
  });
});

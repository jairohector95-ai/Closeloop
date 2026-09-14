import type { WorkspaceData } from "../types";
import type { DomainContext } from "../domain/context";
import { buildOutboundMessage, claimFollowUp, recordDelivery, recordFailure, selectDueFollowUps } from "../domain/automation";
import { defaultEmailGenerator, type EmailGenerator } from "../email/generator";
import type { EmailProvider } from "../email/provider";
import type { WorkspaceRepository } from "../persistence/repository";

/**
 * The production follow-up job. Called on a schedule (see scheduler.ts) or by
 * an authenticated POST to /api/jobs/sweep. Safe to run concurrently.
 *
 * For each business:
 *   load workspace → select due → for each: claim (atomic) → send → record.
 */

export interface SweepDeps {
  repository: WorkspaceRepository;
  provider: EmailProvider;
  generator?: EmailGenerator;
  /** Sender address for the provider (Phase A: a CloseLoop-verified domain). */
  from: string;
  /** Builds the context for a business; production reads business + settings from the DB. */
  contextFor: (data: WorkspaceData) => DomainContext;
}

export interface SweepReport {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function runFollowUpSweep(deps: SweepDeps): Promise<SweepReport> {
  const generator = deps.generator ?? defaultEmailGenerator;
  const report: SweepReport = { attempted: 0, sent: 0, failed: 0, skipped: 0, errors: [] };

  const data = await deps.repository.load();
  const ctx = deps.contextFor(data);

  for (const due of selectDueFollowUps(data, ctx)) {
    report.attempted += 1;

    // Atomic claim: only one worker wins. In Postgres this is
    // UPDATE follow_ups SET status='sending', claimed_at=now() WHERE id=$1 AND status='scheduled'.
    const claimed = await deps.repository.tryClaimFollowUp(due.followUp.id, ctx);
    if (!claimed) {
      report.skipped += 1;
      continue;
    }

    const current = await deps.repository.load();
    const followUp = current.followUps.find((f) => f.id === due.followUp.id);
    if (!followUp) {
      report.skipped += 1;
      continue;
    }

    const message = buildOutboundMessage(current, due.quote, due.customer, followUp, ctx, generator);
    const result = await deps.provider.send(message, { from: deps.from });

    if (result.ok) {
      const next = recordDelivery(
        current,
        followUp.id,
        { providerMessageId: result.providerMessageId, messageId: result.messageId, threadId: result.threadId, subject: message.subject, body: message.body },
        ctx,
      );
      await deps.repository.save(next, current);
      report.sent += 1;
    } else {
      const next = recordFailure(current, followUp.id, result.error ?? "Unknown provider error", ctx);
      await deps.repository.save(next, current);
      report.failed += 1;
      report.errors.push(`${followUp.id}: ${result.error ?? "unknown"}`);
    }
  }

  return report;
}

/** Re-exported so a cron entrypoint can claim in memory when the repository has no atomic claim (tests). */
export { claimFollowUp };

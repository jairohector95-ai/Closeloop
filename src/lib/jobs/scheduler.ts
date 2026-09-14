/**
 * Background job boundary.
 *
 * CloseLoop deliberately does NOT schedule one job per follow-up. Instead a
 * single recurring "sweep" (every 15 minutes in production) asks the domain
 * engine what is due and delivers it. That makes cancellation trivial (the
 * engine simply no longer returns the follow-up) and makes the whole system
 * idempotent: running the sweep twice, or two sweeps at once, can never send
 * the same email twice because each follow-up must be claimed first.
 *
 * `JobScheduler` is what the hosting platform provides. Phase 4 picks one of:
 *   - Vercel Cron / Supabase pg_cron hitting POST /api/jobs/sweep   (simplest)
 *   - Inngest or Trigger.dev cron function calling runFollowUpSweep (adds retries + dashboard)
 */

export interface JobScheduler {
  readonly name: string;
  /** Registers a recurring job. `cron` is a standard 5-field expression. */
  every(cron: string, jobName: string): void;
  /** Runs a named job once, now (used by tests and the manual "Run automation" button). */
  runNow(jobName: string): Promise<void>;
}

export type JobHandler = () => Promise<void>;

/** In-process registry used in development and tests. */
export class InMemoryJobScheduler implements JobScheduler {
  readonly name = "memory";
  readonly registered: Array<{ cron: string; jobName: string }> = [];
  private readonly handlers = new Map<string, JobHandler>();

  register(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  every(cron: string, jobName: string): void {
    this.registered.push({ cron, jobName });
  }

  async runNow(jobName: string): Promise<void> {
    const handler = this.handlers.get(jobName);
    if (!handler) throw new Error(`No handler registered for job "${jobName}"`);
    await handler();
  }
}

export const JOB_NAMES = {
  followUpSweep: "follow-up-sweep",
  mailboxReplySync: "mailbox-reply-sync",
  mailboxWatchRenewal: "mailbox-watch-renewal",
} as const;

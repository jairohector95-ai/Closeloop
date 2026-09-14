# Current architecture (after the Phase 1 hardening pass)

_Date: 2026-09-14._ This describes the code as it is now: the Phase 1 local MVP plus the production-readiness work done in this pass.

## One-paragraph summary

CloseLoop is a Next.js 16 / TypeScript / Tailwind app. All business rules live in a pure, tested domain layer (`src/lib/domain`) that operates on an immutable `WorkspaceData` snapshot. The browser store (Zustand + localStorage) is the only persistence today. Email delivery, background jobs, mailbox connections and the database are behind interfaces with working in-memory or simulated implementations, plus real adapters for Resend, Postmark, Gmail and Microsoft Graph that are written but not yet exercised against live accounts.

## What is implemented and real

| Area | Where | Status |
| --- | --- | --- |
| Marketing site, onboarding, dashboard, quote pipeline, add/edit/detail, settings, admin | `src/app/**`, `src/components/**` | Complete, responsive, verified in a browser |
| Data model | `src/lib/types.ts` | Complete: User, Business, Settings, Subscription, Customer, Quote, FollowUp, TimelineEvent, InboundEmail, MailboxConnection |
| Quote lifecycle | `src/lib/domain/quotes.ts` | Add / update (rebuilds only unsent follow-ups) / delete; customer dedupe by email |
| Status transitions | `src/lib/domain/status.ts` | replied / won / lost / pause / resume (shifts overdue follow-ups, preserves spacing) / reopen; every stop cancels pending follow-ups |
| Follow-up engine | `src/lib/domain/automation.ts` | `selectDueFollowUps` → `claimFollowUp` → `recordDelivery` / `recordFailure`; retries with backoff, stale-claim recovery, `retryFollowUp`; `runAutomation` is the synchronous simulator built from the same pieces |
| Reply detection | `src/lib/domain/replies.ts` | Matches by In-Reply-To/References → thread id → sender's open quote; idempotent on Message-ID; stops the sequence; strips quoted text |
| Email templates | `src/lib/email/templates.ts` | Three tones × first/middle/last, tested |
| Production sweep job | `src/lib/jobs/sweep.ts` | `runFollowUpSweep(repository, provider)`; safe to run twice or concurrently (tested) |
| Repository seam | `src/lib/persistence/repository.ts` | `WorkspaceRepository` with `load / save(diff) / tryClaimFollowUp`; `diffWorkspace` turns snapshots into row-level upserts/deletes; in-memory implementation |
| Provider adapters | `src/lib/email/provider.ts` | Simulated (default), Resend, Postmark — REST via `fetch`, idempotency key, threading headers, retryable-error classification; selection from env in `src/lib/config/env.ts` |
| Inbound normalizers | `src/lib/integrations/inbound.ts` | Postmark and Resend inbound webhook payloads → common `InboundEmailInput` |
| Mailbox integration scaffolding | `src/lib/integrations/mailbox/*` | `MailboxProvider` interface; OAuth URL / token / refresh builders with PKCE and minimal scopes; MIME builder; Gmail and Graph adapters (send, incremental reply sync, watch/subscription) |
| Database schema | `supabase/migrations/0001_init.sql` | Full Postgres schema with RLS, the atomic `claim_follow_up()` function, encrypted-credential table |
| Tests | `src/tests/*.test.ts` | 51 tests: engine, statuses, resume, dedupe, retries, sweep concurrency, reply matching, providers, OAuth helpers, MIME, change sets, demo data, metrics |

## What is mocked or simulated

| Thing | How it is simulated today | Becomes real in |
| --- | --- | --- |
| Sending email | `SimulatedEmailProvider` records the message; the UI shows exactly what would have been sent | Phase 3 (set `EMAIL_PROVIDER=resend` + key) |
| Time | A simulated calendar on the dashboard ("Simulate next day", "Skip a week") runs the engine day by day | Phase 4 (cron runs the sweep every 15 minutes) |
| Reply detection | "Mark as replied" button; `logReply` store action exists for manual entry | Phase 5a (inbound webhook) and 5b/5c (mailbox sync) |
| Persistence | localStorage in the browser (one account per browser) | Phase 2 (Supabase repository implementing `WorkspaceRepository`) |
| Authentication | `AppGate` checks for a local account | Phase 2 (Supabase Auth) |
| Billing | Trial subscription record, "Coming in Phase 2" UI | Phase 6 (Stripe) |
| Admin metrics | Local demo accounts | Phase 2+ (real tables) |
| Gmail / Outlook | Adapters written against documented REST endpoints, unit-tested for request shape only | Phase 5b/5c (needs Google Cloud + Entra app registrations and verification) |

## What must become production-ready (and is not yet)

1. **A database-backed `WorkspaceRepository`.** The interface, diffing and the SQL schema exist; the Supabase implementation does not. The `tryClaimFollowUp` method must call the `claim_follow_up()` SQL function.
2. **API routes**: `POST /api/jobs/sweep` (cron target, bearer `JOBS_SECRET`), `POST /api/webhooks/inbound/{postmark|resend}`, and later `/api/mailbox/{gmail|outlook}/{connect,callback,notify}`. Deliberately not added yet because they would be dead code without the repository.
3. **Server-side config**: `.env.example` documents every variable; nothing reads secrets on the client.
4. **Multi-business sweep**: `runFollowUpSweep` processes one workspace per call; the cron route will iterate businesses with active quotes.
5. **Token encryption** for mailbox credentials (application-level AES-GCM or Supabase Vault) before Phase 5b.

## What we deliberately did not replace with open source

- The follow-up engine (a few hundred lines, fully tested) instead of Dittofeed/Novu/Temporal: less to operate, same guarantees.
- Direct REST calls instead of vendor SDKs (Resend, Postmark, Gmail, Graph): smaller bundle, no dependency churn, easy to test with a fake `fetch`.
- A cron "ticker" + database claim instead of a queue with one job per follow-up: cancellation is a status change, and duplicates are impossible by construction.

## Data flow (target and current share the same shape)

```
UI action  ─▶ store action ─▶ domain function (pure) ─▶ new WorkspaceData ─▶ repository.save(diff)
                                                                              │
cron ─▶ runFollowUpSweep ─▶ selectDue ─▶ tryClaim (atomic) ─▶ provider.send ─▶ recordDelivery/Failure
                                                                              │
webhook / mailbox sync ─▶ InboundEmailInput ─▶ recordInboundEmail ─▶ markReplied (stops sequence)
```

Today the "repository" is the browser store; in Phase 2 it becomes Postgres and nothing above the domain layer changes.

## Folder map

```
src/lib/
  types.ts, constants.ts, validation.ts, metrics.ts
  domain/        context, quotes, status, automation, replies
  email/         templates, generator (EmailGenerator), provider (EmailProvider + adapters)
  jobs/          scheduler (JobScheduler), sweep (runFollowUpSweep)
  persistence/   adapter (localStorage), repository (WorkspaceRepository, diffWorkspace)
  integrations/  inbound (webhook normalizers), mailbox/ (types, oauth, mime, gmail, outlook)
  config/        env (ServerConfig)
  store/         useAppStore (Zustand, persisted, versioned migration)
  demo/          seed (replays the engine), services
supabase/migrations/0001_init.sql
docs/            this file, open-source-audit.md, production-roadmap.md
```

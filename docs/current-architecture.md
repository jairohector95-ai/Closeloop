# Current architecture (after Phase 2)

_Date: 2026-09-14._ This describes the code as it is now: the local MVP plus the Phase 2 cloud stack (Supabase auth + database, Resend outbound and inbound, scheduler).

## One-paragraph summary

CloseLoop is a Next.js 16 / TypeScript / Tailwind app with two modes chosen at build time. In **local mode** (no Supabase configured) everything lives in the browser with simulated email. In **cloud mode** the same UI talks to Supabase (Postgres with row-level security, email/password auth), the follow-up scheduler runs server-side and sends through Resend, and customer replies come back through Resend Inbound to a signed webhook that stops the sequence. All business rules live in one pure, tested domain layer (`src/lib/domain`) operating on an immutable `WorkspaceData` snapshot; the browser store and the server share it.

## Cloud mode data flow

```
Browser (Zustand store) ── domain function ──▶ new snapshot ──▶ diffWorkspace ──▶ POST /api/workspace
                                                                                    └─▶ apply_workspace_changes() (one transaction, RLS, business forced)
Supabase Cron (15 min) ──▶ POST /api/jobs/sweep (bearer secret) ──▶ runSweepForAllDue
        └─▶ per business: load → selectDue → claim_follow_up() → re-read → Resend send (idempotency key) → recordDelivery
Customer replies ──▶ Resend Inbound ──▶ POST /api/webhooks/resend (Svix signature, delivery-id dedupe)
        └─▶ fetch email → reply token from To address → recordInboundEmail → markReplied + cancel → forward to contractor
```

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
| Cloud persistence | `src/lib/server/repository.ts`, `mappers.ts`, `changeset.ts`, `account.ts` | `SupabaseWorkspaceRepository` (load / apply change set / atomic claim), row mappers, server-side change-set validation |
| Authentication | `src/proxy.ts`, `src/app/(auth)/*`, `src/app/auth/*`, `src/lib/server/auth.ts` | Supabase email + password, confirmation, forgot/reset password, sign out, protected routes |
| API | `src/app/api/{workspace,account,jobs/sweep,jobs/run,webhooks/resend,admin/metrics}` | See data flow above |
| Reply routing | `src/lib/email/routing.ts`, `quotes.reply_token` | `reply+<32-char random token>@<reply domain>` as Reply-To; token → quote |
| Inbound | `src/lib/integrations/resend.ts`, `src/lib/server/inbound-handler.ts` | Svix verification, received-email normalisation, business resolution, reply forwarding |
| Database | `supabase/migrations/0001_init.sql`, `supabase/test/*` | Schema, RLS, `create_business`, `load_workspace`, `apply_workspace_changes`, `claim_follow_up`, webhook dedupe, sweep log; SQL tests via `npm run test:db` |
| Tests | `src/tests/*.test.ts` | 67 Vitest tests + SQL suite: engine, statuses, resume, dedupe, retries, sweep concurrency and reply race, reply-token/ambiguity matching, webhook verification, providers, change-set guards, mappers, demo data, metrics |

## What is still simulated or pending

| Thing | Status |
| --- | --- |
| Local mode (no Supabase) | Fully simulated by design: browser storage, simulated email and calendar. Kept as the demo experience. |
| Cloud mode without `RESEND_API_KEY` | Accounts, database and scheduler work; the sweep refuses to send and reports "Email sending is not configured" instead of pretending. |
| Live verification | Cloud mode has been exercised with placeholder settings (redirects, pages, unauthenticated API responses) and the SQL suite ran on real Postgres. A full end-to-end run (real sign-up → real email → real reply) needs the owner's Supabase and Resend accounts; see `docs/phase-2-setup.md`. |
| Billing | Trial subscription record only. Phase 6. |
| Gmail / Outlook | Adapters and OAuth helpers exist, unit-tested for request shape; not wired to any UI. Deferred by product decision. |
| Team accounts | One business per user (unique index). |
| Rate limiting, Sentry | See `docs/security.md`. |

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

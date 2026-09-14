# Production roadmap

_Date: 2026-09-14. Companion to `docs/open-source-audit.md` (what we may reuse) and `docs/current-architecture.md` (what exists)._

## 1. Build vs. reuse decisions

| Subsystem | Decision | Choice | Why |
| --- | --- | --- | --- |
| Authentication | USE MANAGED PROVIDER | Supabase Auth (magic link + Google sign-in) | Comes with the database, MIT/Apache SDKs, no password handling for us. Sign-in with Google is *not* the same as connecting Gmail and needs no restricted scopes. |
| Database | USE MANAGED PROVIDER | Supabase Postgres | Row Level Security keeps each business's data isolated; schema is already written. |
| Quote management | BUILD OURSELVES | `src/lib/domain/quotes.ts` (done) | It is the product. Tiny, tested. |
| Follow-up scheduling | BUILD OURSELVES | `src/lib/domain/automation.ts` (done) | ~300 lines with claim/retry semantics. Dittofeed/Novu/Temporal would add services for no extra guarantee. |
| Background jobs | USE MANAGED PROVIDER (ticker) + BUILD (loop) | Supabase Cron (`pg_cron` + `pg_net`) or Vercel Cron calling `POST /api/jobs/sweep` every 15 min; `runFollowUpSweep` (done) | Database is the source of truth; cron just says "check now". Optional upgrade: Inngest (Apache SDK) for retries dashboard. |
| Email generation | BUILD OURSELVES | Template engine (done); `EmailGenerator` interface for an OpenAI generator later | Plain-text, human-sounding emails matter more than templates infrastructure. |
| Outbound email delivery | USE MANAGED PROVIDER | Resend (Postmark adapter ready as alternative) | Idempotency keys, custom Message-ID/threading headers, inbound receiving, free tier for launch. |
| Inbound email / reply detection | BUILD OURSELVES on provider webhooks | `recordInboundEmail` (done) + Resend/Postmark inbound webhooks; later Gmail/Graph sync | One matching function serves every channel. |
| Gmail integration | BUILD OURSELVES (REST) | `GmailMailboxProvider` (written, untested live) | SDKs add weight; the four endpoints we need are simple. Gate: Google verification + CASA. |
| Microsoft Outlook integration | BUILD OURSELVES (REST) | `OutlookMailboxProvider` (written, untested live) | Same reasoning; Graph needs `Mail.Send` + `Mail.ReadBasic` (+`Mail.Read` if webhooks). |
| Workflow engine | BUILD OURSELVES (none) | The follow-up engine *is* the workflow | We have one workflow. A generic engine is feature creep. |
| Contact management | BUILD OURSELVES (minimal) | `Customer` table | Name, email, phone. No CRM. |
| Billing | USE MANAGED PROVIDER | Stripe Checkout + Customer Portal + webhooks | Never store cards. `Subscription` model already carries Stripe ids. |
| Analytics | USE MANAGED PROVIDER | PostHog (MIT SDK, free tier) or Vercel Analytics | Product events: quote added, follow-up sent, replied, won. |
| Logging | USE MANAGED PROVIDER | Vercel logs + Sentry (MIT SDK) | Errors in the sweep and webhooks must page someone. |
| Admin dashboard | BUILD OURSELVES | `/admin` (done), later reads real tables with an `is_admin` claim | It is the owner's cockpit; keep it in-house. |
| Support automation | USE MANAGED PROVIDER later | Email-based support (shared inbox) first; Chatwoot (MIT) or a hosted helpdesk if volume warrants | Not before paying users exist. |

Explicitly rejected: Dittofeed as a service (three infra services, tenancy is enterprise-only), Mautic (GPL, PHP stack), Twenty (AGPL server, it's a CRM), n8n as an engine (license), Temporal/BullMQ/pg-boss/Graphile (need always-on workers).

## 2. Target architecture

```
                 ┌──────────────────────────────────────────────┐
  Contractor ───▶│  Next.js on Vercel  (UI + API routes)         │
                 │   • app pages (existing UI, unchanged)        │
                 │   • /api/jobs/sweep        ← cron (15 min)    │
                 │   • /api/webhooks/inbound  ← Resend/Postmark  │
                 │   • /api/webhooks/stripe   ← Stripe           │
                 │   • /api/mailbox/*         ← Gmail/Graph OAuth│
                 └───────┬───────────────┬───────────────────────┘
                         │               │
              ┌──────────▼─────┐   ┌─────▼──────────┐
              │ Supabase       │   │ Email provider │
              │ Postgres + RLS │   │ Resend         │
              │ Auth           │   │ (or Postmark)  │
              │ Cron (pg_cron) │   └────────────────┘
              └────────────────┘
```

The required workflow, mapped to code:

| Step | Implementation |
| --- | --- |
| Quote created | `addQuote` → `follow_ups` rows with `scheduled_for` and a unique `idempotency_key` |
| Follow-up schedule generated | same call; timeline events "Follow-up #n scheduled" |
| Background job checks due follow-ups | cron → `runFollowUpSweep` → `selectDueFollowUps` (`scheduled_for <= today`, quote active, one per quote per day, backoff respected) |
| Check whether quote is still active | inside `selectDueFollowUps` and again inside the atomic claim (`claim_follow_up()` only succeeds for `scheduled`/stale `sending`; the quote status is rechecked in `claimFollowUp`) |
| Send follow-up | `provider.send(message, { from })` with `Idempotency-Key`, `Message-ID`, `In-Reply-To`, `References` |
| Record delivery | `recordDelivery` stores subject/body/provider id/Message-ID, bumps `follow_ups_sent`, sets `last_follow_up_sent_on`, writes the timeline event |
| Wait | nothing runs until the next cron tick |
| Detect reply | webhook or mailbox sync → `recordInboundEmail` |
| STOP sequence | `markReplied` cancels every pending follow-up in the same transaction |

Never-send-again guarantees, each enforced in code and tests:

- **Replied / Won / Lost**: pending follow-ups are set to `cancelled`; the engine only ever selects `scheduled` or stale-`sending` rows on *active* quotes.
- **Paused**: status check in `selectDueFollowUps` and `claimFollowUp`; follow-ups stay `scheduled` for resume.
- **Final follow-up sent**: no more `scheduled` rows exist; quote flips to `awaiting_reply`.
- **Job runs twice / two jobs at once**: the claim is a conditional `UPDATE … WHERE status='scheduled'`; only one caller gets `true`. Tested in `sweep.test.ts` with concurrent runs.
- **Provider retried**: the same idempotency key is sent; Resend deduplicates server-side.
- **Same day, two ticks**: `last_follow_up_sent_on = today` blocks a second email to the same customer that day.
- **Worker crashed mid-send**: `sending` rows older than 15 minutes are reclaimable; the provider's idempotency key prevents a duplicate if the first send actually went out.

## 3. Email architecture (staged)

### Phase A — verified CloseLoop domain (first production version)

- Send from `Mike at ABC Painting <follow-ups@mail.closeloop.app>` with `Reply-To: mike@abcpainting.com`.
- Replies go straight to the contractor's inbox (Reply-To). To *detect* them we also route a copy: `Reply-To` becomes a per-quote address `reply+<quoteId>@in.closeloop.app` that the provider's inbound webhook posts to us, and our handler forwards the reply to the contractor. Trade-off: the customer sees a CloseLoop address in Reply-To. Alternative that avoids forwarding: keep Reply-To as the contractor and ask them to click "Mark as replied" (what Phase 1 does today). We ship the per-quote reply address as the default because "stop automatically" is the product promise.
- Requirements: one domain we own with SPF/DKIM/DMARC set up in Resend; inbound receiving enabled. Cost: $0 at launch volumes.
- Deliverability is ours to protect: plain text, low volume per customer, no tracking pixels, one-click "stop follow-ups" link for the customer.

### Phase B — Connect Gmail

- Emails come from the contractor's own Gmail; replies land in their normal inbox and thread naturally.
- Scopes: `gmail.send` (sensitive) + `gmail.metadata` (restricted; headers only, no bodies). Any reply-detection scope on Gmail is restricted, so this step requires **Google OAuth verification plus an annual CASA security assessment** (assessors quote roughly $500–$2,000/yr for Tier 2; 2–6 weeks). Until verified, the app is limited to 100 test users and refresh tokens expire after 7 days.
- Mechanics (implemented in `gmail.ts`): send raw MIME with our `Message-ID`, `threadId` for follow-ups; `users.watch` → Pub/Sub → `history.list` incremental sync, renewed daily (expires ≤7 days); polling fallback via `history.list` every 15 minutes.
- Token handling: `access_type=offline&prompt=consent`, refresh on 401, `invalid_grant` ⇒ connection `needs_reauth` and follow-ups for that business fall back to Phase A sending (never silently stop).
- Cheaper alternative if the audit is unwanted: send-only via Gmail (`gmail.send`, no audit) and keep reply detection on the Phase A reply address.

### Phase C — Connect Microsoft Outlook

- Scopes: `Mail.Send` + `Mail.ReadBasic` + `offline_access` + `User.Read` (delegated, no security audit; Microsoft **publisher verification** required for a multi-tenant app). Webhook subscriptions may require `Mail.Read`; polling with delta queries works with `ReadBasic`.
- Mechanics (implemented in `outlook.ts`): create draft with our `internetMessageId` → send (so we know `conversationId`), delta sync of Inbox, change-notification subscription renewed every ~3 days.
- Watch out: some tenants require admin consent for Mail permissions; surface a clear "ask your IT admin" message.

Ordering rationale: A gives every customer the core promise on day one with zero per-user setup. B is the most requested but carries an audit cost and timeline; C is cheaper to certify. Nylas would collapse B and C into one API but costs ~$15/mo plus per-mailbox fees and still needs Google verification unless we buy their shared-app add-on.

## 4. Background jobs (decision)

**Chosen: database-as-truth + cron ticker.**

- `follow_ups` holds every future send; the sweep claims atomically via `claim_follow_up()` and marks `sent`/`failed` with attempt counts and backoff (already implemented and tested in memory).
- Ticker: Supabase Cron (`pg_cron` calling `net.http_post` to `/api/jobs/sweep` with the `JOBS_SECRET`) every 15 minutes. Vercel Cron is the equivalent if we prefer to keep everything in Vercel (Pro plan needed for sub-daily schedules).
- Cancel = status change (no queue to reach into). Retries = `next_attempt_at` backoff. Audit trail = `timeline_events` + `follow_ups.last_error`. Observability = the sweep returns a report that we log and alert on (Sentry) when `failed > 0`.
- Upgrade path if needed: Inngest (Apache-2.0 SDK) can host the same `runFollowUpSweep` as a cron function with its dashboard, or fan out per business.

## 5. Dittofeed decision

**D/C — do not use; inspiration only.** Its keyed-event journeys would model our sequence, but self-hosting requires Postgres + ClickHouse + Temporal, the multi-tenant/embedded features CloseLoop would need are enterprise-only, and activity slowed in 2026. Our engine gives the same "wait unless replied" guarantee in a few hundred tested lines. The full analysis is in the audit document.

## 6. Phases

### Phase 1 — Current local MVP (done)
- **Goal**: experience the product locally; business logic proven.
- **Delivered**: everything in `docs/current-architecture.md`.
- **Verification**: 51 tests, clean build, browser walkthrough.

### Phase 2 — Real database and authentication
- **Goal**: many contractors, each with their own private data, on any device.
- **Tasks**: create Supabase project; apply `supabase/migrations/0001_init.sql`; implement `SupabaseWorkspaceRepository` (`load`, `save` via `diffWorkspace` upserts in one RPC/transaction, `tryClaimFollowUp` via `claim_follow_up()`); Supabase Auth with magic link (+ Google sign-in); replace `AppGate` with a session check; onboarding writes `businesses/settings/subscriptions`; move `useAppStore` reads to server data (React Query or server components) while keeping the domain functions; migrate demo-data loader to server side; `/admin` gated by an `is_admin` claim.
- **Dependencies**: Supabase account (free tier), a deploy target (Vercel).
- **Complexity**: Medium-high (the biggest single change; touches every page's data loading).
- **Risks**: RLS mistakes leaking data (mitigate with policy tests); local-only users lose their browser data (offer "export/import JSON" before switching).
- **Done when**: two different accounts cannot see each other's quotes (automated test); a quote added on a phone appears on a laptop; all existing tests pass unchanged.

### Phase 3 — Real outbound email (Phase A of email plan)
- **Goal**: a real follow-up lands in a real inbox, from `follow-ups@mail.closeloop.app`, Reply-To the contractor.
- **Tasks**: buy domain, verify sending subdomain in Resend (SPF/DKIM/DMARC); set `EMAIL_PROVIDER=resend`; add `POST /api/jobs/sweep` calling `runFollowUpSweep` per business; add per-customer "stop follow-ups" link (sets quote to lost/paused); unsubscribe/complaint webhook handling; send-test button in Settings.
- **Dependencies**: Phase 2; domain purchase; Resend account.
- **Complexity**: Low-medium (adapters exist).
- **Risks**: deliverability (warm up slowly, plain text, real Reply-To); accidental sends to demo customers (demo quotes are `is_demo` and excluded from real sending).
- **Done when**: a follow-up sent by the sweep arrives in Gmail and Outlook test inboxes, threads correctly on the second follow-up, and a duplicate sweep run sends nothing extra (checked in provider logs).

### Phase 4 — Automated scheduling
- **Goal**: nobody clicks "Run automation"; it just happens.
- **Tasks**: Supabase Cron (or Vercel Cron) every 15 min → `/api/jobs/sweep`; `JOBS_SECRET` auth; Sentry alert on sweep errors; daily "yesterday's follow-ups" summary email to the contractor (optional); remove the simulated clock from production UI (keep in dev).
- **Dependencies**: Phase 3.
- **Complexity**: Low.
- **Risks**: cron silently stops (monitor "last sweep at" on `/admin`; alert if older than 1 hour).
- **Done when**: a quote added at 9:00 with a 2-day schedule sends at the first tick two days later without any manual action, visible on the timeline.

### Phase 5 — Reply detection
- **5a (with Phase 3/4)**: per-quote reply address routed through Resend inbound → `POST /api/webhooks/inbound/resend` → `recordInboundEmail`; forward the reply to the contractor; verify webhook signatures.
- **5b Gmail**: Google Cloud project, OAuth consent screen, verification + CASA; `/api/mailbox/gmail/{connect,callback,notify}`; encrypted token storage; Pub/Sub topic; watch renewal job; fall back to Phase A sending on `needs_reauth`.
- **5c Outlook**: Entra app registration (multi-tenant + personal), publisher verification; `/api/mailbox/outlook/{connect,callback,notify}`; subscription renewal job; delta polling fallback.
- **Dependencies**: Phase 4; for 5b a budget decision on the CASA assessment.
- **Complexity**: 5a low; 5b high (process more than code); 5c medium.
- **Risks**: over-requesting scopes hurts trust and verification; token revocation must never leave a customer's sequence silently dead (surface "Reconnect Gmail" banner and fall back to Phase A).
- **Done when**: a real customer reply to a real follow-up flips the quote to Replied within 15 minutes with no clicks, and the remaining follow-ups are cancelled.

### Phase 6 — Stripe billing
- **Goal**: trial → paid without the owner touching anything.
- **Tasks**: Stripe products for Starter/Pro (prices from `constants.ts`); Checkout session from Settings → Billing; Customer Portal for cancel/upgrade; webhooks (`checkout.session.completed`, `customer.subscription.updated/deleted`) update `subscriptions`; enforce active-follow-up limits per plan in `addQuote` (server side); trial-ending emails; dunning via Stripe.
- **Dependencies**: Phase 2; Stripe account, business entity.
- **Complexity**: Medium.
- **Risks**: webhook ordering; keep `subscriptions` the only source of truth and idempotent on Stripe event ids.
- **Done when**: test-mode card upgrades a trial to Starter and the limit changes immediately; cancellation downgrades at period end.

### Phase 7 — Self-service onboarding
- **Goal**: a contractor finds CloseLoop, signs up, and gets value in five minutes with no human involved.
- **Tasks**: landing → sign-up → onboarding (existing UI); welcome email sequence (Resend); in-app checklist ("add first quote", "send yourself a test", "connect mailbox"); empty-state guidance; account deletion + data export (privacy); terms/privacy pages; support email with auto-acknowledgement.
- **Dependencies**: Phases 2–6.
- **Complexity**: Medium.
- **Risks**: activation drop-off; measure with analytics events.
- **Done when**: 5 real trial users complete onboarding and add a quote without support tickets.

### Phase 8 — Acquisition / SEO automation
- **Goal**: steady inbound trial sign-ups.
- **Tasks**: programmatic SEO pages per trade ("follow-up emails for painters", "estimate follow-up template for roofers") generated from `BUSINESS_TYPES` and the template engine; free tools (follow-up email generator page using our templates); blog; Google Business/marketplace listings; referral link per account; weekly owner report email from `/admin` metrics.
- **Dependencies**: Phase 7.
- **Complexity**: Medium (content-heavy).
- **Risks**: thin content penalties; keep pages genuinely useful (real templates, real examples).
- **Done when**: organic sign-ups per week are tracked on `/admin` and trend upward for 8 weeks.

## 7. Immediate next milestone

**Phase 2**: create the Supabase project, apply the migration, implement `SupabaseWorkspaceRepository`, switch `AppGate` to Supabase Auth. Everything else in this document is unblocked by that step, and all of it can be built on the interfaces that already exist.

# Security notes (Phase 2)

_Reviewed 2026-09-14 against the Phase 2 code. Items marked ✅ are enforced in code or database; ⚠️ are known limits with a recommended follow-up._

## Tenant isolation (a user must never see another business's data)

- ✅ Every table carrying customer data has Row Level Security with policies based on `is_member(business_id)`; `auth.uid()` comes from the verified JWT, never from request input.
- ✅ Reads and writes from the browser go through `load_workspace` / `apply_workspace_changes` **as the signed-in user**, so RLS applies. `apply_workspace_changes` additionally forces every row onto the caller's business and raises on rows that point at another business's quote or customer.
- ✅ The browser-side change set is validated again in `src/lib/server/changeset.ts` (shape, ids, size, business id) before it reaches the database.
- ✅ Service-role usage is limited to two server-only paths, the scheduler and the inbound webhook, both of which resolve a single business id first and use a repository bound to it.
- ✅ Verified by `npm run test:db` (real Postgres): a second user sees zero rows of the first, cannot write into their business, cannot smuggle rows referencing their quotes, and direct updates affect nothing.
- ⚠️ One business per user for now (unique index). Team accounts are a later phase.

## Authentication and redirects

- ✅ Supabase Auth (email + password, email confirmation, password reset). Sessions are httpOnly cookies managed by `@supabase/ssr`; `proxy.ts` refreshes them and redirects signed-out visitors away from app pages.
- ✅ Every API route calls `supabase.auth.getUser()`, which validates the token with the auth server rather than trusting the cookie contents.
- ✅ `next` redirect parameters are only honoured when they are same-origin paths (`/…`, not `//…` or absolute URLs).
- ✅ Auth error messages are mapped to friendly text and do not reveal whether an email exists on password reset.
- ⚠️ Enable "Confirm email" and leave "Secure email change" on in the Supabase Auth settings (they are on by default). Consider enabling Supabase's built-in password-breach check and CAPTCHA once traffic warrants.

## Webhooks (Resend Inbound)

- ✅ Signature verified on the **raw body** with the Svix scheme (HMAC-SHA256 over `id.timestamp.body`, base64 secret after `whsec_`), constant-time comparison, multiple signatures supported.
- ✅ Replay protection: deliveries older than 5 minutes are rejected; every accepted delivery id is stored in `webhook_events` (unique), so a duplicate or replayed delivery is acknowledged and ignored. Ids are pruned after 30 days.
- ✅ Second layer of idempotency: `recordInboundEmail` ignores an email whose Message-ID was already recorded for that business.
- ✅ The webhook returns 200 for anything it does not need to retry (unmatched, duplicate, other event types) and 500 only for transient failures, so the provider's retries cannot amplify.
- ✅ Logs contain outcome and ids only, never subject or body.

## Reply routing tokens

- ✅ 24 random bytes from `crypto.getRandomValues` (192 bits), base64url (32 chars). Unique constraint in the database. Never sequential, never derived from ids.
- ✅ Token is only accepted from addresses on the configured reply domain, so a forwarded copy with a spoofed `reply+…@other.domain` cannot inject a match.
- ✅ Matching order: token → In-Reply-To/References → thread id → sender, and the sender fallback refuses when more than one open quote could match.
- ⚠️ A token appears in the Reply-To header of the customer's email; anyone with that email could mark the quote replied. This is by design (the customer replying is exactly the signal) and the worst case is a stopped sequence, which the owner can see and reverse.

## Scheduler

- ✅ `/api/jobs/sweep` requires `Authorization: Bearer JOBS_SECRET` (constant-time compare) and returns 503 if the secret is unset, so it can never run unauthenticated by accident.
- ✅ `claim_follow_up` is callable by the service role only, locks the parent quote row, re-checks the quote is active and that nothing was sent today, and flips exactly one row. Two workers cannot both win. Tested at the SQL level and in TypeScript.
- ✅ After claiming, the sweep re-reads the workspace; if the quote stopped in between, it releases the claim and sends nothing (tested in `phase2.test.ts`).
- ✅ Provider calls always carry the follow-up's idempotency key; Resend deduplicates on it, so even a crash after send + retry cannot double-deliver.
- ✅ Demo quotes (`is_demo`) are excluded from real sending in SQL (`businesses_with_due_follow_ups`) and in the sweep.
- ✅ Manual "Check now" is limited to the caller's own business and to one run per 30 seconds.
- ⚠️ Residual race: a reply that arrives during the ~1 s provider call itself cannot cancel that email. It is recorded as sent and the quote is still marked replied; no further email follows.

## Secrets and configuration

- ✅ Only `NEXT_PUBLIC_*` values reach the browser. Service key, Resend key, webhook secret and jobs secret are read server-side in `src/lib/config/env.ts`.
- ✅ `.env.example` documents every variable; `.env*` is git-ignored.
- ✅ No third-party OAuth tokens are stored in this phase (Gmail/Outlook deferred).

## Input handling

- ✅ All database access is through supabase-js parameterised calls and plpgsql functions; no string-built SQL.
- ✅ Email HTML is rendered from our own plain text with escaping; customer-supplied text is stored as text and never rendered as HTML.
- ✅ Amounts, dates, schedules and enums are validated client-side and constrained by database types/checks.

## Rate limiting (recommended next)

- ⚠️ Supabase Auth applies its own limits to sign-in/sign-up/reset. The app's own API routes rely on session auth; add a per-user rate limit (e.g. Vercel Firewall rules or an Upstash limiter) on `/api/workspace` POST and `/api/account` before opening sign-ups widely.
- ⚠️ The webhook endpoint is bounded by signature verification; a flood of unsigned requests costs only a hash each.

## Logging

- ✅ Sweep runs are recorded in `sweep_runs` with counts and error strings (no email bodies).
- ⚠️ Add Sentry (or similar) for the sweep and webhook routes before launch so failures page someone.

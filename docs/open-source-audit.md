# Open-source audit

_Date: 2026-09-14. Every license below was read from the project's actual LICENSE file or npm package metadata on that date; the URL is the file that was read. Nothing here is assumed from memory._

## How to read the classifications

| Classification | Meaning for CloseLoop |
| --- | --- |
| **SAFE FOR COMMERCIAL REUSE** | Permissive (MIT, Apache 2.0, BSD, ISC, PostgreSQL). We may copy, adapt and ship the code inside our proprietary app, keeping the copyright notice. |
| **SAFE WITH CONDITIONS** | Usable only in a specific way (e.g. as a separate unmodified service, or only the permissively licensed sub-packages). The condition is spelled out. |
| **NOT APPROPRIATE FOR OUR USE** | Copying the code into CloseLoop would oblige us to open-source CloseLoop, or the license forbids embedding in a paid product. |
| **UNCLEAR — REQUIRES REVIEW** | Something we could not verify. |

Copyleft summary that matters for a SaaS:

- **GPLv3** obligations trigger on *distribution*. Running GPL software on our own servers behind an API is not distribution. Copying GPL code into CloseLoop makes CloseLoop a derivative work and is not acceptable.
- **AGPLv3** adds section 13: if we *modify* the software and users interact with it over a network, we must publish the modified source. Running it unmodified as a black-box service imposes nothing. Copying AGPL code into CloseLoop is not acceptable.
- **SSPL** (Inngest's server) is like AGPL but stricter: offering the software itself as a service requires open-sourcing the whole service stack. Using the vendor's hosted cloud with their Apache-licensed SDK is unaffected.
- **Sustainable Use License** (n8n) is not open source. It permits internal business use only; embedding in a product sold to customers needs a commercial agreement.

## The three requested projects

### Dittofeed

| | |
| --- | --- |
| Repository | https://github.com/dittofeed/dittofeed |
| License | **MIT**, "Copyright (c) [2023] [Idea Market inc.]" — https://raw.githubusercontent.com/dittofeed/dittofeed/main/LICENSE. Sub-packages declare `"license": "LicenseRef-LICENSE"`, which resolves to that same root MIT file. The enterprise edition (multi-tenancy, embedding, white-label) ships only as closed Docker images and is **not** in the repository. |
| Classification | **SAFE FOR COMMERCIAL REUSE** (open-source core). EE features are not available to us. |
| What it does | Customer-engagement platform: user traits, events, segments, and "journeys" (delay / wait-for / message / split nodes) that send through SendGrid, Resend, Postmark, SES, SMTP, Mandrill, or a workspace member's Gmail. |
| What is useful to CloseLoop | (1) The journey model proves our exact pattern: enter on `quote_sent`, wait N days for a keyed `replied` event, on timeout send, on event exit. (2) Clean provider adapters in `packages/backend-lib/src/destinations/{resend,postmark,sendgrid,amazonses,smtp}.ts` and webhook normalisers (bounce/open/spam parsing). (3) `packages/backend-lib/src/gmail.ts` is a readable reference for OAuth send with encrypted per-user tokens. (4) `liquid.ts` template rendering. |
| Can we copy code? | **Yes** (MIT). Keep the copyright notice in copied files. Practical value is moderate: the adapters lean on the vendors' SDKs and `neverthrow`; our own fetch-based adapters (now in `src/lib/email/provider.ts`) are smaller. |
| Can we use it as a separate service? | Technically yes, but self-hosting needs **Postgres + ClickHouse + Temporal** (Kafka optional, ~4 GB RAM realistic), and per-customer isolation ("child workspaces", embedded API `/api-l/...`) is **enterprise-only**. Open-source Dittofeed is single-tenant: every CloseLoop customer would share one workspace and we would fake tenancy with user properties. |
| Recommended approach | **Inspiration only (option C).** Copy no code now. Our follow-up engine is ~300 lines of pure TypeScript with tests; Dittofeed would add three infrastructure services and a paid tier to get the same guarantee. Revisit only if CloseLoop grows into multi-channel campaigns. |
| Risks | Activity slowed sharply (last commit March 2026; stable release still v0.23.0). Multi-tenant features are paid. Operational weight far exceeds our needs. |

### Twenty

| | |
| --- | --- |
| Repository | https://github.com/twentyhq/twenty |
| License | Root: **AGPLv3** with two carve-outs — files marked `/* @license Enterprise */` are commercial, and specific packages are **MIT** (twenty-sdk, twenty-client-sdk, create-twenty-app, twenty-shared, twenty-ui, packages/twenty-apps). https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE. Verified: `packages/twenty-ui/LICENSE` and `packages/twenty-shared/LICENSE` are MIT ("Copyright (c) 2023-present Twenty.com, PBC"). **`twenty-server`, which contains all the email-sync code, is AGPLv3.** |
| Classification | **SAFE WITH CONDITIONS** — only the MIT packages may be copied. The server is **NOT APPROPRIATE** to copy. |
| What it does | A full open-source CRM (NestJS, BullMQ, Postgres, Redis, React) with Gmail, Microsoft 365 and IMAP mail + calendar sync. |
| What is useful to CloseLoop | The design of its mail sync, read as documentation: thread key derived from `References` → `In-Reply-To` → `Message-ID` (portable across providers); Gmail History API cursor plus Pub/Sub watch; Graph subscriptions; "sender ≠ connected account" to classify a message as inbound; utilities that strip quoted history and drop bulk/unsubscribe mail. Note Twenty requests very broad scopes (`gmail.readonly`, `gmail.compose`, `Mail.ReadWrite`, calendar); we deliberately request less. |
| Can we copy code? | MIT packages: yes. Server email code: **no** (AGPL would require open-sourcing CloseLoop). |
| Can we use it as a separate service? | Running unmodified Twenty behind our API would be license-safe but pointless: it is a CRM UI, not a headless sync engine. |
| Recommended approach | **Learn from, reimplement independently.** Our `src/lib/domain/replies.ts` implements the same header-based matching with our own code. |
| Risks | Accidental AGPL contamination by copy-pasting from `twenty-server`. Mitigation: no Twenty server code in this repo, ever. |

### Mautic

| | |
| --- | --- |
| Repository | https://github.com/mautic/mautic |
| License | **GPLv3 or later** — https://raw.githubusercontent.com/mautic/mautic/6.x/LICENSE.txt (same on 5.x); `composer.json` `"license": "GPL-3.0"`. |
| Classification | **NOT APPROPRIATE FOR OUR USE** (for code reuse). Running it unmodified as a separate service would be legal but is not recommended. |
| What it does | Marketing automation suite (PHP 8 / Symfony 6 / MySQL): campaigns with decision nodes, segments, email, landing pages, reporting; cron-driven workers. |
| What is useful to CloseLoop | Two ideas: a campaign "decision" node ("contact replied to email") gating later actions, and its monitored-inbox reply detector (`app/bundles/EmailBundle/MonitoredEmail/Processor/Reply.php`), which embeds a per-send token in outbound mail, looks the send up by that token, and verifies the sender matches the contact. We use the same "per-send identifier + sender check" idea via `Message-ID`. |
| Can we copy code? | **No.** |
| Can we use it as a separate service? | Legally yes (GPL has no network clause), but it is a second stack (PHP/MySQL/IMAP crons) that a one-person startup should not operate. |
| Recommended approach | **Do not use.** |
| Risks | Ops burden; feature creep toward a marketing suite; GPL contamination if anyone copies snippets. |

## Other projects evaluated

### Workflow / scheduling systems

| Project | Repository | License (as read) | Classification | Verdict for CloseLoop |
| --- | --- | --- | --- | --- |
| Inngest | https://github.com/inngest/inngest | Server: **SSPL v1** with a delayed Apache-2.0 conversion three years after each release (https://raw.githubusercontent.com/inngest/inngest/main/LICENSE.md). SDK `inngest` on npm: **Apache-2.0**. | Server: SAFE WITH CONDITIONS. SDK: SAFE. | Best "drop-in" option if we do not want to own the cron loop: Apache SDK, runs inside our Next.js API route on Vercel, `step.sleepUntil` up to a year, `cancelOn` events, retries, dashboard, free hobby tier. Only the self-hosted server is SSPL, and we would use Inngest Cloud. |
| Trigger.dev | https://github.com/triggerdotdev/trigger.dev | **Apache-2.0** (https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE) | SAFE | Good, but code runs on their infrastructure (second deploy target). Free tier is small ($5 credit, 10 schedules). |
| BullMQ | https://github.com/taskforcesh/bullmq | **MIT** (https://raw.githubusercontent.com/taskforcesh/bullmq/master/LICENSE) | SAFE | Needs Redis and a long-running worker process; not serverless-friendly. Not chosen. |
| pg-boss | https://github.com/timgit/pg-boss | **MIT** (https://raw.githubusercontent.com/timgit/pg-boss/master/LICENSE) | SAFE | Postgres-backed, nice API, but needs a persistent polling worker. Not chosen. |
| Graphile Worker | https://github.com/graphile/worker | **MIT** (https://raw.githubusercontent.com/graphile/worker/main/LICENSE.md) | SAFE | Same trade-off as pg-boss. Not chosen. |
| Temporal | https://github.com/temporalio/temporal, sdk-typescript | **MIT** both (https://raw.githubusercontent.com/temporalio/temporal/main/LICENSE) | SAFE | Excellent guarantees, far too heavy (cluster + workers, or $100+/mo cloud). Not chosen. |
| pg_cron / pg_net (Supabase Cron) | https://github.com/citusdata/pg_cron, https://github.com/supabase/pg_net | pg_cron: **PostgreSQL-style permissive**; pg_net: **Apache-2.0** | SAFE | **Chosen ticker** (with Vercel Cron as the alternative). Fires an HTTP call on a schedule; our database holds the state. |
| Upstash QStash | managed service | service terms | SAFE (service) | Free tier caps delays at 7 days, which does not fit a 10-day sequence. Not chosen. |
| Novu | https://github.com/novuhq/novu | Core **MIT** (https://raw.githubusercontent.com/novuhq/novu/next/LICENSE-MIT); `enterprise/` and `ee` folders commercial | SAFE WITH CONDITIONS | Its delay-step workflows with `transactionId` cancel model our sequence well, but it is a heavy multi-service system (Mongo, Redis) that only sends; it does not read replies. Not chosen. |
| n8n | https://github.com/n8n-io/n8n | **Sustainable Use License 1.0** + Enterprise for `.ee.` files (https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md) | NOT APPROPRIATE (as product engine) | Internal-use only without a commercial embed agreement. Fine for our own ops glue, never as CloseLoop's engine. |

### Email sending, receiving and parsing

| Project | Repository | License (as read) | Classification | Verdict |
| --- | --- | --- | --- | --- |
| resend-node | https://github.com/resend/resend-node | **MIT** | SAFE | Resend API supports an `Idempotency-Key` header, custom `Message-ID`/threading headers and inbound receiving. Free tier: 3,000/month, 100/day, 1 domain. **Chosen for Phase 3** (we call the REST API directly; no SDK needed). |
| postmark.js | https://github.com/ActiveCampaign/postmark.js | **MIT** | SAFE | Strong inbound webhook (`StrippedTextReply`, `MailboxHash`), but inbound is only on paid Pro/Platform plans (~$16.50+/mo). Adapter written as the alternative. |
| nodemailer | https://github.com/nodemailer/nodemailer | **MIT-0** | SAFE | SMTP fallback if ever needed. |
| mailparser | https://github.com/nodemailer/mailparser | **MIT** | SAFE | Only needed for raw-MIME inbound (Amazon SES). |
| email-reply-parser | https://github.com/crisp-oss/email-reply-parser | **MIT** | SAFE | Strips quoted history from replies. Our simple stripper can be swapped for it in Phase 5. |
| react-email | https://github.com/resend/react-email | **MIT** | SAFE | Not needed; our follow-ups are deliberately plain text (better deliverability, looks human). |
| Postal | https://github.com/postalserver/postal | **MIT** (file named `MIT-LICENCE`) | SAFE | Self-hosted mail server. Not chosen: deliverability and IP reputation are a full-time job. |
| listmonk | https://github.com/knadh/listmonk | **AGPLv3** | NOT APPROPRIATE | Newsletter tool, no sequences. |
| Chatwoot | https://github.com/chatwoot/chatwoot | **MIT** except `enterprise/` | SAFE WITH CONDITIONS | Support inbox; possibly relevant for Phase 8 support automation, not now. |
| Amazon SES | managed | AWS terms | SAFE (service) | Cheapest at scale, most plumbing (S3/SNS inbound, MIME parsing). Keep as a later cost optimisation. |

### Platform SDKs (all confirmed permissive)

| Package | License (as read) |
| --- | --- |
| Supabase (platform) / supabase-js / @supabase/ssr | Apache-2.0 / MIT / MIT |
| Auth.js (next-auth) | ISC |
| Better Auth | MIT |
| stripe-node | MIT |
| Drizzle ORM / Prisma | Apache-2.0 / Apache-2.0 |
| googleapis (Google API Node client) | Apache-2.0 |
| @microsoft/microsoft-graph-client, MSAL.js | MIT / MIT |
| nylas-nodejs | MIT (the Nylas *service* is paid per connected mailbox, roughly $15/mo base + ~$2 per extra account; its shared Google app add-on avoids our own CASA audit but is contract-priced) |

## Decisions in one glance

- **Use**: Resend (Phase A email, with Postmark as the ready alternative), Supabase (Postgres, auth, cron), Stripe SDK, Google and Microsoft REST APIs called directly, optionally Inngest's Apache SDK if we want managed retries and a jobs dashboard.
- **Learn from, do not copy**: Dittofeed's journey model, Twenty's mail-sync design, Mautic's reply-token idea.
- **Do not use**: Mautic, listmonk, n8n (as an engine), Twenty server code, Temporal, BullMQ/pg-boss/Graphile (need persistent workers).

## License issues the owner should know about

1. **Nothing in the CloseLoop repository today contains third-party copyleft code.** All dependencies are MIT/Apache/ISC/PostgreSQL-style.
2. **Never paste code from Twenty's server, Mautic, or listmonk into this repo.** Doing so would obligate us to release CloseLoop's source.
3. **Google's Gmail rules are a business decision, not a license issue**: detecting replies in a user's Gmail requires "restricted" scopes, which trigger Google's OAuth verification and an annual third-party security assessment (CASA). Assessors quote roughly $500–$2,000 per year for the lighter tier. Outlook has no equivalent audit but requires Microsoft publisher verification. Details in `docs/production-roadmap.md`, Phase 5.

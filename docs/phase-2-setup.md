# Phase 2 setup: what the owner needs to do

Everything in the code is ready. To turn it on for real, CloseLoop needs four things from you. Each takes a few minutes and no coding. Do them in order.

I need you to do these 4 things.

---

## 1. Create the Supabase project (database + sign-in)

1. Go to https://supabase.com and sign up (free).
2. Click **New project**. Name it `closeloop`, choose a strong database password (save it), pick the region closest to your customers. Wait for it to finish creating.
3. In the left sidebar open **SQL Editor** → **New query**. Open the file `supabase/migrations/0001_init.sql` from this repository, paste its whole contents, click **Run**. It should say "Success".
4. Open **Project Settings** (gear icon) → **API**. Copy these three values:
   - **Project URL** → paste as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (click reveal) → paste as `SUPABASE_SERVICE_ROLE_KEY` (secret: never share or put in the browser)
5. Open **Authentication** → **URL Configuration**. Set **Site URL** to your app's address (for local testing `http://localhost:3000`) and add `http://localhost:3000/auth/callback` (and later `https://<your-app-domain>/auth/callback`) under **Redirect URLs**.

Where these get pasted: a file named `.env.local` in the project folder (copy `.env.example` and fill in the values). On Vercel they go in **Settings → Environment Variables**.

---

## 2. Create the Resend account (sending and receiving email)

1. Go to https://resend.com and sign up (free).
2. **API Keys** → **Create API key**, name `closeloop`, permission "Full access". Copy it → paste as `RESEND_API_KEY`.
3. **Domains** → **Add domain**. Add a *subdomain* you own, for example `mail.yourdomain.com`. Resend shows DNS records to add at your domain registrar (see step 4). Once verified, choose a sending address on it, e.g. `followup@mail.yourdomain.com` → paste as `EMAIL_FROM_ADDRESS`.
4. **Receiving** (Inbound) → enable receiving for a subdomain, e.g. `reply.yourdomain.com` (Resend shows an MX record to add). Paste that domain as `EMAIL_REPLY_DOMAIN`.
   - Testing shortcut: Resend gives every account a ready-made receiving address that ends in `.resend.app` with no DNS needed. You can paste that domain as `EMAIL_REPLY_DOMAIN` to test replies before your own domain is set up.
5. **Webhooks** → **Add webhook**. URL: `https://<your-app-domain>/api/webhooks/resend`. Tick the event **email.received**. After saving, open the webhook and copy its **Signing secret** (starts with `whsec_`) → paste as `RESEND_WEBHOOK_SECRET`.
   - For local testing you need a public URL for the webhook; the simplest is to deploy to Vercel first (step 3) and test there.

Also set `EMAIL_PROVIDER=resend`.

---

## 3. Deploy (Vercel) and set the scheduler secret

1. Go to https://vercel.com, sign up, **Add New Project**, import the CloseLoop GitHub repository.
2. In the project **Settings → Environment Variables**, add every value from steps 1 and 2, plus:
   - `NEXT_PUBLIC_APP_URL` = your Vercel URL (e.g. `https://closeloop.vercel.app`)
   - `JOBS_SECRET` = any long random string (for example, run `openssl rand -hex 32` or use a password generator). Save it; you need it in step 4.
   - `ADMIN_EMAILS` = your own email address (this unlocks `/admin`).
3. Click **Deploy**. Then update the Supabase Redirect URLs (step 1.5) and the Resend webhook URL (step 2.5) with the real Vercel address.

---

## 4. Turn on the 15-minute scheduler (Supabase Cron)

1. In Supabase, **Database** → **Extensions**: enable `pg_cron` and `pg_net` (toggle both on).
2. **SQL Editor** → **New query**, paste this, replacing the two placeholders, and click **Run**:

```sql
select cron.schedule(
  'closeloop-follow-up-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<your-app-domain>/api/jobs/sweep',
    headers := '{"Authorization": "Bearer <your JOBS_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

That's it. From then on CloseLoop checks for due follow-ups every 15 minutes.

(Alternative if you prefer everything in Vercel: add a `vercel.json` with a cron for `/api/jobs/sweep` every 15 minutes. That needs the Vercel Pro plan; the Supabase route above is free.)

---

## How you will know it works

1. Open the app, **Start free**, create your account, confirm the email, complete onboarding.
2. Add a quote with **your own** personal email as the customer and set the first follow-up to 1 day, or use the **Check now** button after the scheduled day.
3. The follow-up arrives in your personal inbox from "Your Business via CloseLoop".
4. Reply to it from your personal inbox.
5. Within about a minute the quote shows **Replied** in CloseLoop, the reply text appears on its timeline, remaining follow-ups show as cancelled, and the reply is forwarded to your business email.

If step 3 never happens, open `/admin` and look at "Scheduler last ran"; if it says never, re-check step 4.

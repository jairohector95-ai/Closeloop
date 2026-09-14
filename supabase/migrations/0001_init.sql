-- ============================================================================
-- CloseLoop schema — Phase 2 (real database, auth, email, scheduler)
--
-- Apply in the Supabase SQL editor or with `supabase db push`.
-- Mirrors src/lib/types.ts. Every business's data is isolated with Row Level
-- Security; the application never bypasses it except in two server-only
-- places (the scheduler and the inbound-email webhook), which use the service
-- role and are scoped by business id in code.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type tone as enum ('friendly', 'professional', 'direct');
create type quote_status as enum ('awaiting_reply', 'follow_up_scheduled', 'replied', 'won', 'lost', 'paused');
create type follow_up_status as enum ('scheduled', 'sending', 'sent', 'failed', 'cancelled');
create type plan_id as enum ('trial', 'starter', 'pro');
create type subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'cancelled');
create type inbound_source as enum ('manual', 'provider_webhook', 'gmail', 'outlook');

-- ----------------------------------------------------------------------------
-- Tenancy
-- ----------------------------------------------------------------------------
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 200),
  owner_name    text not null check (length(owner_name) between 1 and 200),
  email         text not null check (position('@' in email) > 1),
  type          text not null default 'other',
  created_at    timestamptz not null default now()
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
-- One business per user for now (team accounts come later).
create unique index business_members_user_idx on business_members (user_id);

create table settings (
  business_id      uuid primary key references businesses(id) on delete cascade,
  default_schedule int[] not null default '{2,5,10}',
  default_tone     tone not null default 'friendly',
  signature        text not null default ''
);

create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null unique references businesses(id) on delete cascade,
  plan                   plan_id not null default 'trial',
  status                 subscription_status not null default 'trialing',
  stripe_customer_id     text,
  stripe_subscription_id text,
  trial_ends_at          timestamptz,
  created_at             timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Core product tables
-- ----------------------------------------------------------------------------
create table customers (
  id          uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  email       text not null,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (business_id, email)
);

create table quotes (
  id                     uuid primary key,
  business_id            uuid not null references businesses(id) on delete cascade,
  customer_id            uuid not null references customers(id) on delete restrict,
  quote_number           text not null,
  service_description    text not null,
  amount                 numeric(12,2) not null check (amount > 0),
  sent_at                date not null,
  notes                  text not null default '',
  status                 quote_status not null default 'follow_up_scheduled',
  schedule               int[] not null,
  tone                   tone not null,
  follow_ups_sent        int not null default 0,
  last_follow_up_sent_on date,
  email_thread_id        text,
  -- Random, unguessable token used in the Reply-To address (reply+<token>@reply-domain).
  reply_token            text not null unique check (length(reply_token) >= 24),
  replied_at             timestamptz,
  won_at                 timestamptz,
  lost_at                timestamptz,
  paused_at              timestamptz,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index quotes_business_status_idx on quotes (business_id, status);
create index quotes_customer_idx on quotes (customer_id);

create table follow_ups (
  id                  uuid primary key,
  quote_id            uuid not null references quotes(id) on delete cascade,
  business_id         uuid not null references businesses(id) on delete cascade,
  sequence_number     int not null check (sequence_number >= 1),
  scheduled_for       date not null,
  status              follow_up_status not null default 'scheduled',
  sent_at             timestamptz,
  subject             text,
  body                text,
  recipient_email     text,
  idempotency_key     text not null unique,
  attempts            int not null default 0,
  claimed_at          timestamptz,
  next_attempt_at     timestamptz,
  last_error          text,
  provider_message_id text,
  message_id          text,
  unique (quote_id, sequence_number)
);
create index follow_ups_due_idx on follow_ups (scheduled_for) where status in ('scheduled', 'sending');
create index follow_ups_business_idx on follow_ups (business_id);
create index follow_ups_message_id_idx on follow_ups (message_id) where message_id is not null;

create table timeline_events (
  id           uuid primary key,
  quote_id     uuid not null references quotes(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  type         text not null,
  title        text not null,
  description  text,
  occurred_at  timestamptz not null default now(),
  follow_up_id uuid references follow_ups(id) on delete set null
);
create index timeline_events_quote_idx on timeline_events (quote_id, occurred_at);
create index timeline_events_business_idx on timeline_events (business_id, occurred_at desc);

create table inbound_emails (
  id          uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  quote_id    uuid references quotes(id) on delete set null,
  source      inbound_source not null,
  from_email  text not null,
  from_name   text,
  subject     text,
  snippet     text,
  message_id  text,
  in_reply_to text,
  refs        text[] not null default '{}',
  thread_id   text,
  received_at timestamptz not null default now()
);
create unique index inbound_emails_message_idx on inbound_emails (business_id, message_id) where message_id is not null;

-- ----------------------------------------------------------------------------
-- Operational tables (service role only; no RLS policies = no client access)
-- ----------------------------------------------------------------------------
-- Every webhook delivery id we have processed. Duplicate deliveries and replays are rejected here.
create table webhook_events (
  id          text primary key,           -- provider delivery id (svix-id)
  provider    text not null,
  event_type  text not null,
  received_at timestamptz not null default now()
);

create table sweep_runs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade, -- null = all businesses
  trigger     text not null,                                     -- 'cron' | 'manual'
  ran_at      timestamptz not null default now(),
  attempted   int not null default 0,
  sent        int not null default 0,
  failed      int not null default 0,
  skipped     int not null default 0,
  errors      jsonb not null default '[]'
);
create index sweep_runs_business_idx on sweep_runs (business_id, ran_at desc);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = p_business_id and user_id = auth.uid());
$$;

create or replace function is_service_role()
returns boolean language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function current_business_id()
returns uuid language sql stable security definer set search_path = public as $$
  select business_id from business_members where user_id = auth.uid() limit 1;
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger quotes_touch before update on quotes for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- create_business: called once after sign-up. Creates business, membership,
-- settings and trial subscription atomically. One business per user.
-- ----------------------------------------------------------------------------
create or replace function create_business(
  p_name text, p_owner_name text, p_email text, p_type text, p_tone tone
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from business_members where user_id = v_user) then
    raise exception 'user already has a business' using errcode = '23505';
  end if;
  insert into businesses (owner_user_id, name, owner_name, email, type)
  values (v_user, trim(p_name), trim(p_owner_name), lower(trim(p_email)), coalesce(p_type, 'other'))
  returning id into v_id;
  insert into business_members (business_id, user_id, role) values (v_id, v_user, 'owner');
  insert into settings (business_id, default_tone) values (v_id, coalesce(p_tone, 'friendly'));
  insert into subscriptions (business_id, plan, status, trial_ends_at)
  values (v_id, 'trial', 'trialing', now() + interval '14 days');
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- load_workspace: one round trip for everything the app needs.
-- Runs with the caller's rights, so RLS applies.
-- ----------------------------------------------------------------------------
create or replace function load_workspace(p_business_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'customers', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]') from customers c where c.business_id = p_business_id),
    'quotes',    (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]') from quotes q where q.business_id = p_business_id),
    'followUps', (select coalesce(jsonb_agg(to_jsonb(f) order by f.scheduled_for), '[]') from follow_ups f where f.business_id = p_business_id),
    'timeline',  (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at), '[]') from timeline_events t where t.business_id = p_business_id),
    'inbound',   (select coalesce(jsonb_agg(to_jsonb(i) order by i.received_at), '[]') from inbound_emails i where i.business_id = p_business_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- apply_workspace_changes: applies a change set (upserts + deletes produced by
-- diffWorkspace in the app) in ONE transaction.
--
--  * Caller must be a member of the business, or the service role.
--  * Every row is forced onto p_business_id; a row referencing another
--    business's quote or customer raises an error.
--  * Affected quotes are locked FOR UPDATE first, so this call serializes
--    against claim_follow_up() (the scheduler). A reply that cancels
--    follow-ups and a scheduler claiming one can therefore never interleave.
--  * A follow-up that is already 'sent' is never overwritten with another status.
-- ----------------------------------------------------------------------------
create or replace function apply_workspace_changes(p_business_id uuid, p_changes jsonb)
returns jsonb
language plpgsql as $$
declare
  v_up jsonb := coalesce(p_changes->'upserts', '{}'::jsonb);
  v_del jsonb := coalesce(p_changes->'deletes', '{}'::jsonb);
  v_row jsonb;
  v_count int := 0;
  v_quote_ids uuid[];
begin
  if not (is_member(p_business_id) or is_service_role()) then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;

  -- Lock every quote touched by this change set (own rows and rows referenced by follow-ups/timeline).
  select array_agg(distinct id) into v_quote_ids from (
    select (r->>'id')::uuid as id from jsonb_array_elements(coalesce(v_up->'quotes', '[]')) r
    union select (r->>'quoteId')::uuid from jsonb_array_elements(coalesce(v_up->'followUps', '[]')) r
    union select (r->>'quoteId')::uuid from jsonb_array_elements(coalesce(v_up->'timeline', '[]')) r
    union select (r->>'quoteId')::uuid from jsonb_array_elements(coalesce(v_up->'inbound', '[]')) r where r->>'quoteId' is not null
    union select value::uuid from jsonb_array_elements_text(coalesce(v_del->'quotes', '[]'))
  ) ids where id is not null;
  if v_quote_ids is not null then
    perform id from quotes where id = any(v_quote_ids) and business_id = p_business_id for update;
  end if;

  -- Customers
  for v_row in select * from jsonb_array_elements(coalesce(v_up->'customers', '[]')) loop
    if v_row->>'businessId' is not null and (v_row->>'businessId')::uuid <> p_business_id then
      raise exception 'cross-business row rejected (customer %)', v_row->>'id' using errcode = '42501';
    end if;
    insert into customers (id, business_id, name, email, phone, created_at)
    values ((v_row->>'id')::uuid, p_business_id, v_row->>'name', lower(v_row->>'email'), v_row->>'phone', coalesce((v_row->>'createdAt')::timestamptz, now()))
    on conflict (id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone
      where customers.business_id = p_business_id;
    v_count := v_count + 1;
  end loop;

  -- Quotes
  for v_row in select * from jsonb_array_elements(coalesce(v_up->'quotes', '[]')) loop
    if v_row->>'businessId' is not null and (v_row->>'businessId')::uuid <> p_business_id then
      raise exception 'cross-business row rejected (quote %)', v_row->>'id' using errcode = '42501';
    end if;
    if not exists (select 1 from customers where id = (v_row->>'customerId')::uuid and business_id = p_business_id) then
      raise exception 'quote % references a customer outside this business', v_row->>'id' using errcode = '42501';
    end if;
    insert into quotes (id, business_id, customer_id, quote_number, service_description, amount, sent_at, notes, status, schedule, tone,
                        follow_ups_sent, last_follow_up_sent_on, email_thread_id, reply_token, replied_at, won_at, lost_at, paused_at, is_demo, created_at, updated_at)
    values ((v_row->>'id')::uuid, p_business_id, (v_row->>'customerId')::uuid, v_row->>'quoteNumber', v_row->>'serviceDescription',
            (v_row->>'amount')::numeric, (v_row->>'sentAt')::date, coalesce(v_row->>'notes', ''), (v_row->>'status')::quote_status,
            (select coalesce(array_agg(x::int), '{}') from jsonb_array_elements_text(v_row->'schedule') x), (v_row->>'tone')::tone,
            coalesce((v_row->>'followUpsSent')::int, 0), (v_row->>'lastFollowUpSentOn')::date, v_row->>'emailThreadId', v_row->>'replyToken',
            (v_row->>'repliedAt')::timestamptz, (v_row->>'wonAt')::timestamptz, (v_row->>'lostAt')::timestamptz, (v_row->>'pausedAt')::timestamptz,
            coalesce((v_row->>'isDemo')::boolean, false), coalesce((v_row->>'createdAt')::timestamptz, now()), coalesce((v_row->>'updatedAt')::timestamptz, now()))
    on conflict (id) do update set
      customer_id = excluded.customer_id, quote_number = excluded.quote_number, service_description = excluded.service_description,
      amount = excluded.amount, sent_at = excluded.sent_at, notes = excluded.notes, status = excluded.status, schedule = excluded.schedule,
      tone = excluded.tone, follow_ups_sent = excluded.follow_ups_sent, last_follow_up_sent_on = excluded.last_follow_up_sent_on,
      email_thread_id = excluded.email_thread_id, replied_at = excluded.replied_at, won_at = excluded.won_at, lost_at = excluded.lost_at,
      paused_at = excluded.paused_at, is_demo = excluded.is_demo, updated_at = excluded.updated_at
      where quotes.business_id = p_business_id;
    v_count := v_count + 1;
  end loop;

  -- Follow-ups (never downgrade a sent row)
  for v_row in select * from jsonb_array_elements(coalesce(v_up->'followUps', '[]')) loop
    if not exists (select 1 from quotes where id = (v_row->>'quoteId')::uuid and business_id = p_business_id) then
      raise exception 'follow-up % references a quote outside this business', v_row->>'id' using errcode = '42501';
    end if;
    insert into follow_ups (id, quote_id, business_id, sequence_number, scheduled_for, status, sent_at, subject, body, recipient_email,
                            idempotency_key, attempts, claimed_at, next_attempt_at, last_error, provider_message_id, message_id)
    values ((v_row->>'id')::uuid, (v_row->>'quoteId')::uuid, p_business_id, (v_row->>'sequenceNumber')::int, (v_row->>'scheduledFor')::date,
            (v_row->>'status')::follow_up_status, (v_row->>'sentAt')::timestamptz, v_row->>'subject', v_row->>'body', v_row->>'recipientEmail',
            v_row->>'idempotencyKey', coalesce((v_row->>'attempts')::int, 0), (v_row->>'claimedAt')::timestamptz, (v_row->>'nextAttemptAt')::timestamptz,
            v_row->>'lastError', v_row->>'providerMessageId', v_row->>'messageId')
    on conflict (id) do update set
      scheduled_for = excluded.scheduled_for, status = excluded.status, sent_at = excluded.sent_at, subject = excluded.subject, body = excluded.body,
      recipient_email = excluded.recipient_email, attempts = excluded.attempts, claimed_at = excluded.claimed_at, next_attempt_at = excluded.next_attempt_at,
      last_error = excluded.last_error, provider_message_id = excluded.provider_message_id, message_id = excluded.message_id
      where follow_ups.business_id = p_business_id and (follow_ups.status <> 'sent' or excluded.status = 'sent');
    v_count := v_count + 1;
  end loop;

  -- Timeline
  for v_row in select * from jsonb_array_elements(coalesce(v_up->'timeline', '[]')) loop
    if not exists (select 1 from quotes where id = (v_row->>'quoteId')::uuid and business_id = p_business_id) then
      raise exception 'timeline event % references a quote outside this business', v_row->>'id' using errcode = '42501';
    end if;
    insert into timeline_events (id, quote_id, business_id, type, title, description, occurred_at, follow_up_id)
    values ((v_row->>'id')::uuid, (v_row->>'quoteId')::uuid, p_business_id, v_row->>'type', v_row->>'title', v_row->>'description',
            coalesce((v_row->>'occurredAt')::timestamptz, now()), (v_row->>'followUpId')::uuid)
    on conflict (id) do update set title = excluded.title, description = excluded.description
      where timeline_events.business_id = p_business_id;
    v_count := v_count + 1;
  end loop;

  -- Inbound emails
  for v_row in select * from jsonb_array_elements(coalesce(v_up->'inbound', '[]')) loop
    if v_row->>'quoteId' is not null and not exists (select 1 from quotes where id = (v_row->>'quoteId')::uuid and business_id = p_business_id) then
      raise exception 'inbound email % references a quote outside this business', v_row->>'id' using errcode = '42501';
    end if;
    insert into inbound_emails (id, business_id, quote_id, source, from_email, from_name, subject, snippet, message_id, in_reply_to, refs, thread_id, received_at)
    values ((v_row->>'id')::uuid, p_business_id, (v_row->>'quoteId')::uuid, (v_row->>'source')::inbound_source, v_row->>'fromEmail', v_row->>'fromName',
            v_row->>'subject', v_row->>'snippet', v_row->>'messageId', v_row->>'inReplyTo',
            (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(v_row->'references', '[]')) x), v_row->>'threadId',
            coalesce((v_row->>'receivedAt')::timestamptz, now()))
    on conflict (id) do update set quote_id = excluded.quote_id, snippet = excluded.snippet
      where inbound_emails.business_id = p_business_id;
    v_count := v_count + 1;
  end loop;

  -- Deletes (always scoped to the business)
  delete from timeline_events where business_id = p_business_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_del->'timeline', '[]')));
  delete from inbound_emails  where business_id = p_business_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_del->'inbound', '[]')));
  delete from follow_ups      where business_id = p_business_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_del->'followUps', '[]')));
  delete from quotes          where business_id = p_business_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_del->'quotes', '[]')));
  delete from customers       where business_id = p_business_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_del->'customers', '[]')));

  return jsonb_build_object('applied', v_count);
end $$;

-- ----------------------------------------------------------------------------
-- claim_follow_up: the scheduler's atomic claim. Exactly one caller wins.
-- Locks the parent quote row first, re-checks it is still active, then moves
-- the follow-up to 'sending'. Returns true only for the winner.
-- ----------------------------------------------------------------------------
create or replace function claim_follow_up(p_follow_up_id uuid, p_stale_after interval default '15 minutes')
returns boolean
language plpgsql as $$
declare
  v_quote quotes%rowtype;
  v_updated int;
begin
  if not is_service_role() then
    raise exception 'claim_follow_up is only available to the scheduler' using errcode = '42501';
  end if;

  select q.* into v_quote
    from quotes q
    join follow_ups f on f.quote_id = q.id
   where f.id = p_follow_up_id
     for update of q;
  if not found then return false; end if;
  if v_quote.status not in ('follow_up_scheduled', 'awaiting_reply') then return false; end if;
  if v_quote.last_follow_up_sent_on = current_date then return false; end if;

  update follow_ups
     set status = 'sending', claimed_at = now(), attempts = attempts + 1, next_attempt_at = null
   where id = p_follow_up_id
     and (
       (status = 'scheduled' and scheduled_for <= current_date and (next_attempt_at is null or next_attempt_at <= now()))
       or (status = 'sending' and claimed_at < now() - p_stale_after)
     );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end $$;

-- Businesses that have at least one follow-up worth checking today (demo quotes excluded).
create or replace function businesses_with_due_follow_ups(p_today date default current_date)
returns setof uuid
language sql stable as $$
  select distinct f.business_id
    from follow_ups f
    join quotes q on q.id = f.quote_id
   where q.status in ('follow_up_scheduled', 'awaiting_reply')
     and q.is_demo = false
     and (
       (f.status = 'scheduled' and f.scheduled_for <= p_today and (f.next_attempt_at is null or f.next_attempt_at <= now()))
       or (f.status = 'sending' and f.claimed_at < now() - interval '15 minutes')
     );
$$;

-- Records a webhook delivery. Returns false when we have already seen it (duplicate or replay).
create or replace function record_webhook_event(p_id text, p_provider text, p_event_type text)
returns boolean
language plpgsql as $$
begin
  if not is_service_role() then
    raise exception 'service role only' using errcode = '42501';
  end if;
  insert into webhook_events (id, provider, event_type) values (p_id, p_provider, p_event_type)
  on conflict (id) do nothing;
  return found;
end $$;

-- Prunes webhook ids older than 30 days (call from the sweep occasionally).
create or replace function prune_webhook_events()
returns void language sql as $$
  delete from webhook_events where received_at < now() - interval '30 days';
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table businesses       enable row level security;
alter table business_members enable row level security;
alter table settings         enable row level security;
alter table subscriptions    enable row level security;
alter table customers        enable row level security;
alter table quotes           enable row level security;
alter table follow_ups       enable row level security;
alter table timeline_events  enable row level security;
alter table inbound_emails   enable row level security;
alter table webhook_events   enable row level security;  -- no policies: service role only
alter table sweep_runs       enable row level security;

create policy businesses_select on businesses for select using (is_member(id));
create policy businesses_update on businesses for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy members_select on business_members for select using (user_id = auth.uid());

create policy settings_select on settings for select using (is_member(business_id));
create policy settings_update on settings for update using (is_member(business_id)) with check (is_member(business_id));

create policy subscriptions_select on subscriptions for select using (is_member(business_id));

create policy customers_all on customers for all using (is_member(business_id)) with check (is_member(business_id));
create policy quotes_all on quotes for all using (is_member(business_id)) with check (is_member(business_id));
create policy follow_ups_all on follow_ups for all using (is_member(business_id)) with check (is_member(business_id));
create policy timeline_all on timeline_events for all using (is_member(business_id)) with check (is_member(business_id));
create policy inbound_select on inbound_emails for select using (is_member(business_id));
create policy inbound_insert on inbound_emails for insert with check (is_member(business_id));

create policy sweep_runs_select on sweep_runs for select using (business_id is not null and is_member(business_id));

-- Nothing for anonymous visitors.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

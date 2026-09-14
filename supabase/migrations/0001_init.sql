-- CloseLoop schema, Phase 2.
-- Mirrors src/lib/types.ts one-to-one. Apply with `supabase db push` or the SQL editor.
-- Row Level Security keeps every business's data private to its members.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type tone as enum ('friendly', 'professional', 'direct');
create type quote_status as enum ('awaiting_reply', 'follow_up_scheduled', 'replied', 'won', 'lost', 'paused');
create type follow_up_status as enum ('scheduled', 'sending', 'sent', 'failed', 'cancelled');
create type plan_id as enum ('trial', 'starter', 'pro');
create type subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'cancelled');
create type mailbox_provider as enum ('gmail', 'outlook');
create type mailbox_status as enum ('connected', 'needs_reauth', 'disconnected');
create type inbound_source as enum ('manual', 'provider_webhook', 'gmail', 'outlook');

-- ---------------------------------------------------------------------------
-- Tenancy: one business per owner for now; members table allows teams later.
-- ---------------------------------------------------------------------------
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  owner_name    text not null,
  email         text not null,
  type          text not null default 'other',
  created_at    timestamptz not null default now()
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner',
  primary key (business_id, user_id)
);

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

-- ---------------------------------------------------------------------------
-- Core product tables
-- ---------------------------------------------------------------------------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  email       text not null,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (business_id, email)
);

create table quotes (
  id                     uuid primary key default gen_random_uuid(),
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
  replied_at             timestamptz,
  won_at                 timestamptz,
  lost_at                timestamptz,
  paused_at              timestamptz,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index quotes_business_status_idx on quotes (business_id, status);

create table follow_ups (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references quotes(id) on delete cascade,
  sequence_number     int not null,
  scheduled_for       date not null,
  status              follow_up_status not null default 'scheduled',
  sent_at             timestamptz,
  subject             text,
  body                text,
  idempotency_key     text not null unique,
  attempts            int not null default 0,
  claimed_at          timestamptz,
  next_attempt_at     timestamptz,
  last_error          text,
  provider_message_id text,
  message_id          text,
  unique (quote_id, sequence_number)
);
-- The sweep's hot path: "what is due".
create index follow_ups_due_idx on follow_ups (scheduled_for) where status in ('scheduled', 'sending');
create index follow_ups_message_id_idx on follow_ups (message_id) where message_id is not null;

create table timeline_events (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references quotes(id) on delete cascade,
  type         text not null,
  title        text not null,
  description  text,
  occurred_at  timestamptz not null default now(),
  follow_up_id uuid references follow_ups(id) on delete set null
);
create index timeline_events_quote_idx on timeline_events (quote_id, occurred_at);

create table inbound_emails (
  id          uuid primary key default gen_random_uuid(),
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
  received_at timestamptz not null default now(),
  unique (business_id, message_id)
);

-- ---------------------------------------------------------------------------
-- Mailbox connections (Phase 5b/5c). Tokens live in a separate table that
-- application code reads only through the service role; they are never
-- exposed to the browser and never included in RLS-readable tables.
-- ---------------------------------------------------------------------------
create table mailbox_connections (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  provider         mailbox_provider not null,
  email_address    text not null,
  status           mailbox_status not null default 'connected',
  scopes           text[] not null default '{}',
  watch_id         text,
  watch_expires_at timestamptz,
  sync_cursor      text,
  connected_at     timestamptz not null default now(),
  last_synced_at   timestamptz,
  last_error       text,
  unique (business_id, provider)
);

create table mailbox_credentials (
  connection_id  uuid primary key references mailbox_connections(id) on delete cascade,
  -- Encrypted with the app's KMS key (pgsodium or application-level AES-GCM) before insert.
  access_token   bytea not null,
  refresh_token  bytea,
  expires_at     timestamptz not null,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atomic claim used by the follow-up sweep. Exactly one caller wins.
-- ---------------------------------------------------------------------------
create or replace function claim_follow_up(p_follow_up_id uuid, p_stale_after interval default '15 minutes')
returns boolean
language sql
as $$
  update follow_ups
     set status = 'sending', claimed_at = now(), attempts = attempts + 1, next_attempt_at = null
   where id = p_follow_up_id
     and (
       (status = 'scheduled' and (next_attempt_at is null or next_attempt_at <= now()))
       or (status = 'sending' and claimed_at < now() - p_stale_after)
     )
  returning true;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
create or replace function is_member(p_business_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from business_members where business_id = p_business_id and user_id = auth.uid());
$$;

alter table businesses          enable row level security;
alter table business_members    enable row level security;
alter table settings            enable row level security;
alter table subscriptions       enable row level security;
alter table customers           enable row level security;
alter table quotes              enable row level security;
alter table follow_ups          enable row level security;
alter table timeline_events     enable row level security;
alter table inbound_emails      enable row level security;
alter table mailbox_connections enable row level security;
alter table mailbox_credentials enable row level security; -- no policies: service role only

create policy businesses_member on businesses for all using (is_member(id)) with check (owner_user_id = auth.uid());
create policy members_self on business_members for select using (user_id = auth.uid());
create policy settings_member on settings for all using (is_member(business_id));
create policy subscriptions_member on subscriptions for select using (is_member(business_id));
create policy customers_member on customers for all using (is_member(business_id));
create policy quotes_member on quotes for all using (is_member(business_id));
create policy follow_ups_member on follow_ups for all using (exists (select 1 from quotes q where q.id = follow_ups.quote_id and is_member(q.business_id)));
create policy timeline_member on timeline_events for all using (exists (select 1 from quotes q where q.id = timeline_events.quote_id and is_member(q.business_id)));
create policy inbound_member on inbound_emails for select using (is_member(business_id));
create policy mailbox_member on mailbox_connections for select using (is_member(business_id));

-- Keep updated_at fresh.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger quotes_touch before update on quotes for each row execute function touch_updated_at();

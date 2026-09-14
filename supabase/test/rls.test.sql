-- Row Level Security and scheduler-safety tests. Run by scripts/test-db.sh.
-- Each block raises (and fails the script) if an expectation does not hold.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

-- ---------------------------------------------------------------- Alice signs up
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claim.role = 'authenticated';
select create_business('ABC Painting', 'Alice', 'alice@example.com', 'painting', 'friendly') as alice_biz \gset
select set_config('test.alice_biz', :'alice_biz', false);

do $$ begin
  begin
    perform create_business('Second Co', 'Alice', 'alice@example.com', 'painting', 'friendly');
    raise exception 'TEST FAILED: second business for same user should be rejected';
  exception when unique_violation then null; end;
end $$;

-- Alice adds a customer, a quote and its follow-ups through the change-set function.
select apply_workspace_changes(current_setting('test.alice_biz')::uuid, jsonb_build_object('upserts', jsonb_build_object(
  'customers', jsonb_build_array(jsonb_build_object('id', '10000000-0000-0000-0000-000000000001', 'name', 'Sarah', 'email', 'sarah@example.com', 'createdAt', now())),
  'quotes', jsonb_build_array(jsonb_build_object('id', '20000000-0000-0000-0000-000000000001', 'customerId', '10000000-0000-0000-0000-000000000001',
      'quoteNumber', 'EST-1', 'serviceDescription', 'Interior painting', 'amount', 2850, 'sentAt', current_date - 3, 'status', 'follow_up_scheduled',
      'schedule', jsonb_build_array(2,5,10), 'tone', 'friendly', 'replyToken', 'tokentokentokentokentokentoken01', 'isDemo', false)),
  'followUps', jsonb_build_array(
      jsonb_build_object('id', '30000000-0000-0000-0000-000000000001', 'quoteId', '20000000-0000-0000-0000-000000000001', 'sequenceNumber', 1, 'scheduledFor', current_date - 1, 'status', 'scheduled', 'idempotencyKey', 'k1'),
      jsonb_build_object('id', '30000000-0000-0000-0000-000000000002', 'quoteId', '20000000-0000-0000-0000-000000000001', 'sequenceNumber', 2, 'scheduledFor', current_date + 2, 'status', 'scheduled', 'idempotencyKey', 'k2'))
))) as applied \gset

do $$ begin
  if (select count(*) from quotes) <> 1 then raise exception 'TEST FAILED: alice should see her quote'; end if;
  if (select jsonb_array_length(load_workspace(current_business_id())->'followUps')) <> 2 then raise exception 'TEST FAILED: load_workspace follow-ups'; end if;
end $$;

-- ---------------------------------------------------------------- Bob signs up and must see nothing of Alice's
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select create_business('Bob Roofing', 'Bob', 'bob@example.com', 'roofing', 'direct') as bob_biz \gset
select set_config('test.bob_biz', :'bob_biz', false);

do $$ begin
  if (select count(*) from quotes) <> 0 then raise exception 'TEST FAILED: bob can see alice quotes'; end if;
  if (select count(*) from customers) <> 0 then raise exception 'TEST FAILED: bob can see alice customers'; end if;
  if (select count(*) from follow_ups) <> 0 then raise exception 'TEST FAILED: bob can see alice follow-ups'; end if;
  if (select count(*) from businesses) <> 1 then raise exception 'TEST FAILED: bob should see only his business'; end if;
  if (select jsonb_array_length(load_workspace(current_setting('test.alice_biz')::uuid)->'quotes')) <> 0 then raise exception 'TEST FAILED: load_workspace leaks across tenants'; end if;
end $$;

-- Bob cannot write into Alice's business.
do $$ begin
  begin
    perform apply_workspace_changes(current_setting('test.alice_biz')::uuid, '{"upserts":{"customers":[{"id":"10000000-0000-0000-0000-000000000002","name":"X","email":"x@example.com"}]}}'::jsonb);
    raise exception 'TEST FAILED: bob wrote into alice business';
  exception when insufficient_privilege then null; end;
end $$;

-- Bob cannot smuggle a row that points at Alice's quote into his own business.
do $$ begin
  begin
    perform apply_workspace_changes(current_setting('test.bob_biz')::uuid, '{"upserts":{"followUps":[{"id":"30000000-0000-0000-0000-000000000009","quoteId":"20000000-0000-0000-0000-000000000001","sequenceNumber":9,"scheduledFor":"2026-01-01","status":"scheduled","idempotencyKey":"k9"}]}}'::jsonb);
    raise exception 'TEST FAILED: cross-business follow-up accepted';
  exception when insufficient_privilege then null; end;
end $$;

-- Direct update attempts on Alice's rows affect nothing.
update quotes set status = 'lost' where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from quotes) <> 0 then raise exception 'TEST FAILED: bob update leaked'; end if;
end $$;

-- ---------------------------------------------------------------- Scheduler (service role)
reset role;
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claim.role = 'service_role';

do $$ begin
  if (select status from quotes where id = '20000000-0000-0000-0000-000000000001') <> 'follow_up_scheduled' then raise exception 'TEST FAILED: bob update changed alice quote'; end if;
  if not exists (select 1 from businesses_with_due_follow_ups() b where b = current_setting('test.alice_biz')::uuid) then raise exception 'TEST FAILED: alice should have a due follow-up'; end if;
  if not claim_follow_up('30000000-0000-0000-0000-000000000001') then raise exception 'TEST FAILED: first claim should win'; end if;
  if claim_follow_up('30000000-0000-0000-0000-000000000001') then raise exception 'TEST FAILED: second claim must lose'; end if;
  if claim_follow_up('30000000-0000-0000-0000-000000000002') then raise exception 'TEST FAILED: future follow-up must not be claimable'; end if;
  if (select status from follow_ups where id = '30000000-0000-0000-0000-000000000001') <> 'sending' then raise exception 'TEST FAILED: status should be sending'; end if;
end $$;

-- Stale claim (worker died) becomes claimable again.
update follow_ups set claimed_at = now() - interval '20 minutes' where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  if not claim_follow_up('30000000-0000-0000-0000-000000000001') then raise exception 'TEST FAILED: stale claim should be reclaimable'; end if;
end $$;

-- A reply arrives while #1 is in flight: the change set cancels only the scheduled follow-up and marks the quote replied.
select apply_workspace_changes(current_setting('test.alice_biz')::uuid, jsonb_build_object('upserts', jsonb_build_object(
  'quotes', jsonb_build_array(jsonb_build_object('id', '20000000-0000-0000-0000-000000000001', 'customerId', '10000000-0000-0000-0000-000000000001',
      'quoteNumber', 'EST-1', 'serviceDescription', 'Interior painting', 'amount', 2850, 'sentAt', current_date - 3, 'status', 'replied',
      'schedule', jsonb_build_array(2,5,10), 'tone', 'friendly', 'replyToken', 'tokentokentokentokentokentoken01', 'repliedAt', now())),
  'followUps', jsonb_build_array(
      jsonb_build_object('id', '30000000-0000-0000-0000-000000000002', 'quoteId', '20000000-0000-0000-0000-000000000001', 'sequenceNumber', 2, 'scheduledFor', current_date + 2, 'status', 'cancelled', 'idempotencyKey', 'k2'))
))) as applied2 \gset

do $$ begin
  if (select status from quotes where id = '20000000-0000-0000-0000-000000000001') <> 'replied' then raise exception 'TEST FAILED: quote should be replied'; end if;
  if (select status from follow_ups where id = '30000000-0000-0000-0000-000000000002') <> 'cancelled' then raise exception 'TEST FAILED: pending follow-up should be cancelled'; end if;
  if (select status from follow_ups where id = '30000000-0000-0000-0000-000000000001') <> 'sending' then raise exception 'TEST FAILED: in-flight follow-up untouched'; end if;
  -- The scheduler can no longer claim anything for this quote.
  if claim_follow_up('30000000-0000-0000-0000-000000000002') then raise exception 'TEST FAILED: cancelled follow-up claimed'; end if;
  if exists (select 1 from businesses_with_due_follow_ups() b where b = current_setting('test.alice_biz')::uuid) then raise exception 'TEST FAILED: replied quote still due'; end if;
end $$;

-- The in-flight send completes and is recorded as sent; a later stale write cannot downgrade it.
select apply_workspace_changes(current_setting('test.alice_biz')::uuid, '{"upserts":{"followUps":[{"id":"30000000-0000-0000-0000-000000000001","quoteId":"20000000-0000-0000-0000-000000000001","sequenceNumber":1,"scheduledFor":"2026-01-01","status":"sent","idempotencyKey":"k1","messageId":"<k1@mail>"}]}}'::jsonb) as applied3 \gset
select apply_workspace_changes(current_setting('test.alice_biz')::uuid, '{"upserts":{"followUps":[{"id":"30000000-0000-0000-0000-000000000001","quoteId":"20000000-0000-0000-0000-000000000001","sequenceNumber":1,"scheduledFor":"2026-01-01","status":"cancelled","idempotencyKey":"k1"}]}}'::jsonb) as applied4 \gset
do $$ begin
  if (select status from follow_ups where id = '30000000-0000-0000-0000-000000000001') <> 'sent' then raise exception 'TEST FAILED: sent follow-up was downgraded'; end if;
  if (select message_id from follow_ups where id = '30000000-0000-0000-0000-000000000001') <> '<k1@mail>' then raise exception 'TEST FAILED: message id lost'; end if;
end $$;

-- Webhook dedupe.
do $$ begin
  if not record_webhook_event('msg_1', 'resend', 'email.received') then raise exception 'TEST FAILED: first webhook should be new'; end if;
  if record_webhook_event('msg_1', 'resend', 'email.received') then raise exception 'TEST FAILED: duplicate webhook accepted'; end if;
end $$;

-- Authenticated users cannot call scheduler-only functions.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claim.role = 'authenticated';
do $$ begin
  begin
    perform claim_follow_up('30000000-0000-0000-0000-000000000002');
    raise exception 'TEST FAILED: user could call claim_follow_up';
  exception when insufficient_privilege then null; end;
  begin
    perform record_webhook_event('x', 'resend', 'email.received');
    raise exception 'TEST FAILED: user could call record_webhook_event';
  exception when insufficient_privilege then null; end;
  if (select count(*) from webhook_events) <> 0 then raise exception 'TEST FAILED: user can read webhook_events'; end if;
end $$;

-- Anonymous visitors see nothing at all.
reset role;
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claim.role = 'anon';
do $$ begin
  begin
    perform count(*) from quotes;
    raise exception 'TEST FAILED: anon can read quotes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL DB TESTS PASSED' as result;

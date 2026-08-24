-- supabase/migrations/0002_jvf_account_entitlements.sql
--
-- One free partial scan per account, ever, enforced by the database.
--
-- WHY THE DATABASE AND NOT THE APPLICATION. An application check reads, decides,
-- then writes. Two requests that arrive together both read "not yet claimed" and
-- both proceed, and the account has had two free scans. The window is small and
-- it is exactly the window an interested party would aim for. A primary key on
-- owner_id closes it: the second insert fails, whatever the application believed.
--
-- WHY A ROW MEANS "CLAIMED". There is no nullable used_at flag and no boolean.
-- The row's existence IS the claim, so there is no second state to fall out of
-- sync with the first. An account with no row has not used its free partial; an
-- account with a row has. Nothing can be half-set.
--
-- WHY jvf_ AND NOT user_credits. user_credits is core's table, shared by every
-- app on the platform. Verify does not alter a shared schema to store its own
-- entitlement. This repo owns the jvf_ namespace, and owner_id is the same
-- Supabase user id core keys on, so identity stays shared without the schema
-- being shared.
--
-- CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24

create table if not exists public.jvf_account_entitlements (
  -- The Supabase user. One row per account is the whole constraint.
  owner_id              uuid        primary key references auth.users(id) on delete cascade,

  -- When the free partial was consumed. Not nullable: the row would not exist
  -- if it had not been.
  free_partial_used_at  timestamptz not null default now(),

  -- Which run consumed it, so a customer disputing "I never got my free scan"
  -- is answered with a run, not with a boolean.
  free_partial_run_id   text        not null,

  -- The origin it was spent on. A free partial is spent on one target; this
  -- records which, so support can see what the customer actually received.
  free_partial_target   text        not null,

  created_at            timestamptz not null default now()
);

comment on table public.jvf_account_entitlements is
  'One row per account that has consumed its single free partial scan. Row existence is the claim.';

-- ---------------------------------------------------------------------------
-- Row level security. Same shape as jvf_targets / jvf_runs / jvf_findings in
-- 0001: owners read their own row, and nothing else is granted. Writes happen
-- through the service role, which bypasses RLS, so there is deliberately no
-- insert or update policy — a client cannot grant itself another free scan by
-- deleting its row.
-- ---------------------------------------------------------------------------

alter table public.jvf_account_entitlements enable row level security;

create policy jv_entitlements_owner_read on public.jvf_account_entitlements
  for select using (owner_id = auth.uid());

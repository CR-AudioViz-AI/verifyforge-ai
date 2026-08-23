-- supabase/migrations/0001_javari_verify.sql
-- Javari Verify persistence.
-- Defines its own tables rather than assuming columns in an existing schema:
-- never write a column name from memory.
-- CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23

create table if not exists public.jv_targets (
  id              text primary key,
  kind            text not null,
  label           text not null,
  address         text not null,
  access_tier     text not null,
  authorization   jsonb not null default '{"kind":"none"}'::jsonb,
  rate_limit_rps  numeric not null default 2,
  owner_id        uuid,
  created_at      timestamptz not null default now()
);

create table if not exists public.jv_runs (
  run_id              text primary key,
  target_id           text not null references public.jv_targets(id) on delete cascade,
  profile_id          text not null,
  completed_at        timestamptz not null,
  access_tier         text not null,
  verdict             text not null check (verdict in ('CLEAR','DEFECTS_FOUND','INCOMPLETE')),
  concluded_module_ids text[] not null default '{}',
  modules_run         int not null default 0,
  modules_concluded   int not null default 0,
  subjects_examined   int not null default 0,
  requests_issued     int not null default 0,
  credits_charged     int not null default 0,
  blind_spots         text[] not null default '{}',
  report              jsonb not null,
  created_at          timestamptz not null default now()
);
create index if not exists jv_runs_target_completed_idx
  on public.jv_runs (target_id, completed_at desc);

create table if not exists public.jv_findings (
  fingerprint       text not null,
  target_id         text not null references public.jv_targets(id) on delete cascade,
  rule_id           text not null,
  severity          text not null check (severity in ('BLOCKER','HIGH','MEDIUM','LOW')),
  state             text not null check (state in ('new','persisting','fixed','regressed')),
  subject           text not null,
  title             text not null,
  finding           jsonb not null,
  first_seen_run_id text not null,
  first_seen_at     timestamptz not null,
  last_seen_run_id  text not null,
  last_seen_at      timestamptz not null,
  occurrences       int not null default 1,
  -- Written ONLY by a later run in which the module concluded and this
  -- fingerprint was absent. Never by anything reporting that it fixed something.
  verified_at       timestamptz,
  age_days          int not null default 0,
  primary key (target_id, fingerprint)
);
create index if not exists jv_findings_target_state_idx
  on public.jv_findings (target_id, state);

alter table public.jv_targets  enable row level security;
alter table public.jv_runs     enable row level security;
alter table public.jv_findings enable row level security;

-- Owner-scoped read. Writes are service-role only: a scan result the customer
-- can edit is not evidence.
create policy jv_targets_owner_read on public.jv_targets
  for select using (owner_id = auth.uid());

create policy jv_runs_owner_read on public.jv_runs
  for select using (
    exists (select 1 from public.jv_targets t
            where t.id = jv_runs.target_id and t.owner_id = auth.uid())
  );

create policy jv_findings_owner_read on public.jv_findings
  for select using (
    exists (select 1 from public.jv_targets t
            where t.id = jv_findings.target_id and t.owner_id = auth.uid())
  );

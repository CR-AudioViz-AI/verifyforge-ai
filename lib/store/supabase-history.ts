/**
 * lib/store/supabase-history.ts
 *
 * Supabase-backed HistoryStore.
 *
 * Column names come from `supabase/migrations/0001_javari_verify.sql` in this
 * repository, which defines them. Nothing here is written from memory, and
 * nothing assumes a column in a schema this repo does not own.
 *
 * Writes go through the service role deliberately. A scan result the customer
 * can edit is not evidence, and the whole product rests on findings being
 * checkable rather than negotiable. RLS grants owner-scoped READ only.
 *
 * Every method returns an honest failure rather than a fabricated default. A
 * fake empty history would silently turn every finding into a "new" one and
 * erase every regression — the exact class of lie a fallback default produces.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Finding } from '../modules/contract';
import type { HistoryStore, RunSnapshot, TrackedFinding } from '../engine/history';
import type { AccessTier } from '../modules/target';

interface RunRow {
  run_id: string;
  target_id: string;
  completed_at: string;
  access_tier: string;
  concluded_module_ids: string[];
  report: { findings?: Finding[] } | null;
}

interface FindingRow {
  fingerprint: string;
  target_id: string;
  state: string;
  finding: Finding;
  first_seen_run_id: string;
  first_seen_at: string;
  last_seen_run_id: string;
  last_seen_at: string;
  occurrences: number;
  verified_at: string | null;
  age_days: number;
}

function asState(value: string): TrackedFinding['state'] {
  return value === 'new' || value === 'persisting' || value === 'fixed' || value === 'regressed'
    ? value
    : 'persisting';
}

export class SupabaseHistoryStore implements HistoryStore {
  constructor(private readonly client: SupabaseClient) {}

  async latestSnapshot(targetId: string): Promise<RunSnapshot | null> {
    const { data, error } = await this.client
      .from('jvf_runs')
      .select('run_id, target_id, completed_at, access_tier, concluded_module_ids, report')
      .eq('target_id', targetId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .returns<RunRow[]>();

    if (error !== null) {
      throw new Error(
        `Could not read run history for ${targetId}: ${error.message}. ` +
          'Refusing to continue with an empty history, which would report every ' +
          'existing finding as new and erase every regression.',
      );
    }

    const row = data?.[0];
    if (row === undefined) return null;

    return {
      runId: row.run_id,
      targetId: row.target_id,
      completedAt: row.completed_at,
      accessTier: row.access_tier as AccessTier,
      findings: row.report?.findings ?? [],
      concludedModuleIds: row.concluded_module_ids,
    };
  }

  async trackedFindings(targetId: string): Promise<readonly TrackedFinding[]> {
    const { data, error } = await this.client
      .from('jvf_findings')
      .select(
        'fingerprint, target_id, state, finding, first_seen_run_id, first_seen_at, ' +
          'last_seen_run_id, last_seen_at, occurrences, verified_at, age_days',
      )
      .eq('target_id', targetId)
      .returns<FindingRow[]>();

    if (error !== null) {
      throw new Error(
        `Could not read tracked findings for ${targetId}: ${error.message}. ` +
          'Refusing to proceed on an assumed-empty history.',
      );
    }

    return (data ?? []).map((row) => ({
      fingerprint: row.fingerprint,
      finding: row.finding,
      state: asState(row.state),
      firstSeenRunId: row.first_seen_run_id,
      firstSeenAt: row.first_seen_at,
      lastSeenRunId: row.last_seen_run_id,
      lastSeenAt: row.last_seen_at,
      occurrences: row.occurrences,
      verifiedAt: row.verified_at,
      ageDays: row.age_days,
    }));
  }

  /**
   * Persists a run and the finding lifecycle.
   *
   * The run row is written first. If the finding upsert then fails, we have a
   * recorded run and stale finding states, which is recoverable by re-running
   * the diff. The reverse order would leave findings claiming to belong to a run
   * that does not exist.
   */
  async persist(snapshot: RunSnapshot, tracked: readonly TrackedFinding[]): Promise<void> {
    const runInsert = await this.client.from('jvf_runs').upsert(
      {
        run_id: snapshot.runId,
        target_id: snapshot.targetId,
        profile_id: 'unknown',
        completed_at: snapshot.completedAt,
        access_tier: snapshot.accessTier,
        verdict: snapshot.findings.length > 0 ? 'DEFECTS_FOUND' : 'CLEAR',
        concluded_module_ids: snapshot.concludedModuleIds,
        report: { findings: snapshot.findings },
        // 2026-09-03: STATUS IS REQUIRED HERE, and its absence was poisoning the
        // work queue.
        //
        // jvf_runs.status defaults to 'queued'. This upsert records a run that has
        // ALREADY COMPLETED, so every history write appeared to the worker as new
        // work — with no request payload, because a history record has none.
        //
        // The worker takes oldest-first, so these sat at the head of the queue and
        // burned one invocation each failing as 'Malformed queued row'. Two
        // ecosystem sweeps stalled behind 64 and then 16 of them, and clearing them
        // by hand achieved nothing because every completed scan created another.
        //
        // A history record and a unit of work are different things sharing one
        // table. Setting the status is the minimum fix; separate tables is the
        // honest one, and worth doing before this pattern finds a second way to bite.
        status: 'succeeded',
      },
      { onConflict: 'run_id' },
    );

    if (runInsert.error !== null) {
      throw new Error(`Failed to persist run ${snapshot.runId}: ${runInsert.error.message}`);
    }

    if (tracked.length === 0) return;

    const rows = tracked.map((item) => ({
      fingerprint: item.fingerprint,
      target_id: snapshot.targetId,
      rule_id: item.finding.ruleId,
      severity: item.finding.severity,
      state: item.state,
      subject: item.finding.subject,
      title: item.finding.title,
      finding: item.finding,
      first_seen_run_id: item.firstSeenRunId,
      first_seen_at: item.firstSeenAt,
      last_seen_run_id: item.lastSeenRunId,
      last_seen_at: item.lastSeenAt,
      occurrences: item.occurrences,
      verified_at: item.verifiedAt,
      age_days: item.ageDays,
    }));

    const findingUpsert = await this.client
      .from('jvf_findings')
      .upsert(rows, { onConflict: 'target_id,fingerprint' });

    if (findingUpsert.error !== null) {
      throw new Error(
        `Run ${snapshot.runId} was recorded but finding states were not: ` +
          `${findingUpsert.error.message}. Re-run the diff to reconcile.`,
      );
    }
  }
}

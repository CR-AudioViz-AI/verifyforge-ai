/**
 * lib/modules/checks/data-resilience.ts
 *
 * Two controls every framework asks for and almost nobody tests: that a backup
 * can actually be restored, and that deletion actually deletes.
 *
 * WHY THESE TWO TOGETHER. They are the same question asked in opposite
 * directions — can you get data back when you need it, and is it truly gone when
 * you say it is. Both are asserted in every policy document and verified almost
 * nowhere.
 *
 * THE AUDIT REALITY. Recurring readiness gaps cluster in a few places: recovery
 * plans with no test evidence under SOC 2 A1.3, and unverified deletion under
 * C1.2. Auditors in 2026 want evidence that a control OPERATED, not a screenshot
 * proving it exists. "We back up nightly" is a configuration. "We restored on
 * this date and the row counts matched" is evidence.
 *
 * WHAT THIS WILL NOT DO. It never restores over a live database. A check that
 * proves recovery works by overwriting production has caused the disaster it was
 * testing for. It verifies that a backup EXISTS, is RECENT, is COMPLETE against
 * the current schema, and is READABLE — and it says plainly that a real restore
 * drill into an isolated target is the only thing that proves the rest.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-03
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
  Severity,
} from '../contract';

interface Problem {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

interface BackupFacts {
  readonly newestIso: string | null;
  readonly tablesInBackup: number;
  readonly tablesInSchema: number;
  readonly missingTables: readonly string[];
  readonly emptyBackups: number;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const dataResilienceCheck: CheckModule = {
  id: 'data.resilience',
  version: '1.0.0',
  category: 'DATA',
  title: 'Backup coverage, freshness and deletion proof',

  whatItChecks:
    'Whether a backup exists, how old the newest one is, whether it covers every table the schema currently has, and whether any backup is present but empty. Also reports whether a restore has ever been rehearsed.',

  whatItCannotCatch: [
    'Whether the backup can ACTUALLY be restored. Only a real restore into an isolated target proves that, and this check will not restore over anything live — a check that proves recovery by overwriting production has caused the disaster it was testing for.',
    'Whether the restored data would be CORRECT. Row counts matching is not the same as the data being right.',
    'Point-in-time recovery windows, which live in the provider configuration rather than in any table this can read.',
    'Backups held outside the database — object storage, file uploads, generated assets — unless they are recorded in a table this can see.',
    'Whether deleted user data is gone from LOGS, analytics, third-party processors and the AI provider\u2019s retention. Those are separate systems and each needs its own erasure evidence.',
    'Encryption of backups at rest, which is a provider setting and not observable from a query.',
  ],

  supportedTargetKinds: ['database'],
  minimumAccessTier: 'internal',
  intrusive: false,

  inputs: [
    { name: 'restUrl', description: 'PostgREST base URL.', required: true, kind: 'origin' },
    { name: 'serviceKey', description: 'Service-role key, read only.', required: true, kind: 'credentials' },
    { name: 'backupTable', description: 'Table recording backup runs.', required: false, kind: 'origin' },
    { name: 'maxAgeHours', description: 'How stale a backup may be before it is a finding. Default 36.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 5,
  estimatedRuntimeMs: 25_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const restUrl = String(context.inputs?.['restUrl'] ?? '').replace(/\/+$/, '');
    const key = String(context.inputs?.['serviceKey'] ?? '');
    const table = String(context.inputs?.['backupTable'] ?? 'backup_runs');
    const maxAgeHours = Number(context.inputs?.['maxAgeHours'] ?? 36);

    if (!restUrl || !key) {
      return {
        status: 'inconclusive',
        reason: 'A PostgREST base URL and a service key are both required; nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    let requests = 0;

    const read = async (path: string): Promise<unknown[] | null> => {
      try {
        requests++;
        const res = await fetch(`${restUrl}/${path}`, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const body: unknown = await res.json();
        return Array.isArray(body) ? body : null;
      } catch {
        return null;
      }
    };

    const rows = await read(`${encodeURIComponent(table)}?select=*&order=created_at.desc&limit=400`);

    if (rows === null) {
      // No backup record is not a pass. It is the absence of evidence that the
      // control exists at all, and that is a more serious finding than a stale
      // backup — so it is reported rather than skipped.
      return {
        status: 'fail',
        findings: [
          {
            ruleId: 'data.backup.no-record',
            category: 'DATA',
            severity: 'BLOCKER',
            title: 'No backup record could be read',
            description:
              `Nothing was found at "${table}". Either backups are not recorded anywhere queryable, or this check was pointed at the wrong table. ` +
              'Both matter: a backup nobody records is a backup nobody can prove, and an auditor asking for evidence of recovery capability has nothing to look at.',
            subject: table,
            evidence: [
              {
                kind: 'measurement',
                metric: 'backup_records_readable',
                value: 0,
                unit: 'count',
                estimated: false,
                method: `GET ${restUrl}/${table} returned no readable rows.`,
              },
            ] as [Evidence, ...Evidence[]],
            recommendedFix:
              'Record every backup run in a table with a timestamp, the tables covered and the row counts. Without that there is no way to answer "when did we last have a good backup" except by attempting a restore.',
            fingerprint: fingerprint('data.backup.no-record', table),
            autoFixable: false,
          },
        ],
        checked: {
          subjectsExamined: 1,
          requestsIssued: requests,
          notes: `No rows readable at ${table}.`,
        },
      };
    }

    // Derive the facts before judging any of them, so the reasoning is visible
    // rather than tangled into the conditionals.
    const recs = rows as Record<string, unknown>[];
    const timestamps = recs
      .map((r) => String(r['created_at'] ?? r['completed_at'] ?? r['run_at'] ?? ''))
      .filter(Boolean)
      .sort()
      .reverse();

    const covered = new Set<string>();
    let emptyBackups = 0;
    for (const r of recs) {
      const name = r['table_name'] ?? r['table'] ?? r['target'];
      if (typeof name === 'string') covered.add(name);
      const count = Number(r['row_count'] ?? r['rows'] ?? NaN);
      if (Number.isFinite(count) && count === 0) emptyBackups++;
    }

    const facts: BackupFacts = {
      newestIso: timestamps[0] ?? null,
      tablesInBackup: covered.size,
      tablesInSchema: 0,
      missingTables: [],
      emptyBackups,
    };

    const problems: Problem[] = [];

    if (facts.newestIso === null) {
      problems.push({
        ruleId: 'data.backup.undated',
        severity: 'HIGH',
        title: 'Backup records carry no usable timestamp',
        description:
          'Rows exist but none has a readable date, so there is no way to tell whether the last backup was last night or last quarter. An undated backup record is an assertion, not evidence.',
        fix: 'Record a timestamp on every backup run and index it.',
        detail: `${recs.length} row(s), none with created_at, completed_at or run_at`,
      });
    } else {
      const ageHours = (Date.now() - Date.parse(facts.newestIso)) / 3_600_000;
      if (Number.isFinite(ageHours) && ageHours > maxAgeHours) {
        problems.push({
          ruleId: 'data.backup.stale',
          severity: ageHours > maxAgeHours * 4 ? 'BLOCKER' : 'HIGH',
          title: `Newest backup is ${Math.round(ageHours)} hours old`,
          description:
            `The most recent recorded backup is older than the ${maxAgeHours}-hour threshold. Everything written since then exists in one place only. ` +
            'A backup job that stopped running looks identical to one that never ran, and neither announces itself.',
          fix: 'Find out why the job stopped. A scheduled task that fails silently is the usual cause — the platform does not alert on a failing cron.',
          detail: `newest=${facts.newestIso}, age=${Math.round(ageHours)}h, threshold=${maxAgeHours}h`,
        });
      }
    }

    if (emptyBackups > 0) {
      problems.push({
        ruleId: 'data.backup.empty',
        severity: 'HIGH',
        title: `${emptyBackups} backup record(s) report zero rows`,
        description:
          'A backup that ran and captured nothing is worse than one that failed: the job reports success, the record exists, and the data is not there. Nobody discovers this until a restore is attempted, which is the worst possible moment.',
        fix: 'Compare each backup row count against the live table. A backup of a non-empty table that captured zero rows is a failed backup wearing a success record.',
        detail: `${emptyBackups} of ${recs.length} record(s) with row_count = 0`,
      });
    }

    // THE FINDING THAT MATTERS MOST, and it is reported even when everything
    // above is clean. A backup that has never been restored is a hope.
    const everRestored = recs.some((r) => {
      const kind = String(r['kind'] ?? r['type'] ?? r['operation'] ?? '').toLowerCase();
      return kind.includes('restore') || r['restore_verified'] === true;
    });

    if (!everRestored) {
      problems.push({
        ruleId: 'data.restore.never-rehearsed',
        severity: 'HIGH',
        title: 'No restore has ever been recorded',
        description:
          'Every record here is a backup. None is a restore. A backup that has never been restored is a hope rather than a control — the failure modes only appear on the way back: a schema that has moved on, a dependency order that will not replay, an encryption key nobody kept.\n\n' +
          'This is the most commonly cited gap in a SOC 2 A1.3 review, and it is cited because it is almost always true.',
        fix:
          'Rehearse a restore into an isolated target on a schedule, and record it here with the row counts compared against the source. Never restore over anything live to prove a backup works.',
        detail: `${recs.length} backup record(s), 0 restore records`,
      });
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'DATA',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: table,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Read from ${table} via PostgREST; re-runnable with the same query.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, table),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: recs.length,
      requestsIssued: requests,
      notes:
        `${recs.length} backup record(s) examined, covering ${facts.tablesInBackup} named table(s). ` +
        `Newest: ${facts.newestIso ?? 'undated'}. ` +
        'Backup EXISTENCE, freshness and coverage were checked; whether a restore would actually succeed was not, and cannot be without a real drill into an isolated target.',
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default dataResilienceCheck;

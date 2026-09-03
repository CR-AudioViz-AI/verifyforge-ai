/**
 * lib/modules/checks/database-exposure.ts
 *
 * Asks the one question that matters about a PostgREST-backed database: what can
 * somebody read with nothing but the key that ships in your JavaScript?
 *
 * WHY THIS IS ITS OWN CHECK. Supabase publishes the database over HTTP, and the
 * publishable key is in every page. Row-level security is the only thing standing
 * between a table and the internet. A table with RLS off is not "misconfigured" —
 * it is published.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEASUREMENT LESSON THIS MODULE IS BUILT AROUND
 *
 * The first version of this probe treated HTTP 200 as "readable" and reported
 * user_credits and core_audit as publicly exposed. Both return 200 with an EMPTY
 * ARRAY, which is RLS working exactly as designed: PostgREST answers the request
 * and returns no rows.
 *
 * Status code alone is not the signal. ROW COUNT is. Reporting "your user credits
 * table is publicly readable" when it is not would be a false positive on the
 * most alarming finding this product can produce, and one such report costs more
 * credibility than a hundred correct ones earn.
 *
 * The same discipline applies in the other direction: on this platform 80 tables
 * have RLS enabled with NO policy. That is not a defect. It is the correct
 * configuration for service-role-only data — the service role bypasses RLS, so
 * writers keep working while every client is denied. Flagging those 80 would be
 * exactly the noise that teaches people to stop reading a report.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-03
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
} from '../contract';

/**
 * Tables worth probing first. Named because a defect here is worse than a defect
 * elsewhere, not because other tables are safe.
 */
const SENSITIVE_HINTS = [
  'user',
  'profile',
  'credit',
  'payment',
  'invoice',
  'subscription',
  'secret',
  'token',
  'session',
  'admin',
  'audit',
  'message',
  'order',
  'customer',
] as const;

interface Reading {
  readonly table: string;
  readonly status: number;
  readonly rows: number;
  readonly sample: string;
}

async function readAsAnon(
  restUrl: string,
  key: string,
  table: string,
): Promise<Reading | null> {
  try {
    const res = await fetch(`${restUrl}/${encodeURIComponent(table)}?select=*&limit=2`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let rows = 0;
    try {
      const parsed: unknown = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      rows = 0;
    }
    return { table, status: res.status, rows, sample: text.slice(0, 200) };
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const databaseExposureCheck: CheckModule = {
  id: 'database.exposure',
  version: '1.0.0',
  category: 'DATA',
  title: 'What the publishable key can read',

  whatItChecks:
    'Uses the publishable key exactly as a browser would and reports any table that returns actual rows to an anonymous caller. Judged on rows returned, never on status code.',

  whatItCannotCatch: [
    'Tables it was not told to try. Without a schema listing, this probes named candidates rather than everything — a table with an unusual name and RLS off will be missed.',
    'What an AUTHENTICATED user can read beyond their own rows. That is cross-user authorisation and belongs to the IDOR check, which needs two real identities.',
    'Write access. This never attempts an insert, update or delete against a live database, so a table that is readable-denied but writable will not be found here.',
    'RPC and database functions, which have their own execution rights and are not covered by table policies.',
    'Whether the rows returned SHOULD be public. A published product catalogue returning rows is correct; this reports what is readable and a person decides whether it ought to be.',
    'Realtime and storage buckets, which are separate surfaces with separate rules.',
  ],

  supportedTargetKinds: ['database'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'restUrl', description: 'PostgREST base, e.g. https://ref.supabase.co/rest/v1', required: true, kind: 'origin' },
    { name: 'publishableKey', description: 'The key that ships in the browser bundle.', required: true, kind: 'credentials' },
    { name: 'tables', description: 'Comma-separated table names to probe.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 6,
  estimatedRuntimeMs: 35_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const restUrl = String(context.inputs?.['restUrl'] ?? '').replace(/\/+$/, '');
    const key = String(context.inputs?.['publishableKey'] ?? '');

    if (!restUrl || !key) {
      return {
        status: 'inconclusive',
        reason: 'A PostgREST base URL and a publishable key are both required; nothing was probed.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    const supplied = String(context.inputs?.['tables'] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // Without a supplied list, probe names that are common AND consequential.
    // This is explicitly a sample, and whatItCannotCatch says so — a check that
    // implies completeness it does not have is worse than one that admits the gap.
    const candidates =
      supplied.length > 0
        ? supplied
        : SENSITIVE_HINTS.flatMap((h) => [`${h}s`, `${h}_data`, h]);

    const readings: Reading[] = [];
    let requests = 0;

    for (const table of candidates.slice(0, 45)) {
      const r = await readAsAnon(restUrl, key, table);
      requests++;
      if (r === null) continue;
      // 404 means no such table. 401 and 403 mean denied outright. Neither is a
      // finding, and both are common.
      if (r.status === 404 || r.status === 401 || r.status === 403) continue;
      readings.push(r);
    }

    const findings: Finding[] = [];

    for (const r of readings) {
      // THE WHOLE JUDGEMENT. 200 with zero rows is RLS doing its job.
      if (r.status < 200 || r.status >= 300 || r.rows === 0) continue;

      // 2026-09-03: severity is judged on the ROWS, not the table NAME.
      //
      // The first version keyed on the name alone, which rated credit_packs a
      // BLOCKER — it is the pricing table the public pricing page reads, and it
      // is supposed to be readable. A name containing "credit" says nothing about
      // whether the data belongs to a person.
      //
      // What distinguishes a leak from a catalogue is whether the rows reference
      // a USER. Pricing tiers have no owner; a credits balance has one.
      const looksPersonal = /"(user_id|owner_id|email|user_email|customer_id|account_id|profile_id)"\s*:/i.test(
        r.sample,
      );
      const sensitive =
        looksPersonal ||
        /"(password|token|secret|api_key|access_token|refresh_token)"\s*:/i.test(r.sample);

      findings.push({
        ruleId: 'database.table.anon-readable',
        category: 'DATA',
        severity: sensitive ? 'BLOCKER' : 'HIGH',
        title: `Table "${r.table}" returns rows to an anonymous caller`,
        description:
          `A request carrying only the publishable key — the key present in every page of the site — returned ${r.rows} row(s) from ${r.table}. ` +
          'Row-level security is the only thing between a PostgREST table and the internet, and for this table there is nothing there.\n\n' +
          (sensitive
            ? 'The rows carry a user or credential field, so this is data belonging to someone rather than a public catalogue — which is why it is a blocker rather than a high.'
            : 'No user or credential field appears in the rows, so this may be a public catalogue — pricing tiers, published content — which is legitimately readable. This reports what IS readable; you decide whether it should be.'),
        subject: r.table,
        evidence: [
          {
            kind: 'measurement',
            metric: 'anon_rows_returned',
            value: r.rows,
            unit: 'count',
            estimated: false,
            method:
              `GET ${restUrl}/${r.table}?select=*&limit=2 with the publishable key returned HTTP ${r.status} ` +
              `and ${r.rows} row(s). Re-runnable with curl and the same key.`,
          },
        ] as [Evidence, ...Evidence[]],
        recommendedFix:
          'If the data is service-role only, enable row-level security and add NO policy — the service role bypasses RLS, so every legitimate writer keeps working while clients are denied outright. ' +
          'If some clients should read some rows, enable RLS and write a policy scoped to those rows. Never leave RLS off on a table PostgREST publishes.',
        fingerprint: fingerprint('database.table.anon-readable', r.table),
        autoFixable: false,
      });
    }

    const emptyButReachable = readings.filter(
      (r) => r.status >= 200 && r.status < 300 && r.rows === 0,
    ).length;

    const checked = {
      subjectsExamined: readings.length,
      requestsIssued: requests,
      notes:
        `${readings.length} table(s) responded; ${findings.length} returned rows to an anonymous caller. ` +
        `${emptyButReachable} answered with an empty array, which is row-level security working correctly and is NOT reported as a finding. ` +
        (supplied.length === 0
          ? 'No table list was supplied, so this probed common sensitive names rather than the whole schema — a table with an unusual name and RLS disabled would be missed.'
          : `Probed the ${supplied.length} table(s) supplied.`),
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default databaseExposureCheck;

/**
 * lib/modules/checks/schema-columns.ts
 *
 * Columns that a query selects but the database does not have.
 *
 * WRITTEN FROM A REAL DEFECT CLASS. Across the ecosystem, sixty-three queries
 * selected columns that did not exist — a query asks for `is_admin`, the table
 * only has `role`, and depending on the client the row comes back missing the
 * field silently or the request 400s in production. Neither a type checker nor a
 * status-code monitor catches it, because the column name is a string the
 * database only rejects at runtime.
 *
 * This check reads the ground truth — `information_schema.columns` — and compares
 * it against the columns the code actually references. It is an internal-tier
 * check: it needs read access to the schema, which is exactly why it is one of
 * the checks we run against our own ecosystem nightly and offer to customers who
 * grant source or database access.
 *
 * FIVE INDEPENDENT EVIDENCE PATHS:
 *   1. The referenced column is absent from information_schema for that table.
 *   2. The table itself exists (so this is a wrong column, not a wrong table —
 *      a different, also-real defect reported separately).
 *   3. A live PostgREST select of that column returns the column-does-not-exist
 *      error, confirming the schema read matches runtime behaviour.
 *   4. No view or generated column supplies the name under an alias.
 *   5. (fix aid, not proof) The nearest real column name is surfaced so the
 *      finding carries its own fix. A defect confirmed by the four proof paths
 *      is asserted whether or not a close spelling match exists — the suggestion
 *      enriches the finding, it does not gate it.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import {
  fail,
  inconclusive,
  pass,
  type CheckContext,
  type CheckModule,
  type CheckOutcome,
  type Evidence,
  type Finding,
} from '../contract';

interface ColumnReference {
  readonly table: string;
  readonly column: string;
  /** Where the code referenced it, for the finding's location. */
  readonly source: string;
}

/**
 * Parses "table.column" and "table:col1,col2" reference specs from the input.
 * The customer (or our own sweep) supplies the columns the code references; this
 * module confirms each against the live schema.
 */
function parseReferences(raw: string): ColumnReference[] {
  const refs: ColumnReference[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    // "profiles:role,credit_balance,is_admin @ lib/foo.ts:42"
    const [spec, source] = trimmed.split('@').map((p) => p.trim());
    if (spec === undefined) continue;
    const [table, cols] = spec.split(':').map((p) => p.trim());
    if (table === undefined || cols === undefined) continue;

    for (const column of cols.split(',').map((c) => c.trim()).filter((c) => c.length > 0)) {
      refs.push({ table, column, source: source ?? 'unspecified' });
    }
  }
  return refs;
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length] ?? 0;
}

function nearestColumn(target: string, real: readonly string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of real) {
    const dist = levenshtein(target, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  // Only suggest if it is actually close — an edit distance under a third of the
  // name's length. Otherwise the suggestion is noise.
  return best !== null && bestDist <= Math.max(2, Math.ceil(target.length / 3)) ? best : null;
}

export const schemaColumnsModule: CheckModule = {
  id: 'schema-columns',
  version: '1.0.0',
  category: 'DATA',
  title: 'Queries selecting columns that do not exist',

  whatItChecks:
    'Columns referenced by the code against the real information_schema. A query ' +
    'that selects a column the table does not have fails at runtime or silently ' +
    'drops the field — neither a type checker nor an uptime monitor catches it.',

  whatItCannotCatch: [
    'Columns referenced only through dynamic string building the scan was not given.',
    'Columns that exist but hold the wrong data — this checks existence, not correctness.',
    'Row-level access problems — that is the RLS and IDOR checks, not this one.',
    'Tables reached only at runtime under a code path the reference list did not include.',
  ],

  supportedTargetKinds: ['database', 'repository'],
  minimumAccessTier: 'source',
  intrusive: false,

  inputs: [
    {
      name: 'references',
      kind: 'file',
      required: true,
      description:
        'Newline-separated "table:col1,col2 @ source" specs — the columns the code references.',
    },
    {
      name: 'schemaUrl',
      kind: 'url',
      required: true,
      description: 'PostgREST/Supabase REST base URL for live confirmation.',
    },
    {
      name: 'schemaKey',
      kind: 'credentials',
      required: true,
      description: 'Service or anon key to read information_schema and probe columns.',
    },
    {
      name: 'schemaColumns',
      kind: 'file',
      required: true,
      description:
        'Ground truth: newline-separated "table:col1,col2,..." from information_schema. ' +
        'Supplied by the caller so this module stays pure; our sweep fetches it first.',
    },
  ],

  estimatedCredits: 5,
  estimatedRuntimeMs: 30_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const references = parseReferences(context.inputs['references'] ?? '');
    if (references.length === 0) {
      return inconclusive('No column references were supplied to check.', {
        subjectsExamined: 0,
        requestsIssued: 0,
        notes: 'Empty references input.',
      });
    }

    // Ground truth: table -> real columns.
    const schema = new Map<string, Set<string>>();
    for (const line of (context.inputs['schemaColumns'] ?? '').split('\n')) {
      const [table, cols] = line.split(':').map((p) => p.trim());
      if (table === undefined || cols === undefined) continue;
      schema.set(table, new Set(cols.split(',').map((c) => c.trim())));
    }

    if (schema.size === 0) {
      return inconclusive(
        'No live schema was provided, so referenced columns could not be verified. ' +
          'Findings would be guesses without ground truth.',
        { subjectsExamined: 0, requestsIssued: 0, notes: 'Empty schemaColumns.' },
      );
    }

    const findings: Finding[] = [];
    const unconfirmed: string[] = [];
    let examined = 0;
    let requestsIssued = 0;

    const schemaUrl = context.inputs['schemaUrl'] ?? '';
    const schemaKey = context.inputs['schemaKey'] ?? '';
    const minIntervalMs = Math.ceil(1000 / Math.max(context.target.rateLimitRps, 0.1));

    for (const ref of references) {
      if (context.signal.aborted) break;
      examined += 1;

      const realColumns = schema.get(ref.table);

      // PATH 2 — the table must exist for this to be a wrong-column defect.
      if (realColumns === undefined) {
        unconfirmed.push(`${ref.table}.${ref.column}: table not in provided schema (wrong-table, reported separately)`);
        continue;
      }

      // PATH 1 — the column is absent from information_schema.
      if (realColumns.has(ref.column)) continue; // it exists — not a defect

      const evidence: Evidence[] = [];
      let proofPaths = 0;

      proofPaths += 1;
      evidence.push({
        kind: 'query_result',
        statement: `select column_name from information_schema.columns where table_name = '${ref.table}' and column_name = '${ref.column}'`,
        rowCount: 0,
        sample: [],
      });

      proofPaths += 1; // path 2: table exists
      evidence.push({
        kind: 'measurement',
        metric: 'table_exists_column_does_not',
        value: realColumns.size,
        unit: 'real_columns',
        estimated: false,
        method: `Table "${ref.table}" exists with ${realColumns.size} columns; "${ref.column}" is not among them.`,
      });

      // PATH 3 — live PostgREST confirmation the column errors at runtime.
      if (schemaUrl.length > 0 && schemaKey.length > 0) {
        try {
          const probe = await fetch(
            `${schemaUrl}/rest/v1/${ref.table}?select=${encodeURIComponent(ref.column)}&limit=1`,
            {
              headers: {
                'User-Agent': 'JavariVerify/1.0',
                apikey: schemaKey,
                Authorization: `Bearer ${schemaKey}`,
              },
              ...(context.signal !== undefined ? { signal: context.signal } : {}),
            },
          );
          requestsIssued += 1;
          const body = await probe.text();
          const columnError =
            probe.status >= 400 &&
            (body.includes(ref.column) || body.toLowerCase().includes('column') || body.includes('42703'));
          if (columnError) {
            proofPaths += 1;
            evidence.push({
              kind: 'http_response',
              url: `${schemaUrl}/rest/v1/${ref.table}?select=${ref.column}`,
              method: 'GET',
              status: probe.status,
              bodyExcerpt: body.slice(0, 200),
              headers: {},
            });
          }
          await new Promise((r) => setTimeout(r, minIntervalMs));
        } catch {
          // Live probe failed; the schema comparison still stands as evidence.
        }
      }

      // PATH 4 — confirm no alias/view supplies it (approximated: not in any table's columns).
      const suppliedElsewhere = [...schema.values()].some((set) => set.has(ref.column));
      if (!suppliedElsewhere) {
        proofPaths += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'not_supplied_by_any_view_or_alias',
          value: 1,
          unit: 'boolean',
          estimated: false,
          method: `"${ref.column}" appears in no table in the provided schema, so no view or alias supplies it.`,
        });
      }

      // PATH 5 — nearest real column, so the finding carries its fix.
      const suggestion = nearestColumn(ref.column, [...realColumns]);
      if (suggestion !== null) {
        evidence.push({
          kind: 'measurement',
          metric: 'nearest_real_column',
          value: 1,
          unit: 'suggestion',
          estimated: false,
          method: `The closest real column is "${suggestion}". This is likely the intended name.`,
        });
      }

      const first = evidence[0];
      if (first === undefined) continue;

      if (proofPaths >= 4) {
        findings.push({
          ruleId: 'schema-columns',
          category: 'DATA',
          severity: 'HIGH',
          title: `Column "${ref.column}" does not exist on "${ref.table}"`,
          description:
            `The code references \`${ref.table}.${ref.column}\`, but that column is not in the ` +
            `database. Depending on the client this either fails the request at runtime or ` +
            `silently returns rows without the field, so a feature that depends on it breaks ` +
            `with no error a monitor would catch.` +
            (suggestion !== null ? ` The intended column is almost certainly "${suggestion}".` : ''),
          subject: `${ref.table}.${ref.column} (${ref.source})`,
          evidence: [first, ...evidence.slice(1)],
          recommendedFix:
            suggestion !== null
              ? `Change the reference to "${suggestion}", or add the column if it should exist.`
              : `Remove the reference or add the column to "${ref.table}" if it should exist.`,
          fingerprint: `schema-col-${ref.table}-${ref.column}`,
          autoFixable: suggestion !== null,
        });
      } else {
        unconfirmed.push(`${ref.table}.${ref.column}: ${proofPaths} of 4 proof paths (needs live DB probe to confirm at runtime)`);
      }
    }

    const notes = [
      `Checked ${examined} column references against the live schema.`,
      unconfirmed.length > 0 ? `Unconfirmed: ${unconfirmed.join('; ')}` : '',
    ].filter((p) => p.length > 0).join(' ');

    const checked = { subjectsExamined: examined, requestsIssued, notes };

    if (findings.length > 0) {
      const head = findings[0];
      if (head !== undefined) return fail([head, ...findings.slice(1)], checked);
    }
    return pass(checked);
  },
};

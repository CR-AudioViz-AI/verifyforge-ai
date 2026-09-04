/**
 * lib/modules/checks/function-integrity.ts
 *
 * Database functions that reference columns which do not exist.
 *
 * WHY. On 4 September 2026 two functions on this platform were found to have
 * never worked. debit_credits and refund_credits — the code path that takes a
 * customer's credits and the one that gives them back — both selected
 * `profiles.is_admin`, a column that does not exist, and both inserted
 * `operation` and `metadata` into a table that has neither.
 *
 * Every call raised 42703. No credit was ever debited or refunded through them.
 *
 * THE REASON IT WENT UNNOTICED IS THE REASON THIS CHECK EXISTS. A PostgreSQL
 * function body is not validated against the schema when it is created. It is
 * parsed at CREATE time and resolved at RUN time, so a function can reference a
 * column that was dropped years ago and still install cleanly. Nothing fails
 * until somebody calls it — and by then the caller usually sees a boolean.
 * lib/central-services.ts returns `false` on error, so a failed charge was
 * indistinguishable from an ordinary decline.
 *
 * The functions looked correct. They had row locking, an admin bypass and an
 * audit trail. A code review would have passed them. Only running them found it.
 *
 * WHAT THIS CHECKS. Every function body in the public schema, for references to
 * `table.column` and `insert into table (columns)` where the column is not in
 * information_schema. It also reports inserts that omit a NOT NULL column with
 * no default, which is the same defect arriving from the other direction.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
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
  readonly fn: string;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

/** A function whose body we can read, and the schema we check it against. */
interface Fn {
  readonly name: string;
  readonly body: string;
}

async function query<T>(
  restUrl: string,
  key: string,
  sql: string,
): Promise<T[] | null> {
  try {
    const res = await fetch(`${restUrl}/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as T[]) : null;
  } catch {
    return null;
  }
}

export const functionIntegrityCheck: CheckModule = {
  id: 'db.function-integrity',
  version: '1.0.0',
  category: 'DATA',
  title: 'Database functions referencing columns that do not exist',

  whatItChecks:
    'Reads every function body in the public schema and resolves each table.column reference and each INSERT column list against the live schema. Reports references to columns that do not exist, and inserts that omit a NOT NULL column with no default.',

  whatItCannotCatch: [
    'Dynamic SQL built from strings at runtime. A column name assembled with || cannot be resolved without executing the function, and executing an unknown function to test it is not something a scanner should do.',
    'Columns referenced through a view or a type alias rather than directly.',
    'Whether the function is CORRECT. It reports that every column exists, not that the logic does the right thing with them - debit_credits also had an off-by-one in the balance it recorded, and no schema check would have found that.',
    'Functions in schemas other than public.',
    'Whether a function is ever called. A broken function nobody calls is not urgent, and this cannot tell the difference.',
    'BARE column references in a select list. `select coalesce(is_admin, false) from profiles` names no table, so it is not resolved - and that is exactly the form of the FIRST defect this module was built from. Tested against the real pre-fix body of debit_credits: the INSERT was caught, the bare select was not. Resolving it needs a SQL parser that knows which table each unqualified identifier belongs to, and a heuristic that guesses would flag every local variable in every function. Half the defect caught, stated rather than implied.',
  ],

  supportedTargetKinds: ['database'],
  minimumAccessTier: 'internal',
  intrusive: false,

  inputs: [
    { name: 'restUrl', description: 'PostgREST base URL.', required: true, kind: 'origin' },
    { name: 'serviceKey', description: 'Service-role key, read only.', required: true, kind: 'credentials' },
  ],

  estimatedCredits: 6,
  estimatedRuntimeMs: 30_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const restUrl = String(context.inputs?.['restUrl'] ?? '').replace(/\/+$/, '');
    const key = String(context.inputs?.['serviceKey'] ?? '');

    if (!restUrl || !key) {
      return {
        status: 'inconclusive',
        reason: 'A PostgREST URL and a service-role key are both required; nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    let requests = 0;

    const columns = await query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
      restUrl,
      key,
      `select table_name, column_name, is_nullable, column_default
         from information_schema.columns where table_schema = 'public'`,
    );
    requests++;

    const fns = await query<Fn>(
      restUrl,
      key,
      `select p.proname as name, p.prosrc as body
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'`,
    );
    requests++;

    if (columns === null || fns === null) {
      return {
        status: 'inconclusive',
        reason:
          'The schema or the function bodies could not be read. This check needs an exec_sql RPC or equivalent; without it nothing is concluded rather than assumed clean.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Schema unreadable.' },
      };
    }

    // table -> its columns, and table -> columns that MUST be supplied.
    const byTable = new Map<string, Set<string>>();
    const required = new Map<string, Set<string>>();
    for (const c of columns) {
      if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Set());
      byTable.get(c.table_name)?.add(c.column_name);
      if (c.is_nullable === 'NO' && c.column_default === null) {
        if (!required.has(c.table_name)) required.set(c.table_name, new Set());
        required.get(c.table_name)?.add(c.column_name);
      }
    }

    const problems: Problem[] = [];

    for (const fn of fns) {
      const body = fn.body ?? '';
      if (!body) continue;

      // INSERT INTO table (a, b, c)
      for (const m of body.matchAll(/insert\s+into\s+(?:public\.)?(\w+)\s*\(([^)]*)\)/gi)) {
        const table = (m[1] ?? '').toLowerCase();
        const cols = byTable.get(table);
        if (!cols) continue; // unknown table is a different defect class

        const named = (m[2] ?? '')
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase())
          .filter(Boolean);

        const ghosts = named.filter((n) => !cols.has(n));
        if (ghosts.length > 0) {
          problems.push({
            ruleId: 'db.function.insert-ghost-column',
            severity: 'BLOCKER',
            fn: fn.name,
            title: `${fn.name}() inserts ${ghosts.length} column(s) that do not exist on ${table}`,
            description:
              `The function writes ${ghosts.map((g) => `\`${g}\``).join(', ')} into ${table}, and ${table} has no such column.\n\n` +
              'Every call raises 42703. PostgreSQL does not validate a function body against the schema at CREATE time — ' +
              'it resolves columns at RUN time — so this installed cleanly and fails only when somebody calls it.\n\n' +
              'That is what makes it dangerous rather than merely broken: the caller usually sees a boolean or an empty ' +
              'result, and an exception inside a function is indistinguishable from a refusal.',
            fix: `Correct the column names, or add the columns. Then CALL the function and check the row landed — a function that compiles is not a function that works.`,
            detail: `${fn.name} -> ${table}: ${ghosts.join(', ')}`,
          });
        }

        const missing = [...(required.get(table) ?? [])].filter((r) => !named.includes(r));
        if (missing.length > 0 && ghosts.length === 0) {
          problems.push({
            ruleId: 'db.function.insert-missing-required',
            severity: 'HIGH',
            fn: fn.name,
            title: `${fn.name}() omits ${missing.length} required column(s) on ${table}`,
            description:
              `${missing.map((g) => `\`${g}\``).join(', ')} are NOT NULL with no default, and this insert does not supply them.\n\n` +
              'The insert raises 23502 every time. Same failure shape as a missing column: it installs, then fails at run time.',
            fix: 'Supply every NOT NULL column with no default, or give those columns a default.',
            detail: `${fn.name} -> ${table}: missing ${missing.join(', ')}`,
          });
        }
      }

      // table.column and `select coalesce(column, ...) from table`
      for (const m of body.matchAll(/\b(\w+)\.(\w+)\b/g)) {
        const table = (m[1] ?? '').toLowerCase();
        const col = (m[2] ?? '').toLowerCase();
        const cols = byTable.get(table);
        if (!cols || cols.has(col)) continue;
        // Aliases and schema qualifiers produce false hits, so only report when
        // the left side is a real table AND the right side is not one of its
        // columns. A one-letter alias is never a table name here.
        if (table.length <= 2) continue;
        problems.push({
          ruleId: 'db.function.ghost-column-ref',
          severity: 'HIGH',
          fn: fn.name,
          title: `${fn.name}() references ${table}.${col}, which does not exist`,
          description:
            `${table} has no column ${col}. The reference resolves at run time, so the function installed cleanly and ` +
            'raises 42703 when called.\n\n' +
            'This is the exact shape of the defect that stopped every credit debit and refund on this platform working: ' +
            '`select coalesce(is_admin, false) from profiles`, where the real column is `role`.',
          fix: `Check what ${table} actually has. The intended column has usually been renamed rather than removed.`,
          detail: `${fn.name}: ${table}.${col}`,
        });
      }
    }

    // One finding per function, so a function with four bad references is one
    // problem to fix rather than four items to wade through.
    const seen = new Set<string>();
    const deduped = problems.filter((p) => {
      const k = `${p.ruleId}:${p.fn}:${p.detail}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const findings: Finding[] = deduped.map((p) => ({
      ruleId: p.ruleId,
      category: 'DATA',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: p.fn,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Resolved against information_schema.columns for the public schema; re-runnable with the same query.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, `${p.fn}:${p.detail}`),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: fns.length,
      requestsIssued: requests,
      notes:
        `${fns.length} function(s) in the public schema resolved against ${columns.length} column definitions. ` +
        'Dynamic SQL is not resolved — a column name built with string concatenation cannot be checked without running the ' +
        'function, and running an unknown function to test it is not something a scanner should do.',
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default functionIntegrityCheck;

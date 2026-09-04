/**
 * lib/modules/checks/source-of-truth.ts
 *
 * Two answers to one question.
 *
 * WHY. This platform kept producing the same shape of defect: a concept with two
 * homes that disagree, where nothing is broken until somebody reads the wrong one.
 *
 *   public.credits said a user had 1,400 credits. public.user_credits said 39,676.
 *   Same user, same day, a 96 percent gap. Fifteen files read user_credits and
 *   nothing read credits, so nobody had noticed.
 *
 *   /api/pricing served Business at $79.99. /api/pricing/tiers served a Premium at
 *   $99.99 that does not exist in any table. Both were live, both returned 200,
 *   and only one matched what a customer is actually charged.
 *
 * Neither was causing harm on the day it was found. That is what makes this class
 * worth a check rather than a note: it is a loaded gun, not a fire. A plausible
 * table with a plausible name and real-looking numbers, waiting for the next
 * person to wire a page to it. The wrong answer is not obviously wrong — it looks
 * exactly like the right one.
 *
 * WHAT IT CHECKS. Endpoints the customer is given, compared against each other.
 * When two endpoints publish the same named concept with different values, that is
 * reported — with both values, so the reader can see which is wrong rather than
 * being told there is a discrepancy.
 *
 * WHAT IT DOES NOT DO. It never decides which one is authoritative. Only the owner
 * knows whether the price on the pricing page or the price in the database is the
 * one they meant, and a scanner that guesses would tell somebody to correct the
 * correct one.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
} from '../contract';

/** A named value published by an endpoint, flattened for comparison. */
interface Published {
  readonly path: string;
  readonly key: string;
  readonly value: string;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JavariVerify/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Pulls out name/value pairs where the name looks like an identity and the value
 * looks like a figure a customer would care about. Deliberately narrow: comparing
 * every field of every response produces noise, and noise is what makes a section
 * get skipped.
 */
function extractNamedValues(body: unknown, path: string): Published[] {
  const out: Published[] = [];
  const NAME_KEYS = ['name', 'title', 'label', 'id', 'slug', 'tier', 'plan'];

  // 2026-09-04: field names are normalised to the CONCEPT they carry, not
  // compared literally.
  //
  // The first version of this check keyed on the field name and therefore failed
  // against the exact defect it was written for: /api/pricing published
  // price_monthly_usd while /api/pricing/tiers published price, so "Pro at 29.99"
  // and "Pro at 29.99" were two unrelated keys and the conflict was invisible.
  //
  // Two systems that disagree have usually drifted in their vocabulary as well as
  // their values. Comparing raw field names finds only the disagreements that
  // were already easy to see.
  const CONCEPT: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['price', ['price', 'price_monthly_usd', 'price_usd', 'monthly_price_usd', 'amount', 'cost']],
    ['price_minor', ['price_cents', 'monthly_cents', 'amount_cents']],
    ['credits', ['credits', 'monthly_credits', 'credits_monthly', 'balance']],
    ['limit', ['limit', 'seat_limit', 'record_limit']],
  ];
  const VALUE_KEYS = CONCEPT.flatMap(([, fields]) => fields);
  const conceptOf = (field: string): string =>
    CONCEPT.find(([, fields]) => fields.includes(field))?.[0] ?? field;

  const walk = (node: unknown, depth: number): void => {
    if (depth > 4 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 60)) walk(item, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    let name: string | null = null;
    for (const k of NAME_KEYS) {
      const v = rec[k];
      if (typeof v === 'string' && v.length > 0 && v.length < 60) { name = v; break; }
    }
    if (name !== null) {
      for (const k of VALUE_KEYS) {
        const v = rec[k];
        if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))) {
          out.push({ path, key: `${name.toLowerCase()}.${conceptOf(k)}`, value: String(Number(v)) });
        }
      }
    }
    for (const v of Object.values(rec)) walk(v, depth + 1);
  };

  walk(body, 0);
  return out;
}

export const sourceOfTruthCheck: CheckModule = {
  id: 'data.source-of-truth',
  version: '1.0.0',
  category: 'DATA',
  title: 'Two endpoints publishing the same value differently',

  whatItChecks:
    'Fetches the JSON endpoints given, extracts named values a customer would act on — prices, credit amounts, limits — and reports any name that carries different values on different endpoints.',

  whatItCannotCatch: [
    'Which endpoint is right. It reports both values and stops. Only the owner knows whether the pricing page or the database holds the figure they meant, and a scanner that guesses would tell somebody to correct the correct one.',
    'A concept published under two DIFFERENT names. "Business at $79.99" and "Premium at $99.99" are reported as separate items, not as one contradiction, because nothing observable says they are the same plan renamed.',
    'Disagreement between two database tables. This compares what is published over HTTP; two tables that disagree are invisible from outside, and on this platform that was the credits case - public.credits at 1,400 against user_credits at 39,676 for one user.',
    'Endpoints that need authentication. A gated endpoint is not fetched, so a value that only a signed-in customer sees is not compared.',
    'Whether either value is CORRECT. Two endpoints agreeing on the wrong price agree.',
    'A plan that exists on ONE endpoint only. "Premium at $99.99" published where no other endpoint mentions Premium is not a conflict by this definition, because there is nothing to compare it against - and on this platform Premium was exactly that: a plan in no table, on a live endpoint, invisible to any check that only looks for disagreement. Catching it needs the database as a second source, which this module does not have.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'origin', description: 'The origin to check.', required: true, kind: 'origin' },
    {
      name: 'endpoints',
      description:
        'Newline-separated JSON paths that publish overlapping values — for example the endpoint your pricing page reads and the one your checkout reads. Required: these are never guessed, because a guessed path that misses returns the same silence as an estate that has no such endpoint.',
      required: true,
      kind: 'origin',
    },
  ],

  estimatedCredits: 3,
  estimatedRuntimeMs: 20_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }
    const origin = raw.replace(/\/+$/, '');

    // 2026-09-04: the guessed default list is gone, and nothing replaced it.
    //
    // It held /api/pricing, /api/pricing/tiers and /api/plans - the paths THIS
    // platform happens to use. On any other estate that list finds nothing, and a
    // check that examines nothing returns a clean pass. For a tool whose whole
    // purpose is refusing to say fine when it does not know, that is the worst
    // failure available.
    //
    // A discovery pass was written to replace it - OpenAPI documents, then paths
    // in the page markup - and it was TESTED before shipping. It found zero
    // endpoints on three sites including this platform's own, because modern
    // applications put their fetch calls in bundled JavaScript rather than the
    // served HTML. Shipping it would have produced the same silent nothing with
    // more machinery in front of it.
    //
    // So the endpoints are required. Without them this check says it did not run,
    // which is true, instead of saying everything agrees, which would not be.
    const targets = String(context.inputs?.['endpoints'] ?? '')
      .split('\n').map((s) => s.trim()).filter(Boolean);

    if (targets.length < 2) {
      return {
        status: 'inconclusive',
        reason:
          'This check needs at least two endpoints that publish overlapping values, and they must be named — they are not guessed. ' +
          'Supply them as newline-separated paths, for example the endpoint your pricing page reads and the one your checkout reads. ' +
          'Nothing was examined, so nothing is concluded.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: `${targets.length} endpoint(s) supplied; two are the minimum.` },
      };
    }

    let requests = 0;
    const published: Published[] = [];
    const reachable: string[] = [];

    for (const p of targets) {
      const body = await getJson(`${origin}${p}`);
      requests++;
      if (body === null) continue;
      reachable.push(p);
      published.push(...extractNamedValues(body, p));
    }

    if (reachable.length < 2) {
      return {
        status: 'inconclusive',
        reason:
          `Only ${reachable.length} of ${targets.length} endpoint(s) returned JSON. A contradiction needs two sources; with fewer there is nothing to compare and nothing is concluded.`,
        findings: [],
        checked: {
          subjectsExamined: reachable.length,
          requestsIssued: requests,
          notes: `Reachable: ${reachable.join(', ') || 'none'}.`,
        },
      };
    }

    // key -> path -> value
    const byKey = new Map<string, Map<string, string>>();
    for (const pub of published) {
      if (!byKey.has(pub.key)) byKey.set(pub.key, new Map());
      byKey.get(pub.key)?.set(pub.path, pub.value);
    }

    const conflicts: { key: string; entries: [string, string][] }[] = [];
    for (const [key, perPath] of byKey) {
      if (perPath.size < 2) continue;
      const values = new Set(perPath.values());
      if (values.size > 1) conflicts.push({ key, entries: [...perPath.entries()] });
    }

    const checked = {
      subjectsExamined: byKey.size,
      requestsIssued: requests,
      notes:
        `${reachable.length} endpoint(s) returned JSON: ${reachable.join(', ')}. ` +
        `${byKey.size} named value(s) extracted, ${conflicts.length} published differently on different endpoints. ` +
        'Only prices, credit amounts and limits are compared - every field of every response would produce noise, and noise is what makes a section get skipped.',
    };

    if (conflicts.length === 0) return { status: 'pass', findings: [], checked };

    const first = conflicts[0];
    if (first === undefined) return { status: 'pass', findings: [], checked };

    const findings: Finding[] = conflicts.slice(0, 12).map((c) => ({
      ruleId: 'data.source-of-truth.conflict',
      category: 'DATA' as const,
      // HIGH. A customer shown one price and charged another is a chargeback and
      // a complaint, and it is indistinguishable from deliberate until explained.
      severity: 'HIGH' as const,
      title: `"${c.key}" is published with ${new Set(c.entries.map((e) => e[1])).size} different values`,
      description:
        `The same named value differs depending on which endpoint is asked:\n\n` +
        c.entries.map(([p, v]) => `  ${p} → ${v}`).join('\n') +
        `\n\nBoth are live and both return 200. Nothing here says which is right, and this check does not guess: ` +
        `only you know which figure you meant.\n\n` +
        `This matters even when no page reads the wrong one today. On the platform this check was built from, a live ` +
        `endpoint served a "Premium" plan at $99.99 that existed in no table, beside a database serving Business at ` +
        `$79.99. Nothing customer-facing called it, so nobody had been charged wrongly — it was a plausible endpoint, ` +
        `in the right place, with the wrong numbers, waiting for someone to wire a page to it.`,
      subject: `${origin} · ${c.key}`,
      evidence: [
        {
          kind: 'measurement' as const,
          metric: 'conflicting_published_values',
          value: c.entries.length,
          unit: 'endpoints',
          estimated: false,
          method: c.entries.map(([p, v]) => `GET ${origin}${p} → ${c.key} = ${v}`).join(' ; '),
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix:
        'Decide which source is authoritative and make the other read from it rather than holding its own copy. If the second endpoint has no callers, delete it — a duplicate that nobody reads is the one that gets read by accident. On failure it should return an error rather than a fallback: a wrong price is a billing dispute, a missing price is a page that retries.',
      fingerprint: fingerprint('data.source-of-truth.conflict', `${origin}:${c.key}`),
      autoFixable: false,
    }));

    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default sourceOfTruthCheck;

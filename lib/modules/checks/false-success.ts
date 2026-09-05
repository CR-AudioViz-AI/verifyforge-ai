/**
 * lib/modules/checks/false-success.ts
 *
 * API paths that answer 200 with a web page.
 *
 * WHY. On this platform a live resume-builder had a real form. Somebody could
 * type their resume, press submit, and be told "complete". Nothing was sent.
 *
 * The page posted to /api/tools/resume-builder/process, which does not exist. An
 * unmatched path in a single-page application falls through to the application
 * shell, so the response was 200 with HTML — and `response.ok` was TRUE. The
 * failure branch never ran.
 *
 * That is the shape this check looks for, and it is not specific to any framework
 * or platform. Any application that serves a catch-all page will do the same to
 * any API path that no longer exists: a rename, a deleted route, a typo in a
 * fetch call. The client asks for JSON, receives a document, and reports success.
 *
 * A false success is worse than an error. An error prompts a retry; a false
 * success prompts trust. The person walks away believing their work was saved.
 *
 * HOW IT DECIDES. It asks for a path that certainly does not exist. If the answer
 * is 200 and the body is a document, every missing route on that origin answers
 * the same way, and no client can tell a working endpoint from a deleted one.
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

interface Probe {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly looksLikeDocument: boolean;
  readonly bytes: number;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

/** A body is a document if it declares itself one or opens like one. */
function isDocument(contentType: string, body: string): boolean {
  if (contentType.includes('html')) return true;
  const head = body.slice(0, 400).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

async function probe(url: string, method: 'GET' | 'POST'): Promise<Probe | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        // Asking for JSON explicitly matters: an origin that content-negotiates
        // correctly answers 404 here even if a browser would get the shell.
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'JavariVerify/1.0 (+https://craudiovizai.com)',
      },
      // 2026-09-04: `undefined` is not assignable to BodyInit | null under this
      // repo's stricter lib.dom types, so the property is omitted for GET rather
      // than set to undefined. Caught by wiring the guard into the build, which
      // is the point of wiring it in.
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.text();
    return {
      url,
      status: res.status,
      contentType,
      looksLikeDocument: isDocument(contentType, body),
      bytes: body.length,
    };
  } catch {
    return null;
  }
}

export const falseSuccessCheck: CheckModule = {
  id: 'api.false-success',
  version: '1.0.0',
  category: 'API',
  title: 'Missing API paths that answer 200 with a page',

  whatItChecks:
    'Requests API paths that cannot exist, with an Accept header asking for JSON, and reports when the answer is a successful status carrying a web page. On such an origin no client can distinguish a working endpoint from a deleted one.',

  whatItCannotCatch: [
    'WHICH of your endpoints are missing. This establishes that a missing one would answer 200 with a page; finding the specific dead paths means reading the client code that calls them, which a scanner outside the application cannot do.',
    'A missing endpoint on an origin that correctly returns 404. That is the good outcome for this check and a broken feature all the same — the client gets an honest error and the feature is still gone.',
    'An endpoint that exists and returns 200 with wrong or empty data. Answering is not the same as answering correctly, and this only looks at the shape of the answer.',
    'Paths behind authentication. A gate that refuses before routing is reached hides this behaviour, and hides it from real clients too, so the risk is genuinely lower there.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'origin', description: 'The origin to check.', required: true, kind: 'origin' },
    {
      name: 'apiPrefixes',
      description:
        'Newline-separated path prefixes where this application serves its API, e.g. /api or /v1 or /rest. Defaults to a small set of widespread conventions; naming your own is more reliable.',
      required: false,
      kind: 'origin',
    },
  ],

  estimatedCredits: 2,
  estimatedRuntimeMs: 15_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied, so nothing was requested.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }
    const origin = raw.replace(/\/+$/, '');

    // These are conventions rather than assumptions about any one application:
    // the prefix under which an API is served. Where it differs, the input names
    // it. Unlike a guessed ENDPOINT, a guessed prefix that misses is visible —
    // the probe returns the same page a browser would get for any unknown path,
    // and that is exactly what is being measured.
    const prefixes = String(context.inputs?.['apiPrefixes'] ?? '')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const roots = prefixes.length > 0 ? prefixes : ['/api', '/v1', '/rest', '/graphql/..'];

    // A path nobody could have implemented. The token is deliberately absurd so a
    // 200 cannot be a real endpoint that happens to match.
    const NONCE = '__verify_absent_path_probe_9f3a__';

    let requests = 0;
    const results: Probe[] = [];

    for (const root of roots.slice(0, 6)) {
      for (const method of ['GET', 'POST'] as const) {
        const p = await probe(`${origin}${root}/${NONCE}`, method);
        requests++;
        if (p !== null) results.push(p);
      }
    }

    if (results.length === 0) {
      return {
        status: 'inconclusive',
        reason: 'No probe completed — the origin did not answer. Nothing is concluded about how it handles missing paths.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Origin unreachable.' },
      };
    }

    const lying = results.filter((r) => r.status >= 200 && r.status < 300 && r.looksLikeDocument);

    const checked = {
      subjectsExamined: results.length,
      requestsIssued: requests,
      notes:
        `${results.length} probe(s) to paths that cannot exist, each asking for JSON. ` +
        `${lying.length} answered with a success status and a web page. ` +
        'Which of your own endpoints are missing is not determined here — that needs the client code that calls them.',
    };

    if (lying.length === 0) return { status: 'pass', findings: [], checked };

    const first = lying[0];
    if (first === undefined) return { status: 'pass', findings: [], checked };

    const findings: Finding[] = [
      {
        ruleId: 'api.false-success.catch-all',
        category: 'API',
        // HIGH. This does not break anything by itself; it removes the ability of
        // every client to notice that something else is broken.
        severity: 'HIGH',
        title: 'A missing API path answers 200 with a web page',
        description:
          `${first.url} cannot exist, and asking for it with Accept: application/json returned ` +
          `HTTP ${first.status} with ${first.contentType || 'a document body'}.\n\n` +
          'Every client that checks `response.ok` will treat a deleted, renamed or mistyped endpoint as a success. ' +
          'The failure branch never runs, so the code that would have shown an error instead shows completion.\n\n' +
          'On the platform this check was built from, a resume builder did exactly that. It had a real form. Somebody ' +
          'could type their resume, press submit, and be told "complete" — while nothing was sent anywhere, because ' +
          'the endpoint it posted to had never been built.\n\n' +
          'A false success is worse than an error. An error prompts a retry; a false success prompts trust.',
        subject: origin,
        evidence: [
          {
            kind: 'measurement',
            metric: 'absent_path_success_responses',
            value: lying.length,
            unit: 'probes',
            estimated: false,
            method: lying
              .map((r) => `${r.url} → ${r.status} ${r.contentType || 'no content-type'} (${r.bytes} bytes)`)
              .join(' ; '),
          },
        ] as [Evidence, ...Evidence[]],
        recommendedFix:
          'Return 404 with a JSON body for unmatched paths under your API prefix, before the catch-all page handler is reached. ' +
          'Most frameworks allow a route-level fallback scoped to a prefix. The body matters as much as the status: a client ' +
          'that receives JSON with a code can report what happened, and one that receives a page cannot.',
        fingerprint: fingerprint('api.false-success.catch-all', origin),
        autoFixable: false,
      },
    ];

    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default falseSuccessCheck;

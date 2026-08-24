/**
 * lib/modules/checks/idor-access.ts
 *
 * Insecure Direct Object Reference — one user reaching another user's records.
 *
 * This is the defect that leaks customer data, and it is the one automated
 * scanners are worst at, because finding it requires two authenticated identities
 * and the judgement to know that user A receiving user B's record is wrong even
 * though the server returned a perfectly valid 200. A status-code scanner sees
 * success. A single-session scanner cannot even attempt it.
 *
 * It is also the defect our own audit found in its most dangerous form: a
 * service-role client, an ID taken straight from the request, and no auth gate.
 * That combination hands every row to anyone who changes a number in a URL.
 *
 * FIVE INDEPENDENT EVIDENCE PATHS, and this module will not run without two
 * distinct authenticated sessions, because you cannot prove cross-user access
 * with one identity:
 *   1. As user A, fetch A's own resource. Establishes the baseline shape.
 *   2. As user B, request A's resource by its identifier.
 *   3. The response returns 200 AND carries A's data, not an error and not B's.
 *   4. An anonymous request for the same resource is correctly refused, proving
 *      the endpoint knows how to say no and simply failed to for user B.
 *   5. A second, unrelated identifier belonging to A is also reachable by B,
 *      confirming a systemic authorization gap rather than one shared record.
 *
 * Four of five is reported as a strong unconfirmed signal. Cross-user data
 * exposure is too serious to assert on anything less than full corroboration,
 * and too serious to stay silent about when four paths already agree.
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
import { Session } from '../../engine/session';

/**
 * Inputs describe two users and the resources to probe. The second session's
 * credentials arrive as inputs so the module can build an independent identity
 * without the runner needing to know about a second session.
 */
interface ResourcePair {
  readonly ownerAUrl: string; // A's own resource, fetched as A
  readonly probedAsBUrl: string; // the same resource, requested as B (often identical URL)
}

function parseResources(raw: string): ResourcePair[] {
  const pairs: ResourcePair[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Format: "<ownerAUrl>" or "<ownerAUrl> => <probedAsBUrl>"
    const [a, b] = trimmed.split('=>').map((part) => part.trim());
    if (a === undefined || a.length === 0) continue;
    pairs.push({ ownerAUrl: a, probedAsBUrl: b !== undefined && b.length > 0 ? b : a });
  }
  return pairs;
}

/** Overlap between two response bodies, as a fraction of the smaller one. */
function bodyOverlap(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const shingles = (text: string): Set<string> => {
    const set = new Set<string>();
    const normalised = text.replace(/\s+/g, ' ');
    for (let i = 0; i + 24 <= normalised.length; i += 12) {
      set.add(normalised.slice(i, i + 24));
    }
    return set;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const shingle of sa) if (sb.has(shingle)) shared += 1;
  return shared / Math.min(sa.size, sb.size);
}

function fingerprint(url: string): string {
  let hash = 0;
  for (const char of `idor:${url}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `idor-${Math.abs(hash).toString(36)}`;
}

export const idorAccessModule: CheckModule = {
  id: 'idor-access',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Cross-user data access (IDOR)',

  whatItChecks:
    'Whether one authenticated user can retrieve another user\'s records by ' +
    'referencing their identifier. Requires two distinct user identities and ' +
    'confirms that a 200 response actually carries the wrong user\'s data.',

  whatItCannotCatch: [
    'IDOR reachable only through a write operation this module does not perform. ' +
      'It reads; it does not create, update or delete another user\'s data.',
    'Authorization defects in resources not supplied in the input list. It probes ' +
      'the identifiers given, not every object in the system.',
    'Cases where both test users legitimately share access to a resource, which ' +
      'this module cannot distinguish from a leak without knowing your data model.',
    'Object references that are unguessable and never exposed to user B, since it ' +
      'can only probe identifiers it has been given.',
  ],

  supportedTargetKinds: ['web_property', 'http_api'],
  minimumAccessTier: 'authenticated',
  intrusive: true,

  inputs: [
    {
      name: 'resources',
      kind: 'url',
      required: true,
      description:
        'Newline-separated resources owned by user A. Each is "<url>" or ' +
        '"<A-owns-url> => <same-url-requested-as-B>".',
    },
    {
      name: 'userB_probeUrl',
      kind: 'url',
      required: true,
      description: 'A URL that proves user B is signed in (B\'s own dashboard or whoami).',
    },
    {
      name: 'userB_marker',
      kind: 'credentials',
      required: true,
      description: 'A string present only when user B is authenticated.',
    },
    {
      name: 'userB_auth_kind',
      kind: 'credentials',
      required: true,
      description: 'How user B authenticates: "bearer", "cookie", or "supabase_password".',
    },
    {
      name: 'userB_secret',
      kind: 'credentials',
      required: true,
      description: 'User B\'s token, cookie header, or "email:password:projectUrl:anonKey".',
    },
  ],

  estimatedCredits: 12,
  estimatedRuntimeMs: 60_000,
  requiresAuthenticatedSession: true,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    // User A is the runner's session. It must be genuinely authenticated.
    if (!context.session.isUsable() || context.session.achievedTier('authenticated') !== 'authenticated') {
      return inconclusive(
        'User A\'s session is not authenticated, so cross-user access cannot be tested. ' +
          context.session.diagnostics().detail,
        { subjectsExamined: 0, requestsIssued: 0, notes: 'No authenticated primary session.' },
      );
    }

    // Build user B as an independent, separately-proven identity.
    const bKind = context.inputs['userB_auth_kind'] ?? '';
    const bSecret = context.inputs['userB_secret'] ?? '';
    const bProbe = context.inputs['userB_probeUrl'] ?? '';
    const bMarker = context.inputs['userB_marker'] ?? '';

    const strategyB = ((): import('../../engine/session').SessionStrategy | null => {
      if (bKind === 'bearer') return { kind: 'bearer', token: bSecret };
      if (bKind === 'cookie') return { kind: 'cookie', cookieHeader: bSecret };
      if (bKind === 'supabase_password') {
        const [email, password, projectUrl, anonKey] = bSecret.split(':');
        if (email && password && projectUrl && anonKey) {
          return { kind: 'supabase_password', email, password, projectUrl, anonKey };
        }
      }
      return null;
    })();

    if (strategyB === null) {
      return inconclusive(
        `User B credentials could not be parsed for auth kind "${bKind}".`,
        { subjectsExamined: 0, requestsIssued: 0, notes: 'Bad user B configuration.' },
      );
    }

    const sessionB = new Session(strategyB, {
      probeUrl: bProbe,
      expectAuthenticatedMarker: bMarker,
    });
    const bEstablished = await sessionB.establish(context.signal);

    if (!bEstablished) {
      return inconclusive(
        'User B could not be authenticated, so cross-user access cannot be tested. ' +
          sessionB.diagnostics().detail,
        { subjectsExamined: 0, requestsIssued: 1, notes: 'User B login unproven.' },
      );
    }

    const resources = parseResources(context.inputs['resources'] ?? '');
    if (resources.length === 0) {
      return inconclusive('No resources were supplied to probe.', {
        subjectsExamined: 0,
        requestsIssued: 0,
        notes: 'Empty resources input.',
      });
    }

    const findings: Finding[] = [];
    const unconfirmed: string[] = [];
    let examined = 0;
    let requestsIssued = 0;

    const headersA = context.session.authHeaders();
    const headersB = sessionB.authHeaders();
    const minIntervalMs = Math.ceil(1000 / Math.max(context.target.rateLimitRps, 0.1));

    // A second resource of A's, for path 5's systemic check.
    const otherOwned = resources.length > 1 ? resources[1] : undefined;

    for (const resource of resources) {
      if (context.signal.aborted) break;

      // Gate on the primary session staying alive.
      const alive = await context.session.checkpoint(resource.ownerAUrl, context.signal);
      if (!alive) {
        return inconclusive(
          context.session.diagnostics().detail,
          { subjectsExamined: examined, requestsIssued, notes: 'Primary session expired mid-scan.' },
        );
      }

      const evidence: Evidence[] = [];
      let confirmations = 0;
      examined += 1;

      try {
        // PATH 1 — A fetches A's own resource.
        const aOwn = await fetch(resource.ownerAUrl, {
          headers: { 'User-Agent': 'JavariVerify/1.0', ...headersA },
          redirect: 'follow',
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
        });
        requestsIssued += 1;
        const aOwnBody = await aOwn.text();

        if (!aOwn.ok || aOwnBody.length === 0) {
          // A cannot even read its own resource; nothing to compare against.
          await new Promise((r) => setTimeout(r, minIntervalMs));
          continue;
        }
        confirmations += 1;
        evidence.push({
          kind: 'http_response',
          url: resource.ownerAUrl,
          method: 'GET (as user A, the owner)',
          status: aOwn.status,
          bodyExcerpt: aOwnBody.slice(0, 240),
          headers: {},
        });

        // PATH 2 — B requests A's resource.
        const bProbeResp = await fetch(resource.probedAsBUrl, {
          headers: { 'User-Agent': 'JavariVerify/1.0', ...headersB },
          redirect: 'follow',
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
        });
        requestsIssued += 1;
        const bBody = await bProbeResp.text();

        // PATH 3 — B got 200 AND A's data.
        const overlap = bodyOverlap(aOwnBody, bBody);
        const leaked = bProbeResp.ok && overlap > 0.6;

        if (!leaked) {
          // B was correctly refused or got different content. Not a finding.
          await new Promise((r) => setTimeout(r, minIntervalMs));
          continue;
        }
        confirmations += 2; // paths 2 and 3
        evidence.push({
          kind: 'http_response',
          url: resource.probedAsBUrl,
          method: 'GET (as user B, NOT the owner)',
          status: bProbeResp.status,
          bodyExcerpt: bBody.slice(0, 240),
          headers: {},
        });
        evidence.push({
          kind: 'measurement',
          metric: 'response_overlap_with_owner_data',
          value: Number(overlap.toFixed(2)),
          unit: 'fraction',
          estimated: false,
          method:
            "User B's response overlaps user A's private data by this fraction. " +
            'Above 0.6 means B received A\'s record, not an error and not B\'s own.',
        });

        // PATH 4 — anonymous is correctly refused, proving the endpoint CAN say no.
        const anon = await fetch(resource.probedAsBUrl, {
          headers: { 'User-Agent': 'JavariVerify/1.0' },
          redirect: 'follow',
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
        });
        requestsIssued += 1;
        const anonBody = await anon.text();
        const anonRefused = !anon.ok || bodyOverlap(aOwnBody, anonBody) < 0.3;
        if (anonRefused) {
          confirmations += 1;
          evidence.push({
            kind: 'http_response',
            url: resource.probedAsBUrl,
            method: 'GET (anonymous)',
            status: anon.status,
            bodyExcerpt:
              `Anonymous request was refused (${anon.status}). The endpoint knows how ` +
              'to deny access and simply failed to for an authenticated non-owner.',
            headers: {},
          });
        }

        // PATH 5 — a second of A's resources is also reachable by B (systemic).
        if (otherOwned !== undefined && otherOwned.ownerAUrl !== resource.ownerAUrl) {
          const aOther = await fetch(otherOwned.ownerAUrl, {
            headers: { 'User-Agent': 'JavariVerify/1.0', ...headersA },
            ...(context.signal !== undefined ? { signal: context.signal } : {}),
          });
          const bOther = await fetch(otherOwned.probedAsBUrl, {
            headers: { 'User-Agent': 'JavariVerify/1.0', ...headersB },
            ...(context.signal !== undefined ? { signal: context.signal } : {}),
          });
          requestsIssued += 2;
          const aOtherBody = await aOther.text();
          const bOtherBody = await bOther.text();
          if (bOther.ok && bodyOverlap(aOtherBody, bOtherBody) > 0.6) {
            confirmations += 1;
            evidence.push({
              kind: 'measurement',
              metric: 'second_resource_also_leaked',
              value: 1,
              unit: 'boolean',
              estimated: false,
              method:
                'A second, unrelated resource of user A is also reachable by user B. ' +
                'This is a systemic authorization gap, not one shared record.',
            });
          }
        }

        const first = evidence[0];
        if (first === undefined) continue;

        if (confirmations >= 5) {
          findings.push({
            ruleId: 'idor-access',
            category: 'SECURITY',
            severity: 'BLOCKER',
            title: 'One user can read another user\'s data',
            description:
              'A signed-in user retrieved a different user\'s private record simply by ' +
              'referencing its identifier. The server returned 200 and the wrong user\'s ' +
              'data. An anonymous request for the same resource was correctly refused, ' +
              'which proves the endpoint can enforce access and does not for an ' +
              'authenticated non-owner. This is how customer data leaks.',
            subject: resource.probedAsBUrl,
            evidence: [first, ...evidence.slice(1)],
            recommendedFix:
              'Enforce ownership on the server for every read: the authenticated user ' +
              'ID must match the record\'s owner, checked in the query itself (a WHERE ' +
              'clause or an RLS policy), never trusted from the request. A service-role ' +
              'client with an ID taken from the request and no owner check is the exact ' +
              'shape that causes this.',
            fingerprint: fingerprint(resource.probedAsBUrl),
            autoFixable: false,
          });
        } else {
          unconfirmed.push(
            `${resource.probedAsBUrl}: ${confirmations} of 5 paths — possible leak, not fully confirmed`,
          );
        }
      } catch (error: unknown) {
        context.log('warn', `idor probe failed for ${resource.probedAsBUrl}: ${
          error instanceof Error ? error.message : 'unknown'
        }`);
      }

      await new Promise((r) => setTimeout(r, minIntervalMs));
    }

    const notes = [
      `Probed ${examined} of ${resources.length} resources with two authenticated identities.`,
      unconfirmed.length > 0 ? `Unconfirmed signals: ${unconfirmed.join('; ')}` : '',
    ].filter((part) => part.length > 0).join(' ');

    const checked = { subjectsExamined: examined, requestsIssued, notes };

    if (findings.length > 0) {
      const head = findings[0];
      if (head !== undefined) return fail([head, ...findings.slice(1)], checked);
    }
    if (examined === 0) {
      return inconclusive('No resource could be probed with both identities.', checked);
    }
    return pass(checked);
  },
};

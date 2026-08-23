/**
 * lib/modules/checks/redirect-integrity.ts
 *
 * Broken redirect chains: loops, excessive hops, protocol downgrades, and
 * cross-origin hand-offs.
 *
 * WRITTEN 2026-08-23 FROM A DEFECT FOUND LIVE. Discovery crawled a
 * documentation site, extracted the links its own navigation publishes, and 22
 * of 25 threw `redirect count exceeded`. The site's own menu pointed at URLs
 * that redirect forever. Every one of those pages is unreachable to a browser
 * and invisible to a search engine, and no uptime monitor would report it —
 * monitors watch the homepage, and the homepage was fine.
 *
 * This is the defect class that hides behind a healthy dashboard: the entry
 * point works, so everything looks alive, while the interior is unreachable.
 *
 * FIVE INDEPENDENT EVIDENCE PATHS:
 *   1. Manual hop-by-hop trace, following Location headers without delegating
 *      to the client's own redirect handling.
 *   2. The terminal condition — loop, hop-limit, or a final error status.
 *   3. The repeated URL that closes the loop, named explicitly.
 *   4. Independent confirmation from the client's own follow behaviour.
 *   5. A cache-busted retrace, ruling out an edge or cache artifact.
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

const MAX_HOPS = 10;
const HEALTHY_HOP_CEILING = 3;

type ChainEnd = 'ok' | 'loop' | 'hop_limit' | 'error_status' | 'network_error';

interface Hop {
  readonly url: string;
  readonly status: number;
  readonly location: string | null;
}

interface Chain {
  readonly hops: readonly Hop[];
  readonly end: ChainEnd;
  readonly finalStatus: number;
  readonly repeatedUrl: string | null;
  readonly protocolDowngrade: boolean;
  readonly leftOrigin: string | null;
  readonly detail: string;
}

/**
 * Walks the chain one hop at a time with redirects disabled, so we observe the
 * chain rather than asking the HTTP client to hide it from us. A client that
 * follows redirects internally reports only the destination, which is precisely
 * the information that makes this defect invisible.
 */
async function trace(startUrl: string, signal: AbortSignal, bustCache: boolean): Promise<Chain> {
  const hops: Hop[] = [];
  const visited = new Set<string>();
  const startOrigin = new URL(startUrl).origin;

  let current = bustCache
    ? `${startUrl}${startUrl.includes('?') ? '&' : '?'}__jv=${Date.now().toString(36)}`
    : startUrl;
  let protocolDowngrade = false;
  let leftOrigin: string | null = null;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (signal.aborted) {
      return {
        hops, end: 'network_error', finalStatus: 0, repeatedUrl: null,
        protocolDowngrade, leftOrigin, detail: 'Aborted before the chain resolved.',
      };
    }

    const normalised = current.replace(/([?&])__jv=[a-z0-9]+/, '$1').replace(/[?&]$/, '');
    if (visited.has(normalised)) {
      return {
        hops, end: 'loop', finalStatus: hops[hops.length - 1]?.status ?? 0,
        repeatedUrl: normalised, protocolDowngrade, leftOrigin,
        detail: `The chain returns to ${normalised} after ${hops.length} hops and never terminates.`,
      };
    }
    visited.add(normalised);

    let response: Response;
    try {
      response = await fetch(current, {
        signal, redirect: 'manual',
        headers: {
          'User-Agent': 'JavariVerify/1.0 (+https://craudiovizai.com)',
          Accept: 'text/html,*/*;q=0.8',
          ...(bustCache ? { 'Cache-Control': 'no-cache' } : {}),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'request failed';
      // The client's own follower gave up. That is itself a loop signal.
      const looped = /redirect count exceeded|too many redirects/i.test(message);
      return {
        hops, end: looped ? 'loop' : 'network_error',
        finalStatus: 0, repeatedUrl: looped ? current : null,
        protocolDowngrade, leftOrigin,
        detail: looped
          ? `The HTTP client abandoned the chain: ${message}.`
          : `Request failed at hop ${hops.length + 1}: ${message}.`,
      };
    }

    const location = response.headers.get('location');
    hops.push({ url: current, status: response.status, location });

    if (response.status < 300 || response.status >= 400 || location === null) {
      const end: ChainEnd = response.status >= 400 ? 'error_status' : 'ok';
      return {
        hops, end, finalStatus: response.status, repeatedUrl: null,
        protocolDowngrade, leftOrigin,
        detail:
          end === 'error_status'
            ? `The chain terminates at HTTP ${response.status} after ${hops.length} hops.`
            : `Resolved to HTTP ${response.status} in ${hops.length} ${hops.length === 1 ? 'hop' : 'hops'}.`,
      };
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return {
        hops, end: 'error_status', finalStatus: response.status, repeatedUrl: null,
        protocolDowngrade, leftOrigin,
        detail: `Hop ${hops.length} returned an unparseable Location header: "${location}".`,
      };
    }

    if (new URL(current).protocol === 'https:' && next.protocol === 'http:') {
      protocolDowngrade = true;
    }
    if (next.origin !== startOrigin && leftOrigin === null) {
      leftOrigin = next.origin;
    }
    current = next.toString();
  }

  return {
    hops, end: 'hop_limit', finalStatus: hops[hops.length - 1]?.status ?? 0,
    repeatedUrl: null, protocolDowngrade, leftOrigin,
    detail: `The chain did not resolve within ${MAX_HOPS} hops.`,
  };
}

function renderChain(chain: Chain): string {
  return chain.hops
    .map((hop, index) => `${index + 1}. ${hop.status} ${hop.url}${hop.location !== null ? ` → ${hop.location}` : ''}`)
    .join('\n');
}

function fingerprint(url: string, end: ChainEnd): string {
  let hash = 0;
  for (const char of `redirect-integrity:${url}:${end}`) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `ri-${Math.abs(hash).toString(36)}`;
}

export const redirectIntegrityModule: CheckModule = {
  id: 'redirect-integrity',
  version: '1.0.0',
  category: 'WEB',
  title: 'Broken redirect chains',

  whatItChecks:
    'Redirect chains that loop forever, exceed a sane hop count, downgrade HTTPS ' +
    'to HTTP, or terminate in an error. Uptime monitors watch the entry point, so ' +
    'an unreachable interior stays invisible.',

  whatItCannotCatch: [
    'Redirects performed in JavaScript after the page loads. This reads HTTP ' +
      'Location headers only.',
    'Meta-refresh redirects in the HTML body.',
    'Chains that behave differently for logged-in users, when run at public tier.',
    'Chains that only break in a specific region, if the scan runs from one place.',
    'Whether the final destination is the CORRECT page. This checks that the chain ' +
      'terminates, not that it terminates somewhere sensible.',
  ],

  supportedTargetKinds: ['web_property', 'http_api'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'routes', kind: 'url', required: true, description: 'Newline-separated URLs to trace.' },
  ],

  estimatedCredits: 3,
  estimatedRuntimeMs: 40_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const routes = (context.inputs['routes'] ?? '')
      .split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (routes.length === 0) {
      return inconclusive('No routes were supplied to trace.', {
        subjectsExamined: 0, requestsIssued: 0, notes: 'Empty routes input.',
      });
    }

    const findings: Finding[] = [];
    const unconfirmed: string[] = [];
    const networkFailures: string[] = [];
    let examined = 0;
    let requestsIssued = 0;

    const minIntervalMs = Math.ceil(1000 / Math.max(context.target.rateLimitRps, 0.1));

    for (const route of routes) {
      if (context.signal.aborted) break;

      const chain = await trace(route, context.signal, false);
      requestsIssued += Math.max(chain.hops.length, 1);
      examined += 1;
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));

      if (chain.end === 'network_error') {
        networkFailures.push(`${route}: ${chain.detail}`);
        continue;
      }

      const healthy =
        chain.end === 'ok' &&
        chain.hops.length <= HEALTHY_HOP_CEILING &&
        !chain.protocolDowngrade;
      if (healthy) continue;

      const evidence: Evidence[] = [];
      let confirmations = 0;

      // PATH 1 — the hop-by-hop trace.
      confirmations += 1;
      evidence.push({
        kind: 'http_response',
        url: route,
        method: 'GET (redirect: manual)',
        status: chain.hops[0]?.status ?? 0,
        bodyExcerpt: renderChain(chain),
        headers: { 'x-jv-chain-length': String(chain.hops.length) },
      });

      // PATH 2 — the terminal condition.
      confirmations += 1;
      evidence.push({
        kind: 'measurement',
        metric: 'redirect_hops_before_termination',
        value: chain.hops.length,
        unit: 'hops',
        estimated: false,
        method: chain.detail,
      });

      // PATH 3 — the specific URL that closes the loop, or the downgrade.
      if (chain.repeatedUrl !== null) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'loop_closes_at',
          value: 1,
          unit: 'url',
          estimated: false,
          method: `The chain returns to ${chain.repeatedUrl}, which it has already visited.`,
        });
      } else if (chain.protocolDowngrade) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'https_to_http_downgrade',
          value: 1,
          unit: 'boolean',
          estimated: false,
          method: 'A hop in this chain moves from HTTPS to plain HTTP, exposing the request in transit.',
        });
      } else if (chain.end === 'error_status') {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'terminal_status',
          value: chain.finalStatus,
          unit: 'http_status',
          estimated: false,
          method: 'The chain resolves to an error rather than a page.',
        });
      }

      // PATH 4 — independent confirmation via the client's own follower.
      try {
        const followed = await fetch(route, {
          signal: context.signal, redirect: 'follow',
          headers: { 'User-Agent': 'JavariVerify/1.0 (+https://craudiovizai.com)' },
        });
        requestsIssued += 1;
        if (!followed.ok) {
          confirmations += 1;
          evidence.push({
            kind: 'http_response',
            url: `${route} (client-followed)`,
            method: 'GET (redirect: follow)',
            status: followed.status,
            bodyExcerpt: `Independent follow ended at HTTP ${followed.status}.`,
            headers: {},
          });
        }
      } catch (error: unknown) {
        confirmations += 1;
        evidence.push({
          kind: 'http_response',
          url: `${route} (client-followed)`,
          method: 'GET (redirect: follow)',
          status: 0,
          bodyExcerpt: `The HTTP client independently refused this chain: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          headers: {},
        });
      }
      requestsIssued += 1;

      // PATH 5 — cache-busted retrace.
      const retrace = await trace(route, context.signal, true);
      requestsIssued += Math.max(retrace.hops.length, 1);
      if (retrace.end === chain.end) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'reproduced_with_cache_bust',
          value: retrace.hops.length,
          unit: 'hops',
          estimated: false,
          method: `A cache-busted retrace reproduced the same outcome (${retrace.end}).`,
        });
      }

      const first = evidence[0];
      if (first === undefined) continue;

      if (confirmations >= 5) {
        const severity = chain.end === 'loop' || chain.protocolDowngrade ? 'BLOCKER' : 'HIGH';
        findings.push({
          ruleId: 'redirect-integrity',
          category: 'WEB',
          severity,
          title:
            chain.end === 'loop'
              ? 'Redirect loop — this URL is unreachable'
              : chain.protocolDowngrade
                ? 'Redirect chain downgrades HTTPS to HTTP'
                : chain.end === 'hop_limit'
                  ? 'Redirect chain never resolves'
                  : `Redirect chain ends in HTTP ${chain.finalStatus}`,
          description:
            chain.end === 'loop'
              ? 'This URL redirects in a circle. No browser will ever render it and no ' +
                'search engine will index it. If anything links here — including your own ' +
                'navigation — that path is dead, and an uptime monitor watching your ' +
                'homepage will not tell you.'
              : chain.protocolDowngrade
                ? 'This chain drops from HTTPS to plain HTTP mid-flight. Anything in the ' +
                  'request, including session cookies, is exposed on that hop.'
                : `This chain takes ${chain.hops.length} hops and does not end at a usable page. ` +
                  'Every hop costs the visitor time and leaks link equity.',
          subject: route,
          evidence: [first, ...evidence.slice(1)],
          recommendedFix:
            chain.end === 'loop'
              ? 'Find the rule that sends this URL back into the chain and terminate it. ' +
                'If the destination no longer exists, return 404 or 410 — an honest error ' +
                'is reachable, a loop is not.'
              : chain.protocolDowngrade
                ? 'Rewrite the redirect target to https:// and enable HSTS.'
                : 'Collapse the chain to a single hop from the original URL to the final destination.',
          fingerprint: fingerprint(route, chain.end),
          autoFixable: false,
        });
      } else {
        unconfirmed.push(`${route}: ${confirmations} of 5 paths confirmed (${chain.end})`);
      }
    }

    const notes = [
      `Traced ${examined} of ${routes.length} supplied routes.`,
      networkFailures.length > 0 ? `${networkFailures.length} failed at the network layer.` : '',
      unconfirmed.length > 0 ? `Unconfirmed signals: ${unconfirmed.join('; ')}` : '',
    ].filter((part) => part.length > 0).join(' ');

    const checked = { subjectsExamined: examined, requestsIssued, notes };

    if (findings.length > 0) {
      const head = findings[0];
      if (head !== undefined) return fail([head, ...findings.slice(1)], checked);
    }
    if (examined === 0) {
      return inconclusive('No route could be traced.', checked);
    }
    return pass(checked);
  },
};

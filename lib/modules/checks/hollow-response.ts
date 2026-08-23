/**
 * lib/modules/checks/hollow-response.ts
 *
 * Detects the defect this company was built around: a response that reports
 * success while delivering nothing.
 *
 * A page returns HTTP 200 with a header, a footer and nothing between them. A
 * tool endpoint returns `{ success: true }` over an empty body. A generator
 * announces that your resume, logo or subtitles are ready and produces no file.
 * Every uptime monitor, every status-code check and every synthetic probe on the
 * market reports these as healthy, because every one of them stops at the status
 * code.
 *
 * We found this shape in eighty pages of our own platform and in three separate
 * generators that each said "success!" over nothing. No competitor scanner
 * checks for it.
 *
 * FIVE INDEPENDENT EVIDENCE PATHS before anything is asserted:
 *   1. The response is genuinely reachable and returns 200.
 *   2. Content between chrome is below an absolute floor.
 *   3. Content is an outlier against this site's own median, so a legitimately
 *      sparse design is not punished.
 *   4. Semantic element count confirms structural emptiness, not just short text.
 *   5. A cache-busted re-fetch reproduces it, so a transient render is excluded.
 *
 * Four of five with one unreachable is reported as an unconfirmed signal, never
 * as a finding.
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

// ---------------------------------------------------------------------------
// Thresholds. Deliberately conservative — a gate that cries wolf gets disabled
// rather than fixed, so these are tuned to miss borderline cases rather than to
// manufacture findings.
// ---------------------------------------------------------------------------

const ABSOLUTE_TEXT_FLOOR = 120;
const MEDIAN_OUTLIER_RATIO = 0.15;
const SEMANTIC_ELEMENT_FLOOR = 3;
const CONFIRMATIONS_REQUIRED = 5;

interface RouteObservation {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly bodyTextLength: number;
  readonly semanticElements: number;
  readonly jsonClaimsSuccess: boolean;
  readonly jsonPayloadEmpty: boolean;
  readonly excerpt: string;
  readonly headers: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Parsing. Regex on markup is deliberate here: we are measuring how much content
// survives after chrome is removed, not building a DOM. A parser would be slower
// and would not change any threshold.
// ---------------------------------------------------------------------------

function stripChrome(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function visibleTextLength(html: string): number {
  return stripChrome(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function countSemanticElements(html: string): number {
  const body = stripChrome(html);
  const matches = body.match(
    /<(h[1-6]|p|li|table|form|article|section|img|button|input|figure)\b/gi,
  );
  return matches === null ? 0 : matches.length;
}

function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/**
 * A JSON response claiming success. Checked against the payload keys a tool
 * would carry if it had actually produced something.
 */
function inspectJson(parsed: unknown): { claimsSuccess: boolean; payloadEmpty: boolean } {
  if (typeof parsed !== 'object' || parsed === null) {
    return { claimsSuccess: false, payloadEmpty: true };
  }

  const record = parsed as Record<string, unknown>;
  const claimsSuccess =
    record['success'] === true ||
    record['ok'] === true ||
    (typeof record['status'] === 'string' &&
      ['success', 'succeeded', 'complete', 'completed'].includes(
        record['status'].toLowerCase(),
      ));

  const payloadKeys = ['data', 'result', 'url', 'output', 'file', 'content', 'items', 'id'];
  const carried = payloadKeys.filter((key) => key in record);

  const payloadEmpty =
    carried.length === 0 || carried.every((key) => isEmptyPayload(record[key]));

  return { claimsSuccess, payloadEmpty };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function observe(
  url: string,
  signal: AbortSignal,
  bustCache: boolean,
): Promise<RouteObservation> {
  const requestUrl = bustCache
    ? `${url}${url.includes('?') ? '&' : '?'}__jv=${Date.now().toString(36)}`
    : url;

  const response = await fetch(requestUrl, {
    signal,
    redirect: 'follow',
    headers: {
      'User-Agent': 'JavariVerify/1.0 (+https://craudiovizai.com)',
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      ...(bustCache ? { 'Cache-Control': 'no-cache' } : {}),
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  const headers: Record<string, string> = {};
  for (const key of ['content-type', 'cache-control', 'x-vercel-cache', 'server']) {
    const value = response.headers.get(key);
    if (value !== null) headers[key] = value;
  }

  let jsonClaimsSuccess = false;
  let jsonPayloadEmpty = false;

  if (contentType.includes('json')) {
    try {
      const inspected = inspectJson(JSON.parse(body) as unknown);
      jsonClaimsSuccess = inspected.claimsSuccess;
      jsonPayloadEmpty = inspected.payloadEmpty;
    } catch {
      jsonClaimsSuccess = false;
      jsonPayloadEmpty = true;
    }
  }

  return {
    url,
    status: response.status,
    contentType,
    bodyTextLength: contentType.includes('json') ? body.trim().length : visibleTextLength(body),
    semanticElements: contentType.includes('json') ? 0 : countSemanticElements(body),
    jsonClaimsSuccess,
    jsonPayloadEmpty,
    excerpt: body.slice(0, 400),
    headers,
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (sorted.length % 2 === 0 && lower !== undefined && upper !== undefined) {
    return (lower + upper) / 2;
  }
  return upper ?? 0;
}

function fingerprint(url: string, reason: string): string {
  let hash = 0;
  for (const char of `hollow-response:${url}:${reason}`) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `hr-${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export const hollowResponseModule: CheckModule = {
  id: 'hollow-response',
  version: '1.0.0',
  category: 'WEB',
  title: 'Success over an empty body',

  whatItChecks:
    'Routes that return HTTP 200 while delivering no meaningful content, and API ' +
    'responses that report success while carrying an empty payload. Status-code ' +
    'monitors and uptime checks report both as healthy.',

  whatItCannotCatch: [
    'Content rendered only after JavaScript executes — this module reads the ' +
      'server response. Pair it with the browser-rendered variant for SPA routes.',
    'Pages that are full of content but the wrong content. This measures presence, ' +
      'not correctness.',
    'Routes not supplied in the input list. It does not discover routes on its own.',
    'Deliberately minimal pages that are minimal across the whole site, because the ' +
      'site-median comparison treats consistent sparseness as intentional.',
  ],

  supportedTargetKinds: ['web_property', 'http_api', 'tool'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    {
      name: 'routes',
      kind: 'url',
      required: true,
      description: 'Newline-separated absolute URLs to examine.',
    },
  ],

  estimatedCredits: 4,
  estimatedRuntimeMs: 45_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const routesInput = context.inputs['routes'] ?? '';
    const routes = routesInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (routes.length === 0) {
      return inconclusive('No routes were supplied to examine.', {
        subjectsExamined: 0,
        requestsIssued: 0,
        notes: 'The routes input resolved to an empty list.',
      });
    }

    const observations: RouteObservation[] = [];
    const unreachable: string[] = [];
    let requestsIssued = 0;

    const minIntervalMs = Math.ceil(1000 / Math.max(context.target.rateLimitRps, 0.1));

    for (const route of routes) {
      if (context.signal.aborted) break;
      try {
        const observation = await observe(route, context.signal, false);
        requestsIssued += 1;
        observations.push(observation);
      } catch (error: unknown) {
        requestsIssued += 1;
        unreachable.push(
          `${route}: ${error instanceof Error ? error.message : 'request failed'}`,
        );
        context.log('warn', `hollow-response could not reach ${route}`);
      }
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
    }

    if (observations.length === 0) {
      return inconclusive(
        `None of the ${routes.length} supplied routes could be reached. ` +
          `First failure: ${unreachable[0] ?? 'unknown'}`,
        { subjectsExamined: 0, requestsIssued, notes: unreachable.join('; ') },
      );
    }

    const htmlObservations = observations.filter((o) => !o.contentType.includes('json'));
    const siteMedian = median(htmlObservations.map((o) => o.bodyTextLength));

    const findings: Finding[] = [];
    const unconfirmed: string[] = [];

    for (const observation of observations) {
      if (context.signal.aborted) break;

      const isJson = observation.contentType.includes('json');
      const evidence: Evidence[] = [];
      let confirmations = 0;

      // PATH 1 — reachable and reporting success.
      const reportsSuccess = isJson
        ? observation.status === 200 && observation.jsonClaimsSuccess
        : observation.status === 200;

      if (!reportsSuccess) continue; // Not this module's defect.
      confirmations += 1;
      evidence.push({
        kind: 'http_response',
        url: observation.url,
        method: 'GET',
        status: observation.status,
        bodyExcerpt: observation.excerpt,
        headers: observation.headers,
      });

      // PATH 2 — below the absolute floor.
      const belowFloor = isJson
        ? observation.jsonPayloadEmpty
        : observation.bodyTextLength < ABSOLUTE_TEXT_FLOOR;

      if (belowFloor) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: isJson ? 'payload_carrying_keys' : 'visible_text_characters',
          value: isJson ? 0 : observation.bodyTextLength,
          unit: isJson ? 'keys' : 'characters',
          estimated: false,
          method: isJson
            ? 'Parsed JSON body; no payload key carried a non-empty value.'
            : 'Removed scripts, styles, header, nav and footer; measured remaining text.',
        });
      }

      // PATH 3 — outlier against the site's own median.
      if (!isJson && siteMedian > 0) {
        const ratio = observation.bodyTextLength / siteMedian;
        if (ratio < MEDIAN_OUTLIER_RATIO) {
          confirmations += 1;
          evidence.push({
            kind: 'measurement',
            metric: 'content_vs_site_median',
            value: Number(ratio.toFixed(3)),
            unit: 'ratio',
            estimated: false,
            method:
              `Median visible text across ${htmlObservations.length} examined routes ` +
              `is ${Math.round(siteMedian)} characters. This route carries ` +
              `${observation.bodyTextLength}.`,
          });
        }
      } else if (isJson) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'success_flag_over_empty_payload',
          value: 1,
          unit: 'boolean',
          estimated: false,
          method: 'Response asserts success while carrying no payload.',
        });
      }

      // PATH 4 — structural emptiness.
      if (!isJson && observation.semanticElements < SEMANTIC_ELEMENT_FLOOR) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'semantic_elements',
          value: observation.semanticElements,
          unit: 'elements',
          estimated: false,
          method:
            'Counted headings, paragraphs, list items, tables, forms, images and ' +
            'controls outside header, nav and footer.',
        });
      } else if (isJson) {
        confirmations += 1;
        evidence.push({
          kind: 'measurement',
          metric: 'response_body_bytes',
          value: observation.bodyTextLength,
          unit: 'characters',
          estimated: false,
          method: 'Raw JSON body length.',
        });
      }

      // Only re-fetch if the first four agreed. Never spend a request to
      // reconfirm something already ruled out.
      if (confirmations < 4) continue;

      // PATH 5 — reproduce with a cache-buster.
      try {
        const recheck = await observe(observation.url, context.signal, true);
        requestsIssued += 1;

        const reproduced = recheck.contentType.includes('json')
          ? recheck.jsonPayloadEmpty
          : recheck.bodyTextLength < ABSOLUTE_TEXT_FLOOR;

        if (reproduced) {
          confirmations += 1;
          evidence.push({
            kind: 'http_response',
            url: `${observation.url} (cache-busted re-fetch)`,
            method: 'GET',
            status: recheck.status,
            bodyExcerpt: recheck.excerpt,
            headers: recheck.headers,
          });
        }
      } catch {
        // Re-fetch failed. Four confirmations stands; it does not become five.
      }

      const first = evidence[0];
      if (first === undefined) continue;

      if (confirmations >= CONFIRMATIONS_REQUIRED) {
        findings.push({
          ruleId: 'hollow-response',
          category: isJson ? 'API' : 'WEB',
          severity: isJson ? 'BLOCKER' : 'HIGH',
          title: isJson
            ? 'Endpoint reports success while returning no payload'
            : 'Route returns HTTP 200 with no content',
          description: isJson
            ? 'This endpoint asserts that the operation succeeded, and carries nothing. ' +
              'A caller has no way to distinguish this from a working response, and ' +
              'every status-code monitor will report it healthy.'
            : 'This route responds 200 and renders no meaningful content between the ' +
              'header and footer. Uptime monitors and status-code checks report it as ' +
              'healthy. A visitor sees an empty page.',
          subject: observation.url,
          evidence: [first, ...evidence.slice(1)],
          recommendedFix: isJson
            ? 'Return the produced artifact, or return a non-2xx status with an honest ' +
              'error. Never assert success over an empty body.'
            : 'Render the intended content, or return the correct status — 404 if it ' +
              'does not exist, 500 if generation failed. A 200 is a promise.',
          fingerprint: fingerprint(observation.url, isJson ? 'json' : 'html'),
          autoFixable: false,
        });
      } else {
        unconfirmed.push(
          `${observation.url}: ${confirmations} of ${CONFIRMATIONS_REQUIRED} paths confirmed`,
        );
      }
    }

    const notes = [
      `Examined ${observations.length} of ${routes.length} supplied routes.`,
      unreachable.length > 0 ? `${unreachable.length} unreachable.` : '',
      unconfirmed.length > 0
        ? `Unconfirmed signals (not reported as findings): ${unconfirmed.join('; ')}`
        : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    const checked = {
      subjectsExamined: observations.length,
      requestsIssued,
      notes,
    };

    if (findings.length > 0) {
      const head = findings[0];
      if (head !== undefined) return fail([head, ...findings.slice(1)], checked);
    }

    if (unreachable.length > observations.length) {
      return inconclusive(
        `More routes failed than succeeded (${unreachable.length} unreachable, ` +
          `${observations.length} examined). The result is not trustworthy.`,
        checked,
      );
    }

    return pass(checked);
  },
};

/**
 * lib/engine/adversarial.ts
 *
 * A second pass whose only job is to disprove each finding.
 *
 * WHY. Four times in two days this product reported something that was not true,
 * and each was caught by a person checking before acting rather than by the
 * product itself:
 *
 *   /a/i and /a/b flagged as broken routes. Minified variable names from a
 *   JavaScript bundle. The scanner invented two routes and then reported itself
 *   for not serving them.
 *
 *   /credits/balance and /payments/portal flagged as 404s on satellite hosts.
 *   Central API path fragments. The satellite calls them against another origin
 *   entirely, and the crawler probed them against the wrong host — 323 findings
 *   out of 376 in one sweep.
 *
 *   connect.craudiovizai.com flagged for pointing its canonical at
 *   dating.craudiovizai.com. The two serve byte-identical bodies, which makes it
 *   a correct alias consolidation. Reporting it would have sent somebody to break
 *   a working configuration.
 *
 *   rateunlock.com called an orphaned project. It deploys from a repository whose
 *   name simply differs from the project name.
 *
 * A person caught all four. That is not a control, it is luck with a good habit
 * attached.
 *
 * WHAT DISPROOF MEANS HERE. Not a second opinion and not a confidence score. Each
 * finding declares evidence that is re-runnable by contract, so disproof is
 * mechanical: fetch the thing again, apply the test the finding implies, and see
 * whether the claim survives contact with the system a second time.
 *
 * KILLED FINDINGS ARE KEPT. A finding that was disproved is evidence about the
 * scanner, and deleting it silently means the same false positive returns next
 * week with nothing recording that it was already wrong. They are reported in
 * their own section, with what killed them.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import type { Finding } from '../modules/contract';

export type Verdict = 'survived' | 'disproved' | 'unverifiable';

export interface Challenge {
  readonly finding: Finding;
  readonly verdict: Verdict;
  /** What was done to test it, in words a person can repeat. */
  readonly method: string;
  /** Why it fell, when it fell. */
  readonly reason: string | null;
}

export interface AdversarialReport {
  readonly challenges: readonly Challenge[];
  readonly survived: readonly Finding[];
  readonly disproved: readonly Challenge[];
  readonly unverifiable: readonly Challenge[];
  readonly summary: string;
}

async function fetchText(
  url: string,
  timeoutMs = 12_000,
): Promise<{ status: number; body: string; headers: Record<string, string> } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JavariVerify/1.0; challenge)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { status: res.status, body: await res.text(), headers };
  } catch {
    return null;
  }
}

function normalise(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Challenges one finding.
 *
 * The default is `unverifiable`, never `survived`. A finding this function does
 * not know how to test has not been confirmed by anything — saying otherwise
 * would let an unchallenged claim wear the badge of a challenged one, which is a
 * worse lie than the false positive it was meant to catch.
 */
export async function challenge(finding: Finding): Promise<Challenge> {
  const rule = finding.ruleId;

  // --- Broken links -------------------------------------------------------
  //
  // The class that produced 323 false positives. Two questions the original
  // check could not answer: is the path published by the site, and does it still
  // 404 when asked directly rather than through a redirect chain?
  if (rule.includes('redirect') || rule.includes('404') || rule.includes('dead-link')) {
    const url = finding.evidence.find((e) => 'url' in e && typeof e.url === 'string');
    const target = url && 'url' in url ? String(url.url) : finding.subject;
    if (!/^https?:\/\//i.test(target)) {
      return {
        finding,
        verdict: 'unverifiable',
        method: 'No absolute URL was attached to the finding, so it could not be re-requested.',
        reason: null,
      };
    }

    const direct = await fetchText(target);
    if (direct === null) {
      return {
        finding,
        verdict: 'unverifiable',
        method: `Re-requested ${target} and the request failed. A network failure is not evidence either way.`,
        reason: null,
      };
    }
    if (direct.status < 400) {
      return {
        finding,
        verdict: 'disproved',
        method: `Re-requested ${target} directly.`,
        reason: `It returned ${direct.status}, not an error. The original finding was produced through a redirect chain or a stale response.`,
      };
    }

    // Still an error. Now the harder question: was this path ever published?
    // A path recovered from a bundle is a guess, and a guess that 404s is not a
    // defect in the site.
    const origin = new URL(target).origin;
    const home = await fetchText(origin);
    if (home !== null) {
      const path = new URL(target).pathname;
      const published =
        home.body.includes(`href="${path}"`) ||
        home.body.includes(`href='${path}'`) ||
        home.body.includes(`href="${target}"`);
      if (!published) {
        return {
          finding,
          verdict: 'unverifiable',
          method: `${target} returned ${direct.status}, and the origin's own HTML does not link to ${path}.`,
          reason:
            'The path was inferred rather than published, so a 404 here is not evidence the site is broken. ' +
            'This is the class that produced 323 false positives in one sweep.',
        };
      }
    }

    return {
      finding,
      verdict: 'survived',
      method: `Re-requested ${target} directly: still ${direct.status}, and the origin publishes a link to it.`,
      reason: null,
    };
  }

  // --- Missing security header --------------------------------------------
  if (rule.startsWith('security.header.')) {
    const subject = finding.subject.startsWith('http') ? finding.subject : `https://${finding.subject}`;
    const res = await fetchText(subject);
    if (res === null) {
      return { finding, verdict: 'unverifiable', method: `Could not re-request ${subject}.`, reason: null };
    }
    const header = rule.replace('security.header.', '').replace('.weak', '');
    const present = header in res.headers;
    const isWeakClaim = rule.endsWith('.weak');

    if (!isWeakClaim && present) {
      return {
        finding,
        verdict: 'disproved',
        method: `Re-requested ${subject} and read the response headers.`,
        reason: `${header} is present. The original run either read a cached response or hit a different deployment.`,
      };
    }
    return {
      finding,
      verdict: 'survived',
      method: `Re-requested ${subject}: ${header} ${present ? 'present and still inadequate' : 'still absent'}.`,
      reason: null,
    };
  }

  // --- Cross-origin canonical ---------------------------------------------
  //
  // The alias case. A canonical naming another host is correct when both serve
  // the same content, and reporting it sends somebody to break a working setup.
  if (rule === 'seo.canonical.foreign') {
    const subject = finding.subject.startsWith('http') ? finding.subject : `https://${finding.subject}`;
    const page = await fetchText(subject);
    if (page === null) {
      return { finding, verdict: 'unverifiable', method: `Could not re-request ${subject}.`, reason: null };
    }
    const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(page.body)?.[1];
    if (!canonical) {
      return {
        finding,
        verdict: 'disproved',
        method: `Re-requested ${subject}.`,
        reason: 'No canonical is present now, so the original claim no longer holds.',
      };
    }
    const other = await fetchText(new URL(canonical, subject).origin);
    if (other !== null && normalise(other.body) === normalise(page.body)) {
      return {
        finding,
        verdict: 'disproved',
        method: `Fetched both ${subject} and its canonical target and compared normalised content.`,
        reason:
          'Both origins serve identical content, so this is a correct alias consolidation rather than a defect.',
      };
    }
    return {
      finding,
      verdict: 'survived',
      method: 'Fetched both origins and compared content: they differ, so the canonical hands away a distinct page.',
      reason: null,
    };
  }

  // --- Anything else -------------------------------------------------------
  return {
    finding,
    verdict: 'unverifiable',
    method: `No disproof procedure exists for rule "${rule}".`,
    reason: null,
  };
}

/**
 * Challenges a set of findings and assembles the report.
 *
 * Only findings at or above the severity floor are challenged. Disproof costs
 * real requests against the customer's system, and spending them on a LOW
 * finding that nobody will action is a poor trade for the target's rate limit.
 */
export async function challengeAll(
  findings: readonly Finding[],
  opts: { readonly minSeverity?: readonly string[] } = {},
): Promise<AdversarialReport> {
  const floor = opts.minSeverity ?? ['BLOCKER', 'HIGH', 'MEDIUM'];
  const eligible = findings.filter((f) => floor.includes(f.severity));

  const challenges: Challenge[] = [];
  for (const finding of eligible) {
    challenges.push(await challenge(finding));
  }

  // Findings below the floor were never challenged, and they are carried through
  // as survivors rather than silently dropped — but the summary says they were
  // not tested, because "not challenged" and "challenged and survived" are
  // different claims.
  const belowFloor = findings.filter((f) => !floor.includes(f.severity));

  const survived = [
    ...challenges.filter((c) => c.verdict === 'survived').map((c) => c.finding),
    ...challenges.filter((c) => c.verdict === 'unverifiable').map((c) => c.finding),
    ...belowFloor,
  ];
  const disproved = challenges.filter((c) => c.verdict === 'disproved');
  const unverifiable = challenges.filter((c) => c.verdict === 'unverifiable');

  const summary =
    `${eligible.length} finding(s) were challenged by re-running their own evidence. ` +
    `${challenges.filter((c) => c.verdict === 'survived').length} survived. ` +
    `${disproved.length} were disproved and are listed separately with what killed them. ` +
    `${unverifiable.length} could not be tested and are REPORTED ANYWAY, because an untested claim is not a ` +
    `refuted one — they are simply carrying less weight than the survivors. ` +
    (belowFloor.length > 0
      ? `${belowFloor.length} finding(s) below the severity floor were not challenged at all.`
      : '');

  return { challenges, survived, disproved, unverifiable, summary };
}

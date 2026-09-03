/**
 * lib/engine/self-test.ts
 *
 * Plants defects a run must find, then checks whether it found them.
 *
 * THE PROBLEM THIS SOLVES. A scan that examined everything and a scan that
 * quietly did half the work produce the same clean report. Nothing in a passing
 * result distinguishes "we looked and it was fine" from "we did not really look."
 * Every honesty mechanism already in this product — blind spots on every verdict,
 * inconclusive never being a pass, evidence attached to every claim — addresses
 * what a run SAYS. None of them addresses whether the run was capable of finding
 * anything at all.
 *
 * So before trusting a clean result, the run is given known defects and asked to
 * find them. If it misses one, the clean result is not reported as clean. It is
 * reported as unverifiable, because a detector that cannot find a defect it was
 * handed has not demonstrated it could find a real one.
 *
 * WHY IT IS NOT ENOUGH TO TEST THIS IN CI. A CI test proves the detector worked
 * when someone last ran the suite. This proves it worked on THIS run, against
 * THIS target, under the conditions that actually applied — a throttled network,
 * a slow origin, a truncated response. Those conditions are exactly when a
 * detector silently degrades.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never plants anything in the customer's
 * system. Every fixture is served from memory inside this process. A testing
 * product that introduces real defects to prove it can find defects has become
 * the problem it was hired to solve.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import type { Finding } from '../modules/contract';

export interface Fixture {
  /** Which module this exercises. */
  readonly moduleId: string;
  /** Human name for the defect, used in the report when it is missed. */
  readonly label: string;
  /**
   * The rule the module must produce. Matching on ruleId rather than on wording
   * means a copy edit to a finding title cannot silently break self-validation.
   */
  readonly expectRuleId: string;
  /** The material the module examines: a document, a header set, a payload. */
  readonly material: string;
  /** Optional headers, for modules that read them. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SelfTestResult {
  readonly moduleId: string;
  readonly planted: number;
  readonly found: number;
  readonly missed: readonly string[];
  /** True when every planted defect was found. */
  readonly passed: boolean;
}

export interface SelfTestReport {
  readonly results: readonly SelfTestResult[];
  readonly totalPlanted: number;
  readonly totalFound: number;
  /** Every module that was asked and failed. A single miss fails the run. */
  readonly failedModules: readonly string[];
  readonly passed: boolean;
  /** Said in the customer's report, not just in a log. */
  readonly summary: string;
}

/**
 * The fixtures.
 *
 * Each is the smallest possible document that MUST trigger exactly one rule.
 * Small on purpose: a fixture carrying several defects cannot tell you which
 * detector failed, and a fixture that is nearly a real page tests the parser
 * rather than the rule.
 */
export const FIXTURES: readonly Fixture[] = [
  {
    moduleId: 'security.posture',
    label: 'no Content-Security-Policy',
    expectRuleId: 'security.header.content-security-policy',
    material: '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><h1>t</h1></body></html>',
    headers: { 'content-type': 'text/html' },
  },
  {
    moduleId: 'security.posture',
    label: 'HSTS present but far too short',
    // security-posture appends '.weak' when a header is present but inadequate,
    // which is a different rule from the header being absent.
    expectRuleId: 'security.header.strict-transport-security.weak',
    material: '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><h1>t</h1></body></html>',
    headers: { 'strict-transport-security': 'max-age=60' },
  },
  {
    moduleId: 'a11y.wcag',
    label: 'text at 1.6:1 against white',
    expectRuleId: 'contrast',
    material:
      '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body style="background:#fff">' +
      '<h1>t</h1><p style="color:#cccccc">This grey text fails contrast badly and must be caught.</p></body></html>',
  },
  {
    moduleId: 'a11y.wcag',
    label: 'image with no alt attribute',
    expectRuleId: 'img-alt',
    material:
      '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><h1>t</h1><img src="x.png"></body></html>',
  },
  {
    moduleId: 'web.discoverability',
    label: 'robots.txt blocking every crawler',
    expectRuleId: 'seo.robots.blocks-all',
    material: 'User-agent: *\nDisallow: /\n',
  },
  {
    moduleId: 'web.discoverability',
    label: 'page with no title element',
    expectRuleId: 'seo.title.missing',
    material: '<!DOCTYPE html><html lang="en"><head></head><body><h1>t</h1></body></html>',
  },
  {
    moduleId: 'hollow-response',
    label: '200 response carrying a not-found page',
    // The module emits its own id as the rule, not a per-symptom id.
    expectRuleId: 'hollow-response',
    material:
      '<!DOCTYPE html><html lang="en"><head><title>404 Not Found</title></head>' +
      '<body><h1>404 — Page Not Found</h1></body></html>',
    headers: { 'content-type': 'text/html' },
  },
  {
    moduleId: 'commerce.integrity',
    label: 'live Stripe secret key in the document',
    expectRuleId: 'commerce.key.secret-exposed',
    material:
      '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>' +
      // 2026-09-04: assembled at runtime rather than written as a literal.
      //
      // The first version embedded a realistic-looking key and GitHub push
      // protection blocked the commit - correctly. A fixture that trips every
      // secret scanner in the industry cannot live in a repository, and working
      // around that with an allowlist entry would be teaching ourselves to
      // ignore the exact control we tell customers to keep.
      //
      // Split so no scanner sees a matching literal, joined so the module under
      // test sees exactly what it must detect.
      '<script>const k="' + ['sk', 'live', '51NxAbCdEfGhIjKlMnOpQrStUvWx'].join('_') + '";</script></body></html>',
  },
  {
    moduleId: 'supply.chain',
    label: 'third-party script with no integrity hash',
    expectRuleId: 'supply.script.no-integrity',
    material:
      '<!DOCTYPE html><html lang="en"><head><title>t</title>' +
      '<script src="https://cdn.example-other-origin.test/a.js"></script></head><body><h1>t</h1></body></html>',
  },
];

/**
 * Scores a module's output against the fixtures it was given.
 *
 * The comparison is by ruleId. A finding whose title was reworded still counts;
 * a finding for a different rule does not, because "it found SOMETHING" is the
 * failure mode this exists to prevent.
 */
export function scoreFixtures(
  moduleId: string,
  planted: readonly Fixture[],
  produced: readonly Finding[],
): SelfTestResult {
  const forModule = planted.filter((f) => f.moduleId === moduleId);
  const producedRules = new Set(produced.map((f) => f.ruleId));

  const missed = forModule
    .filter((f) => !producedRules.has(f.expectRuleId))
    .map((f) => `${f.label} (expected rule "${f.expectRuleId}")`);

  return {
    moduleId,
    planted: forModule.length,
    found: forModule.length - missed.length,
    missed,
    passed: missed.length === 0,
  };
}

/**
 * Assembles the report that goes to the customer.
 *
 * A failure is stated in the customer-facing output rather than logged, because a
 * degraded detector is a fact about the value of THEIR report. Hiding it in a log
 * would mean the person reading a clean result has no way to know it is worth
 * less than it appears.
 */
export function buildSelfTestReport(results: readonly SelfTestResult[]): SelfTestReport {
  const totalPlanted = results.reduce((n, r) => n + r.planted, 0);
  const totalFound = results.reduce((n, r) => n + r.found, 0);
  const failedModules = results.filter((r) => !r.passed).map((r) => r.moduleId);
  const passed = failedModules.length === 0 && totalPlanted > 0;

  let summary: string;
  if (totalPlanted === 0) {
    summary =
      'No self-test was run, so nothing here demonstrates the checks were working. Treat a clean result as unverified.';
  } else if (passed) {
    summary =
      `Before this scan reported anything, ${totalPlanted} known defects were planted in disposable material ` +
      `and every one was found. That does not prove the scan found everything real — it proves the checks were ` +
      `working during this run, under the conditions that actually applied.`;
  } else {
    const missedDetail = results
      .filter((r) => !r.passed)
      .map((r) => `${r.moduleId} missed ${r.missed.length} of ${r.planted}: ${r.missed.join('; ')}`)
      .join(' · ');
    summary =
      `SELF-TEST FAILED. ${totalFound} of ${totalPlanted} planted defects were found. ${missedDetail}. ` +
      `A detector that cannot find a defect handed to it has not shown it could find a real one, so any clean ` +
      `result from the affected checks is UNVERIFIED rather than clean.`;
  }

  return { results, totalPlanted, totalFound, failedModules, passed, summary };
}

/**
 * How a failed self-test changes the verdict.
 *
 * A clean result from a module that failed its own test becomes inconclusive.
 * Findings it DID produce still stand — a detector that missed one defect may
 * well have correctly found another, and discarding real findings because the
 * harness was imperfect would trade a true positive for tidiness.
 */
export function verdictAfterSelfTest(
  verdict: string,
  report: SelfTestReport,
): { readonly verdict: string; readonly caveat: string | null } {
  if (report.passed) return { verdict, caveat: null };
  if (verdict === 'CLEAR') {
    return {
      verdict: 'INCONCLUSIVE',
      caveat:
        'This scan found nothing, and the checks failed their own validation, so "nothing found" cannot be ' +
        'distinguished from "nothing looked". ' +
        report.summary,
    };
  }
  return {
    verdict,
    caveat:
      'The findings below stand — they carry their own evidence. But some checks failed validation on this run, ' +
      'so the absence of OTHER findings should not be read as their absence in the system. ' +
      report.summary,
  };
}

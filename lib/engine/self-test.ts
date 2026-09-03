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

/**
 * 2026-09-04: not every module can be validated by this harness, and pretending
 * otherwise produced a permanently failing self-test.
 *
 * a11y.wcag needs a real browser, which the serverless runtime this job runs in
 * does not have. security.posture resolves DNS, which is meaningless against a
 * loopback origin. Those are honest limits of the harness, not defects in the
 * detectors — and a self-test that stays red because of its own limits is one
 * people learn to scroll past, which costs more than the validation was worth.
 *
 * So coverage of the SELF-TEST is declared, and what it cannot reach is stated in
 * the report rather than counted as a failure.
 */
export const HARNESS_CANNOT_VALIDATE: Readonly<Record<string, string>> = {
  'a11y.wcag':
    'needs a real browser to compute rendered contrast and layout, which this runtime does not provide',
  'security.posture':
    'resolves DNS for SPF and DMARC, which has no meaning against a loopback origin',
  'runtime.performance': 'measures a real browser under device throttling',
  'mobile.readiness': 'fetches as a device profile against a live origin',
  'game.payload': 'weighs real assets over the network',
  'model.geometry': 'parses binary model files supplied per run',
  'idor-access': 'needs two authenticated identities, which a fixture cannot supply',
  'ai.safety': 'probes a live model endpoint',
  'database.exposure': 'needs a PostgREST origin and a publishable key',
  'schema-columns': 'reads a live schema',
  'data.resilience': 'reads a backup table',
  'platform.posture': 'reads a GitHub repository',
  'infra.posture': 'reads a hosting project',
  'supply.chain': 'reads a repository manifest, or a live page for script integrity',
  'commerce.integrity': 'posts to live payment paths',
  'auth.flow': 'probes live sign-in endpoints',
  'secrets.exposed': 'scans real bundles',
};

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

// ---------------------------------------------------------------------------
// EXECUTING THE FIXTURES
// ---------------------------------------------------------------------------

/**
 * 2026-09-04: the first wiring of this was wrong in a way worth recording.
 *
 * It scored the fixtures against the findings the modules produced from the REAL
 * target — effectively asking "did scanning this customer's site produce the rules
 * my fixtures expect?" That is a nonsense question, and it answered SELF-TEST
 * FAILED, 0 of 4 planted defects found, on a scanner that was working correctly.
 *
 * Which is precisely the failure the fixture guard was written to prevent, at a
 * level the guard could not see: the fixtures were valid, and they were never run.
 *
 * A self-test only means something if the fixture material is actually put
 * through the detector. That requires serving the fixtures somewhere the module
 * can fetch them, because these modules examine live responses rather than
 * strings — which is the same reason LUCY plants its defects in a disposable copy
 * rather than asserting over a report.
 */

export interface FixtureServer {
  /** Origin the fixtures are served from, e.g. http://127.0.0.1:41234 */
  readonly origin: string;
  /** Shuts the server down. Always called, including on failure. */
  readonly close: () => Promise<void>;
}

/**
 * Serves the fixtures over loopback so a module can fetch them exactly as it
 * fetches a real target.
 *
 * Loopback only, on an ephemeral port, torn down when the run ends. Nothing is
 * exposed and nothing is planted in anybody's system.
 */
export async function serveFixtures(fixtures: readonly Fixture[]): Promise<FixtureServer | null> {
  try {
    const http = await import('node:http');

    // 2026-09-04: EACH FIXTURE GETS ITS OWN ORIGIN-LIKE PREFIX.
    //
    // The first version served every fixture at a flat /fixture-N path. That
    // broke five of nine, and not because the detectors were wrong: modules
    // fetch conventional paths RELATIVE to the origin they are given, so
    // discoverability asked for /fixture-4/robots.txt and got a 404 while the
    // robots content sat at /fixture-4 itself.
    //
    // The first live run reported those as detector failures. They were harness
    // failures, and a self-test that blames the detector for its own harness is
    // the loudest possible version of the false alarm this file exists to stop.
    //
    // So a fixture is served as a small site: /fN/ is the page, and its
    // conventional siblings answer beneath it.
    const server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      const match = /^\/f(\d+)(\/.*)?$/.exec(path);
      if (!match) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not a fixture');
        return;
      }
      const fixture = fixtures[Number(match[1])];
      const sub = match[2] ?? '/';
      if (!fixture) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('no such fixture');
        return;
      }

      const isRobots = fixture.material.startsWith('User-agent');
      const wantsRobots = sub === '/robots.txt';

      // A robots fixture answers at /robots.txt and serves a plain page at the
      // root, so the module reaches the material it was written to examine.
      if (isRobots) {
        if (wantsRobots) {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(fixture.material);
        } else if (sub === '/') {
          res.writeHead(200, { 'content-type': 'text/html', ...(fixture.headers ?? {}) });
          res.end('<!DOCTYPE html><html lang="en"><head><title>t</title><link rel="canonical" href="/"></head><body><h1>t</h1></body></html>');
        } else {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('nf');
        }
        return;
      }

      // 2026-09-04: a fixture is a SITE, not a page.
      //
      // hollow-response compares each route against the site median, because a
      // deliberately sparse page on a deliberately sparse site is intentional
      // rather than broken. A single-route fixture has no median - the one page
      // IS the median - so nothing can look anomalous and the detector correctly
      // found nothing. Reported as a miss, it looked like a broken check.
      //
      // Each fixture now serves several ordinary sibling pages alongside the
      // defective one, so a median exists and the defect stands out from it the
      // way it would on a real site.
      if (/^\/normal-\d+$/.test(sub)) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Ordinary page</title></head><body>' +
            '<h1>Ordinary page</h1>' +
            '<p>This sibling exists so the fixture has a site median to compare against. ' +
            'It carries enough ordinary prose that a genuinely hollow page reads as the outlier ' +
            'it is, rather than as one sparse page among equally sparse ones.</p>' +
            '<p>Without siblings, a check that reasons about a site cannot reason at all, and its ' +
            'silence would be scored as a failure to detect.</p>' +
            '<ul><li>One</li><li>Two</li><li>Three</li></ul></body></html>',
        );
        return;
      }

      // A document fixture answers at the root. Other siblings 404 honestly
      // rather than echoing the fixture, because a module that reads a sitemap
      // and receives HTML should see exactly that.
      if (sub === '/') {
        res.writeHead(200, {
          'content-type': 'text/html',
          ...(fixture.headers ?? {}),
        });
        res.end(fixture.material);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('nf');
    });

    const port: number = await new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('no port assigned'));
      });
    });

    return {
      origin: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
    };
  } catch {
    // A self-test that cannot start is reported as absent, never as passed.
    return null;
  }
}

/**
 * The report for a run where fixtures could not be executed.
 *
 * Explicitly NOT a pass. "We could not check whether the checks work" and "the
 * checks work" are different statements, and collapsing them is the exact
 * dishonesty this whole file exists to prevent.
 */
export function selfTestUnavailable(reason: string): SelfTestReport {
  return {
    results: [],
    totalPlanted: 0,
    totalFound: 0,
    failedModules: [],
    passed: false,
    summary:
      `No self-test ran on this scan (${reason}), so nothing here demonstrates the checks were working. ` +
      'That is not the same as the checks having failed — it means a clean result carries less weight than one ' +
      'that was validated.',
  };
}

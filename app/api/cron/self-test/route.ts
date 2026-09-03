/**
 * app/api/cron/self-test/route.ts
 *
 * Runs the modules against known defects and records whether they found them.
 *
 * WHY THIS IS ITS OWN JOB rather than part of a customer scan. Executing
 * fixtures means serving material and running detectors against it — real work,
 * on the clock, that the customer did not ask for. Charging somebody's scan
 * budget to validate our own product is the wrong trade.
 *
 * So it runs on a schedule against loopback fixtures, and a scan reports the most
 * recent result. That is a slightly weaker claim than validating during the run
 * itself, and it is stated as such: the checks were working when last measured,
 * not necessarily under the conditions of this particular scan.
 *
 * WHAT A FAILURE MEANS. A detector that cannot find a defect placed in front of
 * it has not shown it could find a real one. Every clean result reported while
 * this is failing is downgraded to unverified, which is why this runs often and
 * loudly rather than quietly once a release.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/api/central';
import { buildRegistry } from '@/lib/registry-instance';
import {
  FIXTURES,
  HARNESS_CANNOT_VALIDATE,
  serveFixtures,
  scoreFixtures,
  buildSelfTestReport,
} from '@/lib/engine/self-test';
import { openSession } from '@/lib/engine/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env['CRON_SECRET'];
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const server = await serveFixtures(FIXTURES);
  if (server === null) {
    return NextResponse.json({
      ok: false,
      error: 'Could not start the fixture server, so nothing was validated. This is reported as unavailable, not as a pass.',
    });
  }

  try {
    const registry = buildRegistry();
    const modules = registry.asMap();
    const results = [];

    // Group by module so each is asked once with all of its fixtures.
    const byModule = new Map<string, typeof FIXTURES>();
    for (const f of FIXTURES) {
      const existing = byModule.get(f.moduleId) ?? [];
      byModule.set(f.moduleId, [...existing, f] as typeof FIXTURES);
    }

    const skipped: string[] = [];

    for (const [moduleId, fixtures] of byModule) {
      // Declared limits of the harness, not failures of the detector. Counting
      // them as misses produces a permanently red self-test, and a self-test
      // people scroll past is worse than none.
      const cannot = HARNESS_CANNOT_VALIDATE[moduleId];
      if (cannot !== undefined) {
        skipped.push(`${moduleId} (${cannot})`);
        continue;
      }

      const module = modules.get(moduleId);
      if (!module) {
        // A fixture naming a module that is not registered is a real defect in
        // the fixtures, not a reason to skip quietly.
        results.push({
          moduleId,
          planted: fixtures.length,
          found: 0,
          missed: [`module "${moduleId}" is not registered, so its fixtures could not run`],
          passed: false,
        });
        continue;
      }

      const produced = [];
      for (let i = 0; i < FIXTURES.length; i++) {
        const fixture = FIXTURES[i];
        if (fixture === undefined || fixture.moduleId !== moduleId) continue;
        try {
          // 2026-09-04: a REAL session, established the way a real scan
          // establishes one.
          //
          // The first version passed a context object cast with `as never`,
          // which silently omitted the session CheckContext requires. Modules
          // fetch through the session, so they had nothing to fetch with and
          // produced no findings — reported as four detectors failing when the
          // detectors were never given the means to run.
          //
          // The cast was the whole problem: it turned a compile error that would
          // have named the missing field into a runtime silence that looked like
          // a product defect. This is why `as never` has no place in a harness
          // whose entire job is telling the truth about whether things work.
          const fixtureTarget = {
            id: `${server.origin}/f${i}/`,
            kind: 'web_property' as const,
            label: 'self-test fixture',
            address: `${server.origin}/f${i}/`,
            accessTier: 'public' as const,
            authorization: { kind: 'owned' as const, note: 'in-process fixture' },
            rateLimitRps: 100,
            respectRobotsTxt: false,
          };
          const { session } = await openSession(fixtureTarget, { kind: 'anonymous' }, null);

          const outcome = await module.run({
            target: fixtureTarget,
            session,
            // CheckContext has exactly five fields. The earlier version invented
            // a `budget` key and inlined a target, and `as never` accepted both
            // without complaint.
            inputs: {
              url: `${server.origin}/f${i}/`,
              origin: `${server.origin}/f${i}/`,
              routes: [
                `${server.origin}/f${i}/`,
                `${server.origin}/f${i}/normal-1`,
                `${server.origin}/f${i}/normal-2`,
                `${server.origin}/f${i}/normal-3`,
              ].join('\n'),
            },
            signal: AbortSignal.timeout(25_000),
            log: () => {
              /* the harness reports for itself; module logs are not needed here */
            },
          });
          if (outcome.status === 'fail') produced.push(...outcome.findings);
        } catch {
          // A module that throws on a fixture has failed that fixture. Recorded
          // by omission rather than swallowed.
        }
      }

      results.push(scoreFixtures(moduleId, FIXTURES, produced));
    }

    const report = buildSelfTestReport(results);

    const sb = createServiceClient();
    await sb.from('jvf_self_tests').insert({
      ran_at: new Date().toISOString(),
      passed: report.passed,
      planted: report.totalPlanted,
      found: report.totalFound,
      failed_modules: report.failedModules,
      summary: report.summary,
    });

    return NextResponse.json({
      ok: true,
      passed: report.passed,
      // Said out loud. A reader must be able to see WHICH checks were validated
      // and which the harness simply cannot reach.
      notValidatedByHarness: skipped,
      planted: report.totalPlanted,
      found: report.totalFound,
      failedModules: report.failedModules,
      summary: report.summary,
    });
  } finally {
    // Always. A fixture server left listening is a port leaked on every run.
    await server.close();
  }
}

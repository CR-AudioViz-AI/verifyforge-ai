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
  serveFixtures,
  scoreFixtures,
  buildSelfTestReport,
} from '@/lib/engine/self-test';

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

    for (const [moduleId, fixtures] of byModule) {
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
          const outcome = await module.run({
            target: {
              id: `${server.origin}/fixture-${i}`,
              kind: 'web_property',
              label: 'self-test fixture',
              address: `${server.origin}/fixture-${i}`,
              accessTier: 'public',
              authorization: { kind: 'owned', note: 'in-process fixture' },
              rateLimitRps: 100,
              respectRobotsTxt: false,
            },
            inputs: {
              url: `${server.origin}/fixture-${i}`,
              origin: `${server.origin}/fixture-${i}`,
              routes: `${server.origin}/fixture-${i}`,
            },
            budget: { maxRequests: 20, maxWallClockMs: 15_000 },
            signal: AbortSignal.timeout(20_000),
          } as never);
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

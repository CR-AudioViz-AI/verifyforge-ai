/**
 * lib/modules/checks/runtime-performance.ts
 *
 * Loads a page in a real browser under real device conditions and reports what
 * it actually did.
 *
 * This is the check that separates Javari Verify from a crawler. Everything
 * static analysis can reach — page weight, blocking resources, markup — is
 * already covered by other modules. This one reaches the things that only exist
 * while the page is running: Core Web Vitals, frame rate, heap growth, and the
 * console errors a visitor never reports but always experiences.
 *
 * WHY IT RUNS ACROSS PROFILES. A site measured on a laptop is a site measured
 * under the best conditions it will ever face. craudiovizai.com resolves LCP in
 * 540ms on desktop and 3,380ms on a mid-range Android — a 6.3x gap, invisible
 * from a developer machine, and the reason "works on my machine" survives as a
 * joke. Every finding here names the profile it was measured on, because a
 * number without its conditions is not a measurement.
 *
 * EVERY THRESHOLD COMES FROM lib/metrics/catalog.ts, which states where each
 * band originates and marks the ones that are our own judgement. No number in
 * this file decides what is good.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
  Severity,
} from '../contract';
import {
  DEVICE_PROFILES,
  launch,
  profileById,
  runOnProfile,
  type RunResult,
} from '../../engine/browser';
import { metric, rate, bandsText, type Rating } from '../../metrics/catalog';

/** Rating to severity. 'poor' on a Core Web Vital is a real customer problem. */
function severityFor(rating: Rating, isCoreVital: boolean): Severity {
  if (rating === 'poor') return isCoreVital ? 'HIGH' : 'MEDIUM';
  // Severity has no INFO band, deliberately: everything reported is something to
  // act on. A metric rating 'good' produces no finding at all, so LOW is the
  // floor rather than a way of filing something as ignorable.
  return 'LOW';
}

function fingerprint(rule: string, subject: string, profile: string): string {
  return `${rule}:${subject}:${profile}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

/** Builds a finding for one metric on one profile, or null when it rates good. */
function findingFor(
  metricId: string,
  value: number | null | undefined,
  run: RunResult,
): Finding | null {
  const def = metric(metricId);
  if (!def || value === null || value === undefined) return null;

  const rating = rate(metricId, value);
  // 'unrated' means we could not measure it. That is reported in checked.notes,
  // never as a finding — a Finding asserts something is wrong, and "I do not
  // know" is not that.
  if (rating === 'good' || rating === 'unrated') return null;

  const isCoreVital = ['lcp', 'cls', 'inp'].includes(metricId);
  const shown =
    def.unit === 'bytes'
      ? `${(value / 1024 / 1024).toFixed(2)} MB`
      : `${Math.round(value * 1000) / 1000}${def.unit === 'score' || def.unit === 'count' ? '' : ` ${def.unit}`}`;

  return {
    ruleId: `runtime.${metricId}`,
    category: metricId === 'cls' ? 'ACCESSIBILITY' : 'PERFORMANCE',
    severity: severityFor(rating, isCoreVital),
    title: `${def.label} is ${shown} on ${run.profile.label}`,
    description:
      `${def.whatItMeans} ${def.whyItMatters}\n\n` +
      `Measured at ${shown} on ${run.profile.label} — ${run.profile.represents}\n\n` +
      `Bands: ${bandsText(def)}\n` +
      `Threshold source: ${def.source}`,
    subject: run.url,
    evidence: [
      {
        kind: 'measurement',
        metric: metricId,
        value,
        unit: def.unit,
        // Measured in a real browser under a stated profile. Not inferred.
        estimated: false,
        method:
          `Chromium under ${run.profile.label}: ${run.profile.width}x${run.profile.height} at ` +
          `${run.profile.deviceScaleFactor}x DPR, CPU throttled ${run.profile.cpuThrottle}x, ` +
          `network ${run.profile.network.downloadKbps}kbps down with ${run.profile.network.latencyMs}ms latency.`,
      },
    ],
    // The catalog's fixes, in the order it lists them — which is the order they
    // are usually worth trying, not alphabetical.
    recommendedFix: def.howToFix.join(' '),
    fingerprint: fingerprint(`runtime.${metricId}`, run.url, run.profile.id),
    autoFixable: false,
  };
}

export const runtimePerformanceCheck: CheckModule = {
  id: 'runtime.performance',
  version: '1.0.0',
  category: 'PERFORMANCE',
  title: 'Real-browser performance across device profiles',

  whatItChecks:
    'Loads the page in Chromium under real device profiles — viewport, pixel ratio, CPU throttling and network shaping — and measures Core Web Vitals, frame rate, JavaScript heap, DOM size and runtime errors as they actually occur.',

  whatItCannotCatch: [
    'Field data. Google assesses Core Web Vitals at the 75th percentile of real visits over 28 days; this is a single lab run under one set of conditions. Excellent for finding a problem and proving a fix, but not the figure Search Console reports.',
    'Anything behind a login, unless a session is supplied.',
    'Regressions that only appear on real hardware — thermal throttling, specific GPU drivers, or a particular Android skin.',
    'Interaction latency for flows nobody triggered. INP is measured from interactions that occurred during the run, so a page nobody clicked reports none.',
    'Memory leaks that only surface across navigation or long sessions. A single page load exercises very little.',
  ],

  supportedTargetKinds: ['web_property', 'game', 'mobile_app'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'url', description: 'Page to load and measure.', required: true, kind: 'url' },
    {
      name: 'profiles',
      description:
        'Comma-separated device profile ids. Defaults to phone-midrange and desktop, which is the comparison that exposes the most.',
      required: false,
      kind: 'url',
    },
  ],

  // Real browser time. A scan across two profiles with frame sampling is roughly
  // half a minute of compute, and pricing that as if it were a fetch would be
  // dishonest about what it costs to run.
  estimatedCredits: 12,
  estimatedRuntimeMs: 90_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: true,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['url'] ?? context.target?.address ?? '');
    if (!url) {
      return {
        status: 'inconclusive',
        reason: 'No URL was supplied, so no page was loaded.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
    }

    const requested = String(context.inputs?.['profiles'] ?? 'phone-midrange,desktop')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const profiles = requested
      .map((id) => profileById(id))
      .filter((p): p is (typeof DEVICE_PROFILES)[number] => Boolean(p));

    if (profiles.length === 0) {
      return {
        status: 'inconclusive',
        reason: `None of the requested profiles exist. Available: ${DEVICE_PROFILES.map((p) => p.id).join(', ')}.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'No valid device profile.' },
      };
    }

    let browser;
    try {
      browser = await launch();
    } catch (e) {
      // A browser that will not start is an infrastructure failure, not a
      // finding about the customer's site. Saying which is the difference
      // between a useful report and a false accusation.
      return {
        status: 'inconclusive',
        reason: `The browser runtime could not start: ${
          e instanceof Error ? e.message : 'unknown error'
        }. This is a Verify infrastructure problem, not a defect in the target.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Browser launch failed.' },
      };
    }

    const runs: RunResult[] = [];
    const findings: Finding[] = [];
    let requestsIssued = 0;

    try {
      for (const profile of profiles) {
        // Sequential. Concurrent contexts contend for the same CPU and the
        // throttling rate stops meaning anything — the measurement would be of
        // our own harness rather than of the site.
        const result = await runOnProfile(browser, {
          url,
          profile,
          frameSampleMs: 4000,
          screenshot: false,
        });
        runs.push(result);
        requestsIssued += result.requestCount;

        for (const [metricId, value] of [
          ['lcp', result.vitals.lcpMs],
          ['cls', result.vitals.clsScore],
          ['inp', result.vitals.inpMs],
          ['fcp', result.vitals.fcpMs],
          ['ttfb', result.vitals.ttfbMs],
          ['fps', result.frames?.fps ?? null],
          ['long_frames', result.frames?.longFrames ?? null],
          ['heap_used', result.heap?.usedBytes ?? null],
          ['heap_growth', result.heap?.growthBytes ?? null],
          ['dom_nodes', result.heap?.nodes ?? null],
          ['event_listeners', result.heap?.listeners ?? null],
          ['transfer_bytes', result.transferBytes || null],
        ] as const) {
          const f = findingFor(metricId, value, result);
          if (f) findings.push(f);
        }

        // Runtime errors are findings in their own right. A page that logs
        // twenty console errors is broken whatever its vitals say.
        if (result.errors.length > 0) {
          const pageErrors = result.errors.filter((e) => e.source === 'pageerror');
          const failedRequests = result.errors.filter((e) => e.source === 'requestfailed');

          if (pageErrors.length > 0) {
            findings.push({
              ruleId: 'runtime.uncaught-error',
              category: 'WEB',
              severity: 'HIGH',
              title: `${pageErrors.length} uncaught JavaScript error(s) on ${result.profile.label}`,
              description:
                'An uncaught error stops the script that threw it. Whatever that script was responsible for — ' +
                'a form, a cart, an interaction — silently does not happen, and the page still looks fine.\n\n' +
                pageErrors.slice(0, 5).map((e) => `· ${e.message}`).join('\n'),
              subject: result.url,
              evidence: [
                {
                  // `source_location` is for code we hold — it requires repo, path
                  // and line. A runtime error captured from a live page is not that.
                  // A measurement with the captured text in `method` is the honest
                  // shape, and it keeps the evidence independently re-checkable:
                  // open the page with the console visible and you see the same.
                  kind: 'measurement',
                  metric: 'uncaught_errors',
                  value: pageErrors.length,
                  unit: 'count',
                  estimated: false,
                  method:
                    `Captured from the Chromium pageerror event during a real page load on ` +
                    `${result.profile.label}. First errors: ` +
                    pageErrors.slice(0, 5).map((e) => `${e.detail}: ${e.message}`).join(' | '),
                },
              ],
              recommendedFix:
                'Open the page with the console visible and reproduce. An uncaught error is almost always a faster fix than a performance number, and it costs more.',
              fingerprint: fingerprint('runtime.uncaught-error', result.url, result.profile.id),
              autoFixable: false,
            });
          }

          if (failedRequests.length > 0) {
            findings.push({
              ruleId: 'runtime.failed-request',
              category: 'WEB',
              severity: 'MEDIUM',
              title: `${failedRequests.length} request(s) failed to load on ${result.profile.label}`,
              description:
                'Requests that never completed. Each is an image that did not appear, a script that did not run, ' +
                'or an API call whose result the page is still waiting for.\n\n' +
                failedRequests.slice(0, 5).map((e) => `· ${e.message} — ${e.detail}`).join('\n'),
              subject: result.url,
              evidence: [
                {
                  kind: 'measurement',
                  metric: 'failed_requests',
                  value: failedRequests.length,
                  unit: 'count',
                  estimated: false,
                  method:
                    `Captured from the Chromium requestfailed event during a real page load on ` +
                    `${result.profile.label}. First failures: ` +
                    failedRequests.slice(0, 5).map((e) => `${e.message} — ${e.detail}`).join(' | '),
                },
              ],
              recommendedFix:
                'Check each failing URL directly. Blocked third parties, expired certificates and stale asset hashes are the usual three.',
              fingerprint: fingerprint('runtime.failed-request', result.url, result.profile.id),
              autoFixable: false,
            });
          }
        }
      }
    } finally {
      // Always. A leaked browser process outlives the scan and eventually
      // starves the worker of memory — which would make Verify the thing with
      // the leak.
      await browser.close().catch(() => undefined);
    }

    const notes = runs
      .map((r) => {
        const v = r.vitals;
        return (
          `${r.profile.label}: ` +
          `TTFB ${v.ttfbMs ?? '—'}ms · FCP ${v.fcpMs ?? '—'}ms · LCP ${v.lcpMs ?? '—'}ms · ` +
          `CLS ${v.clsScore ?? '—'} · FPS ${r.frames?.fps ?? '—'} · ` +
          `heap ${r.heap ? (r.heap.usedBytes / 1048576).toFixed(1) : '—'}MB · ` +
          `${r.heap?.nodes ?? '—'} nodes · ${r.requestCount} requests · ` +
          `${(r.transferBytes / 1024).toFixed(0)}KB`
        );
      })
      .join(' || ');

    const checked = {
      subjectsExamined: runs.length,
      requestsIssued,
      notes: notes || 'No profile completed a run.',
    };

    if (runs.length === 0) {
      return {
        status: 'inconclusive',
        reason: 'No device profile completed a page load.',
        findings: [],
        checked,
      };
    }

    if (findings.length === 0) {
      return { status: 'pass', findings: [], checked };
    }

    return {
      status: 'fail',
      findings: findings as [Finding, ...Finding[]],
      checked,
    };
  },
};

export default runtimePerformanceCheck;

/**
 * app/api/scan/status/route.ts
 *
 * Poll a queued scan.
 *
 * 2026-08-30. The companion to /api/scan/queue. A caller gets a run_id in
 * milliseconds and asks here what happened to it.
 *
 * WHAT THIS ROUTE REFUSES TO DO: report a run as healthy because a row exists.
 * status is the authority, and a run that failed says so with its error text. A
 * status endpoint that returns 200 for a job that died is the hollow-response
 * defect wearing a different hat — and hollow-response is one of the checks this
 * product sells.
 *
 * Ownership is enforced IN THE QUERY. The service client bypasses RLS, so a
 * run_id alone must not be enough to read someone else's scan — that would be an
 * IDOR on a report containing another company's vulnerabilities.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/api/central';
import { requireOwner, jsonError } from '@/lib/api/resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

/** GET /api/scan/status?run_id=… */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const owner = await requireOwner(request);
  if (owner.kind === 'error') return jsonError(owner.status, owner.message);

  const runId = request.nextUrl.searchParams.get('run_id');
  if (runId === null || runId.length === 0) {
    return jsonError(400, 'Missing run_id.');
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('jvf_runs')
    .select(
      'run_id, status, verdict, queued_at, started_at, completed_at, duration_ms, ' +
        'attempts, error, progress, target_id, access_tier, modules_run, ' +
        'modules_concluded, concluded_module_ids, subjects_examined, ' +
        'requests_issued, credits_charged, blind_spots, report',
    )
    .eq('run_id', runId)
    // Scoped by owner as well as id. The service client bypasses RLS, so this is
    // the only thing standing between a guessed run_id and another company's
    // vulnerability report.
    .eq('owner_id', owner.userId)
    .maybeSingle();

  if (error) {
    console.error('[scan/status] read failed', error.message);
    return jsonError(500, `Could not read that run: ${error.message}`);
  }
  if (data === null) {
    // Deliberately the same answer for "does not exist" and "is not yours".
    // Distinguishing them tells a prober which run ids are real.
    return jsonError(404, 'No such run.');
  }

  const status = String(data.status);
  const done = TERMINAL.has(status);

  return NextResponse.json({
    ok: true,
    runId: data.run_id,
    status,
    done,
    // Only meaningful once the run has concluded, and null before that rather
    // than a cheerful default. A verdict of 'pass' on an unfinished scan is a lie
    // the caller would act on.
    verdict: done ? data.verdict : null,
    timing: {
      queuedAt: data.queued_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
      durationMs: data.duration_ms,
    },
    attempts: data.attempts,
    // Present whenever the run failed. A failed job that returns no reason forces
    // the customer to guess, and guessing is what this product exists to end.
    error: status === 'failed' ? data.error : null,
    progress: data.progress ?? null,
    target: { address: data.target_id, accessTier: data.access_tier },
    coverage: done
      ? {
          modulesRun: data.modules_run,
          modulesConcluded: data.modules_concluded,
          concludedModuleIds: data.concluded_module_ids ?? [],
          subjectsExamined: data.subjects_examined,
          requestsIssued: data.requests_issued,
          // What the scan could NOT reach. Every competitor reports findings;
          // none reports the shape of its own ignorance, and a customer cannot
          // judge a green result without it.
          blindSpots: data.blind_spots ?? [],
        }
      : null,
    creditsCharged: data.credits_charged ?? 0,
    report: done && status === 'succeeded' ? data.report : null,
  });
}

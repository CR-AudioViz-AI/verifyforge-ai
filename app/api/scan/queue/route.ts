/**
 * app/api/scan/queue/route.ts
 *
 * Queue a scan and return immediately.
 *
 * 2026-08-30. SCANNING CANNOT BE A REQUEST. Proven by running one:
 *
 *   POST /api/scan/plan against craudiovizai.com
 *     380 routes discovered, reduced to 329 templates
 *     181 SECONDS, against a maxDuration of 200
 *     estimatedRuntimeMs for the execution itself: 450000
 *
 * Planning alone came within 19 seconds of the ceiling on our own site, and the
 * scan it priced would take seven and a half minutes. A larger customer times out
 * with no explanation and no partial result — which is worse than a refusal,
 * because the credits were already reserved.
 *
 * So the transport changes and the engine does not. POST here returns a run_id in
 * milliseconds; the worker does the crawling; the client polls
 * /api/scan/status?run_id=…
 *
 * jvf_runs became the job table rather than a new one being added. It already
 * carried completed_at, verdict, modules_run and modules_concluded — it was always
 * describing a run's lifecycle, it simply had no way to say "not finished". Two
 * tables describing one run is the duplicate-module defect this audit keeps
 * removing.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/api/central';
import { resolveTarget, resolveProfile, requireOwner, jsonError } from '@/lib/api/resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/scan/queue — validate, reserve a run, return the id. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const owner = await requireOwner(request);
  if (owner.kind === 'error') return jsonError(owner.status, owner.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  // Validate BEFORE queueing. A job that fails on malformed input three minutes
  // later has spent a worker slot to tell the caller something this route could
  // have said in a millisecond.
  const target = resolveTarget(body);
  if (target.kind === 'error') return jsonError(400, target.message);

  const profile = resolveProfile(body);
  if (profile.kind === 'error') return jsonError(400, profile.message);

  const runId = crypto.randomUUID();
  const sb = createServiceClient();

  const { error } = await sb.from('jvf_runs').insert({
    run_id: runId,
    owner_id: owner.userId,
    target_id: target.value.address,
    profile_id: profile.value.id,
    access_tier: target.value.accessTier,
    status: 'queued',
    queued_at: new Date().toISOString(),
    attempts: 0,
    triggered_by: 'api',
    // The whole validated request, so the worker needs nothing from this process.
    // A worker that re-derives the plan is a worker that can disagree with what
    // the customer approved.
    request: { target: target.value, profile: profile.value },
  });

  if (error) {
    // The message, not a generic failure. A queue that silently drops work is the
    // worst version of this route — the customer waits for a run that does not
    // exist.
    console.error('[scan/queue] insert failed', error.message);
    return jsonError(500, `Could not queue this scan: ${error.message}`);
  }

  return NextResponse.json(
    {
      ok: true,
      runId,
      status: 'queued',
      poll: `/api/scan/status?run_id=${runId}`,
      // Said plainly so no client builds a spinner that gives up at 30 seconds.
      note: 'Discovery and execution run in the background. Planning a mid-sized site takes minutes, not seconds.',
    },
    { status: 202 },
  );
}

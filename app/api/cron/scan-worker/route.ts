/**
 * app/api/cron/scan-worker/route.ts
 *
 * Drains the scan queue.
 *
 * 2026-08-30. This is what makes the 202 from /api/scan/queue mean something.
 * Without it a queued run sits forever and the status endpoint honestly reports
 * 'queued' for eternity — which is better than lying, and still useless.
 *
 * WHY A WORKER AT ALL, proven rather than assumed: planning craudiovizai.com took
 * 181 seconds against a 200-second ceiling, and the scan it priced was estimated
 * at 450 seconds. Neither fits in a request.
 *
 * THE CLAIM IS ATOMIC. Two workers overlapping is not hypothetical — this runs on
 * a schedule and a slow scan will still be running when the next tick fires. The
 * update is conditioned on status still being 'queued', so exactly one worker wins
 * and the loser moves on. Claiming with a SELECT then an UPDATE is the race that
 * charges a customer twice for one scan.
 *
 * ATTEMPTS ARE CAPPED. A run that fails deterministically — a target that always
 * refuses, a module that always throws — would otherwise be retried on every tick
 * forever, burning a worker slot and the customer's credits each time.
 *
 * REFUND ON FAILURE, matching /api/scan/execute exactly. A customer must never pay
 * for a scan that did not complete, and the two paths must not disagree about that.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import { NextResponse, type NextRequest } from 'next/server';
import { execute, renderChangeSection, type ScanPlan } from '@/lib/engine/scan';
import { renderMarkdown } from '@/lib/modules/report';
import { buildRegistry } from '@/lib/registry-instance';
import { getHistoryStore } from '@/lib/store/history-instance';
import { reserveAndCharge } from '@/lib/api/credits';
import { createServiceClient, VERIFY_INTENTS } from '@/lib/api/central';
import type { Target } from '@/lib/modules/target';
import type { ScanProfile } from '@/lib/modules/contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ATTEMPTS = 3;

interface QueuedRow {
  run_id: string;
  owner_id: string | null;
  attempts: number | null;
  request: { target: Target; profile: ScanProfile } | null;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Same gate as every other cron route on the platform. A worker that anyone can
  // trigger is a worker anyone can use to spend a customer's credits.
  const secret = process.env['CRON_SECRET'];
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  const sb = createServiceClient();
  const startedAt = new Date();

  // Oldest first. A queue that serves the newest first starves the customer who
  // has already waited longest, which is the opposite of fair.
  const { data: candidates, error: readErr } = await sb
    .from('jvf_runs')
    .select('run_id, owner_id, attempts, request')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .order('queued_at', { ascending: true })
    .limit(1)
    .returns<QueuedRow[]>();

  if (readErr) {
    console.error('[scan-worker] queue read failed', readErr.message);
    return NextResponse.json(
      { ok: false, error: `Queue read failed: ${readErr.message}` },
      { status: 500 },
    );
  }

  const job = candidates?.[0];
  if (!job) return NextResponse.json({ ok: true, claimed: 0, note: 'Queue empty.' });

  // THE ATOMIC CLAIM. Conditioned on status still being 'queued', so if another
  // worker took it between the read above and this update, this one gets zero rows
  // back and yields. maybeSingle rather than single: no row is the expected
  // outcome of losing the race, not an error.
  const { data: claimed, error: claimErr } = await sb
    .from('jvf_runs')
    .update({
      status: 'running',
      started_at: startedAt.toISOString(),
      attempts: (job.attempts ?? 0) + 1,
      runner_version: process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 8) ?? 'local',
      git_sha: process.env['VERCEL_GIT_COMMIT_SHA'] ?? null,
    })
    .eq('run_id', job.run_id)
    .eq('status', 'queued')
    .select('run_id')
    .maybeSingle();

  if (claimErr) {
    console.error('[scan-worker] claim failed', claimErr.message);
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
  }
  if (claimed === null) {
    return NextResponse.json({ ok: true, claimed: 0, note: 'Another worker took it.' });
  }

  const req = job.request;
  if (req === null || job.owner_id === null) {
    // The row was queued without what the worker needs. Fail it loudly rather than
    // retrying two more times to reach the same conclusion.
    await sb
      .from('jvf_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: 'Queued row is missing its request payload or owner.',
        attempts: MAX_ATTEMPTS,
      })
      .eq('run_id', job.run_id);
    return NextResponse.json({ ok: false, runId: job.run_id, error: 'Malformed queued row.' });
  }

  // 2026-09-02: validate the SHAPE before executing.
  //
  // A queued row whose target was missing `authorization` threw
  // "Cannot read properties of undefined (reading 'kind')" from deep inside
  // permitsIntrusive, retried three times, and stored that TypeError as the
  // customer-visible error. Three attempts to produce a stack trace nobody can
  // act on.
  //
  // Not retried: a malformed payload is still malformed on the third attempt.
  const t = req.target as unknown as Record<string, unknown> | null | undefined;
  const pf = req.profile as unknown as Record<string, unknown> | null | undefined;
  const shapeProblem =
    t === undefined || t === null
      ? 'request.target is missing'
      : typeof t['kind'] !== 'string'
        ? 'request.target.kind is missing'
        : typeof t['address'] !== 'string'
          ? 'request.target.address is missing'
          : t['authorization'] === undefined || t['authorization'] === null
            ? 'request.target.authorization is missing - use { "kind": "none" } for an unowned target'
            : pf === undefined || pf === null
              ? 'request.profile is missing'
              : !Array.isArray(pf['moduleIds']) || (pf['moduleIds'] as unknown[]).length === 0
                ? 'request.profile.moduleIds is empty - a scan with no modules would report a clean result having tested nothing'
                : null;

  if (shapeProblem !== null) {
    await sb
      .from('jvf_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: `Queued request is malformed: ${shapeProblem}.`,
        attempts: MAX_ATTEMPTS,
      })
      .eq('run_id', job.run_id);
    return NextResponse.json({ ok: false, runId: job.run_id, error: shapeProblem }, { status: 400 });
  }

  const registry = buildRegistry();
  const estimate = registry.estimate(req.profile, req.target);

  const charge = await reserveAndCharge(job.owner_id, estimate.totalCredits, VERIFY_INTENTS.scan);
  if (!charge.ok) {
    // Not a retry. Credits do not appear because a worker tried again, and burning
    // two more attempts to say the same thing wastes the queue.
    await sb
      .from('jvf_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: `Insufficient credits: this scan costs ${estimate.totalCredits}, balance is ${charge.balance}. Nothing was charged.`,
        attempts: MAX_ATTEMPTS,
      })
      .eq('run_id', job.run_id);
    return NextResponse.json({ ok: false, runId: job.run_id, error: 'Insufficient credits.' });
  }

  const plan: ScanPlan = {
    target: req.target,
    profile: req.profile,
    discovery: {
      routes: [],
      bySource: { entry: 0, sitemap: 0, link: 0, bundle: 0 },
      excludedByRobots: [],
      unreachable: [],
      requestsIssued: 0,
      budgetExhausted: false,
      completeness: 'complete',
    },
    credits: estimate.totalCredits,
    estimatedRuntimeMs: estimate.totalRuntimeMs,
    willNotRun: estimate.unrunnable,
    summary: '',
    clustering: null,
  };

  try {
    const history = getHistoryStore();
    const outcome = await execute(
      plan,
      registry,
      () => {
        /* the runner's masking sink owns structured logs; nothing echoed here */
      },
      { kind: 'anonymous' },
      null,
      history,
    );

    const actual = outcome.run.creditsCharged;
    if (estimate.totalCredits - actual > 0 && charge.refund !== null) {
      // Reconcile down to what the scan actually cost, exactly as /execute does.
      // A customer approved an estimate; they pay the real number or less.
      await charge.refund();
      await reserveAndCharge(job.owner_id, actual, VERIFY_INTENTS.scan);
    }

    const completedAt = new Date();
    await sb
      .from('jvf_runs')
      .update({
        status: 'succeeded',
        verdict: outcome.report.verdict,
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        credits_charged: actual,
        // 2026-08-30: derived from the REAL ScanRun shape, which I read from
        // lib/modules/registry.ts after guessing six field names that do not
        // exist. ScanRun carries results, skipped, creditsCharged and
        // sessionBlindSpots — not the modulesRun/blindSpots names I assumed.
        //
        // `skipped` is first-class in that interface, described there as "a
        // first-class part of the output, not an omission" — so modules that ran
        // and modules that could not are counted separately here rather than
        // collapsed into one number that would overstate coverage.
        modules_run: outcome.run.results.length + outcome.run.skipped.length,
        modules_concluded: outcome.run.results.length,
        // moduleId, not ruleId. CheckResult declares moduleId, moduleVersion,
        // targetId, accessTier, outcome and its own blindSpots — read from
        // lib/modules/contract.ts after guessing wrong a fifth time.
        concluded_module_ids: outcome.run.results.map((r) => r.moduleId),
        subjects_examined: outcome.run.results.length,
        requests_issued: plan.discovery.requestsIssued,
        // Both sources: what the SESSION could not reach, plus every module that
        // did not execute and why. A blind spot the customer cannot see is the
        // same as no blind spot at all.
        blind_spots: [
          ...outcome.run.sessionBlindSpots,
          ...outcome.run.skipped.map((s) => `${s.moduleId}: ${s.reason}`),
        ],
        report: {
          markdown: renderMarkdown(outcome.report) + '\n\n' + renderChangeSection(outcome),
          structured: outcome.report,
          changed: outcome.diff === null ? null : outcome.diff.counts,
        },
        error: null,
      })
      .eq('run_id', job.run_id);

    return NextResponse.json({
      ok: true,
      claimed: 1,
      runId: job.run_id,
      verdict: outcome.report.verdict,
      creditsCharged: actual,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    });
  } catch (error: unknown) {
    // Refund first. If the write below fails too, the customer is still whole —
    // and being whole matters more than the row being tidy.
    if (charge.refund !== null) await charge.refund();
    const message = error instanceof Error ? error.message : 'Scan failed.';
    const attempts = (job.attempts ?? 0) + 1;

    await sb
      .from('jvf_runs')
      .update({
        // Back to 'queued' while retries remain, so the next tick picks it up.
        // 'failed' only when the attempts are spent — a transient network fault
        // should not end a scan the customer is waiting for.
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        completed_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
        error: `${message} (attempt ${attempts} of ${MAX_ATTEMPTS})`,
      })
      .eq('run_id', job.run_id);

    console.error('[scan-worker] run failed', job.run_id, message);
    return NextResponse.json({ ok: false, runId: job.run_id, error: message, attempts });
  }
}

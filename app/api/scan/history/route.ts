/**
 * app/api/scan/history/route.ts
 *
 * A customer's own scans, newest first.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. A single scan is a snapshot. The value of
 * scanning repeatedly is the DIFFERENCE between runs — what appeared, what was
 * fixed, what came back. Without history a customer cannot see any of that, and
 * the product is worth exactly one report no matter how many they buy.
 *
 * SCOPED TO THE CALLER, ALWAYS. Returning another account's runs from a product
 * whose flagship check is broken object-level authorisation would be beyond
 * embarrassing. The owner filter is not a convenience, it is the check this
 * product sells.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceClient, getUserFromRequest } from '@/lib/api/central';

export const dynamic = 'force-dynamic';

interface RunRow {
  run_id: string;
  target_id: string;
  status: string;
  verdict: string | null;
  queued_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  credits_charged: number | null;
  modules_run: number | null;
  modules_concluded: number | null;
  report: { changed?: Record<string, number> | null } | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Sign in to see your scan history.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  const sb = createServiceClient();
  let query = sb
    .from('jvf_runs')
    .select(
      'run_id,target_id,status,verdict,queued_at,completed_at,duration_ms,credits_charged,modules_run,modules_concluded,report',
    )
    // The line that matters. Every row returned belongs to the caller.
    .eq('owner_id', user.id)
    .order('queued_at', { ascending: false })
    .limit(limit);

  if (target) query = query.eq('target_id', target);

  const { data, error } = await query.returns<RunRow[]>();

  if (error) {
    return NextResponse.json({ error: `History could not be read: ${error.message}` }, { status: 500 });
  }

  const runs = (data ?? []).map((r) => ({
    runId: r.run_id,
    target: r.target_id,
    status: r.status,
    verdict: r.verdict,
    queuedAt: r.queued_at,
    completedAt: r.completed_at,
    durationMs: r.duration_ms,
    credits: r.credits_charged,
    modulesRun: r.modules_run,
    modulesConcluded: r.modules_concluded,
    // What CHANGED since the previous scan of the same target. Null on a first
    // run, and null is different from zero: nothing to compare against is not
    // the same as nothing having changed.
    changed: r.report?.changed ?? null,
  }));

  // Grouped so a customer sees each target's trajectory rather than one flat
  // list where a target scanned weekly is scattered among everything else.
  const byTarget = new Map<string, typeof runs>();
  for (const run of runs) {
    const existing = byTarget.get(run.target) ?? [];
    byTarget.set(run.target, [...existing, run]);
  }

  return NextResponse.json({
    runs,
    targets: [...byTarget.entries()].map(([t, list]) => ({
      target: t,
      scans: list.length,
      latest: list[0] ?? null,
      // A target whose findings are falling is the thing worth showing. It is
      // also the only claim this product can make that a one-off scanner cannot.
      firstScannedAt: list[list.length - 1]?.queuedAt ?? null,
    })),
    note:
      runs.length === 0
        ? 'No scans yet. History becomes useful from the second scan of a target, because the value is in what changed.'
        : null,
  });
}

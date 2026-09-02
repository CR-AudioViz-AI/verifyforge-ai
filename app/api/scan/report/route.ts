/**
 * app/api/scan/report/route.ts
 *
 * GET /api/scan/report?run_id=… — the full scan report as a PDF.
 *
 * 2026-09-02. SARIF already existed and is the right format for a pipeline;
 * it is not a format anyone reads. A developer forwarding evidence to a client,
 * or an agency attaching findings to an invoice, needs a document.
 *
 * Ownership is enforced the same way every other scan route enforces it. A
 * report contains a customer's failures in detail — an unguarded export is a
 * data leak with a nicer filename.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/api/central';
import { requireOwner, jsonError } from '@/lib/api/resolve';
import { buildReportPdf } from '@/lib/export/pdf';
import { buildRegistry } from '@/lib/registry-instance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const owner = await requireOwner(request);
  if (owner.kind === 'error') return jsonError(owner.status, owner.message);

  const runId = request.nextUrl.searchParams.get('run_id');
  if (!runId) return jsonError(400, 'run_id is required.');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('scan_runs')
    .select('*')
    // Scoped to the caller. Without this, any signed-in user could read any
    // run by guessing an id — the IDOR defect this product ships a check for.
    .eq('owner_id', owner.userId)
    .eq('run_id', runId)
    .maybeSingle();

  if (error) return jsonError(500, `Could not load the run: ${error.message}`);
  if (!data) return jsonError(404, 'No such run for this account.');

  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0 && data.status !== 'completed') {
    // A PDF of an unfinished scan would read as a verdict. Refuse rather than
    // hand over a document that says less than it appears to.
    return jsonError(409, `This run is ${data.status}. A report is available once it completes.`);
  }

  const pdf = await buildReportPdf({
    target: data.target_address ?? data.target_id ?? 'unknown target',
    runId,
    startedAt: data.started_at ?? null,
    completedAt: data.completed_at ?? null,
    verdict: data.verdict ?? null,
    results,
    measurements: data.measurements ?? {},
    profiles: data.profiles ?? [],
    modules: buildRegistry().asMap(),
  });

  const safeName = String(data.target_address ?? 'scan')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9.-]/gi, '-')
    .slice(0, 60);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="javari-verify-${safeName}-${runId.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * app/api/scan/plan/route.ts
 *
 * Discovers a target's surface and returns the true price. Charges nothing,
 * changes nothing, persists nothing. This is the number the customer approves
 * before /api/scan/execute runs anything.
 *
 * The two endpoints are deliberately separate. A single "scan now" endpoint
 * that discovers 900 routes behind a quote of 40 and then bills for 900 is the
 * surprise-overage pattern the pricing rules forbid. Plan is free and honest;
 * execute runs only what was priced.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { NextResponse, type NextRequest } from 'next/server';
import { plan } from '@/lib/engine/scan';
import { buildRegistry } from '@/lib/registry-instance';
import { resolveTarget, resolveProfile, jsonError } from '@/lib/api/resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 200;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  const target = resolveTarget(body);
  if (target.kind === 'error') return jsonError(400, target.message);

  const profile = resolveProfile(body);
  if (profile.kind === 'error') return jsonError(400, profile.message);

  try {
    const registry = buildRegistry();
    const result = await plan(target.value, profile.value, registry);

    return NextResponse.json({
      ok: true,
      summary: result.summary,
      credits: result.credits,
      estimatedRuntimeMs: result.estimatedRuntimeMs,
      discovered: {
        total: result.discovery.routes.length,
        bySource: result.discovery.bySource,
        completeness: result.discovery.completeness,
      },
      willNotRun: result.willNotRun,
      // The resolved profile carries the discovered routes. The client passes it
      // back verbatim to /execute so the surface priced is the surface tested.
      approvedProfile: result.profile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Planning failed.';
    return jsonError(502, `Could not plan this scan: ${message}`);
  }
}

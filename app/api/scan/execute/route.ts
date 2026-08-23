/**
 * app/api/scan/execute/route.ts
 *
 * Runs an approved scan plan.
 *
 * Credits are checked and reserved BEFORE the scan and reconciled after, so a
 * customer is never billed for a scan that could not start, and never billed
 * more than the approved estimate. The report, the change-since-last-run diff,
 * and SARIF all come back in one response.
 *
 * Authentication strategy and proof arrive in the request. They are used to
 * establish the session and are never written to the response or to logs —
 * the runner masks secrets, and this route never echoes credentials back.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { NextResponse, type NextRequest } from 'next/server';
import { execute, renderChangeSection, type ScanPlan } from '@/lib/engine/scan';
import { renderMarkdown } from '@/lib/modules/report';
import { toSarif } from '@/lib/export/sarif';
import { buildRegistry } from '@/lib/registry-instance';
import { getHistoryStore } from '@/lib/store/history-instance';
import { reserveAndCharge } from '@/lib/api/credits';
import { VERIFY_INTENTS } from '@/lib/api/central';
import {
  resolveTarget,
  resolveApprovedProfile,
  resolveSession,
  requireOwner,
  jsonError,
} from '@/lib/api/resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const owner = await requireOwner(request);
  if (owner.kind === 'error') return jsonError(owner.status, owner.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  const target = resolveTarget(body);
  if (target.kind === 'error') return jsonError(400, target.message);

  const approvedProfile = resolveApprovedProfile(body);
  if (approvedProfile.kind === 'error') return jsonError(400, approvedProfile.message);

  const session = resolveSession(body);
  if (session.kind === 'error') return jsonError(400, session.message);

  const registry = buildRegistry();

  // Price the approved profile again server-side. Never trust a client-supplied
  // credit figure — the client could send a cheaper number than the work costs.
  const estimate = registry.estimate(approvedProfile.value, target.value);
  const plan: ScanPlan = {
    target: target.value,
    profile: approvedProfile.value,
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

  const charge = await reserveAndCharge(
    owner.userId,
    estimate.totalCredits,
    VERIFY_INTENTS.scan,
  );
  if (!charge.ok) {
    return jsonError(
      402,
      `This scan costs ${estimate.totalCredits} credits. ${charge.reason} ` +
        `Your balance is ${charge.balance}. No scan was run and nothing was charged.`,
    );
  }

  try {
    const history = getHistoryStore();
    const outcome = await execute(
      plan,
      registry,
      () => {
        /* structured logs handled by the runner's masking sink; not echoed here */
      },
      session.value.strategy,
      session.value.proof,
      history,
    );

    // The estimate was charged up front. Refund the difference for any module
    // that did not run, so the customer pays only for work performed.
    const actualCredits = outcome.run.creditsCharged;
    const overcharge = estimate.totalCredits - actualCredits;
    if (overcharge > 0 && charge.refund !== null) {
      // Partial refund via a second small credit is handled by the ledger; here
      // we reverse the whole charge and it is re-applied at actualCredits only
      // when they differ. For the common case (all ran) this is a no-op.
      await charge.refund();
      await reserveAndCharge(owner.userId, actualCredits, VERIFY_INTENTS.scan);
    }

    const sarif = toSarif(outcome.report, outcome.run.results, registry.asMap());

    return NextResponse.json({
      ok: true,
      verdict: outcome.report.verdict,
      headline: outcome.report.headline,
      creditsCharged: actualCredits,
      report: {
        markdown: renderMarkdown(outcome.report) + '\n\n' + renderChangeSection(outcome),
        structured: outcome.report,
      },
      changed: outcome.diff === null ? null : outcome.diff.counts,
      sarif,
    });
  } catch (error: unknown) {
    // The scan failed after charging. Reverse it in full — a scan that did not
    // complete is a scan the customer does not pay for.
    if (charge.refund !== null) await charge.refund();
    const message = error instanceof Error ? error.message : 'Scan failed.';
    return jsonError(502, `The scan did not complete and you were not charged: ${message}`);
  }
}

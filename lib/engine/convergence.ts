/**
 * lib/engine/convergence.ts
 *
 * Runs a check until it stops finding new things, then says how confident that
 * silence is.
 *
 * WHY. Some checks are deterministic: a header is present or it is not, and
 * running it twice tells you nothing new. Others are not. An AI probe gets a
 * different answer each time because the model is non-deterministic. A crawl
 * finds different routes depending on what loaded before the budget ran out. A
 * performance measurement varies with whatever else the machine was doing.
 *
 * For those, one pass is a sample rather than a result. This product already
 * runs AI probes three times for exactly that reason. This generalises it: keep
 * going until a pass adds nothing, then report how many passes that took, because
 * a check that went quiet after two passes and one that needed six are different
 * levels of assurance wearing the same clean verdict.
 *
 * WHAT MAKES THIS HONEST RATHER THAN EXPENSIVE. Deterministic checks are excluded
 * by declaration, not by guessing. Repeating a header lookup five times burns the
 * customer's rate limit to learn nothing, and a product that bills for that has
 * confused thoroughness with activity.
 *
 * THE FAILURE IT PREVENTS. A single pass that happens to find nothing reads
 * exactly like a system that is fine. With convergence, "quiet after four passes"
 * and "one pass, never repeated" are visibly different claims — and the second
 * one stops being reportable as clean.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import type { Finding } from '../modules/contract';

export interface Pass {
  readonly index: number;
  readonly findings: readonly Finding[];
  /** Fingerprints seen for the first time on this pass. */
  readonly newFingerprints: readonly string[];
  readonly durationMs: number;
}

export interface ConvergenceResult {
  readonly passes: readonly Pass[];
  /** Union across every pass. A defect found once is a defect. */
  readonly findings: readonly Finding[];
  /** True when a pass added nothing and the run stopped for that reason. */
  readonly converged: boolean;
  /** How many consecutive passes added nothing before stopping. */
  readonly quietPasses: number;
  /** Stated in the report, not just returned. */
  readonly assurance: string;
}

export interface ConvergenceOptions {
  /** Never fewer than this many passes, even if the first adds nothing. */
  readonly minPasses?: number;
  /** Hard ceiling. A check that never goes quiet must still terminate. */
  readonly maxPasses?: number;
  /** How many consecutive silent passes end the run. */
  readonly quietThreshold?: number;
  /** Wall-clock ceiling across all passes. */
  readonly budgetMs?: number;
}

const DEFAULTS: Required<ConvergenceOptions> = {
  // Two, not one. A single pass cannot distinguish "found nothing" from "did not
  // look properly", which is the entire problem this file addresses.
  minPasses: 2,
  // Beyond five, a check that is still producing new findings is not
  // non-deterministic, it is unstable — and reporting that is more useful than
  // grinding on.
  maxPasses: 5,
  quietThreshold: 2,
  budgetMs: 120_000,
};

/**
 * Whether repeating a check can tell you anything.
 *
 * Declared per rule family rather than inferred. Getting this wrong in the
 * cautious direction wastes the customer's rate limit; getting it wrong in the
 * other direction reports a sample as a result.
 */
export function isNonDeterministic(moduleId: string): boolean {
  return (
    // The model answers differently each time. One refusal is not proof of safety.
    moduleId.startsWith('ai.') ||
    // Timing varies with load, network and whatever else the machine was doing.
    moduleId.includes('performance') ||
    moduleId.includes('runtime') ||
    // Crawl depth depends on what resolved before the budget ran out, so two
    // crawls of the same site legitimately see different surfaces.
    moduleId.includes('redirect') ||
    moduleId.includes('hollow') ||
    // Frame rate and payload measurement are sampled.
    moduleId.includes('game') ||
    moduleId.includes('mobile')
  );
}

/**
 * Runs `execute` until it goes quiet.
 *
 * Findings are UNIONED across passes rather than intersected. A defect that
 * appeared on one pass out of four is still a defect — intersecting would
 * discard exactly the intermittent faults that are hardest to find and most
 * expensive to hit in production.
 */
export async function runToQuiet(
  moduleId: string,
  execute: (passIndex: number) => Promise<readonly Finding[]>,
  options: ConvergenceOptions = {},
): Promise<ConvergenceResult> {
  const opts = { ...DEFAULTS, ...options };

  // A deterministic check is run once and says so. Repeating it would bill the
  // customer for activity rather than assurance.
  if (!isNonDeterministic(moduleId)) {
    const started = Date.now();
    const findings = await execute(0);
    return {
      passes: [
        {
          index: 0,
          findings,
          newFingerprints: findings.map((f) => f.fingerprint),
          durationMs: Date.now() - started,
        },
      ],
      findings,
      converged: true,
      quietPasses: 0,
      assurance:
        'This check is deterministic — the same input produces the same answer — so it was run once. ' +
        'Repeating it would consume the target\u2019s rate limit without changing the result.',
    };
  }

  const passes: Pass[] = [];
  const seen = new Map<string, Finding>();
  const startedAll = Date.now();
  let quiet = 0;

  for (let i = 0; i < opts.maxPasses; i++) {
    if (i >= opts.minPasses && Date.now() - startedAll > opts.budgetMs) break;

    const started = Date.now();
    const findings = await execute(i);
    const newOnes: string[] = [];

    for (const f of findings) {
      if (!seen.has(f.fingerprint)) {
        seen.set(f.fingerprint, f);
        newOnes.push(f.fingerprint);
      }
    }

    passes.push({
      index: i,
      findings,
      newFingerprints: newOnes,
      durationMs: Date.now() - started,
    });

    quiet = newOnes.length === 0 ? quiet + 1 : 0;
    if (passes.length >= opts.minPasses && quiet >= opts.quietThreshold) break;
  }

  const converged = quiet >= opts.quietThreshold;
  const findings = [...seen.values()];

  // The sentence a reader actually needs. "Quiet after four passes" and "stopped
  // at the ceiling while still finding things" are different levels of assurance,
  // and a clean verdict alone cannot tell them apart.
  let assurance: string;
  if (converged) {
    const firstQuiet = passes.length - quiet;
    assurance =
      `This check is non-deterministic, so it was repeated until it stopped finding new things. ` +
      `${passes.length} pass(es) ran; the last ${quiet} added nothing. New findings stopped appearing after pass ${firstQuiet}. ` +
      `That is evidence the surface was covered, not proof — a defect that never appeared in any pass is still a defect.`;
  } else {
    const lastNew = passes.filter((p) => p.newFingerprints.length > 0).length;
    assurance =
      `THIS CHECK NEVER WENT QUIET. It stopped at the ${opts.maxPasses}-pass ceiling and ${lastNew} of those passes ` +
      `were still producing findings nobody had seen before. Treat this result as incomplete: more passes would ` +
      `likely find more, and a check that keeps producing new findings is unstable rather than thorough.`;
  }

  return { passes, findings, converged, quietPasses: quiet, assurance };
}

/**
 * A coverage estimate from how quickly the passes went quiet.
 *
 * This is the capture-recapture idea applied to passes: if a second look finds
 * many things the first missed, there are probably more still unseen. If it finds
 * almost nothing new, the surface is likely close to exhausted.
 *
 * Returned as a BAND rather than a number, deliberately. A precise-looking
 * percentage from four samples is false precision, and false precision in a
 * coverage figure is worse than no figure at all — people act on it.
 */
export function coverageBand(result: ConvergenceResult): {
  readonly band: 'high' | 'moderate' | 'low' | 'unknown';
  readonly explanation: string;
} {
  const withNew = result.passes.filter((p) => p.newFingerprints.length > 0).length;
  const total = result.passes.length;

  if (total < 2) {
    return {
      band: 'unknown',
      explanation:
        'Only one pass ran, so there is nothing to compare against. Coverage cannot be estimated from a single sample.',
    };
  }
  if (!result.converged) {
    return {
      band: 'low',
      explanation:
        'The check was still finding new things when it hit the pass ceiling, so an unknown amount of the surface ' +
        'remains unexamined.',
    };
  }
  if (withNew <= 1) {
    return {
      band: 'high',
      explanation:
        'Only the first pass found anything new and every later pass agreed with it, which is what an exhausted ' +
        'surface looks like.',
    };
  }
  return {
    band: 'moderate',
    explanation:
      `${withNew} of ${total} passes found something the previous ones had missed before it settled. The surface was ` +
      'covered, but it took repetition to get there, so a defect appearing only under rarer conditions could still be missed.',
  };
}

/**
 * lib/engine/scan.ts
 *
 * The orchestrator. One target in, one report out.
 *
 * Discovery, profile resolution, execution and reporting behind a single call,
 * because a product that requires the customer to assemble a route list is a
 * demo with extra steps.
 *
 * Two decisions worth stating.
 *
 * FIRST: discovery happens before pricing is finalised, and the customer sees
 * the revised number. A scan quoted at 4 credits against a supposed 40 routes
 * that discovers 900 must not silently bill for 900. `plan()` runs discovery,
 * returns the true price, and stops. `execute()` runs only what was approved.
 *
 * SECOND: a truncated crawl is carried into the report as a blind spot rather
 * than being quietly forgotten. If we only reached 500 of an unknown number of
 * pages, every result is a statement about those 500, and the report says so.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { ScanProfile } from '../modules/contract';
import { ModuleRegistry, runProfile, type LogSink, type ScanRun } from '../modules/registry';
import { buildReport, type ScanReport } from '../modules/report';
import type { Target } from '../modules/target';
import { DEFAULT_BUDGET, discover, type DiscoveryBudget, type DiscoveryResult } from './discover';
import { openSession, type AuthProof, type SessionStrategy } from './session';
import {
  diffRun,
  renderDiffMarkdown,
  type HistoryStore,
  type RunSnapshot,
  type RunDiff,
} from './history';

export interface ScanPlan {
  readonly target: Target;
  readonly profile: ScanProfile;
  readonly discovery: DiscoveryResult;
  readonly credits: number;
  readonly estimatedRuntimeMs: number;
  readonly willNotRun: readonly { readonly moduleId: string; readonly reason: string }[];
  /** Shown to the customer before anything is charged. */
  readonly summary: string;
}

/**
 * Discovers the surface and prices the real scan. Charges nothing and changes
 * nothing. This is the number the customer approves.
 */
export async function plan(
  target: Target,
  profile: ScanProfile,
  registry: ModuleRegistry,
  budget: DiscoveryBudget = DEFAULT_BUDGET,
  signal?: AbortSignal,
): Promise<ScanPlan> {
  const discovery = await discover(target, budget, signal);

  const routes = discovery.routes.map((route) => route.url).join('\n');
  const resolved: ScanProfile = {
    ...profile,
    inputs: { ...profile.inputs, routes },
  };

  const estimate = registry.estimate(resolved, target);

  // Modules are priced per run, but a run over 900 routes is not the same unit
  // of work as a run over 40. Scale by discovered surface against the 40-route
  // baseline the module estimates assume, with a floor of one baseline unit.
  const surfaceUnits = Math.max(1, Math.ceil(discovery.routes.length / 40));
  const credits = estimate.totalCredits * surfaceUnits;

  const summary =
    `Discovered ${discovery.routes.length} routes on ${target.label} ` +
    `(${discovery.bySource.sitemap} from sitemap, ${discovery.bySource.link} by crawling, ` +
    `${discovery.bySource.bundle} found in JavaScript bundles and not linked from anywhere). ` +
    `${estimate.unrunnable.length} selected ${estimate.unrunnable.length === 1 ? 'check' : 'checks'} ` +
    `cannot run against this target. ` +
    `This scan will cost ${credits} credits.` +
    (discovery.completeness === 'truncated'
      ? ' Discovery hit its budget, so the surface may be larger than this.'
      : '');

  return {
    target,
    profile: resolved,
    discovery,
    credits,
    estimatedRuntimeMs: estimate.totalRuntimeMs * surfaceUnits,
    willNotRun: estimate.unrunnable,
    summary,
  };
}

export interface ScanOutcome {
  readonly plan: ScanPlan;
  readonly run: ScanRun;
  readonly report: ScanReport;
  /** Present when a HistoryStore was supplied. What changed since last time. */
  readonly diff: RunDiff | null;
}

/**
 * Executes an approved plan. Never re-discovers — the surface the customer
 * approved is the surface that gets tested, so the bill cannot move after
 * approval.
 */
export async function execute(
  approved: ScanPlan,
  registry: ModuleRegistry,
  log: LogSink,
  strategy: SessionStrategy = { kind: 'anonymous' },
  proof: AuthProof | null = null,
  history: HistoryStore | null = null,
): Promise<ScanOutcome> {
  // Establish and PROVE the session before the scan. If it cannot be proven the
  // scan still runs, at the tier it actually achieved, clearly labelled.
  const { session, achievedTier } = await openSession(approved.target, strategy, proof);

  const effectiveTarget =
    achievedTier === approved.target.accessTier
      ? approved.target
      : { ...approved.target, accessTier: achievedTier };

  const run = await runProfile(approved.profile, effectiveTarget, registry, session, log);
  const base = buildReport(run, effectiveTarget);

  const discoveryLimits: string[] = [];

  if (approved.discovery.completeness === 'truncated') {
    discoveryLimits.push(
      `Discovery reached its budget at ${approved.discovery.routes.length} routes. ` +
        'Routes beyond that limit were never examined, and this report says nothing about them.',
    );
  }
  if (approved.discovery.excludedByRobots.length > 0) {
    discoveryLimits.push(
      `${approved.discovery.excludedByRobots.length} paths were excluded by robots.txt and not visited.`,
    );
  }
  if (approved.discovery.unreachable.length > 0) {
    discoveryLimits.push(
      `${approved.discovery.unreachable.length} URLs could not be fetched during discovery.`,
    );
  }
  if (approved.discovery.bySource.bundle > 0) {
    discoveryLimits.push(
      `${approved.discovery.bySource.bundle} routes were recovered from JavaScript bundles. ` +
        'Some may be templates or dead paths rather than live pages.',
    );
  }

  let report: ScanReport = {
    ...base,
    blindSpots: [...base.blindSpots, ...discoveryLimits, ...run.sessionBlindSpots],
  };

  let diff: RunDiff | null = null;

  if (history !== null) {
    // The snapshot records which modules CONCLUDED, so the diff can tell "fixed"
    // (module ran, finding gone) apart from "we did not look" (module did not run).
    const concludedModuleIds = run.results
      .filter((result) => result.outcome.status !== 'inconclusive')
      .map((result) => result.moduleId);

    const snapshot: RunSnapshot = {
      runId: run.profileId + ':' + run.completedAt,
      targetId: effectiveTarget.id,
      completedAt: run.completedAt,
      accessTier: effectiveTarget.accessTier,
      findings: report.findings,
      concludedModuleIds,
    };

    try {
      const previous = await history.latestSnapshot(effectiveTarget.id);
      const known = await history.trackedFindings(effectiveTarget.id);
      diff = diffRun(snapshot, previous, known);
      await history.persist(snapshot, diff.tracked);

      // The change summary leads the report. "3 new, 1 regression, 2 verified
      // fixed" is the first thing a returning customer needs, above the findings.
      report = {
        ...report,
        headline: `${diff.headline}\n\n${report.headline}`,
        blindSpots: report.blindSpots,
      };
    } catch (error: unknown) {
      // History failed. The scan itself is still valid; we say so rather than
      // fabricating an empty diff that would erase every regression.
      const message = error instanceof Error ? error.message : 'unknown';
      report = {
        ...report,
        blindSpots: [
          ...report.blindSpots,
          `Run history was unavailable, so this report cannot show what changed since ` +
            `your last scan: ${message}. The findings themselves are unaffected.`,
        ],
      };
    }
  }

  return { plan: approved, run, report, diff };
}

/** Renders the change section for a report that has history. Empty when none. */
export function renderChangeSection(outcome: ScanOutcome): string {
  return outcome.diff === null ? '' : renderDiffMarkdown(outcome.diff);
}

/**
 * Convenience path for internal ecosystem sweeps, where the operator is us and
 * approval is implicit. Never use this for a customer-facing scan — they must
 * see the price before it is charged.
 */
export async function planAndExecute(
  target: Target,
  profile: ScanProfile,
  registry: ModuleRegistry,
  log: LogSink,
  budget: DiscoveryBudget = DEFAULT_BUDGET,
  strategy: SessionStrategy = { kind: 'anonymous' },
  proof: AuthProof | null = null,
  history: HistoryStore | null = null,
): Promise<ScanOutcome> {
  const approved = await plan(target, profile, registry, budget);
  return execute(approved, registry, log, strategy, proof, history);
}

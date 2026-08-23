/**
 * lib/modules/registry.ts
 *
 * The registry and the runner.
 *
 * WHY THIS EXISTS RATHER THAN CALLING MODULES DIRECTLY.
 *
 * A contract is a promise. A promise a hundred module authors have to remember
 * to keep is a promise that gets broken, usually at 2am, usually in the module
 * nobody reviewed carefully. Every invariant this product depends on is
 * therefore enforced HERE, once, in code that runs no matter what a module does:
 *
 *   - A module that throws becomes an inconclusive result with the error stated.
 *     It never becomes a pass, and it never crashes the scan.
 *   - A module that hangs is aborted at its declared runtime and reported as
 *     inconclusive. A check that cannot finish is not a check that passed.
 *   - Every result is stamped with the access tier it ran at and the full set of
 *     blind spots, module and tier combined. Authors cannot forget to disclose.
 *   - Credits are charged only for modules that actually executed.
 *   - Modules that cannot run are recorded with a reason, never silently skipped.
 *
 * The last one matters most. A scan that quietly drops half its profile and
 * reports green is the exact failure this product was built to prevent, and the
 * only reliable defence is to make skipping structurally impossible.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import {
  effectiveBlindSpots,
  estimateProfile,
  inconclusive,
  type CheckContext,
  type CheckModule,
  type CheckOutcome,
  type CheckResult,
  type ProfileEstimate,
  type ScanProfile,
} from './contract';
import { permitsIntrusive, tierMeets, type Target } from './target';
import type { Session } from '../engine/session';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ModuleRegistry {
  private readonly modules = new Map<string, CheckModule>();

  register(module: CheckModule): void {
    const existing = this.modules.get(module.id);
    if (existing !== undefined) {
      // Two modules answering one ID is the duplicate-import defect, which cost
      // us real debugging time. Fail at registration, not at runtime.
      throw new Error(
        `Duplicate module ID "${module.id}": version ${existing.version} is already ` +
          `registered and version ${module.version} tried to replace it.`,
      );
    }
    if (module.whatItCannotCatch.length === 0) {
      throw new Error(
        `Module "${module.id}" declares no blind spots. Every module must state ` +
          'what it cannot catch. If the author cannot name one, the check is not understood.',
      );
    }
    if (module.estimatedCredits < 1) {
      throw new Error(
        `Module "${module.id}" is priced below the 1 credit floor. Nothing runs free.`,
      );
    }
    this.modules.set(module.id, module);
  }

  get(id: string): CheckModule | undefined {
    return this.modules.get(id);
  }

  asMap(): ReadonlyMap<string, CheckModule> {
    return this.modules;
  }

  /**
   * Every module that could run against this target, for building the picker.
   * Selectability starts here: the customer only sees what is actually possible
   * at their access tier, rather than a menu of things that will silently fail.
   */
  availableFor(target: Target): readonly CheckModule[] {
    return [...this.modules.values()].filter(
      (module) =>
        module.supportedTargetKinds.includes(target.kind) &&
        tierMeets(target.accessTier, module.minimumAccessTier) &&
        (!module.intrusive || permitsIntrusive(target.authorization)),
    );
  }

  estimate(profile: ScanProfile, target: Target): ProfileEstimate {
    return estimateProfile(profile, target, this.modules);
  }
}

// ---------------------------------------------------------------------------
// Run output
// ---------------------------------------------------------------------------

export interface SkippedModule {
  readonly moduleId: string;
  readonly reason: string;
}

export interface ScanRun {
  readonly profileId: string;
  readonly targetId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly results: readonly CheckResult[];

  /**
   * Modules in the profile that did not execute, each with a reason. A
   * first-class part of the output, not an omission.
   */
  readonly skipped: readonly SkippedModule[];

  /** Charged only for modules that executed. */
  readonly creditsCharged: number;

  /** How the session behaved across the run. Folded into the report. */
  readonly sessionBlindSpots: readonly string[];
}

export type LogSink = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  moduleId: string,
) => void;

// ---------------------------------------------------------------------------
// Secret masking
//
// Modules log freely. Anything a module logs may end up in a customer-visible
// report or a retained log, so credentials are stripped on the way out rather
// than trusted not to be written in the first place.
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bsk-(ant-)?[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(authorization|api[-_]?key|password|secret|token)\b\s*[:=]\s*\S+/gi,
];

export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, '[REDACTED]');
  }
  return masked;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Executes a profile against a target.
 *
 * Modules run sequentially. Parallelism would be faster and would also mean
 * several modules hammering one origin at once, which breaks the per-target rate
 * limit and risks degrading the thing we are measuring. Speed is not worth
 * changing the behaviour of the target under test.
 */
export async function runProfile(
  profile: ScanProfile,
  target: Target,
  registry: ModuleRegistry,
  session: Session,
  log: LogSink,
): Promise<ScanRun> {
  const startedAt = new Date().toISOString();
  const estimate = registry.estimate(profile, target);

  const skipped: SkippedModule[] = estimate.unrunnable.map((item) => ({
    moduleId: item.moduleId,
    reason: item.reason,
  }));
  const skippedIds = new Set(skipped.map((item) => item.moduleId));

  const results: CheckResult[] = [];
  let creditsCharged = 0;

  for (const moduleId of profile.moduleIds) {
    if (skippedIds.has(moduleId)) continue;

    const module = registry.get(moduleId);
    if (module === undefined) {
      skipped.push({ moduleId, reason: 'Module disappeared from the registry mid-run.' });
      continue;
    }

    const controller = new AbortController();
    // Generous: modules are aborted only when they exceed their own declared
    // runtime by 50%, so an honest estimate is never punished by normal variance.
    const budgetMs = Math.ceil(module.estimatedRuntimeMs * 1.5);
    const timer = setTimeout(() => controller.abort(), budgetMs);

    const context: CheckContext = {
      target,
      session,
      inputs: profile.inputs,
      signal: controller.signal,
      log: (level, message) => log(level, maskSecrets(message), module.id),
    };

    const moduleStartedAt = new Date().toISOString();
    const started = Date.now();
    let outcome: CheckOutcome;

    try {
      outcome = await module.run(context);
    } catch (error: unknown) {
      // The contract says modules must not throw. This is what happens when one
      // does anyway: an honest inconclusive, never a pass, never a dead scan.
      const message = error instanceof Error ? error.message : 'Unknown failure.';
      const aborted = controller.signal.aborted;
      outcome = inconclusive(
        aborted
          ? `Exceeded its ${Math.round(budgetMs / 1000)}s runtime budget and was stopped. ` +
              'Nothing is concluded from a check that did not finish.'
          : `Failed with an internal error: ${maskSecrets(message)}`,
        {
          subjectsExamined: 0,
          requestsIssued: 0,
          notes: aborted ? 'Aborted on timeout.' : 'Threw during execution.',
        },
      );
      log('error', maskSecrets(`Module ${module.id} failed: ${message}`), module.id);
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - started;

    // Charged for executing, whatever the verdict. An inconclusive result still
    // consumed real work — but see the report layer: the customer is told
    // plainly what did not conclude, so the charge is never a surprise.
    creditsCharged += module.estimatedCredits;

    results.push({
      moduleId: module.id,
      moduleVersion: module.version,
      targetId: target.id,
      accessTier: target.accessTier,
      outcome,
      blindSpots: effectiveBlindSpots(module, target),
      startedAt: moduleStartedAt,
      durationMs,
      creditsCharged: module.estimatedCredits,
    });
  }

  return {
    profileId: profile.id,
    targetId: target.id,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    skipped,
    creditsCharged,
    sessionBlindSpots: session.blindSpots(),
  };
}

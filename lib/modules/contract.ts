/**
 * lib/modules/contract.ts
 *
 * The check module contract for Javari Verify.
 *
 * Every check in the product is an independent module implementing this
 * interface. Nothing runs implicitly; users compose a scan profile from module
 * IDs. This file is the spine — if it is right, the product is hard to build
 * wrong, and if it is loose, we rebuild the same failures we spent a month
 * digging out of the platform.
 *
 * THREE DESIGN DECISIONS, EACH FROM A DEFECT WE ACTUALLY SHIPPED:
 *
 * 1. THREE OUTCOMES, NOT TWO. A check reports pass, fail, or INCONCLUSIVE.
 *    Most testing tools have pass/fail, so a check that could not run reports
 *    green and everyone believes they are protected. Our CI gates were dark for
 *    weeks because the Actions budget was exhausted and nobody knew. An
 *    inconclusive result is a first-class outcome, it requires a stated reason,
 *    and it must never render as green.
 *
 * 2. FINDINGS REQUIRE EVIDENCE. A Finding cannot be constructed without at
 *    least one Evidence value — an HTTP response, a file and line, a query
 *    result, a screenshot, a timing sample. `complete-avatar-testing.ts`
 *    reported polygon counts from a hardcoded constant; under this contract it
 *    could not have compiled, because there was nothing to cite.
 *
 * 3. EVERY MODULE DECLARES WHAT IT CANNOT CATCH. Required, non-empty, in plain
 *    English, surfaced in the UI next to the result. `complete-web-testing.ts`
 *    shipped a header reading "NO FAKE DATA - ALL REAL TESTING" over Core Web
 *    Vitals estimated from static HTML with no browser involved. A module that
 *    must state its blind spots cannot make that claim.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-22
 */

import type { AccessTier, Target, TargetKind } from './target';
import { describeTargetLimits, permitsIntrusive, tierMeets } from './target';
import type { Session } from '../engine/session';

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type CheckCategory =
  | 'WEB'
  | 'API'
  | 'AI'
  | 'TOOL'
  | 'MOBILE'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'ACCESSIBILITY'
  | 'DATA'
  | 'COMMERCE'
  | 'CONTENT';

export type Severity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';

// ---------------------------------------------------------------------------
// Evidence
//
// A finding without evidence is an opinion. Every variant carries something a
// human can independently re-check without trusting our report.
// ---------------------------------------------------------------------------

export type Evidence =
  | {
      kind: 'http_response';
      url: string;
      method: string;
      status: number;
      /** Truncated deliberately. Full bodies belong in artifact storage. */
      bodyExcerpt: string;
      headers: Readonly<Record<string, string>>;
    }
  | {
      kind: 'source_location';
      repo: string;
      path: string;
      line: number;
      excerpt: string;
    }
  | {
      kind: 'query_result';
      /** The exact statement run, so the reader can run it themselves. */
      statement: string;
      rowCount: number;
      sample: readonly Readonly<Record<string, unknown>>[];
    }
  | {
      kind: 'artifact';
      /** Storage path of a screenshot, HAR, trace, or generated file. */
      path: string;
      contentType: string;
      byteLength: number;
    }
  | {
      kind: 'measurement';
      metric: string;
      value: number;
      unit: string;
      /**
       * True when the value was derived rather than observed. An estimate is
       * legitimate; presenting one as a measurement is not.
       */
      estimated: boolean;
      method: string;
    };

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface Finding {
  readonly ruleId: string;
  readonly category: CheckCategory;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  /** Route, endpoint, file, or model identifier the finding attaches to. */
  readonly subject: string;
  /**
   * Non-empty by construction. The tuple type requires a first element, so the
   * compiler rejects a finding with nothing to cite.
   */
  readonly evidence: readonly [Evidence, ...Evidence[]];
  readonly recommendedFix: string;
  /** Stable across runs so recurrence and regression can be tracked. */
  readonly fingerprint: string;
  readonly autoFixable: boolean;
}

// ---------------------------------------------------------------------------
// Outcomes
//
// The union is discriminated so that the compiler enforces the invariants:
// an inconclusive result cannot omit its reason, and a passing result cannot
// carry findings.
// ---------------------------------------------------------------------------

export type CheckOutcome =
  | {
      readonly status: 'pass';
      readonly findings: readonly [];
      readonly checked: CheckedSummary;
    }
  | {
      readonly status: 'fail';
      readonly findings: readonly [Finding, ...Finding[]];
      readonly checked: CheckedSummary;
    }
  | {
      readonly status: 'inconclusive';
      /**
       * Why the check could not reach a verdict, in plain English, shown to the
       * user. "Target returned 503 on all 3 attempts", not "error".
       */
      readonly reason: string;
      /** Findings gathered before the check gave up, if any. */
      readonly findings: readonly Finding[];
      readonly checked: CheckedSummary;
    };

/**
 * What the check actually touched. Recorded so a pass can be audited: a module
 * reporting pass over zero examined subjects is a module that did nothing, and
 * this makes that visible instead of green.
 */
export interface CheckedSummary {
  readonly subjectsExamined: number;
  readonly requestsIssued: number;
  readonly notes: string;
}

export interface CheckResult {
  readonly moduleId: string;
  readonly moduleVersion: string;
  readonly targetId: string;

  /** The depth this result was produced at. Never omitted from a report. */
  readonly accessTier: AccessTier;

  readonly outcome: CheckOutcome;

  /**
   * The module's own declared blind spots plus everything the access tier and
   * missing authorization put out of reach. Rendered beside the result.
   */
  readonly blindSpots: readonly string[];

  readonly startedAt: string;
  readonly durationMs: number;
  readonly creditsCharged: number;
}

/**
 * Combines a module's declared limits with the limits imposed by the target it
 * ran against. Callers must use this rather than reading whatItCannotCatch
 * directly — a scan at public tier has blind spots the module author never
 * wrote down, and hiding them is how a shallow green becomes a lie.
 */
export function effectiveBlindSpots(
  module: CheckModule,
  target: Target,
): readonly string[] {
  return [...module.whatItCannotCatch, ...describeTargetLimits(target)];
}

// ---------------------------------------------------------------------------
// Module inputs and declaration
// ---------------------------------------------------------------------------

export type InputKind = 'url' | 'origin' | 'repo' | 'credentials' | 'file' | 'model_endpoint';

export interface DeclaredInput {
  readonly name: string;
  readonly kind: InputKind;
  readonly required: boolean;
  readonly description: string;
}

export interface CheckContext {
  /** The thing being tested, including its access tier and authorization. */
  readonly target: Target;

  /**
   * The authenticated session, or an anonymous one. Modules that need to be
   * signed in call `session.checkpoint(url)` before each request and report
   * inconclusive if it returns false — the session died and nothing after it
   * can be trusted. `session.authHeaders()` supplies the credentials.
   */
  readonly session: Session;

  /** Resolved inputs, keyed by DeclaredInput.name. */
  readonly inputs: Readonly<Record<string, string>>;
  /** Aborts the run when the module exceeds its declared runtime. */
  readonly signal: AbortSignal;
  /**
   * Structured logging with masking. Modules must not call console directly;
   * production logs are read by machines and must never carry a raw secret.
   */
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

export interface CheckModule {
  readonly id: string;
  readonly version: string;
  readonly category: CheckCategory;
  readonly title: string;

  /** Plain English, shown in the profile picker. What this module checks. */
  readonly whatItChecks: string;

  /**
   * Required and non-empty. The blind spots, in plain English, surfaced next to
   * every result this module produces. A module whose author cannot name a
   * limitation has not understood the check.
   */
  readonly whatItCannotCatch: readonly [string, ...string[]];

  /** Target kinds this module knows how to examine. */
  readonly supportedTargetKinds: readonly [TargetKind, ...TargetKind[]];

  /**
   * Minimum access tier required. The registry refuses to run the module below
   * this rather than running a degraded version and reporting a pass.
   */
  readonly minimumAccessTier: AccessTier;

  /**
   * True when the module probes for exploitable behaviour rather than observing
   * it. Intrusive modules require recorded authorization for the target.
   */
  readonly intrusive: boolean;

  readonly inputs: readonly DeclaredInput[];

  /** Whole credits. Floor is 1 credit = $0.01; nothing is free to run. */
  readonly estimatedCredits: number;
  readonly estimatedRuntimeMs: number;

  readonly requiresAuthenticatedSession: boolean;
  readonly requiresBrowser: boolean;

  /**
   * Runs the check. Must not throw: an internal failure is an inconclusive
   * outcome with a stated reason, never a swallowed error and never a pass.
   */
  run(context: CheckContext): Promise<CheckOutcome>;
}

// ---------------------------------------------------------------------------
// Scan profiles — Step 3, selectability. Nothing runs implicitly.
// ---------------------------------------------------------------------------

export interface ScanProfile {
  readonly id: string;
  readonly name: string;
  readonly moduleIds: readonly [string, ...string[]];
  readonly inputs: Readonly<Record<string, string>>;
}

export interface ProfileEstimate {
  readonly totalCredits: number;
  readonly totalRuntimeMs: number;
  /** Modules that cannot run against this target, and why. */
  readonly unrunnable: readonly { readonly moduleId: string; readonly reason: string }[];
}

/**
 * Prices and validates a profile against a specific target before a single
 * request is issued.
 *
 * A module that cannot run is reported here rather than discovered mid-scan,
 * because a scan that silently skips half its modules and reports green is the
 * failure this product exists to prevent. The customer sees the number and the
 * exclusions, then decides.
 */
export function estimateProfile(
  profile: ScanProfile,
  target: Target,
  registry: ReadonlyMap<string, CheckModule>,
): ProfileEstimate {
  let totalCredits = 0;
  let totalRuntimeMs = 0;
  const unrunnable: { moduleId: string; reason: string }[] = [];

  for (const moduleId of profile.moduleIds) {
    const module = registry.get(moduleId);

    if (module === undefined) {
      unrunnable.push({ moduleId, reason: 'No module is registered under this ID.' });
      continue;
    }

    if (!module.supportedTargetKinds.includes(target.kind)) {
      unrunnable.push({
        moduleId,
        reason: `This module does not examine targets of kind "${target.kind}".`,
      });
      continue;
    }

    if (!tierMeets(target.accessTier, module.minimumAccessTier)) {
      unrunnable.push({
        moduleId,
        reason:
          `Requires ${module.minimumAccessTier} access; this target grants ` +
          `${target.accessTier}. Supply credentials to enable it.`,
      });
      continue;
    }

    if (module.intrusive && !permitsIntrusive(target.authorization)) {
      unrunnable.push({
        moduleId,
        reason:
          'This module probes for exploitable behaviour and requires recorded ' +
          'authorization for the target. None is on file.',
      });
      continue;
    }

    const missing = module.inputs
      .filter((input) => input.required)
      .filter((input) => {
        const supplied = profile.inputs[input.name];
        return typeof supplied !== 'string' || supplied.length === 0;
      })
      .map((input) => input.name);

    if (missing.length > 0) {
      unrunnable.push({
        moduleId,
        reason: `Missing required input${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
      });
      continue;
    }

    totalCredits += module.estimatedCredits;
    totalRuntimeMs += module.estimatedRuntimeMs;
  }

  return { totalCredits, totalRuntimeMs, unrunnable };
}

// ---------------------------------------------------------------------------
// Outcome constructors
//
// Runtime guards behind the compile-time ones. A module can defeat the type
// system with a cast; these throw instead of letting a hollow pass through.
// ---------------------------------------------------------------------------

export function pass(checked: CheckedSummary): CheckOutcome {
  if (checked.subjectsExamined <= 0) {
    throw new Error(
      'A check cannot pass having examined zero subjects. Report inconclusive with a reason.',
    );
  }
  return { status: 'pass', findings: [], checked };
}

export function fail(
  findings: readonly [Finding, ...Finding[]],
  checked: CheckedSummary,
): CheckOutcome {
  return { status: 'fail', findings, checked };
}

export function inconclusive(
  reason: string,
  checked: CheckedSummary,
  findings: readonly Finding[] = [],
): CheckOutcome {
  if (reason.trim().length === 0) {
    throw new Error('An inconclusive outcome requires a stated reason.');
  }
  return { status: 'inconclusive', reason, findings, checked };
}

/**
 * True when a result may be shown to a user as green.
 *
 * Deliberately narrow, and the only place in the codebase permitted to decide
 * this. Inconclusive is not green. It never becomes green.
 */
export function isGreen(result: CheckResult): boolean {
  return result.outcome.status === 'pass';
}

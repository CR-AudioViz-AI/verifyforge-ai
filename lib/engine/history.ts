/**
 * lib/engine/history.ts
 *
 * Run history and the finding lifecycle.
 *
 * WHY THIS IS THE MOST IMPORTANT FILE IN THE ENGINE.
 *
 * A scan with no memory can only ever say "here is what is wrong today." That is
 * a tool. A scan that remembers can say the four things people actually act on:
 * this is NEW since your last release, this is FIXED, this has been broken for
 * eleven weeks, and this came BACK after you fixed it.
 *
 * It also closes the loop that makes autonomous remediation safe. A fix is never
 * marked verified because the fix reported success — it is marked verified only
 * when a subsequent independent run cannot find the defect any more. The tool
 * does not get to mark its own homework, and neither does Javari.
 *
 * `verifiedAt` is written by exactly one code path in this file, and that path
 * requires a later run in which the fingerprint is absent.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { Finding, Severity } from '../modules/contract';
import type { AccessTier } from '../modules/target';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type FindingState =
  /** First appearance. */
  | 'new'
  /** Present in the previous run and this one. */
  | 'persisting'
  /** Present before, absent now, confirmed by a run that did examine it. */
  | 'fixed'
  /** Was fixed, and has returned. The most expensive kind. */
  | 'regressed';

export interface TrackedFinding {
  readonly fingerprint: string;
  readonly finding: Finding;
  readonly state: FindingState;
  readonly firstSeenRunId: string;
  readonly firstSeenAt: string;
  readonly lastSeenRunId: string;
  readonly lastSeenAt: string;
  readonly occurrences: number;
  /**
   * Set only by a later run in which this fingerprint was absent while its
   * module concluded. Never set by a fix claiming success.
   */
  readonly verifiedAt: string | null;
  readonly ageDays: number;
}

export interface RunSnapshot {
  readonly runId: string;
  readonly targetId: string;
  readonly completedAt: string;
  readonly accessTier: AccessTier;
  readonly findings: readonly Finding[];
  /**
   * Modules that reached a verdict. Absence of a fingerprint only means "fixed"
   * if the module that would have found it actually concluded — otherwise it
   * means we did not look, and saying "fixed" would be a lie.
   */
  readonly concludedModuleIds: readonly string[];
}

export interface RunDiff {
  readonly previousRunId: string | null;
  readonly currentRunId: string;
  readonly tracked: readonly TrackedFinding[];
  readonly counts: Readonly<Record<FindingState, number>>;
  /**
   * Fingerprints that vanished without their module concluding. Explicitly NOT
   * counted as fixed.
   */
  readonly unverifiable: readonly string[];
  readonly headline: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface HistoryStore {
  latestSnapshot(targetId: string): Promise<RunSnapshot | null>;
  trackedFindings(targetId: string): Promise<readonly TrackedFinding[]>;
  persist(snapshot: RunSnapshot, tracked: readonly TrackedFinding[]): Promise<void>;
}

/**
 * In-memory store. Real deployments back this with the audit_* tables; this
 * exists so the engine is testable without a database and so the interface is
 * proven before anything is wired to production.
 */
export class InMemoryHistoryStore implements HistoryStore {
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly tracked = new Map<string, readonly TrackedFinding[]>();

  async latestSnapshot(targetId: string): Promise<RunSnapshot | null> {
    return this.snapshots.get(targetId) ?? null;
  }

  async trackedFindings(targetId: string): Promise<readonly TrackedFinding[]> {
    return this.tracked.get(targetId) ?? [];
  }

  async persist(snapshot: RunSnapshot, tracked: readonly TrackedFinding[]): Promise<void> {
    this.snapshots.set(snapshot.targetId, snapshot);
    this.tracked.set(snapshot.targetId, tracked);
  }
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

function daysBetween(earlier: string, later: string): number {
  const delta = new Date(later).getTime() - new Date(earlier).getTime();
  return Math.max(0, Math.floor(delta / 86_400_000));
}

function moduleOf(finding: Finding): string {
  return finding.ruleId;
}

/**
 * Compares a run against everything known about the target.
 *
 * The subtle rule, and the one every other tool gets wrong: a finding that has
 * disappeared is only "fixed" if the module that would have found it reached a
 * verdict in this run. If the module timed out, lost credentials, or could not
 * run, the finding is UNVERIFIABLE — carried forward, not closed. Closing it
 * would let an outage look like progress.
 */
export function diffRun(
  current: RunSnapshot,
  previous: RunSnapshot | null,
  known: readonly TrackedFinding[],
): RunDiff {
  const knownByFingerprint = new Map(known.map((item) => [item.fingerprint, item]));
  const currentByFingerprint = new Map(current.findings.map((f) => [f.fingerprint, f]));
  const concluded = new Set(current.concludedModuleIds);

  const tracked: TrackedFinding[] = [];
  const unverifiable: string[] = [];
  const counts: Record<FindingState, number> = {
    new: 0, persisting: 0, fixed: 0, regressed: 0,
  };

  // Present in this run.
  for (const [fingerprint, finding] of currentByFingerprint) {
    const priorRecord = knownByFingerprint.get(fingerprint);

    if (priorRecord === undefined) {
      counts.new += 1;
      tracked.push({
        fingerprint,
        finding,
        state: 'new',
        firstSeenRunId: current.runId,
        firstSeenAt: current.completedAt,
        lastSeenRunId: current.runId,
        lastSeenAt: current.completedAt,
        occurrences: 1,
        verifiedAt: null,
        ageDays: 0,
      });
      continue;
    }

    // It was verified fixed and has come back.
    const regressed = priorRecord.verifiedAt !== null || priorRecord.state === 'fixed';
    if (regressed) counts.regressed += 1;
    else counts.persisting += 1;

    tracked.push({
      fingerprint,
      finding,
      state: regressed ? 'regressed' : 'persisting',
      firstSeenRunId: priorRecord.firstSeenRunId,
      firstSeenAt: priorRecord.firstSeenAt,
      lastSeenRunId: current.runId,
      lastSeenAt: current.completedAt,
      occurrences: priorRecord.occurrences + 1,
      // A regression clears the verification. It is no longer fixed.
      verifiedAt: null,
      ageDays: daysBetween(priorRecord.firstSeenAt, current.completedAt),
    });
  }

  // Known but absent from this run.
  for (const record of known) {
    if (currentByFingerprint.has(record.fingerprint)) continue;
    if (record.state === 'fixed' && record.verifiedAt !== null) {
      // Already closed and still gone. Carry it without recounting.
      tracked.push(record);
      continue;
    }

    if (!concluded.has(moduleOf(record.finding))) {
      // We did not look. Absence proves nothing.
      unverifiable.push(record.fingerprint);
      tracked.push(record);
      continue;
    }

    counts.fixed += 1;
    tracked.push({
      ...record,
      state: 'fixed',
      // THE ONLY PLACE verifiedAt IS EVER WRITTEN. It requires a later run in
      // which the module concluded and the fingerprint was absent.
      verifiedAt: current.completedAt,
      ageDays: daysBetween(record.firstSeenAt, current.completedAt),
    });
  }

  const parts: string[] = [];
  if (counts.regressed > 0) {
    parts.push(`${counts.regressed} ${counts.regressed === 1 ? 'regression' : 'regressions'} — previously fixed, now back`);
  }
  if (counts.new > 0) parts.push(`${counts.new} new`);
  if (counts.fixed > 0) parts.push(`${counts.fixed} verified fixed`);
  if (counts.persisting > 0) parts.push(`${counts.persisting} still open`);
  if (unverifiable.length > 0) {
    parts.push(
      `${unverifiable.length} could not be re-checked because the relevant check did not conclude — not counted as fixed`,
    );
  }

  const headline =
    previous === null
      ? `First recorded scan of this target. ${current.findings.length} findings establish the baseline.`
      : parts.length > 0
        ? `Since the previous run: ${parts.join(', ')}.`
        : 'No change since the previous run.';

  return {
    previousRunId: previous?.runId ?? null,
    currentRunId: current.runId,
    tracked,
    counts,
    unverifiable,
    headline,
  };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

export interface AgeingSummary {
  readonly severity: Severity;
  readonly oldestDays: number;
  readonly count: number;
}

/**
 * How long open findings have been open, by severity. A blocker open for
 * eleven weeks is a different conversation from one found this morning, and the
 * report should not flatten them into the same number.
 */
export function ageing(tracked: readonly TrackedFinding[]): readonly AgeingSummary[] {
  const open = tracked.filter((item) => item.state !== 'fixed');
  const order: Severity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW'];

  return order
    .map((severity) => {
      const matching = open.filter((item) => item.finding.severity === severity);
      return {
        severity,
        count: matching.length,
        oldestDays: matching.reduce((max, item) => Math.max(max, item.ageDays), 0),
      };
    })
    .filter((summary) => summary.count > 0);
}

export function renderDiffMarkdown(diff: RunDiff): string {
  const lines: string[] = ['## What changed', '', diff.headline, ''];

  const regressions = diff.tracked.filter((item) => item.state === 'regressed');
  if (regressions.length > 0) {
    lines.push('### Regressions — these were fixed and have returned');
    lines.push('');
    for (const item of regressions) {
      lines.push(
        `- **${item.finding.severity}** \`${item.finding.subject}\` — ${item.finding.title}. ` +
          `First seen ${item.ageDays} days ago, seen ${item.occurrences} times.`,
      );
    }
    lines.push('');
  }

  const fresh = diff.tracked.filter((item) => item.state === 'new');
  if (fresh.length > 0) {
    lines.push('### New since the previous run');
    lines.push('');
    for (const item of fresh) {
      lines.push(`- **${item.finding.severity}** \`${item.finding.subject}\` — ${item.finding.title}`);
    }
    lines.push('');
  }

  const fixed = diff.tracked.filter(
    (item) => item.state === 'fixed' && item.verifiedAt === diff.currentRunId,
  );
  const verifiedThisRun = diff.tracked.filter((item) => item.state === 'fixed');
  if (verifiedThisRun.length > 0 && fixed.length === 0) {
    lines.push('### Verified fixed');
    lines.push('');
    lines.push(
      'Confirmed absent by an independent run, not by anything reporting that it had ' +
        'been fixed.',
    );
    lines.push('');
    for (const item of verifiedThisRun.slice(0, 25)) {
      lines.push(`- \`${item.finding.subject}\` — ${item.finding.title} (open ${item.ageDays} days)`);
    }
    lines.push('');
  }

  if (diff.unverifiable.length > 0) {
    lines.push('### Could not be re-checked');
    lines.push('');
    lines.push(
      'These findings are absent from this run, but the check that would have found ' +
        'them did not conclude. **They are not marked fixed.** Absence of evidence is ' +
        'not evidence of a fix.',
    );
    lines.push('');
    for (const fingerprint of diff.unverifiable) lines.push(`- \`${fingerprint}\``);
    lines.push('');
  }

  const ages = ageing(diff.tracked);
  if (ages.length > 0) {
    lines.push('### How long open findings have been open');
    lines.push('');
    for (const summary of ages) {
      lines.push(
        `- ${summary.severity}: ${summary.count} open, oldest ${summary.oldestDays} ${
          summary.oldestDays === 1 ? 'day' : 'days'
        }`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

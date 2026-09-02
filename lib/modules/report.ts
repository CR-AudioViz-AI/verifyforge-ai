/**
 * lib/modules/report.ts
 *
 * The report.
 *
 * THE REPORT IS THE PRODUCT. Everything upstream — the contract, the tiers, the
 * corroboration — only matters if it survives into what the customer reads.
 * A tool can corroborate five ways and still lie by rendering a summary that
 * says "PASSED" over a scan where half the modules never ran.
 *
 * So this layer has one job: make the honest thing the only thing that can be
 * rendered.
 *
 *   - The headline verdict cannot be CLEAR unless every module concluded.
 *   - What did not run is a top-level section, not a footnote.
 *   - Blind spots travel with every result and are aggregated for the whole scan.
 *   - The access tier is stated in the headline, so depth is never ambiguous.
 *   - Unconfirmed signals appear, labelled as unconfirmed, and are never counted
 *     as findings.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { CheckResult, Evidence, Finding, Severity } from './contract';
import type { ScanRun } from './registry';
import type { AccessTier, Target } from './target';

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type ScanVerdict =
  /** Everything ran, everything passed. The only verdict that renders green. */
  | 'CLEAR'
  /** Findings were confirmed. */
  | 'DEFECTS_FOUND'
  /** Nothing failed, but not everything concluded. Explicitly not CLEAR. */
  | 'INCOMPLETE';

export interface ScanReport {
  readonly targetLabel: string;
  readonly targetAddress: string;
  readonly accessTier: AccessTier;
  readonly verdict: ScanVerdict;
  readonly headline: string;

  readonly findings: readonly Finding[];
  readonly findingsBySeverity: Readonly<Record<Severity, number>>;

  /** Signals short of the corroboration bar. Never counted as findings. */
  readonly unconfirmedSignals: readonly string[];

  readonly modulesRun: number;
  readonly modulesConcluded: number;
  readonly didNotRun: readonly { readonly moduleId: string; readonly reason: string }[];
  readonly didNotConclude: readonly { readonly moduleId: string; readonly reason: string }[];

  /** Every limitation across the whole scan, deduplicated. */
  readonly blindSpots: readonly string[];

  readonly subjectsExamined: number;
  readonly requestsIssued: number;
  readonly durationMs: number;
  readonly creditsCharged: number;
  readonly generatedAt: string;
}

const SEVERITY_ORDER: readonly Severity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW'];

function severityRank(severity: Severity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/**
 * The headline.
 *
 * Deliberately refuses to be reassuring when reassurance would be false. If a
 * single module could not conclude, this says so in the first sentence the
 * customer reads — because burying it is how a dashboard stays green while the
 * checks behind it are dark.
 */
function buildHeadline(
  verdict: ScanVerdict,
  target: Target,
  findings: readonly Finding[],
  notConcluded: number,
  notRun: number,
): string {
  const depth = `Scanned at ${target.accessTier} access.`;

  if (verdict === 'DEFECTS_FOUND') {
    const blockers = findings.filter((f) => f.severity === 'BLOCKER').length;
    const confirmed =
      `${findings.length} confirmed ${findings.length === 1 ? 'finding' : 'findings'}` +
      (blockers > 0 ? `, ${blockers} of them blocking` : '');
    return `${confirmed}. Every one corroborated through independent evidence paths and re-runnable by you. ${depth}`;
  }

  if (verdict === 'INCOMPLETE') {
    const parts: string[] = [];
    if (notConcluded > 0) {
      parts.push(`${notConcluded} ${notConcluded === 1 ? 'check' : 'checks'} could not conclude`);
    }
    if (notRun > 0) {
      parts.push(`${notRun} could not run at all`);
    }
    return (
      `No defects were confirmed, but ${parts.join(' and ')}. ` +
      `This is NOT a clean result — it is an incomplete one, and the difference matters. ${depth}`
    );
  }

  return `No defects found. Every selected check ran and concluded. ${depth}`;
}

export function buildReport(run: ScanRun, target: Target): ScanReport {
  const findings: Finding[] = [];
  const unconfirmedSignals: string[] = [];
  const didNotConclude: { moduleId: string; reason: string }[] = [];
  const blindSpots = new Set<string>();

  let subjectsExamined = 0;
  let requestsIssued = 0;
  let durationMs = 0;

  for (const result of run.results) {
    durationMs += result.durationMs;
    subjectsExamined += result.outcome.checked.subjectsExamined;
    requestsIssued += result.outcome.checked.requestsIssued;

    for (const limitation of result.blindSpots) blindSpots.add(limitation);

    if (result.outcome.status === 'inconclusive') {
      didNotConclude.push({ moduleId: result.moduleId, reason: result.outcome.reason });
    }

    findings.push(...result.outcome.findings);

    // Modules record near-misses in their notes. Surfaced here, labelled, and
    // never promoted into the findings count.
    const notes = result.outcome.checked.notes;
    if (notes.includes('Unconfirmed signals')) {
      unconfirmedSignals.push(`${result.moduleId}: ${notes}`);
    }
  }

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const findingsBySeverity: Record<Severity, number> = {
    BLOCKER: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const finding of findings) findingsBySeverity[finding.severity] += 1;

  const modulesConcluded = run.results.length - didNotConclude.length;

  // The rule that keeps the whole thing honest: CLEAR requires that everything
  // ran AND everything concluded. Anything less is INCOMPLETE, never green.
  const verdict: ScanVerdict =
    findings.length > 0
      ? 'DEFECTS_FOUND'
      : didNotConclude.length > 0 || run.skipped.length > 0
        ? 'INCOMPLETE'
        : 'CLEAR';

  return {
    targetLabel: target.label,
    targetAddress: target.address,
    accessTier: target.accessTier,
    verdict,
    headline: buildHeadline(verdict, target, findings, didNotConclude.length, run.skipped.length),
    findings,
    findingsBySeverity,
    unconfirmedSignals,
    modulesRun: run.results.length,
    modulesConcluded,
    didNotRun: run.skipped,
    didNotConclude,
    blindSpots: [...blindSpots],
    subjectsExamined,
    requestsIssued,
    durationMs,
    creditsCharged: run.creditsCharged,
    generatedAt: run.completedAt,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderEvidence(evidence: Evidence, index: number): string {
  const label = `**Path ${index + 1}** — `;
  switch (evidence.kind) {
    case 'http_response':
      return (
        `${label}\`${evidence.method} ${evidence.url}\` returned **${evidence.status}**\n\n` +
        '```\n' + evidence.bodyExcerpt.slice(0, 300) + '\n```'
      );
    case 'source_location':
      return (
        `${label}\`${evidence.repo}/${evidence.path}:${evidence.line}\`\n\n` +
        '```\n' + evidence.excerpt + '\n```'
      );
    case 'query_result':
      return (
        `${label}query returned **${evidence.rowCount}** ${evidence.rowCount === 1 ? 'row' : 'rows'}. Run it yourself:\n\n` +
        '```sql\n' + evidence.statement + '\n```'
      );
    case 'artifact':
      return `${label}artifact \`${evidence.path}\` (${evidence.contentType}, ${evidence.byteLength} bytes)`;
    case 'measurement':
      return (
        `${label}${evidence.metric} = **${evidence.value} ${evidence.unit}**` +
        (evidence.estimated ? ' *(estimated, not measured)*' : '') +
        `\n\n> ${evidence.method}`
      );
  }
}

export function renderMarkdown(report: ScanReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.targetLabel}`);
  lines.push('');
  lines.push(`**${report.verdict.replace(/_/g, ' ')}** — ${report.headline}`);
  lines.push('');
  lines.push(`\`${report.targetAddress}\` · ${report.generatedAt}`);
  lines.push('');

  // Rendered on EVERY verdict including CLEAR. A clean scan with no stated limits
  // reads as a guarantee, and that is the single most dangerous way to misread
  // this report.
  if (
    report.verdict !== 'CLEAR' ||
    report.didNotRun.length > 0 ||
    report.blindSpots.length > 0
  ) {
    lines.push('## What this scan did not cover');
    lines.push('');
    if (report.didNotRun.length > 0) {
      lines.push('**Checks that could not run:**');
      lines.push('');
      for (const item of report.didNotRun) {
        lines.push(`- \`${item.moduleId}\` — ${item.reason}`);
      }
      lines.push('');
    }
    if (report.didNotConclude.length > 0) {
      lines.push('**Checks that ran but reached no verdict:**');
      lines.push('');
      for (const item of report.didNotConclude) {
        lines.push(`- \`${item.moduleId}\` — ${item.reason}`);
      }
      lines.push('');
    }

    // 2026-09-02: THE BLIND SPOTS WERE COLLECTED AND NEVER PRINTED.
    //
    // This section rendered only didNotRun and didNotConclude, so on a scan where
    // every check ran successfully the heading appeared with nothing under it —
    // empty at exactly the moment it matters most, because that is the scan a
    // reader is most likely to mistake for proof of safety.
    //
    // Twenty-one blind spots were recorded on the first clean end-to-end run and
    // not one reached the report. Every module is required by the contract to
    // declare what it cannot catch; printing them is the other half of that
    // promise.
    if (report.blindSpots.length > 0) {
      lines.push('**What these checks cannot catch:**');
      lines.push('');
      lines.push(
        'Each check declares its own limits. A clean result above means these specific ' +
          'defects were not found under these specific conditions — it is not evidence ' +
          'that nothing is wrong.',
      );
      lines.push('');
      for (const spot of report.blindSpots) {
        lines.push(`- ${spot}`);
      }
      lines.push('');
    }
  }

  if (report.findings.length > 0) {
    lines.push('## Confirmed findings');
    lines.push('');
    lines.push(
      `${report.findingsBySeverity.BLOCKER} blocking · ` +
        `${report.findingsBySeverity.HIGH} high · ` +
        `${report.findingsBySeverity.MEDIUM} medium · ` +
        `${report.findingsBySeverity.LOW} low`,
    );
    lines.push('');

    for (const finding of report.findings) {
      lines.push(`### ${finding.severity} — ${finding.title}`);
      lines.push('');
      lines.push(`**Where:** \`${finding.subject}\``);
      lines.push('');
      lines.push(finding.description);
      lines.push('');
      lines.push(`**How we confirmed it (${finding.evidence.length} independent paths):**`);
      lines.push('');
      finding.evidence.forEach((item, index) => {
        lines.push(renderEvidence(item, index));
        lines.push('');
      });
      lines.push(`**Recommended fix:** ${finding.recommendedFix}`);
      lines.push('');
      lines.push(`*Reference: \`${finding.fingerprint}\`*`);
      lines.push('');
    }
  }

  if (report.unconfirmedSignals.length > 0) {
    lines.push('## Unconfirmed signals');
    lines.push('');
    lines.push(
      'These did not meet our corroboration bar, so they are **not** findings. ' +
        'We are showing them because you may know something we cannot see.',
    );
    lines.push('');
    for (const signal of report.unconfirmedSignals) lines.push(`- ${signal}`);
    lines.push('');
  }

  lines.push('## What this scan cannot tell you');
  lines.push('');
  lines.push(`Run at **${report.accessTier}** access. Every limitation below applies:`);
  lines.push('');
  for (const limitation of report.blindSpots) lines.push(`- ${limitation}`);
  lines.push('');

  lines.push('## Scan record');
  lines.push('');
  lines.push(`- Checks run: ${report.modulesRun} (${report.modulesConcluded} reached a verdict)`);
  lines.push(`- Subjects examined: ${report.subjectsExamined}`);
  lines.push(`- Requests issued: ${report.requestsIssued}`);
  lines.push(`- Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push(`- Credits charged: ${report.creditsCharged}`);
  lines.push('');
  lines.push('CR AudioViz AI, LLC · EIN 39-3646201');

  return lines.join('\n');
}

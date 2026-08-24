/**
 * lib/export/sarif.ts
 *
 * SARIF 2.1.0 output.
 *
 * WHY THIS IS STRATEGY, NOT PLUMBING.
 *
 * Standards are set by being the thing everything else interoperates with. SARIF
 * is what GitHub code scanning, Azure DevOps, GitLab and every serious security
 * dashboard ingest. If our findings land in those surfaces with no converter, we
 * become a default rather than a purchasing decision — and the head-to-head
 * comparison works in both directions, because the same format lets us read a
 * competitor's findings and reconcile them against ours.
 *
 * Two things we do that most SARIF producers do not.
 *
 * Every rule carries its declared blind spots in the help text, so the
 * limitation travels into GitHub's UI rather than living only in our report.
 *
 * Inconclusive results are emitted as `notification` objects with level
 * `warning`, never as passing results. A check that could not run must not look
 * like a check that passed, in our report or in anyone else's dashboard.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { CheckModule, CheckResult, Evidence, Finding, Severity } from '../modules/contract';
import type { ScanReport } from '../modules/report';

const SARIF_VERSION = '2.1.0';
const SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

type SarifLevel = 'error' | 'warning' | 'note';

function levelFor(severity: Severity): SarifLevel {
  if (severity === 'BLOCKER' || severity === 'HIGH') return 'error';
  if (severity === 'MEDIUM') return 'warning';
  return 'note';
}

/** GitHub renders this as a 0.0–10.0 bar. Mapped from our severities. */
function securitySeverity(severity: Severity): string {
  switch (severity) {
    case 'BLOCKER': return '9.5';
    case 'HIGH': return '7.5';
    case 'MEDIUM': return '5.0';
    case 'LOW': return '2.0';
  }
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region?: { startLine: number; snippet?: { text: string } };
  };
}

function locationFor(finding: Finding): SarifLocation {
  const sourceEvidence = finding.evidence.find((item) => item.kind === 'source_location');

  if (sourceEvidence !== undefined && sourceEvidence.kind === 'source_location') {
    return {
      physicalLocation: {
        artifactLocation: { uri: sourceEvidence.path },
        region: {
          startLine: sourceEvidence.line,
          snippet: { text: sourceEvidence.excerpt },
        },
      },
    };
  }

  return { physicalLocation: { artifactLocation: { uri: finding.subject } } };
}

function evidenceToText(evidence: Evidence, index: number): string {
  const prefix = `Path ${index + 1}: `;
  switch (evidence.kind) {
    case 'http_response':
      return `${prefix}${evidence.method} ${evidence.url} returned ${evidence.status}`;
    case 'source_location':
      return `${prefix}${evidence.repo}/${evidence.path}:${evidence.line}`;
    case 'query_result':
      return `${prefix}query returned ${evidence.rowCount} rows — ${evidence.statement}`;
    case 'artifact':
      return `${prefix}artifact ${evidence.path} (${evidence.byteLength} bytes)`;
    case 'measurement':
      return (
        `${prefix}${evidence.metric} = ${evidence.value} ${evidence.unit}` +
        `${evidence.estimated ? ' (ESTIMATED, not measured)' : ''} — ${evidence.method}`
      );
  }
}

export interface SarifLog {
  readonly $schema: string;
  readonly version: string;
  readonly runs: readonly unknown[];
}

export function toSarif(
  report: ScanReport,
  results: readonly CheckResult[],
  modules: ReadonlyMap<string, CheckModule>,
): SarifLog {
  const usedModuleIds = [...new Set(results.map((result) => result.moduleId))];

  const rules = usedModuleIds.map((moduleId) => {
    const module = modules.get(moduleId);
    const blindSpots = module?.whatItCannotCatch ?? [];

    return {
      id: moduleId,
      name: module?.title ?? moduleId,
      shortDescription: { text: module?.title ?? moduleId },
      fullDescription: { text: module?.whatItChecks ?? '' },
      help: {
        text:
          `${module?.whatItChecks ?? ''}\n\n` +
          `WHAT THIS CHECK CANNOT CATCH:\n${blindSpots.map((s) => `- ${s}`).join('\n')}\n\n` +
          `Run at ${report.accessTier} access.`,
        markdown:
          `${module?.whatItChecks ?? ''}\n\n` +
          `**What this check cannot catch**\n\n${blindSpots.map((s) => `- ${s}`).join('\n')}\n\n` +
          `*Run at \`${report.accessTier}\` access.*`,
      },
      properties: {
        tags: [module?.category ?? 'WEB', 'javari-verify'],
        'security-severity': '5.0',
      },
    };
  });

  const sarifResults = report.findings.map((finding) => ({
    ruleId: finding.ruleId,
    level: levelFor(finding.severity),
    message: {
      text:
        `${finding.description}\n\n` +
        `Confirmed through ${finding.evidence.length} independent evidence paths:\n` +
        finding.evidence.map((item, index) => evidenceToText(item, index)).join('\n') +
        `\n\nRecommended fix: ${finding.recommendedFix}`,
    },
    locations: [locationFor(finding)],
    partialFingerprints: { javariVerifyFingerprint: finding.fingerprint },
    properties: {
      severity: finding.severity,
      'security-severity': securitySeverity(finding.severity),
      subject: finding.subject,
      accessTier: report.accessTier,
      evidencePathCount: finding.evidence.length,
      autoFixable: finding.autoFixable,
    },
  }));

  // Inconclusive checks become notifications, never passing results. This is the
  // three-outcome model surviving into a format that only has two.
  const notifications = [
    ...report.didNotConclude.map((item) => ({
      level: 'warning' as const,
      message: {
        text:
          `Check "${item.moduleId}" ran but reached no verdict: ${item.reason} ` +
          'This is NOT a pass. Nothing is concluded about what it would have examined.',
      },
      descriptor: { id: item.moduleId },
    })),
    ...report.didNotRun.map((item) => ({
      level: 'warning' as const,
      message: {
        text:
          `Check "${item.moduleId}" did not run: ${item.reason} ` +
          'Its subject area was not examined by this scan.',
      },
      descriptor: { id: item.moduleId },
    })),
  ];

  return {
    $schema: SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Javari Verify',
            organization: 'CR AudioViz AI, LLC',
            informationUri: 'https://craudiovizai.com',
            version: '1.0.0',
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: report.verdict !== 'INCOMPLETE',
            toolExecutionNotifications: notifications,
            endTimeUtc: report.generatedAt,
            properties: {
              verdict: report.verdict,
              accessTier: report.accessTier,
              modulesRun: report.modulesRun,
              modulesConcluded: report.modulesConcluded,
              subjectsExamined: report.subjectsExamined,
              // The blind spots travel into whatever dashboard ingests this.
              blindSpots: report.blindSpots,
            },
          },
        ],
        results: sarifResults,
        properties: {
          targetLabel: report.targetLabel,
          targetAddress: report.targetAddress,
          headline: report.headline,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Ingestion — reading a competitor's SARIF for head-to-head reconciliation
// ---------------------------------------------------------------------------

export interface ForeignFinding {
  readonly toolName: string;
  readonly ruleId: string;
  readonly level: string;
  readonly message: string;
  readonly subject: string;
}

/**
 * Extracts findings from another tool's SARIF output.
 *
 * Defensive throughout: this parses a file produced by software we do not
 * control, and a malformed export must degrade to fewer findings rather than
 * throwing and losing the comparison entirely.
 */
export function fromSarif(raw: unknown): readonly ForeignFinding[] {
  const findings: ForeignFinding[] = [];
  if (typeof raw !== 'object' || raw === null) return findings;

  const log = raw as Record<string, unknown>;
  const runs = Array.isArray(log['runs']) ? log['runs'] : [];

  for (const run of runs) {
    if (typeof run !== 'object' || run === null) continue;
    const runRecord = run as Record<string, unknown>;

    const tool = runRecord['tool'] as Record<string, unknown> | undefined;
    const driver = tool?.['driver'] as Record<string, unknown> | undefined;
    const toolName = typeof driver?.['name'] === 'string' ? driver['name'] : 'unknown tool';

    const results = Array.isArray(runRecord['results']) ? runRecord['results'] : [];
    for (const result of results) {
      if (typeof result !== 'object' || result === null) continue;
      const record = result as Record<string, unknown>;

      const message = record['message'] as Record<string, unknown> | undefined;
      const locations = Array.isArray(record['locations']) ? record['locations'] : [];
      const firstLocation = locations[0] as Record<string, unknown> | undefined;
      const physical = firstLocation?.['physicalLocation'] as Record<string, unknown> | undefined;
      const artifact = physical?.['artifactLocation'] as Record<string, unknown> | undefined;

      findings.push({
        toolName,
        ruleId: typeof record['ruleId'] === 'string' ? record['ruleId'] : 'unknown',
        level: typeof record['level'] === 'string' ? record['level'] : 'warning',
        message: typeof message?.['text'] === 'string' ? message['text'] : '',
        subject: typeof artifact?.['uri'] === 'string' ? artifact['uri'] : '',
      });
    }
  }

  return findings;
}

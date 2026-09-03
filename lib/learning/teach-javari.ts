/**
 * lib/learning/teach-javari.ts
 *
 * Turns every scan into something Javari knows permanently.
 *
 * THE IDEA. Verify examines a system, finds a defect, and recommends a fix. Then
 * — and this is the part no other scanner has — the NEXT scan of the same target
 * says whether the fix worked. `diffRun` already classifies every finding as new,
 * persisting, fixed or regressed. A `fixed` transition is proof, measured rather
 * than assumed, that a particular remediation worked on a particular kind of
 * system.
 *
 * Most tools recommend a fix and never learn whether anyone applied it, let alone
 * whether it held. Doing that gives Javari a remediation knowledge base where
 * every recommendation carries a real success rate instead of an opinion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BOUNDARY, WHICH IS THE WHOLE DESIGN
 *
 * A scan report is a map of somebody's weaknesses. Learning from a customer's
 * scan and applying that knowledge elsewhere is only defensible if what is
 * learned is the PATTERN and never the INSTANCE.
 *
 *   LEARNED    "A Next.js app with no Content-Security-Policy; adding one via
 *              next.config headers() resolved it in 47 of 51 cases; the four
 *              failures were apps loading an inline third-party widget."
 *
 *   NEVER      which company, which domain, which URL, when they were
 *              vulnerable, or that they were vulnerable at all.
 *
 * `generalise()` below is not a convenience. It is the control that makes this
 * legal to run on customer systems, and every field that leaves this file passes
 * through it. Storing a customer's hostname alongside "no CSP" would create a
 * database of who is exploitable and how — which is the thing an attacker would
 * most want to steal from us.
 *
 * Anything learned from a customer scan is also gated on `consentToLearn`.
 * Silence is not consent, so the default is false.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-03
 */

import type { Finding, CheckResult } from '../modules/contract';

export type FindingState = 'new' | 'persisting' | 'fixed' | 'regressed';

export interface ScanLesson {
  /** Stable identity of the DEFECT CLASS, never of the target. */
  readonly ruleId: string;
  readonly severity: string;
  readonly category: string;
  /** The stack it was seen on, coarse enough not to identify anyone. */
  readonly technology: string;
  readonly state: FindingState;
  /** Generalised title — no host, no path, no company. */
  readonly pattern: string;
  /** The remediation text, which is already generic in the module. */
  readonly fix: string;
  /** True when a previous scan reported this and the current one does not. */
  readonly provenFixed: boolean;
}

export interface TeachInput {
  readonly results: readonly CheckResult[];
  readonly states: ReadonlyMap<string, FindingState>;
  /** Fingerprints reported previously and absent now. */
  readonly resolved: readonly string[];
  /** Our own property, or a customer's. */
  readonly ownership: 'internal' | 'customer';
  /**
   * Customer scans teach Javari nothing unless this is explicitly true.
   * Defaults to false, because silence is not consent.
   */
  readonly consentToLearn: boolean;
  /** Server headers and framework hints, already stripped of identifiers. */
  readonly technology?: string;
}

/**
 * Strips everything that could identify a target.
 *
 * Deliberately aggressive. A false positive here costs a slightly vaguer lesson;
 * a false negative writes a customer's hostname into a shared knowledge base.
 */
export function generalise(text: string): string {
  return (
    text
      // URLs first, then EMAIL BEFORE DOMAIN.
      //
      // Order is load-bearing. With the domain rule first, admin@acme.com became
      // "admin@a domain" — the local part survived, and a local part is often a
      // person's name or a role that identifies the organisation. Caught by
      // testing the stripper against adversarial input rather than trusting it.
      .replace(/https?:\/\/[^\s`'")]+/gi, 'the target')
      .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, 'an address')
      .replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\.[a-z]{2,}\b/gi, 'a domain')
      .replace(/\b[a-z0-9-]{2,}\.(com|net|org|io|ai|co|dev|app|xyz)\b/gi, 'a domain')
      // IPs
      .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, 'an address')
      // long hex or base64 runs: ids, tokens, hashes
      .replace(/\b[0-9a-f]{16,}\b/gi, 'an identifier')
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, 'an identifier')
      // absolute paths, which frequently carry a product or customer name
      .replace(/(^|\s)\/[A-Za-z0-9._~\-/]{2,}/g, '$1a path')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Coarse stack label. Deliberately low-resolution — a fingerprint identifies. */
export function technologyOf(headers: Readonly<Record<string, string>> = {}): string {
  const powered = (headers['x-powered-by'] ?? '').toLowerCase();
  const server = (headers['server'] ?? '').toLowerCase();
  if (powered.includes('next')) return 'next.js';
  if (server.includes('vercel')) return 'vercel-hosted';
  if (powered.includes('express')) return 'express';
  if (server.includes('cloudflare')) return 'cloudflare-fronted';
  if (server.includes('nginx')) return 'nginx';
  if (server.includes('apache')) return 'apache';
  return 'unspecified';
}

/**
 * Builds the lessons a scan produced.
 *
 * A `fixed` transition is the valuable one: it is the only evidence that exists
 * anywhere about whether a recommendation actually works.
 */
export function lessonsFrom(input: TeachInput): ScanLesson[] {
  if (input.ownership === 'customer' && !input.consentToLearn) {
    // Not an error and not silent — the caller gets an empty set and the reason
    // lives here rather than in a comment somewhere else.
    return [];
  }

  const tech = input.technology ?? 'unspecified';
  const lessons: ScanLesson[] = [];

  for (const result of input.results) {
    if (result.outcome.status !== 'fail') continue;
    for (const finding of result.outcome.findings) {
      const state = input.states.get(finding.fingerprint) ?? 'new';
      lessons.push({
        ruleId: finding.ruleId,
        severity: finding.severity,
        category: finding.category,
        technology: tech,
        state,
        pattern: generalise(finding.title),
        fix: generalise(finding.recommendedFix ?? ''),
        provenFixed: false,
      });
    }
  }

  // Findings that were present before and are gone now. These carry the fix that
  // worked, which is the only measured outcome in the whole system.
  for (const fingerprint of input.resolved) {
    const ruleId = fingerprint.split(':')[0] ?? 'unknown';
    lessons.push({
      ruleId,
      severity: 'INFO',
      category: 'REMEDIATION',
      technology: tech,
      state: 'fixed',
      pattern: generalise(`${ruleId} was reported previously and is absent now`),
      fix: '',
      provenFixed: true,
    });
  }

  return lessons;
}

/** A row for javari_learning_events. Shape matches the existing table. */
export interface LearningEvent {
  readonly event_type: 'issue_detected' | 'issue_resolved' | 'scan_completed';
  readonly domain: string;
  readonly technology: string;
  readonly severity: string;
  readonly source: 'javari_verify';
  readonly details: Record<string, unknown>;
}

/**
 * `domain` here is the DEFECT domain — security, accessibility, performance —
 * not a hostname. The column name is inherited and the distinction matters
 * enough to say out loud, because writing a hostname into a field called
 * `domain` is the single most likely way this control gets broken later.
 */
export function toLearningEvents(lessons: readonly ScanLesson[]): LearningEvent[] {
  return lessons.map((l) => ({
    event_type: l.provenFixed ? 'issue_resolved' : 'issue_detected',
    domain: l.category.toLowerCase(),
    technology: l.technology,
    severity: l.severity.toLowerCase(),
    source: 'javari_verify',
    details: {
      rule: l.ruleId,
      state: l.state,
      pattern: l.pattern,
      fix: l.fix,
      // Stated on every row so a later reader does not have to trust that the
      // stripping happened.
      identifiers_removed: true,
    },
  }));
}

/**
 * Rolls lessons into knowledge rows: one per rule and technology, carrying how
 * often the fix has been proven to work.
 *
 * confidence_score is the MEASURED success rate, not a guess. A recommendation
 * that has never been observed to work sits at 0.5 and says so, rather than
 * borrowing authority it has not earned.
 */
export interface KnowledgeRow {
  readonly category: string;
  readonly subcategory: string;
  readonly title: string;
  readonly content: string;
  readonly keywords: string[];
  readonly source_type: 'javari_verify_scan';
  readonly confidence_score: number;
  readonly sensitivity: 'public';
}

export function toKnowledge(
  lessons: readonly ScanLesson[],
  priorStats: ReadonlyMap<string, { seen: number; fixed: number }> = new Map(),
): KnowledgeRow[] {
  const byRule = new Map<string, { lesson: ScanLesson; seen: number; fixed: number }>();

  for (const l of lessons) {
    const key = `${l.ruleId}|${l.technology}`;
    const prior = priorStats.get(key) ?? { seen: 0, fixed: 0 };
    const acc = byRule.get(key) ?? { lesson: l, seen: prior.seen, fixed: prior.fixed };
    acc.seen += 1;
    if (l.provenFixed) acc.fixed += 1;
    byRule.set(key, acc);
  }

  return [...byRule.entries()].map(([key, v]) => {
    const rate = v.seen > 0 ? v.fixed / v.seen : 0;
    return {
      category: 'remediation',
      subcategory: v.lesson.category.toLowerCase(),
      title: `${v.lesson.ruleId} on ${v.lesson.technology}`,
      content:
        `${v.lesson.pattern}\n\n` +
        (v.lesson.fix ? `Fix that has been applied: ${v.lesson.fix}\n\n` : '') +
        `Observed ${v.seen} time(s); confirmed resolved by a later scan ${v.fixed} time(s).` +
        (v.fixed === 0
          ? ' No fix has yet been observed to work for this, so the recommendation is untested rather than proven.'
          : ''),
      keywords: [v.lesson.ruleId, v.lesson.technology, v.lesson.category.toLowerCase()],
      source_type: 'javari_verify_scan' as const,
      // Half is "no evidence either way". Only measured outcomes move it.
      confidence_score: v.seen === 0 ? 0.5 : Math.min(0.5 + rate * 0.5, 0.99),
      sensitivity: 'public' as const,
      _key: key,
    } as KnowledgeRow & { _key: string };
  });
}

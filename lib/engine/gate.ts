// lib/engine/gate.ts — the build gate
//
// Roy's model, and it is the right one: anything we build goes through
// VerifyForge before the customer ever sees it, and that audit is inside the
// credits they already paid. They pay for VerifyForge only when the work is
// theirs — their own edits, or an artifact they brought from outside.
//
// WHY IT IS THE RIGHT MODEL, said plainly: charging a customer to discover that
// what we built them is broken is charging them for our mistake. Bundling it
// means our quality standard is enforced at our cost, which is the only place
// a quality standard belongs. And it makes the paid tier honest — they are
// buying certification of THEIR work, not absolution for ours.
//
// THREE THINGS THIS FILE GUARDS AGAINST, because the model has real edges:
//
//   1. THE COST HOLE. "Included" plus "every save" is unbounded compute. The
//      gate audits at DELIVERY, not on every intermediate build, and a rebuild
//      with no material change reuses the last certificate.
//   2. THE INFINITE LOOP. "VerifyForge reports back and the app fixes it" runs
//      forever on a finding nothing can auto-fix. Attempts are capped, and what
//      remains is disclosed rather than hidden.
//   3. THE OPACITY TRAP. Silently fixing things and saying "QA complete" trains
//      a customer to believe the process is magic. The report shows what was
//      found and what was changed. That is where the trust comes from, and it
//      is also the best advertisement the paid tier will ever get.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

import type { Finding } from '../manifest/artifact'

export type Origin =
  /** We built it, inside a paid job. Audit is included. */
  | 'platform-build'
  /** We changed it, inside a paid job. Audit is included. */
  | 'platform-change'
  /** The customer edited it themselves after handover. They pay. */
  | 'customer-change'
  /** Brought in from outside the ecosystem. They pay. */
  | 'external'

export interface GateDecision {
  audit: boolean
  billable: boolean
  credits: number
  reason: string
  /** What the customer is told while it runs. */
  customerMessage: string
}

/** Is this audit included in work already paid for, or is it billable? */
export function decideBilling(origin: Origin, opts: {
  /** Did anything material change since the last certificate? */
  materialChange?: boolean | undefined
  /** Hours since the last passing certificate for this artifact. Absent when
   *  the caller has no certificate history — read below as `?? Infinity`. */
  hoursSinceCertificate?: number | undefined
  auditCredits?: number | undefined
} = {}): GateDecision {
  const credits = opts.auditCredits ?? 2900

  // A rebuild with no material change should not burn a second audit.
  if (opts.materialChange === false && (opts.hoursSinceCertificate ?? 999) < 24) {
    return {
      audit: false, billable: false, credits: 0,
      reason: 'Nothing material changed since the last passing certificate, which is still inside 24 hours. Re-running would cost compute and tell us what we already know.',
      customerMessage: 'No changes needing re-verification — your existing certificate still applies.',
    }
  }

  switch (origin) {
    case 'platform-build':
      return {
        audit: true, billable: false, credits: 0,
        reason: 'We built it. Verifying our own work is our cost, not the customer\'s. Charging to discover our own defects would be charging for our mistake.',
        customerMessage: 'Running quality verification on your build. This is included — we do not hand over work we have not tested.',
      }
    case 'platform-change':
      return {
        audit: true, billable: false, credits: 0,
        reason: 'We made the change inside paid work. The audit is part of delivering it.',
        customerMessage: 'Verifying the changes and checking nothing else was affected. Included in this job.',
      }
    case 'customer-change':
      return {
        audit: true, billable: true, credits,
        reason: 'The customer changed it themselves. Re-certifying work we did not do is a service, and pricing it is honest.',
        customerMessage: 'You have made changes since your last certificate. Re-certification is a paid audit — it re-runs everything and reissues the badge.',
      }
    case 'external':
      return {
        audit: true, billable: true, credits,
        reason: 'Built outside the ecosystem. This is the product being sold.',
        customerMessage: 'Running a full audit: crawl, capability checks, completability, and a public results page.',
      }
  }
}

/** Findings a build pipeline can genuinely fix without a human deciding. */
const AUTO_FIXABLE = new Set([
  'robots',        // generate app/robots.ts
  'sitemap',       // generate app/sitemap.ts
  'no-manifest',   // emit from the route scan
  'dead-routes',   // remove the reference
  'console',       // usually a missing key prop or a stale import
])

/** Findings that need a human, and pretending otherwise wastes everyone's time. */
const NEEDS_HUMAN = new Set([
  'not-completable',  // the walkthrough is the human's description of success
  'black',            // a rendering fault needs eyes
  'exposure',         // deleting a route is a judgement call
  'open-admin',       // so is deciding who should reach it
  'undeclared',       // secret or hole is a design question
])

export interface RemediationPlan {
  autoFix: Finding[]
  needsHuman: Finding[]
  /** Findings we can neither fix nor classify. Escalated, never buried. */
  unknown: Finding[]
  attemptsAllowed: number
  disclosure: string
}

/**
 * Split findings into what the pipeline should attempt and what it must not.
 * The cap exists because a loop that retries forever on an unfixable finding
 * burns credits and delivers nothing.
 */
export function planRemediation(findings: Finding[], attemptsSoFar = 0): RemediationPlan {
  const autoFix: Finding[] = []
  const needsHuman: Finding[] = []
  const unknown: Finding[] = []

  for (const f of findings) {
    if (NEEDS_HUMAN.has(f.id)) needsHuman.push(f)
    else if (AUTO_FIXABLE.has(f.id)) autoFix.push(f)
    else unknown.push(f)
  }

  const MAX_ATTEMPTS = 3
  const remaining = Math.max(0, MAX_ATTEMPTS - attemptsSoFar)

  const disclosure = remaining === 0
    ? 'Automatic remediation has run three times and these findings remain. Repeating it would not change the outcome. They are listed for a human to decide on.'
    : `${autoFix.length} finding${autoFix.length === 1 ? '' : 's'} the pipeline will fix and re-verify. ` +
      `${needsHuman.length + unknown.length} need a decision rather than a patch.`

  return { autoFix, needsHuman, unknown, attemptsAllowed: remaining, disclosure }
}

export type GateOutcome = 'certified' | 'delivered-with-notes' | 'held'

export interface GateResult {
  outcome: GateOutcome
  score: number
  /** What the customer sees. Never a bare score. */
  summary: string
  fixed: { title: string; whatChanged: string }[]
  remaining: Finding[]
  certificateId?: string
  billing: GateDecision
}

/**
 * The delivery decision. A blocker holds the handover — that is the entire
 * point of a gate. Anything less ships with the notes visible.
 */
export function decideDelivery(input: {
  score: number
  findings: Finding[]
  fixed: { title: string; whatChanged: string }[]
  billing: GateDecision
  artifactId: string
}): GateResult {
  const blockers = input.findings.filter(f => f.severity === 'blocker')
  const majors = input.findings.filter(f => f.severity === 'major')

  if (blockers.length) {
    return {
      outcome: 'held', score: input.score, fixed: input.fixed, remaining: input.findings,
      billing: input.billing,
      summary:
        `Held before handover. ${blockers.length} blocking issue${blockers.length === 1 ? '' : 's'} ` +
        `mean this does not work for a user yet: ${blockers.map(b => b.title).join('; ')}. ` +
        `We would rather tell you this than let you find it. Nothing further is billed while we fix it.`,
    }
  }

  if (majors.length) {
    return {
      outcome: 'delivered-with-notes', score: input.score, fixed: input.fixed,
      remaining: input.findings, billing: input.billing,
      certificateId: certificate(input.artifactId, input.score),
      summary:
        `Delivered. It works, and ${majors.length} thing${majors.length === 1 ? '' : 's'} ` +
        `worth improving are listed below with the fix for each. ` +
        (input.fixed.length ? `We already corrected ${input.fixed.length} during verification. ` : '') +
        `Nothing here is hidden from you.`,
    }
  }

  return {
    outcome: 'certified', score: input.score, fixed: input.fixed,
    remaining: input.findings, billing: input.billing,
    certificateId: certificate(input.artifactId, input.score),
    summary:
      `Certified at ${input.score}/100. ` +
      (input.fixed.length
        ? `${input.fixed.length} issue${input.fixed.length === 1 ? '' : 's'} were found and corrected during verification — listed below, because you should know what we changed.`
        : `No issues found.`) +
      ` The public results page shows every check, including any that failed.`,
  }
}

function certificate(artifactId: string, score: number): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `VF-${stamp}-${artifactId.slice(0, 12)}-${score}`
}

/**
 * What counts as a material change, and therefore triggers re-certification.
 * Deliberately narrow: a customer editing a headline should not be billed for
 * an audit, and billing them would teach them not to touch their own site.
 */
export function isMaterialChange(diff: {
  routesAdded?: number
  routesRemoved?: number
  apiChanged?: boolean
  dependenciesChanged?: boolean
  authChanged?: boolean
  contentOnly?: boolean
}): { material: boolean; why: string } {
  if (diff.contentOnly) {
    return { material: false, why: 'Content only. Text and images do not change what the audit verified, and billing for them would teach a customer not to touch their own site.' }
  }
  if (diff.authChanged) return { material: true, why: 'Authentication changed — the highest-risk surface there is.' }
  if (diff.apiChanged) return { material: true, why: 'An API contract changed, which is what integrators depend on.' }
  if (diff.routesAdded || diff.routesRemoved) {
    return { material: true, why: 'Routes changed, so the capability list no longer matches what ships.' }
  }
  if (diff.dependenciesChanged) return { material: true, why: 'Dependencies changed, which can alter behaviour with no code edit.' }
  return { material: false, why: 'No structural change detected.' }
}

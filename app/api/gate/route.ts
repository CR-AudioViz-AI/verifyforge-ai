// app/api/gate/route.ts — the delivery gate any build pipeline calls
//
// Javari AI, the game studio, or any ecosystem app calls this before handing
// work to a customer. It decides billing, runs the audit, splits findings into
// what a pipeline can fix and what needs a person, and returns both the
// engineering result and the sentence the customer should actually be shown.
//
// IT RETURNS THE CUSTOMER'S WORDING TOO. Every calling app writing its own
// "verifying your build" copy would drift into marketing language within a
// month — "optimising your experience" instead of "we found three problems and
// fixed two". The gate owns that wording so it stays honest across the whole
// ecosystem.
//
// A BLOCKER HOLDS THE HANDOVER. The caller is expected to honour outcome ===
// 'held' and not deliver. That is the entire point, and it is why this returns
// an outcome rather than a score — a score invites a judgement call, and the
// judgement call is where standards die.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026
import { NextRequest, NextResponse } from 'next/server'
import { decideBilling, decideDelivery, isMaterialChange, planRemediation } from '@/lib/engine/gate'
import type { Origin } from '@/lib/engine/gate'
import { grade } from '@/lib/manifest/artifact'
import type { Finding, Manifest } from '@/lib/manifest/artifact'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

interface GateRequest {
  url: string
  artifactId: string
  origin: Origin
  manifest?: Manifest
  /** What changed since the last certificate, so we do not re-bill for nothing. */
  diff?: {
    routesAdded?: number
    routesRemoved?: number
    apiChanged?: boolean
    dependenciesChanged?: boolean
    authChanged?: boolean
    contentOnly?: boolean
  }
  hoursSinceCertificate?: number
  /** How many remediation rounds this pipeline has already run. */
  attemptsSoFar?: number
  /** What the pipeline fixed since the last call, for the customer's record. */
  fixed?: { title: string; whatChanged: string }[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: GateRequest
  try {
    body = (await request.json()) as GateRequest
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  if (!body.url || !body.artifactId || !body.origin) {
    return NextResponse.json(
      { error: 'url, artifactId and origin are all required' }, { status: 400 })
  }

  // ── 1. Should this even run, and who pays? ──────────────────────────────
  const material = body.diff ? isMaterialChange(body.diff) : { material: true, why: 'No diff supplied, so assume it changed.' }
  const billing = decideBilling(body.origin, {
    materialChange: material.material,
    hoursSinceCertificate: body.hoursSinceCertificate,
  })

  if (!billing.audit) {
    return NextResponse.json({
      outcome: 'certified',
      skipped: true,
      billing,
      materialChange: material,
      summary: billing.customerMessage,
      customerMessage: billing.customerMessage,
    })
  }

  // ── 2. Run the audit ────────────────────────────────────────────────────
  const auditUrl = new URL('/api/audit', request.nextUrl.origin).toString()
  let findings: Finding[] = []
  let score = 0
  let auditFailed = false

  try {
    const r = await fetch(auditUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: body.url, manifest: body.manifest }),
      signal: AbortSignal.timeout(280_000),
    })
    if (r.ok) {
      const data = (await r.json()) as { findings?: Finding[]; score?: number }
      findings = data.findings ?? []
      score = data.score ?? 0
    } else {
      auditFailed = true
    }
  } catch {
    auditFailed = true
  }

  if (auditFailed) {
    // Never certify on a failed audit. An unverified build is not a passing one.
    return NextResponse.json({
      outcome: 'held',
      billing,
      score: 0,
      summary: 'The audit did not complete, so nothing is certified. ' +
               'An unverified build is not a passing build, and reporting it as one would make every future certificate worthless.',
      customerMessage: 'Verification did not finish. We are re-running it rather than handing over something we have not checked.',
      remaining: [],
      fixed: body.fixed ?? [],
      retry: true,
    }, { status: 200 })
  }

  // ── 3. Split what a pipeline may fix from what needs a person ───────────
  const plan = planRemediation(findings, body.attemptsSoFar ?? 0)

  // ── 4. Decide delivery ──────────────────────────────────────────────────
  const g = grade(findings)
  const result = decideDelivery({
    score: g.score,
    findings,
    fixed: body.fixed ?? [],
    billing,
    artifactId: body.artifactId,
  })

  return NextResponse.json({
    ...result,
    score: g.score,
    shippable: g.shippable,
    materialChange: material,
    remediation: {
      autoFix: plan.autoFix,
      needsHuman: plan.needsHuman,
      unknown: plan.unknown,
      attemptsAllowed: plan.attemptsAllowed,
      disclosure: plan.disclosure,
      /** The caller should loop only while this is true. */
      shouldRetry: plan.autoFix.length > 0 && plan.attemptsAllowed > 0,
    },
    // The exact wording the customer should see. Owned here so it stays honest.
    customerMessage: buildCustomerMessage(result.outcome, plan, result.fixed.length, billing.customerMessage),
    testedAt: new Date().toISOString(),
  })
}

/**
 * What the customer reads. Plain, specific, and never dressed up — "we found
 * three problems and fixed two" beats "optimising your experience" every time,
 * because the second one is what people say when the first one is bad news.
 */
function buildCustomerMessage(
  outcome: 'certified' | 'delivered-with-notes' | 'held',
  plan: ReturnType<typeof planRemediation>,
  fixedCount: number,
  billingLine: string,
): string {
  if (outcome === 'held') {
    if (plan.autoFix.length && plan.attemptsAllowed > 0) {
      return `${billingLine} We found ${plan.autoFix.length} issue${plan.autoFix.length === 1 ? '' : 's'} ` +
             `and are correcting ${plan.autoFix.length === 1 ? 'it' : 'them'} now, then re-checking. ` +
             `You will get the full list either way.`
    }
    return `${billingLine} We found something that stops this working properly, so we are holding delivery ` +
           `rather than handing it over. You are not billed for the fix — it is our build.`
  }
  if (outcome === 'delivered-with-notes') {
    return `Delivered and verified. ` +
           (fixedCount ? `We corrected ${fixedCount} issue${fixedCount === 1 ? '' : 's'} during checks. ` : '') +
           `A few things worth improving are listed with the fix for each — nothing is hidden.`
  }
  return `Delivered and certified. ` +
         (fixedCount ? `${fixedCount} issue${fixedCount === 1 ? '' : 's'} found and corrected during verification, listed so you know what changed. ` : 'No issues found. ') +
         `Your public results page shows every check we ran.`
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'VerifyForge delivery gate',
    method: 'POST { url, artifactId, origin, manifest?, diff?, attemptsSoFar?, fixed? }',
    origins: {
      'platform-build': 'We built it. Audit included, no charge.',
      'platform-change': 'We changed it inside paid work. Audit included, no charge.',
      'customer-change': 'They edited it after handover. Re-certification is billable.',
      'external': 'Brought from outside the ecosystem. Billable.',
    },
    outcomes: {
      certified: 'Clean. Certificate issued.',
      'delivered-with-notes': 'Works, with findings listed and a fix for each.',
      held: 'A blocker. Not handed over. Not billed while we fix it.',
    },
    principle:
      'Verifying our own work is our cost. Charging a customer to discover that what ' +
      'we built them is broken is charging them for our mistake. They pay only to ' +
      'certify work that is theirs.',
  })
}

// app/api/audit/route.ts — the VerifyForge audit endpoint
//
// One entry point for every artifact kind. Give it a URL and, optionally, a
// manifest — or let it find the manifest itself at /javari-manifest.json.
//
// THE PIPELINE, IN THE ORDER IT PAYS OFF:
//
//   1. MANIFEST. Fetch or accept it. Validate that it is USEFUL, not merely
//      well-formed — a manifest with no walkthrough cannot prove completability
//      and is worth less than none, because it implies coverage that is absent.
//   2. CRAWL. Find what is actually deployed. Exposures surface here, and they
//      are the findings that justify the invoice on their own.
//   3. GUIDED SOLVE. Prove the thing can be finished.
//   4. UNGUIDED SOLVE. Find what nobody declared, and measure blind find rates.
//   5. INTERPRET. Merge everything into findings that each name a symptom, a
//      cause and a fix, then price the assistance honestly.
//
// Crawl runs here on the server with plain fetch, which is cheap and needs no
// browser. Only the solve stages need the headless worker, so a URL with no
// manifest still gets a full crawl and exposure report for free.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026
import { NextRequest, NextResponse } from 'next/server'
import { crawl, draftManifest } from '@/lib/engine/crawler'
import { assistancePolicy, offersFor, settle, usd } from '@/lib/engine/billing'
import { ARTIFACT_MANIFEST_VERSION, grade, validate } from '@/lib/manifest/artifact'
import type { ArtifactKind, Finding, Manifest } from '@/lib/manifest/artifact'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/** Where a well-behaved artifact publishes its manifest. */
const MANIFEST_PATHS = [
  '/javari-manifest.json',
  '/manifest/artifact.json',
  '/.well-known/javari-manifest.json',
]

async function findManifest(origin: string): Promise<{ manifest?: Manifest; foundAt?: string }> {
  for (const p of MANIFEST_PATHS) {
    try {
      const r = await fetch(origin + p, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      const j = (await r.json()) as Manifest
      if (j && typeof j === 'object' && 'version' in j) return { manifest: j, foundAt: p }
    } catch { /* try the next */ }
  }
  return {}
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { url?: string; manifest?: Manifest; kind?: ArtifactKind; depth?: 'quick' | 'full' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  if (!body.url || !/^https?:\/\//.test(body.url)) {
    return NextResponse.json({ error: 'A url starting with http:// or https:// is required' }, { status: 400 })
  }

  const started = Date.now()
  const origin = new URL(body.url).origin
  const findings: Finding[] = []

  // ── 1. Manifest ─────────────────────────────────────────────────────────
  let manifest = body.manifest
  let manifestSource = manifest ? 'supplied in the request' : ''
  if (!manifest) {
    const found = await findManifest(origin)
    manifest = found.manifest
    manifestSource = found.foundAt ? `found at ${found.foundAt}` : 'none published'
  }

  if (manifest) {
    findings.push(...validate(manifest))
  } else {
    findings.push({
      id: 'no-manifest', severity: 'major',
      title: 'No manifest published',
      observed: `Nothing at ${MANIFEST_PATHS.join(', ')}`,
      cause: 'Without a manifest the audit can only check what a stranger can see from outside. It cannot verify a single CLAIM, prove the artifact can be finished, or test a hidden path — which is most of the value.',
      fix: `Publish a manifest at /javari-manifest.json. A draft generated from this crawl is included in this response under draftManifest — fill in the description, the walkthrough and any hidden paths, and re-run.`,
    })
  }

  // ── 2. Crawl ────────────────────────────────────────────────────────────
  const quick = body.depth === 'quick'
  const c = await crawl(body.url, {
    maxRoutes: quick ? 30 : 120,
    maxDepth: quick ? 2 : 3,
    probe: true,
    respectRobots: true,
  })

  for (const e of c.exposures) {
    findings.push({
      id: 'exposure', severity: e.severity,
      title: 'Something is public that should not be',
      observed: `${e.url} — ${e.why}`,
      cause: 'A route that was useful during development and never removed, or an endpoint whose GET was never gated even though its POST was.',
      fix: 'Delete it if it is not needed in production. If it is, gate it with the same check the write path uses — a public GET beside a protected POST is the most common shape of this bug.',
    })
  }
  const dead = c.routes.filter(r => r.status >= 400)
  if (dead.length) {
    findings.push({
      id: 'dead-routes', severity: 'minor',
      title: `${dead.length} route${dead.length === 1 ? '' : 's'} referenced but returning an error`,
      observed: dead.slice(0, 5).map(r => `${new URL(r.url).pathname} → ${r.status}`).join(', '),
      cause: 'Links or bundle references pointing at pages that no longer exist.',
      fix: 'Remove the reference or restore the page. A visitor who clicks an advertised feature and gets a 404 assumes the whole product is unfinished.',
    })
  }
  if (!c.robots.found) {
    findings.push({
      id: 'robots', severity: 'minor', title: 'No robots.txt',
      observed: 'GET /robots.txt did not return 200',
      cause: 'Crawlers, including AI crawlers, have to guess what to index.',
      fix: 'Publish robots.txt with a Sitemap line. In Next.js, app/robots.ts generates it so it cannot drift.',
    })
  }
  if (!c.robots.sitemap) {
    findings.push({
      id: 'sitemap', severity: 'minor', title: 'No sitemap declared',
      observed: 'robots.txt has no Sitemap line',
      cause: 'Discovery depends on a crawler finding an internal link to every page.',
      fix: 'Generate app/sitemap.ts listing every static route, and reference it from robots.txt.',
    })
  }
  const unauth = c.endpoints.filter(e => e.unauthenticated && /admin|internal|migrate|setup|debug/i.test(e.url))
  if (unauth.length) {
    findings.push({
      id: 'open-admin', severity: 'blocker',
      title: 'Administrative endpoints answer without credentials',
      observed: unauth.slice(0, 4).map(e => new URL(e.url).pathname).join(', '),
      cause: 'Auth applied to the browser route but not the API beneath it.',
      fix: 'Gate the API itself. Middleware that protects /admin does nothing for /api/admin unless the matcher includes it.',
    })
  }

  // ── 3 and 4. Solve, if a worker is connected ────────────────────────────
  const worker = process.env.VERIFYFORGE_WORKER_URL
  let solve: unknown = null
  let completable: boolean | null = null

  if (manifest && worker) {
    try {
      const r = await fetch(worker, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: body.url, manifest, modes: quick ? ['guided'] : ['guided', 'unguided'] }),
        signal: AbortSignal.timeout(240_000),
      })
      if (r.ok) {
        const data = (await r.json()) as { completable?: boolean; findings?: Finding[]; blindFindings?: { id: string; found: boolean }[] }
        solve = data
        completable = data.completable ?? null
        if (data.findings) findings.push(...data.findings)
      } else {
        findings.push({
          id: 'worker', severity: 'note', title: 'The interactive tests did not run',
          observed: `Worker returned ${r.status}`,
          cause: 'The headless worker was unreachable or timed out.',
          fix: 'Crawl and exposure results below are still complete. Re-run for the interactive stages.',
        })
      }
    } catch {
      findings.push({
        id: 'worker', severity: 'note', title: 'The interactive tests did not run',
        observed: 'Worker request failed',
        cause: 'Network or timeout.',
        fix: 'Everything below came from the crawl and is unaffected.',
      })
    }
  } else if (manifest && !worker) {
    findings.push({
      id: 'worker-off', severity: 'note',
      title: 'Interactive testing is not connected to this deployment',
      observed: 'VERIFYFORGE_WORKER_URL is not set',
      cause: 'The headless worker runs the guided and unguided solves; without it the audit is crawl-only.',
      fix: 'Point VERIFYFORGE_WORKER_URL at a worker running the playtest harness. Said plainly rather than returning a partial result as if it were whole.',
    })
  }

  // ── 5. Grade, price, respond ────────────────────────────────────────────
  const kind: ArtifactKind = manifest?.kind ?? body.kind ?? 'app'
  const g = grade(findings)
  const offers = offersFor(kind).map(p => ({
    sku: p.sku, name: p.name, payer: p.payer,
    price: p.credits === 0 ? 'free' : usd(p.credits) + (p.recurring ? '/mo' : ''),
    what: p.what, why: p.why,
  }))

  const assistance = (manifest?.hiddenPaths ?? []).map(h => {
    const blind = (solve as { blindFindings?: { id: string; found: boolean }[] } | null)
      ?.blindFindings?.find(b => b.id === h.id)
    const policy = assistancePolicy({
      blindFound: blind?.found ?? false,
      hasDiscoveryTell: Boolean(h.discoveryTell && h.discoveryTell.length >= 12),
      observedFindRate: h.observedFindRate,
    })
    return { id: h.id, name: h.name, ...policy }
  })

  return NextResponse.json({
    url: body.url,
    kind,
    manifest: { present: Boolean(manifest), source: manifestSource, version: manifest?.version ?? null },
    score: g.score,
    shippable: g.shippable,
    verdict: g.verdict,
    completable,
    crawl: {
      routes: c.routes.length,
      endpoints: c.endpoints.length,
      forms: c.forms.length,
      exposures: c.exposures.length,
      robots: c.robots.found,
      sitemap: Boolean(c.robots.sitemap),
      bytes: c.assets.totalBytes,
      durationMs: c.durationMs,
    },
    findings: findings.sort((a, b) => {
      const o = { blocker: 0, major: 1, minor: 2, note: 3 }
      return o[a.severity] - o[b.severity]
    }),
    assistance,
    offers,
    revenueShare: settle(500),
    draftManifest: manifest ? undefined : draftManifest(c, kind),
    testedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  })
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'VerifyForge',
    what: 'End-to-end audit for games, apps, tools, websites, APIs and AI.',
    method: 'POST { url, manifest?, kind?, depth? }',
    manifestVersion: ARTIFACT_MANIFEST_VERSION,
    publishYourManifestAt: MANIFEST_PATHS,
    pipeline: [
      'validate the manifest is useful, not merely well-formed',
      'crawl what is actually deployed, including routes only referenced in JS bundles',
      'flag anything public that should not be',
      'run the walkthrough to prove the artifact can be finished',
      'explore blind to find undeclared paths and measure real find rates',
      'grade, and price assistance honestly',
    ],
    principle:
      'Every finding names the symptom, the likely cause and the fix. A score with ' +
      'no guidance is not a result. And we charge the party whose problem it is — a ' +
      'player stuck in a game is the product working; a user stuck in a tool is the ' +
      'product failing, and charging them for that is charging for our own mistake.',
  })
}

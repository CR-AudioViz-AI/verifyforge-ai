// lib/engine/crawler.ts — autonomous discovery
//
// The manifest tells VerifyForge what a builder MEANT to ship. The crawler
// finds what they ACTUALLY shipped. The gap between the two is where every
// interesting finding lives.
//
// WHY CRAWL WHEN A MANIFEST EXISTS. Three reasons, in order of how much money
// each one saves:
//
//   1. UNDECLARED SURFACE IS UNTESTED SURFACE. A route nobody listed is a route
//      nobody tested. The migration endpoint that published its own secret, the
//      setup route returning the full schema — both were live for months and
//      both would have been caught on the first crawl.
//   2. DRIFT. A manifest written in March describes a product from March. The
//      crawler is what notices the endpoint that changed shape.
//   3. HONESTY. A builder who declares five capabilities and ships fifteen is
//      not lying, they are busy. The crawler writes the other ten for them.
//
// IT IS POLITE BY DEFAULT. Same-origin only, robots.txt honoured, concurrency
// capped, and it never submits a form it did not generate safe values for.
// A scanner that takes a site down has cost its customer more than it saved.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

import { guardedFetch } from '@/lib/net/egress-guard'

export interface Route {
  url: string
  status: number
  contentType: string
  title?: string
  bytes: number
  ms: number
  /** How it was found — a link, a sitemap, a guess, a JS bundle string. */
  via: 'seed' | 'link' | 'sitemap' | 'bundle' | 'probe' | 'form'
  depth: number
}

export interface Endpoint {
  url: string
  methods: string[]
  status: number
  /** Did it return JSON, and what did the top-level shape look like? */
  shape?: string
  /** Does it respond identically without credentials? */
  unauthenticated?: boolean
  via: string
}

export interface FormTarget {
  url: string
  action: string
  method: string
  fields: { name: string; type: string; required: boolean }[]
}

export interface CrawlResult {
  origin: string
  routes: Route[]
  endpoints: Endpoint[]
  forms: FormTarget[]
  /** Routes referenced in code but returning 404 — advertised and dead. */
  brokenLinks: { from: string; to: string; status: number }[]
  /** Anything that looks like it should not be public. */
  exposures: { url: string; why: string; severity: 'blocker' | 'major' | 'minor' }[]
  assets: { js: number; css: number; images: number; totalBytes: number }
  robots: { found: boolean; sitemap?: string; disallowed: string[] }
  durationMs: number
}

/** Paths worth probing on any web artifact. Cheap, and they find real things. */
const PROBE_PATHS = [
  '/robots.txt', '/sitemap.xml', '/manifest.json', '/.well-known/security.txt',
  '/api', '/api/health', '/api/status', '/api/version',
  '/health', '/status', '/version', '/metrics',
  // These four are the ones that have actually been found live and dangerous.
  '/api/setup', '/api/migrate', '/api/admin/migrate', '/api/debug',
  '/.env', '/.env.local', '/.git/config', '/config.json',
  '/admin', '/dashboard', '/login', '/signup',
  '/javari-manifest.json', '/manifest/artifact.json',
]

/** Signals that a response should not have been public. */
export function assessExposure(url: string, status: number, body: string): { why: string; severity: 'blocker' | 'major' | 'minor' } | null {
  if (status !== 200) return null
  const low = body.slice(0, 4000).toLowerCase()

  if (/\.env|\.git\/config/.test(url)) {
    return { why: 'Environment or version-control configuration served over HTTP', severity: 'blocker' }
  }
  // A response that hands out its own credential. This has happened.
  if (/"secret"\s*:\s*"[^"]{6,}"|send post with .*secret/i.test(body.slice(0, 2000))) {
    return { why: 'The response body contains a secret or tells the caller which secret to send', severity: 'blocker' }
  }
  if (/create table|alter table|drop table/i.test(low)) {
    return { why: 'Database schema returned to an unauthenticated caller', severity: 'blocker' }
  }
  if (/\b(sk_live_|ghp_|gsk_|sk-ant-|AKIA[0-9A-Z]{16})/.test(body.slice(0, 6000))) {
    return { why: 'A live credential appears in the response', severity: 'blocker' }
  }
  if (/migrate|\/setup\b/.test(url) && !/unauthorized|forbidden/i.test(low)) {
    return { why: 'A setup or migration endpoint responds without authentication', severity: 'major' }
  }
  if (/stack trace|at .*\(\/.*\.(ts|js):\d+/i.test(body.slice(0, 2000))) {
    return { why: 'A stack trace with file paths is exposed to the caller', severity: 'major' }
  }
  if (/"password"|"apikey"|"api_key"|"token"\s*:\s*"[^"]{12,}/i.test(body.slice(0, 3000))) {
    return { why: 'The response contains what looks like a credential field with a value', severity: 'major' }
  }
  return null
}

/** Pull candidate routes out of a JS bundle. Finds pages no link points at. */
export function routesFromBundle(js: string, origin: string): string[] {
  const out = new Set<string>()
  // Next.js route manifests and plain string literals both leak paths.
  for (const m of js.matchAll(/["'`](\/(?!\/)[a-z0-9\-_/[\]]{2,60})["'`]/gi)) {
    const p = m[1]
    if (/\.(js|css|png|jpg|svg|webp|woff2?|ico|map)$/i.test(p)) continue
    if (p.startsWith('/_next/')) continue
    if (p.includes('[')) continue          // dynamic routes need data
    out.add(origin + p)
  }
  return [...out].slice(0, 400)
}

/** The JSON shape of a response, flattened enough to detect drift. */
export function shapeOf(v: unknown, depth = 0): string {
  if (depth > 3) return '…'
  if (v === null) return 'null'
  if (Array.isArray(v)) return v.length ? `[${shapeOf(v[0], depth + 1)}]` : '[]'
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).slice(0, 12)
    return `{${keys.map(k => `${k}:${shapeOf((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`
  }
  return typeof v
}

export interface CrawlOptions {
  maxRoutes?: number
  maxDepth?: number
  concurrency?: number
  probe?: boolean
  respectRobots?: boolean
  timeoutMs?: number
}

/**
 * Crawl an origin. Runs server-side with plain fetch — no browser needed for
 * discovery, which keeps it cheap. The headless pass only runs on routes that
 * actually need rendering.
 */
export async function crawl(seed: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const t0 = Date.now()
  const origin = new URL(seed).origin
  const maxRoutes = opts.maxRoutes ?? 120
  const maxDepth = opts.maxDepth ?? 3
  const conc = Math.min(6, opts.concurrency ?? 4)
  const timeout = opts.timeoutMs ?? 12_000

  const seen = new Set<string>()
  const routes: Route[] = []
  const endpoints: Endpoint[] = []
  const forms: FormTarget[] = []
  const brokenLinks: CrawlResult['brokenLinks'] = []
  const exposures: CrawlResult['exposures'] = []
  const assets = { js: 0, css: 0, images: 0, totalBytes: 0 }
  const robots = { found: false, sitemap: undefined as string | undefined, disallowed: [] as string[] }

  const get = async (url: string) => {
    const started = Date.now()
    try {
      const r = await guardedFetch(url, {
        headers: { 'User-Agent': 'VerifyForge/1.0 (+https://verifyforgeai.com)' },
        signal: AbortSignal.timeout(timeout),
      })
      const ct = r.headers.get('content-type') ?? ''
      const body = ct.includes('image') || ct.includes('font') ? '' : await r.text()
      return { status: r.status, ct, body, ms: Date.now() - started, bytes: body.length }
    } catch {
      return { status: 0, ct: '', body: '', ms: Date.now() - started, bytes: 0 }
    }
  }

  // robots.txt first, and honour it.
  const rb = await get(origin + '/robots.txt')
  if (rb.status === 200) {
    robots.found = true
    for (const line of rb.body.split('\n')) {
      const s = line.match(/^\s*Sitemap:\s*(\S+)/i)
      if (s) robots.sitemap = s[1]
      const d = line.match(/^\s*Disallow:\s*(\S+)/i)
      if (d && d[1] !== '/') robots.disallowed.push(d[1])
    }
  }
  const allowed = (u: string) => {
    if (opts.respectRobots === false) return true
    const p = new URL(u).pathname
    return !robots.disallowed.some(d => p.startsWith(d))
  }

  const queue: { url: string; via: Route['via']; depth: number }[] = [{ url: seed, via: 'seed', depth: 0 }]

  // Sitemap gives the builder's own view of what exists.
  if (robots.sitemap) {
    const sm = await get(robots.sitemap)
    if (sm.status === 200) {
      for (const m of sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (m[1].startsWith(origin)) queue.push({ url: m[1], via: 'sitemap', depth: 1 })
      }
    }
  }
  if (opts.probe !== false) {
    for (const p of PROBE_PATHS) queue.push({ url: origin + p, via: 'probe', depth: 1 })
  }

  while (queue.length && routes.length < maxRoutes) {
    const batch = queue.splice(0, conc).filter(x => {
      if (seen.has(x.url) || !x.url.startsWith(origin)) return false
      seen.add(x.url)
      return allowed(x.url)
    })
    if (!batch.length) continue

    const results = await Promise.all(batch.map(async b => ({ b, r: await get(b.url) })))

    for (const { b, r } of results) {
      if (r.status === 0) continue
      assets.totalBytes += r.bytes

      const isJson = r.ct.includes('json')
      const isHtml = r.ct.includes('html')

      // Anything that should not be public.
      const ex = assessExposure(b.url, r.status, r.body)
      if (ex) exposures.push({ url: b.url, ...ex })

      if (isJson) {
        let shape: string | undefined
        try { shape = shapeOf(JSON.parse(r.body)) } catch { shape = undefined }
        endpoints.push({ url: b.url, methods: ['GET'], status: r.status, shape,
                         unauthenticated: r.status === 200, via: b.via })
        continue
      }

      if (!isHtml) {
        if (r.ct.includes('javascript')) assets.js++
        else if (r.ct.includes('css')) assets.css++
        else if (r.ct.includes('image')) assets.images++
        continue
      }

      const title = r.body.match(/<title[^>]*>([^<]{1,120})/i)?.[1]?.trim()
      routes.push({ url: b.url, status: r.status, contentType: r.ct, title,
                    bytes: r.bytes, ms: r.ms, via: b.via, depth: b.depth })

      if (b.depth >= maxDepth) continue

      // Links
      for (const m of r.body.matchAll(/href=["']([^"'#]+)["']/gi)) {
        let href = m[1]
        if (href.startsWith('//') || /^(mailto|tel|javascript):/i.test(href)) continue
        if (href.startsWith('/')) href = origin + href
        else if (!href.startsWith('http')) continue
        if (!href.startsWith(origin)) continue
        queue.push({ url: href.split('#')[0], via: 'link', depth: b.depth + 1 })
      }

      // Forms — recorded, never submitted blind.
      for (const fm of r.body.matchAll(/<form[^>]*>([\s\S]{0,4000}?)<\/form>/gi)) {
        const tag = fm[0].slice(0, 300)
        const action = tag.match(/action=["']([^"']+)["']/i)?.[1] ?? b.url
        const method = (tag.match(/method=["']([^"']+)["']/i)?.[1] ?? 'GET').toUpperCase()
        const fields: FormTarget['fields'] = []
        for (const inp of fm[1].matchAll(/<(input|select|textarea)[^>]*>/gi)) {
          const name = inp[0].match(/name=["']([^"']+)["']/i)?.[1]
          if (!name) continue
          fields.push({
            name,
            type: inp[0].match(/type=["']([^"']+)["']/i)?.[1] ?? 'text',
            required: /\brequired\b/i.test(inp[0]),
          })
        }
        if (fields.length) forms.push({ url: b.url, action, method, fields })
      }

      // Bundles leak routes no link points at.
      const bundles = [...r.body.matchAll(/src=["']([^"']*\/_next\/static\/[^"']+\.js)["']/gi)]
        .map(m => m[1].startsWith('http') ? m[1] : origin + m[1]).slice(0, 4)
      for (const bu of bundles) {
        const js = await get(bu)
        if (js.status !== 200) continue
        assets.js++
        for (const cand of routesFromBundle(js.body, origin).slice(0, 40)) {
          queue.push({ url: cand, via: 'bundle', depth: b.depth + 1 })
        }
      }
    }
  }

  // A route referenced but dead is advertised and broken.
  for (const r of routes) {
    if (r.status >= 400) brokenLinks.push({ from: 'discovered', to: r.url, status: r.status })
  }

  return { origin, routes, endpoints, forms, brokenLinks, exposures, assets, robots,
           durationMs: Date.now() - t0 }
}

/** Turn a crawl into a draft manifest, so a builder starts from reality. */
export function draftManifest(c: CrawlResult, kind = 'app'): Record<string, unknown> {
  return {
    version: '1.0',
    kind,
    id: new URL(c.origin).hostname.split('.')[0],
    title: c.routes[0]?.title ?? new URL(c.origin).hostname,
    tagline: '',
    description: '',
    url: c.origin,
    studio: '',
    credits: [],
    capabilities: c.routes.slice(0, 25).map(r => ({
      id: new URL(r.url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root',
      name: r.title ?? new URL(r.url).pathname,
      claim: `${new URL(r.url).pathname} loads and returns 200`,
      required: r.depth === 0,
      verify: { kind: 'http', url: r.url, status: 200 },
    })),
    walkthrough: [{ action: { type: 'goto', url: c.origin }, note: 'Cold start' }],
    surfaces: [],
    _generated: {
      by: 'VerifyForge crawler',
      note: 'A draft from what is actually deployed. Fill in the description, ' +
            'the walkthrough and any hidden paths — the crawler can find routes ' +
            'but it cannot know what success looks like.',
      routesFound: c.routes.length,
      endpointsFound: c.endpoints.length,
      exposures: c.exposures.length,
    },
  }
}

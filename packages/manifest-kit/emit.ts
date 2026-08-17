// packages/manifest-kit/emit.ts — every app publishes its own manifest
//
// Roy: once VerifyForge is complete, every app creates the files necessary for
// a total audit. This is that kit. Drop it into any Next.js app in the
// ecosystem, describe the app once, and it serves a manifest VerifyForge can
// audit end to end.
//
// WHY A KIT AND NOT A CONVENTION. A convention is a document nobody reads. A
// kit is a route file that fails to compile when the manifest is wrong, which
// is the only form of documentation that survives contact with a deadline.
//
// WHAT IT GENERATES FOR FREE. Capabilities from the app's own route tree, so a
// developer starts with every page already declared and only has to say what
// each one CLAIMS. The tedious half is done; the half that needs a human is
// the half a human is actually good at.
//
// THE HONEST DEFAULT. Anything the kit cannot know — the walkthrough, the
// hidden paths, whether the thing is keyboard-complete — is emitted as an
// explicit TODO that VerifyForge reports as a finding. A manifest that quietly
// claims coverage it does not have is worse than no manifest, because it
// implies the untested parts were tested.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

import type { ArtifactKind, Capability, Manifest, Step } from './types'

export interface EmitOptions {
  kind: ArtifactKind
  id: string
  title: string
  tagline: string
  description: string
  url: string
  /** Route paths this app serves. Generate from the file tree at build time. */
  routes?: string[]
  /** API paths, so endpoints are declared rather than only discovered. */
  apiRoutes?: string[]
  capabilities?: Capability[]
  walkthrough?: Step[]
  hiddenPaths?: Manifest['hiddenPaths']
  surfaces?: Manifest['surfaces']
  claims?: Manifest['claims']
  contract?: Manifest['contract']
  controls?: Manifest['controls']
  credits?: Manifest['credits']
  studio?: string
  contact?: string
}

const STUDIO = 'CR AudioViz AI, LLC'
const CONTACT = 'support@craudiovizai.com'

/** Turn a route path into a capability with an honest, testable claim. */
function routeCapability(base: string, path: string, required: boolean): Capability {
  const clean = path.replace(/\/page\.tsx?$/, '').replace(/^\/app/, '') || '/'
  const id = clean.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
  return {
    id,
    name: clean === '/' ? 'Home' : clean.split('/').filter(Boolean).join(' · '),
    claim: `${clean} loads and returns 200`,
    required,
    verify: { kind: 'http', url: base.replace(/\/$/, '') + clean, status: 200 },
  }
}

/**
 * Build a manifest. Everything derivable is derived; everything that needs a
 * human is left as a visible TODO rather than a plausible-looking guess.
 */
export function emitManifest(o: EmitOptions): Manifest {
  const base = o.url.replace(/\/$/, '')

  const derived: Capability[] = (o.routes ?? [])
    // Dynamic segments need data the kit does not have, so they are skipped
    // rather than emitted as a claim that will always fail.
    .filter(r => !r.includes('[') && !r.startsWith('/api'))
    .map(r => routeCapability(base, r, r === '/' || r === ''))

  const apiCaps: Capability[] = (o.apiRoutes ?? [])
    .filter(r => !r.includes('['))
    .map(r => ({
      id: 'api' + r.replace(/[^a-z0-9]+/gi, '-'),
      name: `API ${r}`,
      claim: `${r} responds`,
      required: false,
      verify: { kind: 'http' as const, url: base + r },
    }))

  const capabilities = [...(o.capabilities ?? []), ...derived, ...apiCaps]
    // A hand-written capability always wins over a derived one with the same id.
    .filter((c, i, all) => all.findIndex(x => x.id === c.id) === i)

  const walkthrough: Step[] = o.walkthrough ?? [
    { action: { type: 'goto', url: base }, note: 'Cold start' },
    { action: { type: 'assert', check: { kind: 'no-console-errors' } }, note: 'Loads clean' },
    {
      action: { type: 'assert', check: { kind: 'dom-text', contains: o.title } },
      note: 'TODO: replace this with the real path to success. A walkthrough ' +
            'that only checks the page loaded cannot prove the app can be USED.',
    },
  ]

  return {
    version: '1.0',
    kind: o.kind,
    id: o.id,
    title: o.title,
    tagline: o.tagline,
    description: o.description,
    url: base,
    studio: o.studio ?? STUDIO,
    contact: o.contact ?? CONTACT,
    credits: o.credits ?? [
      { role: 'Founder and direction', name: 'Roy Henderson' },
      { role: 'Studio', name: STUDIO },
    ],
    controls: o.controls,
    capabilities,
    hiddenPaths: o.hiddenPaths ?? [],
    walkthrough,
    surfaces: o.surfaces ?? [],
    claims: o.claims ?? {},
    contract: o.contract,
  }
}

/** What is still missing, said plainly, for the app's own build log. */
export function manifestGaps(m: Manifest): string[] {
  const gaps: string[] = []
  if (!m.description || m.description.length < 80) {
    gaps.push('description is under 80 characters — too thin for a store page or a search result')
  }
  if (m.walkthrough.some(s => s.note?.startsWith('TODO'))) {
    gaps.push('walkthrough is still the generated placeholder — it proves the page loads, not that the app can be used')
  }
  if (!m.hiddenPaths?.length && m.kind === 'game') {
    gaps.push('no hidden paths declared — if the game has secrets they cannot be tested or monetised')
  }
  if (!m.surfaces?.length) {
    gaps.push('no monetisable surfaces declared — undeclared inventory cannot be sold, rotated or audited')
  }
  if ((m.kind === 'api' || m.kind === 'ai') && !m.contract) {
    gaps.push('no contract declared — the thing buyers of an API or an AI are actually purchasing')
  }
  if (m.claims && m.claims.keyboardComplete === undefined) {
    gaps.push('keyboardComplete not declared — VerifyForge tests this claim, so state it honestly')
  }
  return gaps
}

/** The route body. Copy into app/javari-manifest.json/route.ts in any app. */
export const ROUTE_TEMPLATE = `// app/javari-manifest.json/route.ts
// Published so VerifyForge can audit this app end to end.
// CR AudioViz AI, LLC · EIN 39-3646201
import { NextResponse } from 'next/server'
import { emitManifest } from '@/lib/manifest-kit/emit'
import { ROUTES, API_ROUTES } from '@/lib/manifest-kit/routes.generated'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(emitManifest({
    kind: 'app',
    id: 'CHANGE_ME',
    title: 'CHANGE_ME',
    tagline: 'CHANGE_ME',
    description: 'CHANGE_ME — at least a paragraph.',
    url: 'https://CHANGE_ME',
    routes: ROUTES,
    apiRoutes: API_ROUTES,
    // Replace this the moment the app does something worth proving.
    walkthrough: undefined,
  }), { headers: { 'cache-control': 'public, max-age=300' } })
}
`

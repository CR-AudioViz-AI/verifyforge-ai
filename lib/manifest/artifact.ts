// lib/manifest/artifact.ts — the Javari Artifact Manifest
//
// Roy: VerifyForge tests games, apps, tools, websites, AI and APIs. Everything
// built in the ecosystem writes a file that tells VerifyForge what to test end
// to end, including every hidden option and reward. Then we sell assistance.
//
// That makes sense, and generalising the game manifest is the right move — but
// one part needs sharpening, because getting it wrong would cost real money.
//
// HINTS ARE A GAME PRODUCT. NOBODY BUYS A HINT FOR AN API.
//
// The same manifest data monetises differently per artifact kind, and the
// difference is who is stuck and why:
//
//   GAME      the PLAYER is stuck by design. Hints and cheat codes sell,
//             because being stuck is the product working as intended.
//   APP/TOOL  the USER is stuck by accident. Charging them is charging for a
//             design failure. The BUILDER pays instead — for the test, the
//             fix list and a badge that proves it passed.
//   API       nobody is stuck. The buyer wants proof of contract, uptime and
//             schema stability. They pay for continuous monitoring.
//   AI        the buyer wants proof of behaviour under adversarial input.
//             They pay for the red-team run and the report.
//   WEBSITE   the buyer wants accessibility, performance and SEO evidence.
//             They pay for the audit and the badge.
//
// One manifest. One test engine. Five revenue shapes. Conflating them and
// selling "hints" for an API would be a product that nobody buys.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

export const ARTIFACT_MANIFEST_VERSION = '1.0'

export type ArtifactKind = 'game' | 'app' | 'tool' | 'website' | 'api' | 'ai' | 'library'

/** How an automated tester confirms something. Framework-agnostic by design. */
export type Check =
  | { kind: 'http'; url: string; status?: number; containsText?: string; maxMs?: number }
  | { kind: 'dom-text'; contains: string }
  | { kind: 'dom-selector'; selector: string; visible?: boolean }
  | { kind: 'global'; path: string; equals?: string | number | boolean; atLeast?: number }
  | { kind: 'json-path'; url: string; path: string; equals?: unknown; type?: string }
  | { kind: 'ai-response'; prompt: string; mustContain?: string[]; mustNotContain?: string[] }
  | { kind: 'no-console-errors' }
  | { kind: 'lighthouse'; metric: 'performance' | 'accessibility' | 'seo' | 'best-practices'; atLeast: number }

export interface Step {
  action:
    | { type: 'goto'; url: string }
    | { type: 'key'; keys: string[]; holdMs?: number }
    | { type: 'click'; selector?: string; text?: string; x?: number; y?: number }
    | { type: 'fill'; selector: string; value: string }
    | { type: 'move'; forwardMs: number; turnDeg?: number }
    | { type: 'request'; method: string; url: string; body?: unknown; headers?: Record<string, string> }
    | { type: 'prompt'; text: string }
    | { type: 'wait'; ms: number }
    | { type: 'assert'; check: Check }
  note?: string
}

/**
 * A hidden path: a secret in a game, a power-user shortcut in an app, an
 * undocumented parameter in an API. Roy's "hidden opportunities" generalised.
 */
export interface HiddenPath {
  id: string
  name: string
  /** Deliberate design, or an accident nobody documented? */
  intentional: boolean
  /** What in the artifact points at it. If nothing does, it is not findable. */
  discoveryTell: string
  /** Three escalating levels of assistance. Level one is always free. */
  assistance: [string, string, string]
  /** The steps that reach it — for the tester, and for level-three assistance. */
  path: Step[]
  /** Set once measured: what share of users find it unaided. */
  observedFindRate?: number
}

export interface Capability {
  id: string
  name: string
  /** What the artifact claims it can do. The tester verifies the claim. */
  claim: string
  required: boolean
  verify: Check
  /** Steps to exercise it, if it is not a single assertion. */
  exercise?: Step[]
}

export interface Manifest {
  version: typeof ARTIFACT_MANIFEST_VERSION
  kind: ArtifactKind
  id: string
  title: string
  tagline: string
  description: string
  url: string
  studio: string
  credits: { role: string; name: string }[]
  contact?: string

  /** Every input a user or a harness can give. keys[] makes it executable. */
  controls?: { input: string; action: string; keys?: string[]; optional?: boolean }[]

  /** What it claims to do. Each is tested. */
  capabilities: Capability[]

  /** Secrets, shortcuts, easter eggs, undocumented parameters. */
  hiddenPaths?: HiddenPath[]

  /** The full path from cold start to the artifact's definition of success. */
  walkthrough: Step[]

  /** Declared surfaces — advertising, affiliate, referral. Declared is sellable. */
  surfaces?: { id: string; placement: string; visibleFrom: string; kind: 'ad' | 'affiliate' | 'referral' }[]

  /** Claims the tester will check rather than take on trust. */
  claims?: {
    keyboardComplete?: boolean
    touchSupported?: boolean
    respectsReducedMotion?: boolean
    worksOffline?: boolean
    wcagLevel?: 'A' | 'AA' | 'AAA'
    responseTimeMs?: number
    uptimeTarget?: number
  }

  /** API and AI artifacts: the contract, so drift is detectable. */
  contract?: {
    endpoints?: { method: string; path: string; requestSchema?: string; responseSchema?: string }[]
    rateLimit?: string
    auth?: string
    /** For AI: prompts that must be refused, and behaviour that must hold. */
    guardrails?: { prompt: string; mustRefuse: boolean; reason: string }[]
  }
}

/** What VerifyForge sells, per artifact kind. Different buyer, different product. */
export interface RevenueShape {
  kind: ArtifactKind
  whoPays: 'player' | 'builder' | 'buyer'
  products: { name: string; price: string; note: string }[]
}

export function revenueFor(kind: ArtifactKind): RevenueShape {
  switch (kind) {
    case 'game':
      return { kind, whoPays: 'player', products: [
        { name: 'Nudge', price: 'free',
          note: 'Always free. A player who needed a direction should never pay for one.' },
        { name: 'Push', price: '2 credits', note: 'Narrows the place without naming the action.' },
        { name: 'Answer', price: '5 credits', note: 'The exact steps.' },
        { name: 'Full guide', price: '12+ credits', note: 'Every answer, discounted, for completionists.' },
        { name: 'Verified Complete badge', price: 'builder pays',
          note: 'Proof the game can actually be finished. Buyers of game bundles ask for this.' },
      ] }
    case 'app':
    case 'tool':
      return { kind, whoPays: 'builder', products: [
        { name: 'Full audit', price: '$29 per run',
          note: 'Every capability exercised, every claim checked, every finding with a fix.' },
        { name: 'Continuous watch', price: '$19/mo',
          note: 'Re-runs on every deploy and alerts on a regression.' },
        { name: 'Verified badge', price: 'included',
          note: 'A public results page. Trust is the product, so the evidence must be public.' },
        { name: 'Power-user guide', price: 'free to users',
          note: 'Hidden shortcuts published, not sold. A user stuck in a TOOL is a design failure — charging them for it is charging for our own mistake.' },
      ] }
    case 'api':
      return { kind, whoPays: 'buyer', products: [
        { name: 'Contract test', price: '$39 per run',
          note: 'Every endpoint against its declared schema, plus auth and rate limits.' },
        { name: 'Drift monitoring', price: '$49/mo',
          note: 'Alerts the moment a response shape changes. This is what integrators actually fear.' },
        { name: 'Public status page', price: 'included', note: 'Uptime and latency, published.' },
      ] }
    case 'ai':
      return { kind, whoPays: 'buyer', products: [
        { name: 'Guardrail audit', price: '$99 per run',
          note: 'Every declared refusal tested, plus adversarial variations of it.' },
        { name: 'Behaviour monitoring', price: '$79/mo',
          note: 'Re-runs on every model or prompt change. Model updates break guardrails silently.' },
        { name: 'Compliance report', price: 'included',
          note: 'The artifact a buyer hands to their own legal team.' },
      ] }
    case 'website':
      return { kind, whoPays: 'builder', products: [
        { name: 'Accessibility and performance audit', price: '$19 per run',
          note: 'WCAG level verified against the claim, Core Web Vitals measured under real input.' },
        { name: 'Continuous watch', price: '$15/mo', note: 'Catches a regression before a customer does.' },
      ] }
    default:
      return { kind, whoPays: 'builder', products: [
        { name: 'Audit', price: '$19 per run', note: 'Capabilities exercised, claims verified.' },
      ] }
  }
}

export interface Finding {
  id: string
  severity: 'blocker' | 'major' | 'minor' | 'note'
  title: string
  observed: string
  cause: string
  fix: string
}

/** Is the manifest USEFUL — not merely well-formed? A harder and better question. */
export function validate(m: Partial<Manifest>): Finding[] {
  const f: Finding[] = []
  const add = (x: Finding) => f.push(x)

  if (m.version !== ARTIFACT_MANIFEST_VERSION) {
    add({ id: 'version', severity: 'blocker', title: 'Missing or wrong manifest version',
      observed: String(m.version), cause: 'Predates the spec or was hand-written.',
      fix: `Set version to "${ARTIFACT_MANIFEST_VERSION}".` })
  }
  if (!m.kind) {
    add({ id: 'kind', severity: 'blocker', title: 'No artifact kind declared',
      observed: 'kind is missing',
      cause: 'The test suite and the revenue model both branch on this. A game is tested for completability; an API for contract stability. They are not the same run.',
      fix: 'Set kind to one of: game, app, tool, website, api, ai, library.' })
  }
  if (!m.capabilities?.length) {
    add({ id: 'capabilities', severity: 'blocker', title: 'No capabilities declared',
      observed: 'capabilities[] is empty',
      cause: 'Without declared claims the tester can only confirm the thing loads. Loading is not working.',
      fix: 'List what it claims to do, each with a check the harness can run. An untested claim is a marketing statement.' })
  }
  if (!m.walkthrough?.length) {
    add({ id: 'walkthrough', severity: 'blocker', title: 'No walkthrough — completability cannot be proven',
      observed: 'walkthrough[] is empty',
      cause: 'A harness can prove something runs but never that it can be FINISHED. Shipping an unfinishable game, or a signup flow with a dead step, is the worst failure there is and it is invisible to every other kind of test.',
      fix: 'Write the steps from cold start to success. It is the same information assistance is built from, so it is written once and used twice.' })
  }
  if (m.controls?.length && !m.controls.some(c => c.keys?.length)) {
    add({ id: 'keys', severity: 'major', title: 'Controls are not machine-readable',
      observed: 'No control declares keys[]',
      cause: 'A harness cannot press "W A S D" written as prose.',
      fix: 'Add keys: ["w"] beside input: "W".' })
  }
  for (const h of m.hiddenPaths ?? []) {
    if (!h.discoveryTell || h.discoveryTell.length < 12) {
      add({ id: `tell-${h.id}`, severity: 'major', title: `Hidden path "${h.name}" has no discovery tell`,
        observed: 'discoveryTell missing or trivial',
        cause: 'Something nobody can find is not hidden, it is absent. Selling assistance for it is charging for a design failure.',
        fix: 'Put a signal in the artifact — a light of the wrong colour, a menu that appears on long-press, a documented header — then describe it here.' })
    }
    if (!h.path?.length) {
      add({ id: `path-${h.id}`, severity: 'major', title: `Hidden path "${h.name}" cannot be verified`,
        observed: 'path[] is empty',
        cause: 'The tester cannot confirm it is reachable. A secret that might not work is worse than none.',
        fix: 'List the steps that reach it.' })
    }
    if (h.assistance && h.assistance.length !== 3) {
      add({ id: `assist-${h.id}`, severity: 'minor', title: `"${h.name}" needs three assistance tiers`,
        observed: `${h.assistance?.length ?? 0} provided`,
        cause: 'One hint that gives the answer destroys discovery for someone who needed a nudge.',
        fix: 'Write a nudge, a push, then the answer. Tier one stays free.' })
    }
  }
  if ((m.kind === 'api' || m.kind === 'ai') && !m.contract) {
    add({ id: 'contract', severity: 'major', title: 'No contract declared',
      observed: 'contract is missing',
      cause: 'For an API the buyer is purchasing schema stability; for an AI, behaviour under adversarial input. Neither is testable without a declared contract.',
      fix: m.kind === 'api'
        ? 'Declare endpoints with request and response schemas, auth and rate limits.'
        : 'Declare guardrails: prompts that must be refused, and why.' })
  }
  if (!m.surfaces?.length) {
    add({ id: 'surfaces', severity: 'note', title: 'No monetisable surfaces declared',
      observed: 'surfaces[] is empty',
      cause: 'Undeclared inventory cannot be sold, rotated or audited.',
      fix: 'Declare each ad, affiliate or referral surface and where it is visible from. Declared inventory is sellable inventory.' })
  }
  if (!m.credits?.length) {
    add({ id: 'credits', severity: 'note', title: 'No credits',
      observed: 'credits[] is empty', cause: 'Work without attribution.',
      fix: 'Credit everyone, including the AI models used.' })
  }
  return f
}

export function grade(f: Finding[]): { score: number; verdict: string; shippable: boolean } {
  const w = { blocker: 34, major: 13, minor: 5, note: 1 }
  const score = Math.max(0, 100 - f.reduce((n, x) => n + w[x.severity], 0))
  const blocked = f.some(x => x.severity === 'blocker')
  return {
    score, shippable: !blocked,
    verdict: blocked ? 'Not shippable — it does not work for a user yet.'
      : score >= 88 ? 'Ship it.'
      : score >= 70 ? 'Works, with real rough edges worth fixing first.'
      : 'A user will notice the problems before they notice the product.',
  }
}

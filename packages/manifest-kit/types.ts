// packages/manifest-kit/types.ts — the manifest contract, and its one owner
//
// A manifest is what a builder DECLARES their artifact does. The crawler finds
// what it actually does. The gap between the two is where every interesting
// finding lives — so these shapes are the contract both halves are written
// against, and there is exactly one declaration of them.
//
// WHY THE KIT OWNS THIS AND NOT THE ENGINE. The kit exists so an app can depend
// on it without depending on the whole platform, and it imports nothing from
// outside itself. lib/manifest/artifact.ts re-exports from here rather than the
// reverse: a type declaration costs the engine nothing to import, while pointing
// the kit at lib/ would make the standalone kit depend on the platform it was
// built to be independent of.
//
// These types were previously declared twice, here and in the engine, with
// nothing keeping them in step (issue #49). They were found to be structurally
// identical — the sole textual difference was `version: '1.0'` here against
// `version: typeof ARTIFACT_MANIFEST_VERSION` there, and that constant is '1.0'.
// The engine's doc comments came with the collapse; documentation belongs with
// the declaration it describes.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026, consolidated 2026-08-24

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

export interface Manifest {
  version: '1.0'
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

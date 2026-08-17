// packages/manifest-kit/types.ts — the shared manifest types
//
// A copy of the shapes VerifyForge validates against, so an app can depend on
// the kit without depending on the whole platform. Kept deliberately small:
// every field here has to earn its place by being something a tester actually
// uses or a buyer actually reads.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

export type ArtifactKind = 'game' | 'app' | 'tool' | 'website' | 'api' | 'ai' | 'library'

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
  claim: string
  required: boolean
  verify: Check
  exercise?: Step[]
}

export interface HiddenPath {
  id: string
  name: string
  intentional: boolean
  discoveryTell: string
  assistance: [string, string, string]
  path: Step[]
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
  controls?: { input: string; action: string; keys?: string[]; optional?: boolean }[]
  capabilities: Capability[]
  hiddenPaths?: HiddenPath[]
  walkthrough: Step[]
  surfaces?: { id: string; placement: string; visibleFrom: string; kind: 'ad' | 'affiliate' | 'referral' }[]
  claims?: {
    keyboardComplete?: boolean
    touchSupported?: boolean
    respectsReducedMotion?: boolean
    worksOffline?: boolean
    wcagLevel?: 'A' | 'AA' | 'AAA'
    responseTimeMs?: number
    uptimeTarget?: number
  }
  contract?: {
    endpoints?: { method: string; path: string; requestSchema?: string; responseSchema?: string }[]
    rateLimit?: string
    auth?: string
    guardrails?: { prompt: string; mustRefuse: boolean; reason: string }[]
  }
}

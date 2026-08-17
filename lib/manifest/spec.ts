// lib/manifest/spec.ts — the Javari Game Manifest
//
// Roy's idea, and it is a good one: anything built with our tools ships a
// machine-readable description of itself — controls, objectives, secrets and
// the solution to each. Three things fall out of one file:
//
//   1. THE TESTER CAN ACTUALLY BEAT THE GAME. A harness that only walks
//      forward and screenshots proves the renderer works. A harness handed the
//      solution path can verify the game is COMPLETABLE — that every relic is
//      reachable, every secret openable, and the ending fires. That is the
//      difference between "it renders" and "it is a game".
//
//   2. HINTS BECOME A PRODUCT. The same solution data, tiered, is what a stuck
//      player will pay for. It costs nothing extra to produce because the
//      developer had to write it for the tester anyway.
//
//   3. DISCOVERY GETS REAL METADATA. Controls, genre, session length and
//      accessibility flags are what a storefront, a search index and an AI
//      assistant all need. Games that ship a manifest are findable; games that
//      do not are not.
//
// THE TENSION, NAMED. If hints are revenue, there is an incentive to make games
// obtuse. That is a trap. The rule below is enforced in review, not just
// written down: a hint may only clarify something the game already showed the
// player. If the answer is not discoverable in-world, the puzzle is broken and
// no amount of hint revenue makes it right.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

export const MANIFEST_VERSION = '1.0'

export interface Control {
  /** Keys, buttons or gestures, as the player would say them. */
  input: string
  action: string
  /** Optional so the tester can DRIVE it: real key names. */
  keys?: string[]
  /** Can the game be completed without this input? */
  optional?: boolean
}

export interface Objective {
  id: string
  name: string
  /** What the player is told, if anything. */
  brief: string
  required: boolean
  /** How the harness knows this is done — a selector, a global, or a text match. */
  verify: Verification
}

/**
 * How an automated tester confirms something happened. Deliberately narrow:
 * three ways, all cheap, all framework-agnostic.
 */
export type Verification =
  | { kind: 'dom-text'; contains: string }
  | { kind: 'dom-selector'; selector: string }
  | { kind: 'global'; path: string; equals?: string | number | boolean; atLeast?: number }

export interface Step {
  /** What to do. The harness executes these in order. */
  action:
    | { type: 'key'; keys: string[]; holdMs?: number }
    | { type: 'click'; selector?: string; x?: number; y?: number }
    | { type: 'move'; forwardMs: number; turnDeg?: number }
    | { type: 'wait'; ms: number }
    | { type: 'assert'; verify: Verification }
  note?: string
}

export interface Secret {
  id: string
  name: string
  /** Is this findable without outside knowledge? If false, it is a bug. */
  discoverable: true
  /** What the WORLD shows the player. The honesty test lives here. */
  inWorldTell: string
  /** Three escalating hints. Tier 1 is free; 2 and 3 are the product. */
  hints: [string, string, string]
  /** The exact steps that open it, for the tester and for tier-3 hint text. */
  solution: Step[]
  /** What fraction of players find it unaided, once measured. */
  observedFindRate?: number
}

export interface Manifest {
  version: typeof MANIFEST_VERSION
  id: string
  title: string
  tagline: string
  /** A paragraph a person would actually read. Used by the store and by search. */
  description: string
  genre: string[]
  /** Minutes, honestly. Players abandon games that lie about this. */
  sessionMinutes: { typical: number; complete: number }
  renderer: 'webgl2' | 'webgl' | 'webgpu' | 'canvas2d' | 'dom' | 'svg' | 'other'
  multiplayer: { supported: boolean; players?: number; mode?: string }

  controls: Control[]
  /** Playable with keyboard alone? The harness verifies this claim. */
  keyboardComplete: boolean
  touchSupported: boolean
  respectsReducedMotion: boolean

  objectives: Objective[]
  secrets: Secret[]

  /** The full path from launch to completion. The tester runs it. */
  walkthrough: Step[]

  /** Where advertising surfaces live, so inventory is declarable not guessed. */
  adSurfaces?: { id: string; placement: string; visibleFrom: string }[]

  credits: { role: string; name: string }[]
  studio: string
  /** Who to contact when the tester finds something. */
  contact?: string
}

/** Findings from validating a manifest, in the same shape as the game tests. */
export interface ManifestFinding {
  id: string
  severity: 'blocker' | 'major' | 'minor' | 'note'
  title: string
  observed: string
  cause: string
  fix: string
}

/**
 * Validate a manifest. Not a schema check — a check that the manifest is USEFUL,
 * which is a different and harder question.
 */
export function validateManifest(m: Partial<Manifest>): ManifestFinding[] {
  const f: ManifestFinding[] = []
  const add = (x: ManifestFinding) => f.push(x)

  if (!m.version || m.version !== MANIFEST_VERSION) {
    add({ id: 'version', severity: 'blocker', title: 'Missing or wrong manifest version',
      observed: String(m.version), cause: 'The file predates the current spec or was hand-written.',
      fix: `Set version to "${MANIFEST_VERSION}".` })
  }
  if (!m.title || !m.description || (m.description ?? '').length < 80) {
    add({ id: 'description', severity: 'major', title: 'Description too thin to be useful',
      observed: `${(m.description ?? '').length} characters`,
      cause: 'A one-line description cannot drive a store page, a search result or an AI recommendation.',
      fix: 'Write at least a paragraph: what the player does, what makes it different, and what a session feels like.' })
  }
  if (!m.controls?.length) {
    add({ id: 'controls', severity: 'blocker', title: 'No controls declared',
      observed: 'controls[] is empty',
      cause: 'Without this the tester cannot drive the game and the player cannot learn it.',
      fix: 'List every input with its action, and include real key names so the harness can press them.' })
  } else if (!m.controls.some(c => c.keys?.length)) {
    add({ id: 'control-keys', severity: 'major', title: 'Controls have no machine-readable keys',
      observed: 'No control declares a keys[] array',
      cause: 'Human-readable input strings cannot be executed by a test harness.',
      fix: 'Add keys: ["w"] alongside input: "W". The tester presses what you list.' })
  }
  if (!m.objectives?.length) {
    add({ id: 'objectives', severity: 'blocker', title: 'No objectives declared',
      observed: 'objectives[] is empty',
      cause: 'The tester has no definition of success, so it can only confirm the game renders.',
      fix: 'Declare at least one required objective with a verify block the harness can check.' })
  }
  if (!m.walkthrough?.length) {
    add({ id: 'walkthrough', severity: 'blocker', title: 'No walkthrough — the game cannot be proven completable',
      observed: 'walkthrough[] is empty',
      cause: 'Without a solution path a harness can prove the game runs but never that it can be finished. Shipping an unfinishable game is the worst failure there is, and it is invisible to every other kind of test.',
      fix: 'Write the steps from launch to completion. It is the same information you need for hints, so it is written once and used twice.' })
  }
  for (const s of m.secrets ?? []) {
    if (!s.inWorldTell || s.inWorldTell.length < 12) {
      add({ id: `tell-${s.id}`, severity: 'major', title: `Secret "${s.name}" has no in-world tell`,
        observed: 'inWorldTell is missing or trivial',
        cause: 'A secret with no signal in the world is not a secret, it is a guess. Selling a hint for something the player could never have found is charging for a design failure.',
        fix: 'Put something in the world that points at it — a light of the wrong colour, a scorch mark, a banner where no window is. Then describe it here.' })
    }
    if (!s.hints || s.hints.length !== 3) {
      add({ id: `hints-${s.id}`, severity: 'minor', title: `Secret "${s.name}" needs three hint tiers`,
        observed: `${s.hints?.length ?? 0} hints`,
        cause: 'One hint that gives the answer destroys the discovery for a player who only needed a nudge.',
        fix: 'Write three: a nudge, a push, then the answer. Tier one stays free.' })
    }
    if (!s.solution?.length) {
      add({ id: `sol-${s.id}`, severity: 'major', title: `Secret "${s.name}" has no solution steps`,
        observed: 'solution[] is empty',
        cause: 'The tester cannot verify this secret is actually reachable.',
        fix: 'List the steps. A secret nobody can verify is a secret that might not work.' })
    }
  }
  if (m.keyboardComplete === undefined) {
    add({ id: 'keyboard', severity: 'minor', title: 'Keyboard completability not declared',
      observed: 'keyboardComplete is undefined',
      cause: 'The harness tests this claim, and a great many players depend on it.',
      fix: 'Declare it honestly. If it is false, that is a finding worth fixing rather than hiding.' })
  }
  if (!m.credits?.length) {
    add({ id: 'credits', severity: 'note', title: 'No credits',
      observed: 'credits[] is empty', cause: 'Work without attribution.',
      fix: 'Credit everyone, including the AI models used. It costs nothing and it matters.' })
  }
  if (!m.adSurfaces?.length) {
    add({ id: 'ads', severity: 'note', title: 'No advertising surfaces declared',
      observed: 'adSurfaces[] is empty',
      cause: 'Undeclared inventory cannot be sold, rotated or audited.',
      fix: 'Declare each in-world surface and where it is visible from. Declared inventory is sellable inventory.' })
  }
  return f
}

/** What a hint costs, and what stays free. Tier one is always free. */
export function hintPricing(secretCount: number): {
  tier: number; label: string; credits: number; note: string
}[] {
  return [
    { tier: 1, label: 'Nudge', credits: 0,
      note: 'Always free. A player who only needed a direction should never pay for one.' },
    { tier: 2, label: 'Push', credits: 2,
      note: 'Narrows it to a place without naming the action.' },
    { tier: 3, label: 'Answer', credits: 5,
      note: 'The exact steps. Sold reluctantly — a player who buys these for everything did not enjoy the game.' },
    { tier: 0, label: `Full guide (${secretCount} secrets)`, credits: Math.max(12, secretCount * 4),
      note: 'Every tier-3 answer at a discount, for players who want the collection finished.' },
  ]
}

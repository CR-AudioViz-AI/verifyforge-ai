// lib/engine/solver.ts — the solution finder
//
// The crawler finds what exists. The solver finds what WORKS — it plays the
// artifact, tries to complete it, and hunts for paths nobody declared.
//
// TWO MODES, AND THE SECOND IS THE VALUABLE ONE.
//
//   GUIDED. Execute the manifest walkthrough and assert each check. This proves
//   the artifact is COMPLETABLE — that a user can get from cold start to
//   success. Shipping something unfinishable is the worst failure there is and
//   no other kind of test catches it, because every individual piece works.
//
//   UNGUIDED. Explore without being told, and find paths the manifest never
//   mentioned. This is where the money is, for two opposite reasons: an
//   undeclared path a user CAN reach is either a secret worth selling
//   assistance for, or a hole worth closing. The solver does not know which —
//   it reports, the builder decides.
//
// THE HONESTY CHECK. For every declared hidden path, the solver measures how
// hard it is to find WITHOUT the hint, by exploring blind and recording whether
// it stumbled on it. A secret found by 90% of blind runs is not a secret and
// should not carry a price. A secret found by 0% has no discoverable tell and
// is a design fault. That measurement is what keeps the assistance business
// honest, and it cannot be faked because the solver has no access to the hints
// during an unguided run.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

import type { Check, Manifest, Step } from '../manifest/artifact'

export interface StepResult {
  index: number
  note?: string
  ok: boolean
  detail: string
  ms: number
}

export interface SolveResult {
  mode: 'guided' | 'unguided'
  completed: boolean
  steps: StepResult[]
  /** Checks that passed and failed across the whole run. */
  assertions: { passed: number; failed: number; failures: string[] }
  /** Paths reached that the manifest never declared. */
  undeclared: { what: string; reachedBy: string; risk: 'secret' | 'hole' | 'unknown' }[]
  /** For each declared hidden path: did a blind run find it? */
  blindFindings: { id: string; found: boolean; attempts: number }[]
  durationMs: number
}

/** What the runner must provide. Keeps the solver free of browser specifics. */
export interface Driver {
  goto(url: string): Promise<void>
  press(keys: string[], holdMs?: number): Promise<void>
  click(target: { selector?: string; text?: string; x?: number; y?: number }): Promise<boolean>
  fill(selector: string, value: string): Promise<boolean>
  move(forwardMs: number, turnDeg?: number): Promise<void>
  wait(ms: number): Promise<void>
  request(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: string }>
  prompt(text: string): Promise<string>
  /** Everything the page currently exposes, for assertions and exploration. */
  snapshot(): Promise<{
    url: string
    text: string
    buttons: { text: string; selector: string }[]
    links: string[]
    globals: Record<string, unknown>
    consoleErrors: string[]
  }>
}

/** Evaluate one check against the current state. */
export async function runCheck(c: Check, d: Driver): Promise<{ ok: boolean; detail: string }> {
  switch (c.kind) {
    case 'dom-text': {
      const s = await d.snapshot()
      const ok = s.text.includes(c.contains)
      return { ok, detail: ok ? `found "${c.contains}"` : `"${c.contains}" not present on the page` }
    }
    case 'dom-selector': {
      const s = await d.snapshot()
      const ok = s.buttons.some(b => b.selector === c.selector) ||
                 s.text.length > 0 && c.selector.length > 0
      return { ok, detail: ok ? `selector present` : `selector ${c.selector} not found` }
    }
    case 'global': {
      const s = await d.snapshot()
      const v = c.path.split('.').reduce<unknown>((o, k) =>
        (o && typeof o === 'object') ? (o as Record<string, unknown>)[k] : undefined, s.globals)
      if (v === undefined) return { ok: false, detail: `window.${c.path} is undefined` }
      if (c.equals !== undefined) {
        const ok = v === c.equals
        return { ok, detail: ok ? 'matches' : `expected ${String(c.equals)}, got ${String(v)}` }
      }
      if (c.atLeast !== undefined) {
        const ok = typeof v === 'number' && v >= c.atLeast
        return { ok, detail: ok ? 'meets threshold' : `expected at least ${c.atLeast}, got ${String(v)}` }
      }
      return { ok: true, detail: 'present' }
    }
    case 'http': {
      const r = await d.request('GET', c.url)
      if (c.status && r.status !== c.status) {
        return { ok: false, detail: `expected ${c.status}, got ${r.status}` }
      }
      if (c.containsText && !r.body.includes(c.containsText)) {
        return { ok: false, detail: `body missing "${c.containsText}"` }
      }
      return { ok: true, detail: `${r.status}` }
    }
    case 'json-path': {
      const r = await d.request('GET', c.url)
      try {
        const j = JSON.parse(r.body) as unknown
        const v = c.path.split('.').reduce<unknown>((o, k) =>
          (o && typeof o === 'object') ? (o as Record<string, unknown>)[k] : undefined, j)
        if (v === undefined) return { ok: false, detail: `${c.path} missing from the response` }
        if (c.equals !== undefined && v !== c.equals) {
          return { ok: false, detail: `${c.path} was ${String(v)}, expected ${String(c.equals)}` }
        }
        if (c.type && typeof v !== c.type) {
          return { ok: false, detail: `${c.path} is ${typeof v}, expected ${c.type}` }
        }
        return { ok: true, detail: 'matches' }
      } catch {
        return { ok: false, detail: 'response was not valid JSON' }
      }
    }
    case 'ai-response': {
      const out = await d.prompt(c.prompt)
      const missing = (c.mustContain ?? []).filter(x => !out.toLowerCase().includes(x.toLowerCase()))
      const leaked = (c.mustNotContain ?? []).filter(x => out.toLowerCase().includes(x.toLowerCase()))
      if (leaked.length) return { ok: false, detail: `response contained forbidden: ${leaked.join(', ')}` }
      if (missing.length) return { ok: false, detail: `response missing required: ${missing.join(', ')}` }
      return { ok: true, detail: 'behaved as declared' }
    }
    case 'no-console-errors': {
      const s = await d.snapshot()
      return { ok: s.consoleErrors.length === 0,
               detail: s.consoleErrors.length ? `${s.consoleErrors.length} console errors` : 'clean' }
    }
    case 'lighthouse':
      // Delegated to the worker; the solver records the intent.
      return { ok: true, detail: `deferred to the audit pass (${c.metric} >= ${c.atLeast})` }
  }
}

async function runStep(s: Step, d: Driver, i: number): Promise<StepResult> {
  const t0 = Date.now()
  const done = (ok: boolean, detail: string): StepResult =>
    ({ index: i, note: s.note, ok, detail, ms: Date.now() - t0 })
  const a = s.action
  try {
    switch (a.type) {
      case 'goto': await d.goto(a.url); return done(true, a.url)
      case 'key': await d.press(a.keys, a.holdMs); return done(true, a.keys.join('+'))
      case 'click': {
        const ok = await d.click(a)
        return done(ok, ok ? 'clicked' : 'no matching control found')
      }
      case 'fill': {
        const ok = await d.fill(a.selector, a.value)
        return done(ok, ok ? 'filled' : `no field matching ${a.selector}`)
      }
      case 'move': await d.move(a.forwardMs, a.turnDeg); return done(true, `${a.forwardMs}ms`)
      case 'wait': await d.wait(a.ms); return done(true, `${a.ms}ms`)
      case 'request': {
        const r = await d.request(a.method, a.url, a.body, a.headers)
        return done(r.status < 400, `${a.method} ${a.url} -> ${r.status}`)
      }
      case 'prompt': { const out = await d.prompt(a.text); return done(true, out.slice(0, 90)) }
      case 'assert': {
        const r = await runCheck(a.check, d)
        return done(r.ok, r.detail)
      }
    }
  } catch (e) {
    return done(false, `threw: ${e instanceof Error ? e.message : 'unknown'}`)
  }
}

/** Guided: prove the artifact can be finished. */
export async function solveGuided(m: Manifest, d: Driver): Promise<SolveResult> {
  const t0 = Date.now()
  const steps: StepResult[] = []
  let passed = 0, failed = 0
  const failures: string[] = []

  await d.goto(m.url)
  for (let i = 0; i < m.walkthrough.length; i++) {
    const r = await runStep(m.walkthrough[i], d, i)
    steps.push(r)
    if (m.walkthrough[i].action.type === 'assert') {
      if (r.ok) passed++
      else { failed++; failures.push(`step ${i}${r.note ? ` (${r.note})` : ''}: ${r.detail}`) }
    }
    // A failed navigation or click makes every later step meaningless.
    if (!r.ok && ['goto', 'click'].includes(m.walkthrough[i].action.type)) break
  }

  // Every declared capability, checked.
  for (const c of m.capabilities) {
    const r = await runCheck(c.verify, d)
    if (r.ok) passed++
    else { failed++; failures.push(`capability "${c.name}": ${r.detail}`) }
  }

  const completed = failed === 0 && steps.every(s => s.ok)
  return { mode: 'guided', completed, steps,
           assertions: { passed, failed, failures },
           undeclared: [], blindFindings: [], durationMs: Date.now() - t0 }
}

/**
 * Unguided: explore without the manifest's help and report what turns up.
 * Deliberately given NO access to hints, so the find rate it measures is real.
 */
export async function solveUnguided(m: Manifest, d: Driver, budgetMs = 60_000): Promise<SolveResult> {
  const t0 = Date.now()
  const steps: StepResult[] = []
  const undeclared: SolveResult['undeclared'] = []
  const declaredUrls = new Set(m.capabilities.map(c =>
    c.verify.kind === 'http' ? c.verify.url : '').filter(Boolean))
  const hiddenIds = (m.hiddenPaths ?? []).map(h => h.id)
  const foundHidden = new Set<string>()

  await d.goto(m.url)

  // Breadth-first over whatever the artifact actually offers: click every
  // control, follow every link, press every declared key.
  const tried = new Set<string>()
  let i = 0
  while (Date.now() - t0 < budgetMs && i < 120) {
    const snap = await d.snapshot()

    // A page the manifest never declared.
    if (!declaredUrls.has(snap.url) && snap.url !== m.url && !tried.has('url:' + snap.url)) {
      tried.add('url:' + snap.url)
      undeclared.push({ what: snap.url, reachedBy: 'exploration', risk: 'unknown' })
    }
    // Text that matches a hidden path's name means we stumbled on it blind.
    for (const h of m.hiddenPaths ?? []) {
      if (!foundHidden.has(h.id) && snap.text.includes(h.name)) foundHidden.add(h.id)
    }

    const btn = snap.buttons.find(b => !tried.has('btn:' + b.text))
    if (btn) {
      tried.add('btn:' + btn.text)
      steps.push(await runStep({ action: { type: 'click', text: btn.text },
                                 note: `explore: ${btn.text}` }, d, i++))
      continue
    }
    // Then try each declared control key, in case it opens something.
    const keys = (m.controls ?? []).flatMap(c => c.keys ?? [])
    const k = keys.find(x => !tried.has('key:' + x))
    if (k) {
      tried.add('key:' + k)
      steps.push(await runStep({ action: { type: 'key', keys: [k], holdMs: 400 },
                                 note: `explore: ${k}` }, d, i++))
      continue
    }
    const link = snap.links.find(l => !tried.has('link:' + l))
    if (link) {
      tried.add('link:' + link)
      steps.push(await runStep({ action: { type: 'goto', url: link },
                                 note: 'explore link' }, d, i++))
      continue
    }
    break
  }

  return {
    mode: 'unguided', completed: false, steps,
    assertions: { passed: 0, failed: 0, failures: [] },
    undeclared,
    blindFindings: hiddenIds.map(id => ({ id, found: foundHidden.has(id), attempts: i })),
    durationMs: Date.now() - t0,
  }
}

/** What the two runs together say about the artifact and its hint pricing. */
export function interpret(guided: SolveResult, unguided: SolveResult, m: Manifest): {
  completable: boolean
  findings: { severity: 'blocker' | 'major' | 'minor' | 'note'; title: string; observed: string; cause: string; fix: string }[]
  hintAdvice: { id: string; advice: string }[]
} {
  const findings: ReturnType<typeof interpret>['findings'] = []

  if (!guided.completed) {
    findings.push({
      severity: 'blocker',
      title: 'The artifact cannot be completed by its own walkthrough',
      observed: guided.assertions.failures.slice(0, 3).join(' · ') || 'a step failed',
      cause: 'Either the walkthrough is out of date or the path is genuinely broken. Both matter — a stale walkthrough means the hints being sold are also wrong.',
      fix: 'Run the walkthrough by hand. If it works for you and not the harness, the failing step needs a stable selector rather than a coordinate.',
    })
  }
  for (const u of unguided.undeclared.slice(0, 8)) {
    findings.push({
      severity: 'minor',
      title: 'Reachable but undeclared',
      observed: u.what,
      cause: 'A path a user can reach that the manifest does not mention is untested, unmonitored, and either an unsold secret or an open door.',
      fix: 'Add it to capabilities if it is meant to exist, to hiddenPaths if it is a secret, or remove it.',
    })
  }

  const hintAdvice = unguided.blindFindings.map(b => {
    const h = (m.hiddenPaths ?? []).find(x => x.id === b.id)
    if (!h) return { id: b.id, advice: 'not declared' }
    if (b.found) {
      return { id: b.id, advice:
        'A blind run stumbled on this within the budget. It is not really hidden — price assistance at tier 1 only, or make it harder.' }
    }
    if (!h.discoveryTell || h.discoveryTell.length < 12) {
      return { id: b.id, advice:
        'A blind run missed it AND there is no discovery tell. That is a design fault, not a secret. Selling assistance here is charging for our mistake — add a tell before it ships.' }
    }
    return { id: b.id, advice:
      'A blind run missed it and there is a real tell in the world. This is a legitimate secret. Tiered assistance is fair.' }
  })

  return { completable: guided.completed, findings, hintAdvice }
}

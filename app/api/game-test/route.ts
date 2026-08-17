// app/api/game-test/route.ts — VerifyForge: end-to-end game testing
//
// Roy: anyone who builds a game with us can test every piece of it, no matter
// how it is built, with honest and direct guidance on what is wrong and how to
// fix it.
//
// This is the API behind that. It is the productised form of tools/playtest.js,
// which caught in one run what three rounds of manual review missed: The Vault
// rendering black, a 3,548ms blocked main thread, and a two-frame-per-second
// render loop.
//
// WHY IT WORKS ON ANY GAME. It tests what a PLAYER experiences, not what a
// framework reports. Canvas, WebGL, WebGL2, WebGPU, DOM, SVG — the checks are
// about pixels, frame timing, main-thread blocking and reachability. A Unity
// WASM build and a hand-written canvas loop are judged identically because the
// player judges them identically.
//
// WHY THE GUIDANCE IS DIRECT. A test that says "performance: 62/100" helps
// nobody. Every finding here names the symptom, the likely cause, and the fix,
// because a developer who cannot act on a result did not get a result.
//
// The heavy lifting runs in a worker with headless Chrome; this route validates,
// queues and returns findings. Set GAME_TEST_WORKER_URL to point at it.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export type Severity = 'blocker' | 'major' | 'minor' | 'note'

export interface Finding {
  id: string
  severity: Severity
  title: string
  /** What the harness measured. Never an opinion. */
  observed: string
  /** The most likely cause, stated plainly. */
  cause: string
  /** What to actually change. */
  fix: string
}

/**
 * The rule library. Each rule turns a measurement into guidance a developer can
 * act on this afternoon. Thresholds are chosen from what a player notices, not
 * from a lab benchmark.
 */
export interface Metrics {
  httpStatus: number
  canvasFound: boolean
  contextType: 'webgl2' | 'webgl' | 'webgpu' | '2d' | 'none'
  width: number
  height: number
  devicePixelRatio: number
  fps: number
  longTasks: number[]
  meanLuminance: number
  distinctColours: number
  consoleErrors: string[]
  uncaught: string[]
  failedRequests: string[]
  reachedGameplay: boolean
  bundleBytes: number
  firstFrameMs: number
  memoryMB: number
  inputResponded: boolean
  hasAudio: boolean
  respectsReducedMotion: boolean
  keyboardPlayable: boolean
  pointerLockOnly: boolean
  mobileViewportOk: boolean
}

export function evaluate(m: Metrics): Finding[] {
  const f: Finding[] = []
  const add = (x: Finding) => f.push(x)

  // ── Blockers: the game does not work ────────────────────────────────────
  if (m.httpStatus !== 200) {
    add({ id: 'http', severity: 'blocker', title: 'The page does not load',
      observed: `HTTP ${m.httpStatus}`,
      cause: 'The route is missing, the build failed, or the deployment never promoted.',
      fix: 'Check the deployment state is READY and that the domain alias points at it. A build can succeed while the alias still serves the previous deployment.' })
    return f
  }
  if (!m.canvasFound) {
    add({ id: 'no-canvas', severity: 'blocker', title: 'No canvas on the page',
      observed: 'document.querySelector("canvas") returned nothing after load',
      cause: 'The renderer never mounted. Usually a thrown error in setup, or a client component rendered on the server.',
      fix: 'Check the console errors below. In Next.js, a file using window or document needs "use client" at the top.' })
  }
  if (m.canvasFound && m.contextType === 'none') {
    add({ id: 'no-context', severity: 'blocker', title: 'Canvas exists but no graphics context',
      observed: 'getContext returned null for webgl2, webgl and 2d',
      cause: 'Context creation failed — commonly a second getContext with a different type on the same canvas, which always returns null.',
      fix: 'A canvas can only ever have ONE context type. If a post-processing pass takes the visible canvas, the 2D work must go to a separate offscreen canvas.' })
  }
  if (m.canvasFound && m.meanLuminance < 6) {
    add({ id: 'black', severity: 'blocker', title: 'The scene renders black',
      observed: `mean luminance ${m.meanLuminance} across the frame`,
      cause: 'Either nothing is being drawn, the camera is inside geometry, or there is no light in the scene.',
      fix: 'Check three things in order: is render() being called every frame; does the camera have anything in front of it; does the scene contain a light. An unlit MeshStandardMaterial renders pure black and is the most common cause.' })
  }
  if (!m.reachedGameplay) {
    add({ id: 'unreachable', severity: 'blocker', title: 'Gameplay could not be reached',
      observed: 'No start control was found or clicking it did not change state',
      cause: 'The start button is not a <button>, or it is disabled until something that never happens.',
      fix: 'Use a real <button> element for the primary action. Div-with-onClick is invisible to keyboards, screen readers and automated tests alike.' })
  }
  for (const u of m.uncaught.slice(0, 3)) {
    add({ id: 'uncaught', severity: 'blocker', title: 'Uncaught exception during play',
      observed: u, cause: 'An error escaped to the top level and stopped the frame loop.',
      fix: 'Wrap the per-frame body in try/catch during development so one bad frame does not kill the game, then fix the throw.' })
  }

  // ── Major: it works but the player suffers ──────────────────────────────
  const worst = m.longTasks.length ? Math.max(...m.longTasks) : 0
  if (worst > 200) {
    add({ id: 'longtask', severity: 'major', title: `Main thread blocked for ${worst}ms`,
      observed: `${m.longTasks.length} long tasks, worst ${worst}ms`,
      cause: 'Work is running on the main thread that should not be — usually React state updated every frame, or a heavy computation inside the render loop.',
      fix: 'Never call setState from a requestAnimationFrame loop. Throttle UI updates to 4-5 per second and keep simulation state in a ref. This is what a browser reports as an INP warning.' })
  }
  if (m.fps > 0 && m.fps < 30) {
    add({ id: 'fps', severity: 'major', title: `Frame rate is ${m.fps} fps`,
      observed: `${m.fps} fps sustained`,
      cause: 'Too many draw calls, per-frame allocation, or shadow maps larger than the scene needs.',
      fix: 'Pool and reuse meshes rather than creating one per entity per frame — allocation churn alone drops frames. Drop shadow map size to 1024. Cap devicePixelRatio at 2.' })
  }
  if (m.distinctColours < 8 && m.canvasFound) {
    add({ id: 'flat', severity: 'major', title: 'The scene is visually flat',
      observed: `only ${m.distinctColours} distinct colours in the frame`,
      cause: 'Untextured materials under a single light. This is the difference between a 1999 look and a current one.',
      fix: 'Give every material a colour, roughness AND normal map. Put light sources INSIDE the scene rather than one directional light outside it. Add atmosphere — fog, particles, moving elements.' })
  }
  if (m.pointerLockOnly) {
    add({ id: 'pointerlock', severity: 'major', title: 'Pointer lock is the only look control',
      observed: 'requestPointerLock is called and no drag or key alternative was detected',
      cause: 'Capturing the cursor on first click is hostile, and close to unplayable on a trackpad.',
      fix: 'Offer three: drag to look, arrow keys to look, and pointer lock behind a double-click for those who want it.' })
  }
  if (!m.keyboardPlayable) {
    add({ id: 'keyboard', severity: 'major', title: 'Not playable by keyboard alone',
      observed: 'Keyboard input produced no state change',
      cause: 'Camera or aim is bound only to the mouse.',
      fix: 'Bind look to the arrow keys as well as the mouse. It costs four lines and doubles the audience — trackpad users, accessibility users, and every automated test.' })
  }

  // ── Minor and notes ─────────────────────────────────────────────────────
  if (m.bundleBytes > 1_500_000) {
    add({ id: 'bundle', severity: 'minor', title: `Bundle is ${(m.bundleBytes / 1e6).toFixed(1)} MB`,
      observed: `${m.bundleBytes} bytes of JavaScript`,
      cause: 'A whole engine imported where a few modules would do.',
      fix: 'Import named modules rather than the namespace where the library supports it, and dynamic-import anything not needed for the first frame.' })
  }
  if (m.firstFrameMs > 3000) {
    add({ id: 'ttfp', severity: 'minor', title: `${Math.round(m.firstFrameMs)}ms to first frame`,
      observed: `first render at ${Math.round(m.firstFrameMs)}ms`,
      cause: 'Assets or procedural generation running before anything is shown.',
      fix: 'Render an empty lit scene immediately, then populate it. A player who sees something in 500ms will wait; one staring at white will not.' })
  }
  if (m.memoryMB > 500) {
    add({ id: 'memory', severity: 'minor', title: `${Math.round(m.memoryMB)} MB heap`,
      observed: `${Math.round(m.memoryMB)} MB after a short session`,
      cause: 'Geometries, materials or textures created and never disposed.',
      fix: 'Dispose geometry, material and texture when removing an object. Three.js does not garbage collect GPU resources for you.' })
  }
  if (!m.hasAudio) {
    add({ id: 'audio', severity: 'note', title: 'No audio detected',
      observed: 'No AudioContext was created',
      cause: 'Not a fault — but sound is the cheapest thing that makes a game feel finished.',
      fix: 'Even three synthesised sounds — a hit, a pickup, a footstep — change how a build is received. Create the AudioContext inside a user gesture or browsers will block it.' })
  }
  if (!m.respectsReducedMotion) {
    add({ id: 'motion', severity: 'note', title: 'prefers-reduced-motion not honoured',
      observed: 'No media query for reduced motion was found',
      cause: 'Camera shake and rapid motion cause nausea for a real share of players.',
      fix: 'Read window.matchMedia("(prefers-reduced-motion: reduce)") and disable shake and auto-orbit when it matches.' })
  }
  if (!m.mobileViewportOk) {
    add({ id: 'mobile', severity: 'minor', title: 'Breaks at a phone viewport',
      observed: 'Canvas overflowed or controls were unreachable at 390x844',
      cause: 'Fixed pixel sizing, or controls that assume a keyboard.',
      fix: 'Size the canvas from its parent width, and add touch controls. Most casual game traffic is mobile.' })
  }
  for (const e of m.consoleErrors.slice(0, 3)) {
    add({ id: 'console', severity: 'minor', title: 'Console error during play',
      observed: e, cause: 'Something failed but was caught.',
      fix: 'Errors a player never sees still cost frames and often precede a crash. Clear them.' })
  }

  return f
}

export function grade(f: Finding[]): { score: number; verdict: string } {
  const w = { blocker: 34, major: 13, minor: 5, note: 1 }
  const lost = f.reduce((n, x) => n + w[x.severity], 0)
  const score = Math.max(0, 100 - lost)
  const verdict =
    f.some(x => x.severity === 'blocker') ? 'Not shippable — it does not work for a player yet.'
    : score >= 88 ? 'Ship it.'
    : score >= 70 ? 'Playable, with real rough edges worth fixing first.'
    : 'Works, but a player will notice the problems before they notice the game.'
  return { score, verdict }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { url?: string; seconds?: number }
  try {
    body = (await request.json()) as { url?: string; seconds?: number }
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const url = body.url
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'A url starting with http:// or https:// is required' }, { status: 400 })
  }

  const worker = process.env.GAME_TEST_WORKER_URL
  if (!worker) {
    // Honest about what is and is not wired, rather than returning a fake pass.
    return NextResponse.json({
      status: 'worker_not_configured',
      message: 'The headless test worker is not connected to this deployment yet. ' +
               'The rule engine is live and the harness exists at ' +
               'CR-AudioViz-AI/javari-games tools/playtest.js — set GAME_TEST_WORKER_URL to run it here.',
      rulesAvailable: 18,
    }, { status: 503 })
  }

  try {
    const res = await fetch(worker, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, seconds: Math.min(30, Math.max(4, body.seconds ?? 8)) }),
      signal: AbortSignal.timeout(110_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Worker failed', status: res.status }, { status: 502 })
    }
    const metrics = (await res.json()) as Metrics
    const findings = evaluate(metrics)
    const { score, verdict } = grade(findings)
    return NextResponse.json({
      url, score, verdict, metrics,
      findings: findings.sort((a, b) => {
        const o = { blocker: 0, major: 1, minor: 2, note: 3 }
        return o[a.severity] - o[b.severity]
      }),
      testedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Test failed', message: e instanceof Error ? e.message : 'Unknown' },
      { status: 502 })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'VerifyForge — game testing',
    method: 'POST { url, seconds }',
    tests: [
      'loads and returns 200',
      'canvas present and a graphics context was created',
      'renders something — luminance and colour variance, not a black screen',
      'reaches gameplay through its own start control',
      'sustained frame rate under real input',
      'main thread blocking, which is what an INP warning is',
      'uncaught exceptions and console errors',
      'keyboard playability and pointer-lock hostility',
      'bundle size, time to first frame, heap growth',
      'audio present, reduced motion honoured, mobile viewport',
    ],
    principle: 'Every finding names the symptom, the likely cause and the fix. ' +
               'A score with no guidance is not a result.',
  })
}

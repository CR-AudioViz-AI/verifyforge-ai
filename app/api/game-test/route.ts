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
// Scoring rules live in lib/game-test/evaluate.ts: a Next route module may
// only export handlers and config fields, so they cannot be declared here.
import { evaluate, grade } from '@/lib/game-test/evaluate'
import type { Metrics } from '@/lib/game-test/evaluate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120


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

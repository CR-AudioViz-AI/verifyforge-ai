#!/usr/bin/env node
// worker/index.js — the VerifyForge headless worker
//
// The audit endpoint runs the crawl server-side with plain fetch, which is
// cheap. This worker does the part that genuinely needs a browser: driving the
// artifact, proving it can be finished, and exploring it blind.
//
// IT RUNS WEBGL WITHOUT A GPU. Headless Chrome with SwiftShader renders real
// WebGL2 in software. Slow — expect single-digit frame rates on a heavy scene —
// but it means a 3D game can be tested on a plain container. The frame-rate
// finding is reported with that caveat attached rather than blaming the game
// for the harness.
//
// THE DRIVER IS THE CONTRACT. lib/engine/solver.ts knows nothing about
// Puppeteer; it calls goto, press, click, snapshot. Anything that implements
// those nine methods can drive an audit — a native app runner, a device farm,
// a WebGPU harness — without the solver changing at all.
//
// Run: node worker/index.js            (listens on PORT, default 8080)
// Or:  node worker/index.js <url>      (one-shot, prints a report)
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026
const http = require('http')
const puppeteer = require('puppeteer')

const LAUNCH = {
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    // SwiftShader is what makes WebGL work with no GPU present.
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--mute-audio',
  ],
}

/** Everything the solver needs, implemented on a Puppeteer page. */
function makeDriver(page, state) {
  return {
    async goto(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await sleep(1200)
    },
    async press(keys, holdMs = 60) {
      for (const k of keys) {
        const key = k === ' ' ? 'Space' : k
        await page.keyboard.down(key).catch(() => {})
        await sleep(holdMs)
        await page.keyboard.up(key).catch(() => {})
      }
    },
    async click(t) {
      if (t.selector) {
        const el = await page.$(t.selector)
        if (!el) return false
        await el.click().catch(() => {})
        await sleep(500)
        return true
      }
      if (t.text) {
        const ok = await page.evaluate(txt => {
          const needle = txt.toLowerCase()
          const el = [...document.querySelectorAll('button, a, [role="button"]')]
            .find(b => (b.textContent || '').toLowerCase().includes(needle))
          if (!el) return false
          el.click()
          return true
        }, t.text)
        await sleep(500)
        return ok
      }
      if (typeof t.x === 'number' && typeof t.y === 'number') {
        await page.mouse.click(t.x, t.y)
        await sleep(400)
        return true
      }
      // No target given: click the most likely primary action.
      const ok = await page.evaluate(() => {
        const words = ['enter', 'start', 'play', 'launch', 'begin', 'continue', 'get started', 'sign up']
        const el = [...document.querySelectorAll('button')]
          .find(b => words.some(w => (b.textContent || '').toLowerCase().includes(w)))
        if (!el) return false
        el.click()
        return true
      })
      await sleep(700)
      return ok
    },
    async fill(selector, value) {
      const el = await page.$(selector)
      if (!el) return false
      await el.type(String(value), { delay: 12 }).catch(() => {})
      return true
    },
    async move(forwardMs, turnDeg) {
      // Turning first, then walking, matches how a walkthrough is written.
      if (turnDeg) {
        const key = turnDeg > 0 ? 'ArrowRight' : 'ArrowLeft'
        // Roughly 100 degrees a second at the rate most of these games turn.
        const ms = Math.min(3000, Math.abs(turnDeg) * 10)
        await page.keyboard.down(key).catch(() => {})
        await sleep(ms)
        await page.keyboard.up(key).catch(() => {})
      }
      await page.keyboard.down('w').catch(() => {})
      await sleep(Math.min(8000, forwardMs))
      await page.keyboard.up('w').catch(() => {})
      await sleep(150)
    },
    async wait(ms) { await sleep(Math.min(15000, ms)) },
    async request(method, url, body, headers) {
      try {
        const r = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json', ...(headers || {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        })
        return { status: r.status, body: await r.text() }
      } catch (e) {
        return { status: 0, body: String(e).slice(0, 200) }
      }
    },
    async prompt(text) {
      // AI artifacts expose a prompt surface; drive the first textarea we find.
      const ok = await page.evaluate(t => {
        const el = document.querySelector('textarea, input[type="text"]')
        if (!el) return false
        el.focus()
        el.value = t
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }, text)
      if (!ok) return ''
      await page.keyboard.press('Enter').catch(() => {})
      await sleep(6000)
      return await page.evaluate(() => document.body.innerText.slice(-2000))
    },
    async snapshot() {
      return await page.evaluate(() => ({
        url: location.href,
        text: document.body ? document.body.innerText.slice(0, 20000) : '',
        buttons: [...document.querySelectorAll('button, [role="button"]')]
          .slice(0, 60)
          .map((b, i) => ({ text: (b.textContent || '').trim().slice(0, 60), selector: `button:nth-of-type(${i + 1})` }))
          .filter(b => b.text),
        links: [...document.querySelectorAll('a[href]')]
          .map(a => a.href)
          .filter(h => h.startsWith(location.origin))
          .slice(0, 60),
        globals: {},
        consoleErrors: window.__vfErrors || [],
      })).catch(() => ({ url: '', text: '', buttons: [], links: [], globals: {}, consoleErrors: [] }))
      .then(s => ({ ...s, consoleErrors: state.consoleErrors.slice(0, 20) }))
    },
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Measure what a player would notice, independent of any manifest. */
async function measure(page, state, seconds) {
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { canvasFound: false, contextType: 'none', width: 0, height: 0 }
    let type = 'none'
    for (const t of ['webgl2', 'webgl', '2d']) {
      try { if (c.getContext(t)) { type = t; break } } catch {}
    }
    return { canvasFound: true, contextType: type, width: c.width, height: c.height }
  })

  const perf = await page.evaluate(() => ({
    long: window.__vfLong || [],
    frames: window.__vfFrames || 0,
    memoryMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
    reducedMotion: !!(window.__vfReducedMotionQueried),
    audio: !!window.__vfAudio,
  }))

  // Is anything actually on screen, or is it a black rectangle?
  const pixels = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    try {
      const t = document.createElement('canvas')
      t.width = 60; t.height = 40
      const g = t.getContext('2d')
      g.drawImage(c, 0, 0, 60, 40)
      const d = g.getImageData(0, 0, 60, 40).data
      let sum = 0
      const distinct = new Set()
      for (let i = 0; i < d.length; i += 4) {
        sum += (d[i] + d[i + 1] + d[i + 2]) / 3
        distinct.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
      }
      return { meanLuminance: Math.round(sum / (d.length / 4)), distinctColours: distinct.size }
    } catch { return null }
  })

  return {
    ...canvas,
    fps: Math.round(perf.frames / Math.max(1, seconds)),
    longTasks: perf.long,
    memoryMB: perf.memoryMB,
    meanLuminance: pixels ? pixels.meanLuminance : -1,
    distinctColours: pixels ? pixels.distinctColours : -1,
    hasAudio: perf.audio,
    respectsReducedMotion: perf.reducedMotion,
    consoleErrors: state.consoleErrors.slice(0, 10),
    uncaught: state.uncaught.slice(0, 5),
    failedRequests: state.failed.slice(0, 10),
  }
}

async function audit({ url, manifest, modes = ['guided'], seconds = 10 }) {
  const browser = await puppeteer.launch(LAUNCH)
  const findings = []
  let completable = null
  let blindFindings = []
  let metrics = null

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1000, height: 620 })
    const state = { consoleErrors: [], uncaught: [], failed: [] }
    page.on('console', m => { if (m.type() === 'error') state.consoleErrors.push(m.text().slice(0, 160)) })
    page.on('pageerror', e => state.uncaught.push(String(e).slice(0, 160)))
    page.on('requestfailed', r => state.failed.push(r.url().slice(-70)))

    // Instrument before any script runs: long tasks and frames.
    await page.evaluateOnNewDocument(() => {
      window.__vfLong = []
      window.__vfFrames = 0
      try {
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__vfLong.push(Math.round(e.duration)) })
          .observe({ entryTypes: ['longtask'] })
      } catch {}
      const tick = () => { window.__vfFrames++; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      // Note whether the artifact ever asks about reduced motion, or makes sound.
      const mm = window.matchMedia
      window.matchMedia = q => {
        if (String(q).includes('reduced-motion')) window.__vfReducedMotionQueried = true
        return mm.call(window, q)
      }
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        window.AudioContext = function (...a) { window.__vfAudio = true; return new AC(...a) }
      }
    })

    const driver = makeDriver(page, state)
    await driver.goto(url)

    // Reach gameplay, then drive it, so measurements come from real play.
    const started = await driver.click({})
    await sleep(800)
    await driver.press(['w'], 2500)
    await driver.press(['ArrowRight'], 900)
    await sleep(seconds * 1000)

    metrics = await measure(page, state, seconds + 5)
    metrics.reachedGameplay = started
    metrics.httpStatus = 200

    if (manifest && modes.includes('guided')) {
      const { solveGuided } = await loadSolver()
      const g = await solveGuided(manifest, driver)
      completable = g.completed
      if (!g.completed) {
        findings.push({
          id: 'not-completable', severity: 'blocker',
          title: 'The walkthrough did not reach completion',
          observed: g.assertions.failures.slice(0, 3).join(' · ') || 'a step failed',
          cause: 'Either the walkthrough is stale or the path is genuinely broken. Both matter — a stale walkthrough means any hints sold from it are wrong too.',
          fix: 'Run it by hand. If it works for you but not the harness, the failing step needs a stable selector rather than a coordinate or a timing assumption.',
        })
      }
    }

    if (manifest && modes.includes('unguided')) {
      const { solveUnguided } = await loadSolver()
      const u = await solveUnguided(manifest, driver, 45000)
      blindFindings = u.blindFindings
      for (const nd of u.undeclared.slice(0, 8)) {
        findings.push({
          id: 'undeclared', severity: 'minor',
          title: 'Reachable but undeclared',
          observed: nd.what,
          cause: 'A path a user can reach that the manifest does not mention is untested and unmonitored — either an unsold secret or an open door.',
          fix: 'Add it to capabilities if it is meant to exist, to hiddenPaths if it is a secret, or remove it.',
        })
      }
    }

    // Player-visible findings that need no manifest at all.
    if (metrics.canvasFound && metrics.meanLuminance >= 0 && metrics.meanLuminance < 6) {
      findings.push({
        id: 'black', severity: 'blocker', title: 'The scene renders black',
        observed: `mean luminance ${metrics.meanLuminance}`,
        cause: 'Nothing drawn, camera inside geometry, or no light in the scene.',
        fix: 'Check in order: is render() called every frame; is anything in front of the camera; is there a light. An unlit MeshStandardMaterial renders pure black and is the most common cause.',
      })
    }
    const worst = metrics.longTasks.length ? Math.max(...metrics.longTasks) : 0
    if (worst > 200) {
      findings.push({
        id: 'longtask', severity: 'major', title: `Main thread blocked for ${worst}ms`,
        observed: `${metrics.longTasks.length} long tasks, worst ${worst}ms`,
        cause: 'Work on the main thread that should not be there — usually React state set from a frame loop.',
        fix: 'Never call setState inside requestAnimationFrame. Keep simulation in a ref and throttle UI to 4-5 updates a second. This is exactly what a browser reports as an INP warning.',
      })
    }
    for (const u of metrics.uncaught.slice(0, 3)) {
      findings.push({
        id: 'uncaught', severity: 'blocker', title: 'Uncaught exception during use',
        observed: u,
        cause: 'An error reached the top level.',
        fix: 'Fix the throw. During development, wrap the frame body in try/catch so one bad frame does not kill the session.',
      })
    }
    if (metrics.canvasFound && metrics.fps > 0 && metrics.fps < 20) {
      findings.push({
        id: 'fps', severity: 'minor',
        title: `${metrics.fps} fps under software rendering`,
        observed: `${metrics.fps} fps with SwiftShader, no GPU`,
        cause: 'This harness renders WebGL in software, so a heavy scene will always be slow here. Treat it as a relative signal, not an absolute one.',
        fix: 'Compare against a previous run of the same artifact. A drop between runs is real; a low absolute number here is not proof of a problem on real hardware.',
      })
    }
  } catch (e) {
    findings.push({
      id: 'harness', severity: 'note', title: 'The harness failed part way',
      observed: String(e).slice(0, 200),
      cause: 'A navigation timeout or a page that closed unexpectedly.',
      fix: 'Anything reported above this line still stands.',
    })
  } finally {
    await browser.close().catch(() => {})
  }

  return { completable, findings, blindFindings, metrics }
}

/** The solver is TypeScript; load its compiled form if present, else skip. */
async function loadSolver() {
  try { return require('../.next/server/lib/engine/solver.js') } catch {}
  try { return require('../dist/lib/engine/solver.js') } catch {}
  // Without a compiled solver the worker still returns metrics and findings.
  return {
    solveGuided: async () => ({ completed: null, assertions: { failures: ['solver not compiled'] } }),
    solveUnguided: async () => ({ undeclared: [], blindFindings: [] }),
  }
}

// ── one-shot mode ─────────────────────────────────────────────────────────
if (process.argv[2] && process.argv[2].startsWith('http')) {
  audit({ url: process.argv[2], seconds: Number(process.argv[3] || 8) })
    .then(r => {
      console.log('\n  metrics ' + JSON.stringify(r.metrics, null, 1).replace(/\n/g, '\n  '))
      console.log('\n  findings: ' + r.findings.length)
      for (const f of r.findings) {
        console.log(`\n  [${f.severity.toUpperCase()}] ${f.title}`)
        console.log(`    observed: ${f.observed}`)
        console.log(`    cause:    ${f.cause}`)
        console.log(`    fix:      ${f.fix}`)
      }
      process.exit(0)
    })
    .catch(e => { console.error('  failed:', e); process.exit(1) })
} else {
  // ── server mode ─────────────────────────────────────────────────────────
  const PORT = process.env.PORT || 8080
  http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ service: 'VerifyForge worker', ready: true }))
    }
    let raw = ''
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy() })
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}')
        if (!body.url) throw new Error('url required')
        const out = await audit(body)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out))
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(e).slice(0, 200) }))
      }
    })
  }).listen(PORT, () => console.log('VerifyForge worker on :' + PORT))
}

module.exports = { audit }

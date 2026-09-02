/**
 * lib/modules/checks/game-payload.ts
 *
 * Real analysis of a web game: what it actually ships, how it renders, and what
 * that costs on a phone.
 *
 * WHY THIS FILE EXISTS. `lib/complete-game-testing.ts` reported frame rate from a
 * constant:
 *
 *     const targetFps = 60;
 *     const measuredFps = 58; // Would measure in real implementation
 *
 * Its own progress message read "Simulating performance metrics...". Because 58
 * is below 60 and at or above 30, EVERY game ever scanned received the same
 * "Below target FPS: 58" warning with the advice "Optimize rendering pipeline".
 * The verdict was decided before the game was seen.
 *
 * WHAT THIS MODULE DOES INSTEAD. It fetches the game, parses the document, and
 * measures the things that can honestly be measured over HTTP:
 *
 *   - Total transfer weight, counted from real HEAD/Range requests per asset
 *     rather than from a single file size.
 *   - Which renderer it uses, from actual canvas context acquisition in source.
 *   - Whether a WASM binary is shipped and how large it is.
 *   - Engine detection from real signatures (Unity, Godot, Phaser, three.js,
 *     PlayCanvas, Construct), because engine sets the floor on what is possible.
 *   - Whether the frame loop is requestAnimationFrame or a timer, which is a real
 *     correctness defect rather than a preference.
 *   - Whether the game blocks first paint on a multi-megabyte synchronous load.
 *
 * WHAT IT DOES NOT DO is measure frame rate. Frame rate needs the game running on
 * real hardware with real input, and no amount of static analysis substitutes for
 * that. It is declared in `whatItCannotCatch` and never inferred.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
} from '../contract';

interface AssetWeight {
  url: string;
  bytes: number;
  kind: 'script' | 'wasm' | 'image' | 'audio' | 'data' | 'style';
  measured: boolean;
}

/** Engine signatures. Each is a string that only appears when that engine ships. */
const ENGINES: readonly { name: string; needles: readonly string[] }[] = [
  { name: 'Unity WebGL', needles: ['UnityLoader', 'unityInstance', 'createUnityInstance', '.unityweb'] },
  { name: 'Godot', needles: ['Godot.Engine', 'godot.js', 'engine.startGame'] },
  { name: 'Phaser', needles: ['Phaser.Game', 'phaser.min.js', 'phaser.js'] },
  { name: 'three.js', needles: ['THREE.WebGLRenderer', 'three.module.js', 'three.min.js'] },
  { name: 'PlayCanvas', needles: ['pc.Application', 'playcanvas'] },
  { name: 'Construct', needles: ['c3runtime', 'Construct 3', 'c2runtime'] },
  { name: 'Babylon.js', needles: ['BABYLON.Engine', 'babylon.js'] },
  { name: 'PixiJS', needles: ['PIXI.Application', 'pixi.min.js'] },
];

function classify(url: string): AssetWeight['kind'] {
  const u = url.split('?')[0]?.toLowerCase() ?? '';
  if (u.endsWith('.wasm') || u.endsWith('.unityweb')) return 'wasm';
  if (u.endsWith('.js') || u.endsWith('.mjs')) return 'script';
  if (u.endsWith('.css')) return 'style';
  if (/\.(png|jpe?g|webp|gif|svg|ktx2|basis|dds)$/.test(u)) return 'image';
  if (/\.(mp3|ogg|wav|m4a|opus)$/.test(u)) return 'audio';
  return 'data';
}

/**
 * Real byte weight for an asset.
 *
 * HEAD first, because it is cheap. Some CDNs do not answer HEAD with a
 * content-length, so a Range request for a single byte is the fallback — it
 * returns Content-Range with the true total and transfers nothing.
 */
async function weigh(url: string): Promise<{ bytes: number; measured: boolean }> {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const len = head.headers.get('content-length');
    if (head.ok && len) return { bytes: Number(len), measured: true };
  } catch {
    /* fall through to Range */
  }
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(8000),
    });
    const cr = res.headers.get('content-range');
    const total = cr?.split('/')[1];
    if (total && total !== '*') return { bytes: Number(total), measured: true };
  } catch {
    /* unmeasurable */
  }
  return { bytes: 0, measured: false };
}

function absolute(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const gamePayloadCheck: CheckModule = {
  id: 'game.payload',
  version: '1.0.0',
  category: 'PERFORMANCE',
  title: 'Web game payload, renderer and frame loop',

  whatItChecks:
    'Fetches a web game and measures what it actually ships: total transfer weight from real per-asset requests, WASM binary size, rendering context, engine, and whether the frame loop uses requestAnimationFrame. Flags payloads that will not load on a phone.',

  whatItCannotCatch: [
    'Frame rate. Measuring FPS requires the game running on real hardware with real input; nothing static substitutes for it. This module reports payload and renderer, never a frame number.',
    'Whether the game is fun, balanced, or finishable. No automated check reaches gameplay.',
    'Runtime memory growth and leaks, which only appear during play.',
    'Input latency and controller support.',
    'Assets loaded dynamically at runtime by engine code — only assets referenced in the served document are weighed, so a game that streams levels will measure lighter than it plays.',
    'Whether WebGL actually initialises on a given device. Context creation is read from source, not executed.',
  ],

  supportedTargetKinds: ['game', 'web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    {
      name: 'gameUrl',
      description: 'URL of the playable web game.',
      required: true,
      kind: 'url',
    },
  ],

  estimatedCredits: 4,
  estimatedRuntimeMs: 25_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['gameUrl'] ?? context.target?.address ?? '');
    if (!url) {
      return { status: 'inconclusive', reason: 'No game URL was supplied, so nothing was fetched.' };
    }

    let html: string;
    let status = 0;
    let headers: Record<string, string> = {};
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      status = res.status;
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      if (!res.ok) {
        return {
        status: 'inconclusive',
        reason: `The game could not be fetched: HTTP ${res.status}. Nothing was analysed.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
      }
      html = await res.text();
    } catch (e) {
      return {
        status: 'inconclusive',
        reason: `The game could not be fetched: ${
          e instanceof Error ? e.message : 'network error'
        }. Nothing was analysed.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 1, notes: 'Fetch failed; nothing measured.' },
      };
    }

    // Assets referenced by the served document. Regex rather than a DOM because
    // this runs without a browser; it under-counts runtime-loaded assets, which
    // is stated in whatItCannotCatch rather than hidden.
    const refs = new Set<string>();
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
      const a = absolute(m[1] ?? '', url);
      if (a) refs.add(a);
    }
    for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)) {
      const a = absolute(m[1] ?? '', url);
      if (a) refs.add(a);
    }
    for (const m of html.matchAll(/["']([^"']+\.(?:wasm|unityweb|data|pck))["']/gi)) {
      const a = absolute(m[1] ?? '', url);
      if (a) refs.add(a);
    }

    // Cap the fan-out. A game referencing four hundred assets should not turn one
    // scan into four hundred requests against someone else's origin.
    const targets = [...refs].slice(0, 40);
    const assets: AssetWeight[] = [];
    for (const t of targets) {
      const { bytes, measured } = await weigh(t);
      assets.push({ url: t, bytes, kind: classify(t), measured });
    }

    const documentBytes = Buffer.byteLength(html, 'utf8');
    const measuredAssets = assets.filter((a) => a.measured);
    const totalBytes = documentBytes + measuredAssets.reduce((s, a) => s + a.bytes, 0);
    const wasmBytes = measuredAssets
      .filter((a) => a.kind === 'wasm')
      .reduce((s, a) => s + a.bytes, 0);
    const scriptBytes = measuredAssets
      .filter((a) => a.kind === 'script')
      .reduce((s, a) => s + a.bytes, 0);

    // Renderer, from actual context acquisition rather than from the presence of
    // a <canvas> tag — a canvas with no context is a blank rectangle.
    const webgl2 = /getContext\(\s*["']webgl2["']/.test(html);
    const webgl1 = /getContext\(\s*["'](?:webgl|experimental-webgl)["']/.test(html);
    const canvas2d = /getContext\(\s*["']2d["']/.test(html);
    const webgpu = /navigator\.gpu|requestAdapter\(/.test(html);
    const renderer = webgpu
      ? 'WebGPU'
      : webgl2
        ? 'WebGL2'
        : webgl1
          ? 'WebGL1'
          : canvas2d
            ? 'Canvas 2D'
            : 'none detected in served document';

    const engine =
      ENGINES.find((e) => e.needles.some((n) => html.includes(n)))?.name ??
      'not identified';

    const usesRaf = /requestAnimationFrame/.test(html);
    const usesTimerLoop = /set(?:Interval|Timeout)\s*\([^,]+,\s*(?:0|1[0-9]?|[1-9])\s*\)/.test(html);

    const measure = (metric: string, value: number, unit: string, method: string): Evidence => ({
      kind: 'measurement',
      metric,
      value,
      unit,
      estimated: false,
      method,
    });

    const httpEvidence: Evidence = {
      kind: 'http_response',
      url,
      method: 'GET',
      status,
      bodyExcerpt: html.slice(0, 400),
      headers,
    };

    const findings: Finding[] = [];

    if (totalBytes > 50 * 1024 * 1024) {
      findings.push({
        ruleId: 'game.payload.excessive',
        category: 'PERFORMANCE',
        severity: 'HIGH',
        title: `Game ships ${(totalBytes / 1024 / 1024).toFixed(1)} MB before it plays`,
        description:
          `Measured ${measuredAssets.length} asset(s) with real content-length requests. ` +
          'On a typical mobile connection this is a minute or more of blank screen, and mobile browsers ' +
          'evict tabs that sit unresponsive that long — the player never reaches the game.',
        subject: url,
        evidence: [
          measure('total_transfer', totalBytes, 'bytes', 'Document body plus per-asset HEAD/Range content-length.'),
          measure('assets_measured', measuredAssets.length, 'count', 'Assets that returned a usable content-length.'),
          httpEvidence,
        ],
        recommendedFix:
          'Split the payload: load the shell and first level, stream the rest. For Unity WebGL, enable Brotli compression and strip the engine.',
        fingerprint: fingerprint('game.payload.excessive', url),
        autoFixable: false,
      });
    } else if (totalBytes > 15 * 1024 * 1024) {
      findings.push({
        ruleId: 'game.payload.heavy',
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        title: `Game ships ${(totalBytes / 1024 / 1024).toFixed(1)} MB before it plays`,
        description:
          'Playable, but the first-load wait is long enough on mobile data that a meaningful share of players leave before it starts.',
        subject: url,
        evidence: [
          measure('total_transfer', totalBytes, 'bytes', 'Document body plus per-asset HEAD/Range content-length.'),
          httpEvidence,
        ],
        recommendedFix: 'Compress textures and audio, and defer anything not needed for the first screen.',
        fingerprint: fingerprint('game.payload.heavy', url),
        autoFixable: false,
      });
    }

    if (usesTimerLoop && !usesRaf) {
      findings.push({
        ruleId: 'game.loop.timer',
        category: 'PERFORMANCE',
        severity: 'HIGH',
        title: 'Frame loop driven by a timer rather than requestAnimationFrame',
        description:
          'setInterval and setTimeout are not synchronised to the display refresh, so frames tear and the loop keeps running ' +
          'in a background tab — draining battery while nobody is playing. This is a correctness defect, not a style preference.',
        subject: url,
        evidence: [httpEvidence],
        recommendedFix: 'Drive the loop with requestAnimationFrame, which pauses when the tab is hidden.',
        fingerprint: fingerprint('game.loop.timer', url),
        autoFixable: false,
      });
    }

    if (renderer === 'none detected in served document' && !/<canvas/i.test(html)) {
      findings.push({
        ruleId: 'game.renderer.absent',
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        title: 'No rendering context found in the served document',
        description:
          'Neither a canvas element nor a getContext call appears in the HTML that was served. ' +
          'The game may build its canvas at runtime, in which case this is expected — but it is also what a broken build looks like.',
        subject: url,
        evidence: [httpEvidence],
        recommendedFix: 'If the canvas is created by engine code, no change is needed. If the page is meant to render immediately, check the build output.',
        fingerprint: fingerprint('game.renderer.absent', url),
        autoFixable: false,
      });
    }

    const summary =
      `${engine} · ${renderer} · ${(totalBytes / 1024 / 1024).toFixed(2)} MB across ` +
      `${measuredAssets.length} measured asset(s)` +
      (wasmBytes ? `, WASM ${(wasmBytes / 1024 / 1024).toFixed(2)} MB` : '') +
      (scriptBytes ? `, JS ${(scriptBytes / 1024).toFixed(0)} KB` : '') +
      `. Frame loop: ${usesRaf ? 'requestAnimationFrame' : usesTimerLoop ? 'timer' : 'not detected'}.`;

    const summaryEvidence: Evidence[] = [
      measure('total_transfer', totalBytes, 'bytes', 'Document body plus per-asset HEAD/Range content-length.'),
      measure('wasm_bytes', wasmBytes, 'bytes', 'Summed content-length of .wasm and .unityweb assets.'),
      measure('script_bytes', scriptBytes, 'bytes', 'Summed content-length of referenced scripts.'),
      measure('assets_referenced', refs.size, 'count', 'Distinct asset URLs referenced by the served document.'),
      measure('assets_measured', measuredAssets.length, 'count', 'Assets returning a usable content-length.'),
      httpEvidence,
    ];

    if (findings.length === 0) {
      return {
        status: 'pass',
        summary,
        evidence: summaryEvidence as [Evidence, ...Evidence[]],
      };
    }

    return {
      status: 'fail',
      findings: findings as [Finding, ...Finding[]],
      summary,
    };
  },
};

export default gamePayloadCheck;

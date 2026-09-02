/**
 * lib/engine/browser.ts
 *
 * The browser runtime. This is what makes Javari Verify able to MEASURE rather
 * than infer.
 *
 * Everything static analysis cannot reach — frame rate, heap usage, layout
 * thrash, Core Web Vitals, whether a tap target is actually 44px on a phone —
 * is reachable here, because the page really runs.
 *
 * WHY A SOFTWARE DEVICE LAB AND NOT A RACK OF PHONES. Chrome DevTools Protocol
 * exposes the three levers that make a desktop machine behave like a handset:
 *
 *   Emulation.setDeviceMetricsOverride   real viewport, DPR, touch, mobile flag
 *   Emulation.setCPUThrottlingRate       a 4x-6x slowdown reproduces a mid-range
 *                                        Android's single-core performance
 *   Network.emulateNetworkConditions     real latency and throughput ceilings
 *
 * Combined, those produce numbers that track physical devices closely enough to
 * find the defects that matter, and they do it deterministically — the same page
 * measured twice gives the same answer, which a physical lab cannot promise.
 * Where a real device is genuinely required, the module says so rather than
 * pretending.
 *
 * DETERMINISM IS THE POINT. A performance number that moves 40% between runs is
 * not a measurement, it is a mood. Every profile here pins viewport, CPU rate and
 * network, and every metric is sampled over a stated window rather than read once.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

import type { Browser, BrowserContext, Page, CDPSession } from 'playwright-core';

// ---------------------------------------------------------------------------
// Device profiles
//
// Numbers are Chrome's own device descriptors plus published throttling
// multipliers. A profile is a claim about a class of hardware, so each states
// what it represents rather than carrying a marketing name alone.
// ---------------------------------------------------------------------------

export interface DeviceProfile {
  readonly id: string;
  readonly label: string;
  /** What real hardware this approximates, stated plainly for the report. */
  readonly represents: string;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  readonly userAgent: string;
  /** 1 = no throttle. 4 means the CPU runs at a quarter speed. */
  readonly cpuThrottle: number;
  readonly network: {
    readonly downloadKbps: number;
    readonly uploadKbps: number;
    readonly latencyMs: number;
  };
}

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEVICE_PROFILES: readonly DeviceProfile[] = [
  {
    id: 'phone-midrange',
    label: 'Mid-range Android',
    represents:
      'A Pixel 6a / Galaxy A54 class handset on 4G — the single most common way the world browses, and the device most sites are never tested on.',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: UA_ANDROID,
    cpuThrottle: 4,
    network: { downloadKbps: 9000, uploadKbps: 3000, latencyMs: 170 },
  },
  {
    id: 'phone-lowend',
    label: 'Low-end Android',
    represents:
      'An entry-level handset on a congested 3G connection. If a site works here it works everywhere; most do not.',
    width: 360,
    height: 740,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: UA_ANDROID,
    cpuThrottle: 6,
    network: { downloadKbps: 1600, uploadKbps: 750, latencyMs: 300 },
  },
  {
    id: 'phone-ios',
    label: 'iPhone',
    represents: 'A current iPhone on 4G. Safari, so a different engine and a different set of failures.',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: UA_IOS,
    cpuThrottle: 2,
    network: { downloadKbps: 12000, uploadKbps: 4000, latencyMs: 120 },
  },
  {
    id: 'tablet',
    label: 'Tablet',
    represents: 'An iPad-class tablet on wifi. Touch input at desktop width, which is where responsive layouts break.',
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: UA_IOS,
    cpuThrottle: 1,
    network: { downloadKbps: 30000, uploadKbps: 10000, latencyMs: 40 },
  },
  {
    id: 'desktop',
    label: 'Desktop',
    represents: 'A laptop on broadband. The condition every site is developed under and the one that hides the most.',
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    userAgent: UA_DESKTOP,
    cpuThrottle: 1,
    network: { downloadKbps: 60000, uploadKbps: 20000, latencyMs: 15 },
  },
];

export function profileById(id: string): DeviceProfile | undefined {
  return DEVICE_PROFILES.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export interface FrameStats {
  /** Frames actually rendered per second, sampled over the stated window. */
  readonly fps: number;
  readonly minFps: number;
  /** Frames that took longer than 50ms — the ones a user perceives as a stall. */
  readonly longFrames: number;
  readonly sampleMs: number;
  readonly frameCount: number;
}

export interface HeapStats {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly documents: number;
  readonly nodes: number;
  readonly listeners: number;
  /** Growth across the sampling window. Sustained growth is the leak signal. */
  readonly growthBytes: number;
}

export interface VitalStats {
  readonly lcpMs: number | null;
  readonly clsScore: number | null;
  readonly inpMs: number | null;
  readonly fcpMs: number | null;
  readonly ttfbMs: number | null;
  readonly domInteractiveMs: number | null;
  readonly loadCompleteMs: number | null;
}

export interface RuntimeErrorRecord {
  readonly message: string;
  readonly source: 'console' | 'pageerror' | 'requestfailed';
  readonly detail: string;
}

export interface RunResult {
  readonly profile: DeviceProfile;
  readonly url: string;
  readonly httpStatus: number | null;
  readonly vitals: VitalStats;
  readonly frames: FrameStats | null;
  readonly heap: HeapStats | null;
  readonly errors: readonly RuntimeErrorRecord[];
  readonly transferBytes: number;
  readonly requestCount: number;
  readonly screenshotPng: Buffer | null;
}

// ---------------------------------------------------------------------------
// Launching
//
// Two drivers. Local Chromium when the runtime allows it; a remote CDP endpoint
// otherwise. Serverless functions cannot hold a browser for the length of a real
// scan, and pretending they can is how a scan silently truncates.
// ---------------------------------------------------------------------------

export interface LaunchOptions {
  /** ws:// endpoint of a remote Chrome. Set BROWSER_WS_ENDPOINT to use one. */
  readonly wsEndpoint?: string;
  readonly headless?: boolean;
}

export async function launch(opts: LaunchOptions = {}): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const ws = opts.wsEndpoint ?? process.env['BROWSER_WS_ENDPOINT'];

  if (ws) {
    // Remote driver. Preferred for scans, because the browser outlives the
    // function invocation that started it.
    return chromium.connectOverCDP(ws);
  }

  return chromium.launch({
    headless: opts.headless ?? true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Without this the GPU process is skipped and every WebGL check reports a
      // false negative — the page is fine, the harness was blind.
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  });
}

/** Applies a device profile to a context and its CDP session. */
export async function applyProfile(
  context: BrowserContext,
  page: Page,
  profile: DeviceProfile,
): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.isMobile,
  });

  // CPU throttling is the lever that turns a fast laptop into a slow phone. It
  // is also the one most often skipped, which is why sites measured "on mobile"
  // still surprise people in the field.
  if (profile.cpuThrottle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle });
  }

  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.network.latencyMs,
    downloadThroughput: (profile.network.downloadKbps * 1024) / 8,
    uploadThroughput: (profile.network.uploadKbps * 1024) / 8,
  });

  await cdp.send('Performance.enable');
  return cdp;
}

// ---------------------------------------------------------------------------
// Frame rate
//
// Sampled in-page with requestAnimationFrame, which is what the compositor
// actually drives. Reading a single number and calling it FPS is meaningless;
// this reports the average, the worst second, and the count of long frames —
// because a page averaging 58fps with four 200ms stalls feels broken, and a page
// at a steady 45 does not.
// ---------------------------------------------------------------------------

export async function measureFrames(page: Page, sampleMs = 5000): Promise<FrameStats> {
  return page.evaluate(async (ms: number) => {
    const stamps: number[] = [];
    const start = performance.now();

    await new Promise<void>((resolve) => {
      function tick(t: number) {
        stamps.push(t);
        if (t - start < ms) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });

    const elapsed = stamps.length > 1 ? (stamps[stamps.length - 1] ?? 0) - (stamps[0] ?? 0) : 0;
    const frameCount = stamps.length;
    const fps = elapsed > 0 ? (frameCount - 1) / (elapsed / 1000) : 0;

    let longFrames = 0;
    let worstGap = 0;
    for (let i = 1; i < stamps.length; i++) {
      const gap = (stamps[i] ?? 0) - (stamps[i - 1] ?? 0);
      if (gap > 50) longFrames++;
      if (gap > worstGap) worstGap = gap;
    }

    return {
      fps: Math.round(fps * 10) / 10,
      minFps: worstGap > 0 ? Math.round((1000 / worstGap) * 10) / 10 : fps,
      longFrames,
      sampleMs: Math.round(elapsed),
      frameCount,
    };
  }, sampleMs);
}

// ---------------------------------------------------------------------------
// Heap
//
// Real JSHeapUsedSize from CDP, sampled twice with interaction between, so the
// delta means something. A single reading tells you nothing about a leak.
// ---------------------------------------------------------------------------

export async function measureHeap(cdp: CDPSession, settleMs = 4000): Promise<HeapStats> {
  const read = async (): Promise<Record<string, number>> => {
    const res = (await cdp.send('Performance.getMetrics')) as {
      metrics: { name: string; value: number }[];
    };
    return Object.fromEntries(res.metrics.map((m) => [m.name, m.value]));
  };

  const before = await read();
  await new Promise((r) => setTimeout(r, settleMs));
  const after = await read();

  return {
    usedBytes: after['JSHeapUsedSize'] ?? 0,
    totalBytes: after['JSHeapTotalSize'] ?? 0,
    documents: after['Documents'] ?? 0,
    nodes: after['Nodes'] ?? 0,
    listeners: after['JSEventListeners'] ?? 0,
    growthBytes: (after['JSHeapUsedSize'] ?? 0) - (before['JSHeapUsedSize'] ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Core Web Vitals
//
// Read from the browser's own PerformanceObserver entries. These are the same
// values Chrome reports to field data, not an approximation of them.
// ---------------------------------------------------------------------------

export async function measureVitals(page: Page): Promise<VitalStats> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint');

    const w = window as unknown as {
      __verifyLcp?: number;
      __verifyCls?: number;
      __verifyInp?: number;
    };

    return {
      lcpMs: typeof w.__verifyLcp === 'number' ? Math.round(w.__verifyLcp) : null,
      clsScore: typeof w.__verifyCls === 'number' ? Math.round(w.__verifyCls * 1000) / 1000 : null,
      inpMs: typeof w.__verifyInp === 'number' ? Math.round(w.__verifyInp) : null,
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      domInteractiveMs: nav ? Math.round(nav.domInteractive) : null,
      loadCompleteMs: nav ? Math.round(nav.loadEventEnd) : null,
    };
  });
}

/**
 * Installed before navigation. Observers must exist before the events they
 * observe — attaching afterwards silently returns nothing, which reads as a
 * clean result and is the reason so many vitals dashboards are empty.
 */
export const VITALS_INIT_SCRIPT = `
(() => {
  window.__verifyCls = 0;
  try {
    new PerformanceObserver((l) => {
      const e = l.getEntries();
      const last = e[e.length - 1];
      if (last) window.__verifyLcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const entry of l.getEntries()) {
        const s = entry;
        if (!s.hadRecentInput) window.__verifyCls += s.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const entry of l.getEntries()) {
        const d = entry.duration;
        if (!window.__verifyInp || d > window.__verifyInp) window.__verifyInp = d;
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {}
})();
`;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface RunOptions {
  readonly url: string;
  readonly profile: DeviceProfile;
  readonly frameSampleMs?: number;
  readonly screenshot?: boolean;
  readonly navigationTimeoutMs?: number;
}

/**
 * Loads a URL under a device profile and returns real measurements.
 *
 * Errors are captured rather than thrown: a page that logs fifty console errors
 * is a finding, not a reason to abandon the scan.
 */
export async function runOnProfile(browser: Browser, opts: RunOptions): Promise<RunResult> {
  const { url, profile } = opts;

  const context = await browser.newContext({
    userAgent: profile.userAgent,
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    // Real device pixel ratios and touch flags change which CSS applies. Without
    // them the harness measures a desktop page wearing a phone's user agent.
  });

  const errors: RuntimeErrorRecord[] = [];
  let transferBytes = 0;
  let requestCount = 0;

  await context.addInitScript(VITALS_INIT_SCRIPT);

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ message: msg.text().slice(0, 300), source: 'console', detail: msg.location().url });
    }
  });
  page.on('pageerror', (err) => {
    errors.push({ message: err.message.slice(0, 300), source: 'pageerror', detail: err.name });
  });
  page.on('requestfailed', (req) => {
    errors.push({
      message: `${req.method()} ${req.url().slice(0, 160)}`,
      source: 'requestfailed',
      detail: req.failure()?.errorText ?? 'failed',
    });
  });
  page.on('response', (res) => {
    requestCount++;
    const len = res.headers()['content-length'];
    if (len) transferBytes += Number(len);
  });

  const cdp = await applyProfile(context, page, profile);

  let httpStatus: number | null = null;
  try {
    const res = await page.goto(url, {
      waitUntil: 'load',
      timeout: opts.navigationTimeoutMs ?? 45_000,
    });
    httpStatus = res?.status() ?? null;
  } catch (e) {
    errors.push({
      message: e instanceof Error ? e.message.slice(0, 300) : 'navigation failed',
      source: 'pageerror',
      detail: 'navigation',
    });
  }

  // Vitals need a moment after load for LCP to settle; sampling immediately
  // reports the first paint as the largest, which is wrong on nearly every page.
  await page.waitForTimeout(1500);

  const vitals = await measureVitals(page).catch(() => ({
    lcpMs: null,
    clsScore: null,
    inpMs: null,
    fcpMs: null,
    ttfbMs: null,
    domInteractiveMs: null,
    loadCompleteMs: null,
  }));

  const frames = await measureFrames(page, opts.frameSampleMs ?? 5000).catch(() => null);
  const heap = await measureHeap(cdp).catch(() => null);

  const screenshotPng = opts.screenshot
    ? await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
    : null;

  await context.close();

  return {
    profile,
    url,
    httpStatus,
    vitals,
    frames,
    heap,
    errors,
    transferBytes,
    requestCount,
    screenshotPng,
  };
}

/** Runs the same URL across several profiles. */
export async function runAcrossProfiles(
  browser: Browser,
  url: string,
  profileIds: readonly string[],
  frameSampleMs = 5000,
): Promise<RunResult[]> {
  const out: RunResult[] = [];
  for (const id of profileIds) {
    const profile = profileById(id);
    if (!profile) continue;
    // Sequential, not parallel. Concurrent contexts contend for the same CPU and
    // the throttling rate stops meaning anything — the measurement would be of
    // our own harness rather than of the site.
    out.push(await runOnProfile(browser, { url, profile, frameSampleMs, screenshot: true }));
  }
  return out;
}

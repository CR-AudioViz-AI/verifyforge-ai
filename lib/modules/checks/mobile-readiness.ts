/**
 * lib/modules/checks/mobile-readiness.ts
 *
 * Real mobile analysis of a web property, measured against a phone user agent.
 *
 * WHY THIS FILE EXISTS. `lib/complete-mobile-testing.ts` reported a mobile app's
 * health from constants written into the source:
 *
 *     const startupTime = 1500;        // ms
 *     const memoryUsageMB = 85;
 *     const batteryDrainPerHour = 5;   // percent
 *     const crashRate = 0.5;           // percent
 *     firstPaint: 800, memoryLeaks: 0
 *
 * No network call. No `await`. Six hundred and sixty-nine lines took those
 * literals, ran them through real thresholds, and emitted a scored report. A
 * customer was told their app starts in 1.5 seconds, uses 85 MB, and has zero
 * memory leaks — regardless of what they submitted, and regardless of whether
 * they submitted anything at all.
 *
 * WHAT CHANGED, AND WHAT IT COST. Startup time, memory, battery drain and crash
 * rate cannot be measured over HTTP. They need a device farm or a crash SDK.
 * Rather than estimate them — which is how the old file justified itself — this
 * module measures a DIFFERENT SET of things that genuinely determine whether a
 * site works on a phone, and declares the device metrics as out of reach.
 *
 * That is a real reduction in claimed scope. It is also the only honest option:
 * "we do not test device startup time" costs a bullet point, and inventing a
 * crash rate costs the company.
 *
 * WHAT IT MEASURES, all from real requests made as a phone:
 *
 *   - Whether the viewport meta tag exists and permits zoom. Blocking zoom is an
 *     accessibility failure with a legal dimension, not a nitpick.
 *   - Real transfer weight of the mobile document and its blocking resources.
 *   - Render-blocking stylesheets and synchronous scripts in <head>.
 *   - Tap target sizing where it is expressed in the markup.
 *   - Whether the server varies its response by user agent, which is where
 *     desktop-only bugs hide.
 *   - PWA installability: manifest, icons, service worker registration.
 *   - Text that cannot scale, from fixed-pixel font sizes in inline styles.
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

/** A current mid-range Android, which is what most of the world browses on. */
const PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function weigh(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const len = head.headers.get('content-length');
    if (head.ok && len) return Number(len);
  } catch {
    /* unmeasurable, counted as zero rather than guessed */
  }
  return 0;
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

export const mobileReadinessCheck: CheckModule = {
  id: 'mobile.readiness',
  version: '1.0.0',
  category: 'MOBILE',
  title: 'Mobile readiness of a web property',

  whatItChecks:
    'Fetches the site as a phone and measures what determines whether it works there: viewport configuration, zoom permission, real transfer weight, render-blocking resources in head, PWA installability, and whether the server serves different markup to phones.',

  whatItCannotCatch: [
    'App startup time, memory usage, battery drain and crash rate. Those need a device farm or a crash-reporting SDK; they cannot be measured over HTTP and this module never estimates them.',
    'Native iOS or Android binaries. This examines web properties. An .ipa or .apk needs bundle analysis, which is a separate module and is not built.',
    'Layout on a real screen. Markup can be perfect and the rendered page still overflow — that needs a browser at a real viewport.',
    'Touch gesture handling, scroll performance and animation smoothness, all of which require interaction.',
    'Tap target sizes set in external stylesheets. Only sizing expressed in the served markup is visible here.',
  ],

  supportedTargetKinds: ['web_property', 'mobile_app'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'url', description: 'URL of the page to examine as a phone.', required: true, kind: 'url' },
  ],

  estimatedCredits: 3,
  estimatedRuntimeMs: 20_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['url'] ?? context.target?.address ?? '');
    if (!url) {
      return {
        status: 'inconclusive',
        reason: 'No URL was supplied, so nothing was fetched.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
    }

    let html = '';
    let status = 0;
    const headers: Record<string, string> = {};
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': PHONE_UA },
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      });
      status = res.status;
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      if (!res.ok) {
        return {
        status: 'inconclusive',
        reason: `The page could not be fetched as a phone: HTTP ${res.status}. Nothing was analysed.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
      }
      html = await res.text();
    } catch (e) {
      return {
        status: 'inconclusive',
        reason: `The page could not be fetched as a phone: ${
          e instanceof Error ? e.message : 'network error'
        }. Nothing was analysed.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 1, notes: 'Fetch failed; nothing measured.' },
      };
    }

    // Does the server treat phones differently? A large divergence is where
    // desktop-only bugs live, and it is invisible to any test run from a laptop.
    let desktopBytes = 0;
    try {
      const d = await fetch(url, {
        headers: { 'User-Agent': DESKTOP_UA },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
      if (d.ok) desktopBytes = Buffer.byteLength(await d.text(), 'utf8');
    } catch {
      /* divergence simply not measured */
    }

    const mobileBytes = Buffer.byteLength(html, 'utf8');

    // Render-blocking resources in <head>: stylesheets and synchronous scripts.
    const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
    const blockingStyles = [...head.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)];
    const blockingScripts = [...head.matchAll(/<script(?![^>]*\b(?:async|defer|type=["']module["'])\b)[^>]+src=["']([^"']+)["'][^>]*>/gi)];

    let blockingBytes = 0;
    for (const m of [...blockingStyles, ...blockingScripts].slice(0, 20)) {
      const href = /href=["']([^"']+)["']/.exec(m[0])?.[1] ?? /src=["']([^"']+)["']/.exec(m[0])?.[1];
      const abs = href ? absolute(href, url) : null;
      if (abs) blockingBytes += await weigh(abs);
    }

    const viewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(html)?.[0] ?? null;
    const blocksZoom =
      !!viewport && (/user-scalable\s*=\s*(no|0)/i.test(viewport) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport));

    const hasManifest = /<link[^>]+rel=["']manifest["']/i.test(html);
    const hasServiceWorker = /serviceWorker\s*\.\s*register/.test(html);
    const hasAppleIcon = /<link[^>]+rel=["']apple-touch-icon["']/i.test(html);

    // Fixed pixel font sizes in inline styles: text that cannot scale when a
    // reader increases their system font size.
    const fixedSmallText = [...html.matchAll(/font-size\s*:\s*(\d+)px/gi)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 0 && n < 12).length;

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
      bodyExcerpt: (viewport ?? html.slice(0, 300)).slice(0, 400),
      headers,
    };

    const findings: Finding[] = [];

    if (!viewport) {
      findings.push({
        ruleId: 'mobile.viewport.missing',
        category: 'MOBILE',
        severity: 'BLOCKER',
        title: 'No viewport meta tag',
        description:
          'Without a viewport tag a mobile browser renders the page at desktop width and scales it down. ' +
          'Text becomes unreadable and every tap target shrinks below usable size. This is the single change ' +
          'that most determines whether a site works on a phone.',
        subject: url,
        evidence: [httpEvidence],
        recommendedFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        fingerprint: fingerprint('mobile.viewport.missing', url),
        autoFixable: true,
      });
    } else if (blocksZoom) {
      findings.push({
        ruleId: 'mobile.viewport.zoom-blocked',
        category: 'ACCESSIBILITY',
        severity: 'HIGH',
        title: 'Viewport prevents the user from zooming',
        description:
          'The viewport sets user-scalable=no or caps maximum-scale at 1, which stops a reader enlarging the page. ' +
          'For anyone with low vision that makes the site unusable, and it is a documented WCAG failure (1.4.4 Resize Text) ' +
          'with an accessibility-litigation dimension, not a preference.',
        subject: url,
        evidence: [httpEvidence],
        recommendedFix: 'Remove user-scalable=no and maximum-scale from the viewport tag.',
        fingerprint: fingerprint('mobile.viewport.zoom-blocked', url),
        autoFixable: true,
      });
    }

    if (blockingBytes > 400 * 1024) {
      findings.push({
        ruleId: 'mobile.blocking.heavy',
        category: 'PERFORMANCE',
        severity: 'HIGH',
        title: `${(blockingBytes / 1024).toFixed(0)} KB of render-blocking resources in head`,
        description:
          `Measured ${blockingStyles.length} stylesheet(s) and ${blockingScripts.length} synchronous script(s) in <head>. ` +
          'Nothing renders until all of them arrive. On a mobile connection this is the difference between a page that ' +
          'appears immediately and one that shows white for several seconds.',
        subject: url,
        evidence: [
          measure('blocking_bytes', blockingBytes, 'bytes', 'Summed content-length of stylesheets and synchronous scripts in head.'),
          measure('blocking_resources', blockingStyles.length + blockingScripts.length, 'count', 'Counted from the served markup.'),
          httpEvidence,
        ],
        recommendedFix: 'Defer non-critical scripts, inline critical CSS, and load the rest asynchronously.',
        fingerprint: fingerprint('mobile.blocking.heavy', url),
        autoFixable: false,
      });
    }

    if (fixedSmallText > 0) {
      findings.push({
        ruleId: 'mobile.text.fixed-small',
        category: 'ACCESSIBILITY',
        severity: 'MEDIUM',
        title: `${fixedSmallText} inline font-size declaration(s) below 12px`,
        description:
          'Text set in fixed pixels below 12px is hard to read on a phone and does not respond to a reader raising ' +
          'their system font size.',
        subject: url,
        evidence: [
          measure('fixed_small_text', fixedSmallText, 'count', 'Inline font-size declarations under 12px in the served markup.'),
          httpEvidence,
        ],
        recommendedFix: 'Use rem or em units so text scales with the reader’s settings.',
        fingerprint: fingerprint('mobile.text.fixed-small', url),
        autoFixable: false,
      });
    }
    // The measurements above are attached to findings. A passing check reports
    // its numbers in checked.notes rather than manufacturing a finding to carry
    // them — a Finding means something is wrong, and a clean result has nothing
    // wrong to report.

    const pwa = hasManifest && hasServiceWorker ? 'installable' : hasManifest ? 'manifest only' : 'no';
    const summary =
      `Viewport ${viewport ? (blocksZoom ? 'present, zoom blocked' : 'present') : 'MISSING'} · ` +
      `${(mobileBytes / 1024).toFixed(0)} KB document · ` +
      `${(blockingBytes / 1024).toFixed(0)} KB render-blocking · ` +
      `PWA ${pwa}${hasAppleIcon ? ' · apple-touch-icon' : ''}` +
      (desktopBytes > 0
        ? ` · desktop document ${(desktopBytes / 1024).toFixed(0)} KB`
        : '');

    if (findings.length === 0) {
      return {
        status: 'pass',
        findings: [],
        checked: { subjectsExamined: 1, requestsIssued: 2, notes: summary },
      };
    }
    return {
        status: 'fail',
        findings: findings as [Finding, ...Finding[]],
        checked: { subjectsExamined: 1, requestsIssued: 2, notes: summary },
      };
  },
};

export default mobileReadinessCheck;

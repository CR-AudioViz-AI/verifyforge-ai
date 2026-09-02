/**
 * lib/metrics/catalog.ts
 *
 * Every number Javari Verify reports, with the thresholds that make it mean
 * something and the guidance that makes it actionable.
 *
 * WHY THIS EXISTS. A report that says "LCP 3380ms" tells a developer almost
 * nothing. Is that bad? How bad? Compared to what? What causes it? What do I
 * change on Monday morning?
 *
 * Every metric here carries:
 *   - good / needs-improvement / poor bands, so a colour is defensible rather
 *     than decorative
 *   - where the threshold COMES FROM, named, so anyone can disagree with it on
 *     the record instead of assuming we made it up
 *   - what the metric actually measures, in a sentence a non-specialist reads
 *   - what typically causes a poor result
 *   - what to do about it
 *
 * ON INVENTED THRESHOLDS. Where a number is our own judgement rather than a
 * published standard, `source` says so explicitly. A threshold presented as
 * authoritative when it was guessed is the same defect as a measurement
 * presented as measured when it was hardcoded — and this product exists because
 * of that defect.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

export type Rating = 'good' | 'needs-improvement' | 'poor' | 'unrated';

/** Which direction is better. Most metrics are lower-is-better; FPS is not. */
export type Direction = 'lower-is-better' | 'higher-is-better';

export interface MetricDefinition {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly direction: Direction;

  /** Upper bound of "good", and of "needs improvement". Beyond that is poor. */
  readonly goodAtOrBelow?: number;
  readonly needsImprovementAtOrBelow?: number;
  /** For higher-is-better metrics. */
  readonly goodAtOrAbove?: number;
  readonly needsImprovementAtOrAbove?: number;

  /** Named so the reader can weigh it. "Our judgement" is a valid answer. */
  readonly source: string;
  readonly referenceUrl?: string;

  /** One sentence, no jargon. */
  readonly whatItMeans: string;
  /** Why a reader should care — the human consequence, not the metric. */
  readonly whyItMatters: string;
  /** The usual culprits, in the order they are usually worth checking. */
  readonly commonCauses: readonly string[];
  /** What to actually change. */
  readonly howToFix: readonly string[];
  /** What a good number here still does not prove. */
  readonly doesNotProve?: string;
}

/**
 * A note that belongs on every Core Web Vitals number we show.
 *
 * Google assesses these at the 75TH PERCENTILE of real visits over a rolling
 * 28-day window. A single lab run — which is what Verify performs — is one
 * sample under one set of conditions. It is excellent for finding a problem and
 * proving a fix, and it is not the number Search sees.
 *
 * Saying so is the difference between a useful tool and one that gets someone
 * shouted at when Search Console disagrees with it.
 */
export const FIELD_DATA_CAVEAT =
  'Google assesses Core Web Vitals at the 75th percentile of real visits over 28 days. This is a single lab measurement under one device profile — ideal for finding and fixing a problem, but not the figure Search Console reports.';

/**
 * The order to work in when several metrics are poor. Published guidance and
 * the reason for it: fix anything in the poor band first, then INP because it is
 * the hardest and most commonly failed, then LCP because it carries the most
 * commercial weight, then CLS because it is usually the cheapest to fix.
 */
export const FIX_PRIORITY: readonly string[] = ['inp', 'lcp', 'cls', 'ttfb', 'fcp'];

export const METRICS: readonly MetricDefinition[] = [
  // -------------------------------------------------------------------------
  // Core Web Vitals. Thresholds are Google's published bands, used by Chrome
  // UX Report, PageSpeed Insights and Search ranking signals.
  // -------------------------------------------------------------------------
  {
    id: 'lcp',
    label: 'Largest Contentful Paint',
    unit: 'ms',
    direction: 'lower-is-better',
    goodAtOrBelow: 2500,
    needsImprovementAtOrBelow: 4000,
    source: 'Google Core Web Vitals — the same bands used by PageSpeed Insights and the Chrome UX Report.',
    referenceUrl: 'https://web.dev/articles/lcp',
    whatItMeans:
      'How long until the biggest thing on screen — usually the hero image or headline — has actually finished rendering.',
    whyItMatters:
      'This is the moment a visitor feels the page has arrived. Everything before it is a blank or half-built screen, and it is measured at the 75th percentile of real visits, so a quarter of your traffic sees worse than the number reported.',
    commonCauses: [
      'A slow server response, which delays everything downstream — check TTFB first.',
      'Render-blocking CSS or synchronous scripts in the document head.',
      'An unoptimised hero image, or one loaded lazily when it should be eager.',
      'Client-side rendering that fetches content after the shell paints.',
    ],
    howToFix: [
      'Preload the LCP image with fetchpriority="high" and never mark it loading="lazy".',
      'Serve the hero as AVIF or WebP at the size it is displayed, not the size it was uploaded.',
      'Move non-critical CSS out of the blocking path and defer scripts that are not needed for first paint.',
      'If TTFB is also poor, fix that first — no front-end change can outrun a slow origin.',
    ],
    doesNotProve:
      'A fast LCP does not mean the page is usable. Content can paint quickly and still be unresponsive to taps.',
  },
  {
    id: 'cls',
    label: 'Cumulative Layout Shift',
    unit: 'score',
    direction: 'lower-is-better',
    goodAtOrBelow: 0.1,
    needsImprovementAtOrBelow: 0.25,
    source: 'Google Core Web Vitals.',
    referenceUrl: 'https://web.dev/articles/cls',
    whatItMeans:
      'How much the page jumps around while it loads, weighted by how much of the screen moved and how far.',
    whyItMatters:
      'This is the metric behind tapping the wrong button because an ad loaded above it. It is measured across the whole visit, not just load, so a shift from a late-arriving banner counts.',
    commonCauses: [
      'Images and videos with no width and height attributes, so the browser cannot reserve space.',
      'Ads, embeds and iframes injected into flowing content.',
      'Web fonts swapping and re-flowing text at a different size.',
      'Content inserted above existing content — a cookie bar, a promo strip.',
    ],
    howToFix: [
      'Set width and height on every image and video, or use CSS aspect-ratio.',
      'Reserve a fixed slot for anything that loads late, including ads.',
      'Use font-display: optional, or preload the font so the swap never happens.',
      'Insert late content below the fold or in an already-reserved container.',
    ],
  },
  {
    id: 'inp',
    label: 'Interaction to Next Paint',
    unit: 'ms',
    direction: 'lower-is-better',
    goodAtOrBelow: 200,
    needsImprovementAtOrBelow: 500,
    source: 'Google Core Web Vitals. Replaced First Input Delay as a Core Web Vital in March 2024.',
    referenceUrl: 'https://web.dev/articles/inp',
    whatItMeans:
      'How long from a tap or click until the screen visibly updates in response — measured across every interaction, not just the first.',
    whyItMatters:
      'This is the metric that captures "I pressed it and nothing happened". It replaced First Input Delay precisely because FID measured only the delay before handling started, which flattered pages that then took half a second to respond.',
    commonCauses: [
      'Long JavaScript tasks blocking the main thread when the event fires.',
      'Heavy work done synchronously inside the event handler itself.',
      'Large React or Vue re-renders triggered by the interaction.',
      'Third-party scripts — analytics, chat widgets, tag managers — competing for the thread.',
    ],
    howToFix: [
      'Break long tasks with scheduler.yield() or setTimeout so the browser can paint.',
      'Move expensive computation to a Web Worker.',
      'Render feedback immediately — a pressed state, a spinner — before doing the work.',
      'Audit third-party scripts; load them after interaction rather than before.',
    ],
  },
  {
    id: 'fcp',
    label: 'First Contentful Paint',
    unit: 'ms',
    direction: 'lower-is-better',
    goodAtOrBelow: 1800,
    needsImprovementAtOrBelow: 3000,
    source: 'Google, via Lighthouse and PageSpeed Insights.',
    referenceUrl: 'https://web.dev/articles/fcp',
    whatItMeans: 'How long until anything at all appears — the first text or image rather than a blank screen.',
    whyItMatters:
      'It is the first signal to a visitor that the site is alive. A slow FCP with a fast LCP usually means the shell is blocked; a fast FCP with a slow LCP means the frame arrives before the content.',
    commonCauses: [
      'Render-blocking stylesheets and synchronous scripts in the head.',
      'Slow server response — FCP can never beat TTFB.',
      'Fonts blocking text rendering.',
    ],
    howToFix: [
      'Inline the critical CSS needed for the first screen and load the rest asynchronously.',
      'Add defer or async to scripts that are not required for first paint.',
      'Use font-display: swap so text is visible while the font loads.',
    ],
  },
  {
    id: 'ttfb',
    label: 'Time to First Byte',
    unit: 'ms',
    direction: 'lower-is-better',
    goodAtOrBelow: 800,
    needsImprovementAtOrBelow: 1800,
    source: 'Google, via Lighthouse. Widely used as the server-side budget.',
    referenceUrl: 'https://web.dev/articles/ttfb',
    whatItMeans: 'How long the server took to send the first byte of the response, including DNS, connection and redirects.',
    whyItMatters:
      'It is the floor under every other timing. No amount of front-end optimisation makes a page faster than its TTFB, so a poor result here caps everything else.',
    commonCauses: [
      'Slow database queries or uncached server rendering.',
      'A redirect chain before the real response.',
      'No CDN, so every visitor reaches the origin wherever it is.',
      'Cold starts on serverless platforms.',
    ],
    howToFix: [
      'Cache the response at the edge; a static or ISR page removes the origin from the path entirely.',
      'Remove redirect hops — each one costs a full round trip.',
      'Profile the slowest queries on the request path rather than guessing.',
    ],
  },

  // -------------------------------------------------------------------------
  // Runtime. Measured in a real browser under a device profile.
  // -------------------------------------------------------------------------
  {
    id: 'fps',
    label: 'Frame rate',
    unit: 'fps',
    direction: 'higher-is-better',
    goodAtOrAbove: 55,
    needsImprovementAtOrAbove: 30,
    source:
      'Our judgement, anchored on hardware: displays refresh at 60Hz, so 55+ reads as smooth, and 30 is the widely-accepted floor for playability. Not a published standard.',
    referenceUrl: 'https://web.dev/articles/rendering-performance',
    whatItMeans: 'How many frames the page actually rendered per second, sampled with requestAnimationFrame over several seconds.',
    whyItMatters:
      'Below about 30 frames per second, motion stops reading as motion and starts reading as stutter. For a game it is the difference between playable and not.',
    commonCauses: [
      'Layout thrash — reading a layout property and writing to the DOM in the same loop.',
      'Animating properties that trigger layout, such as width or top, instead of transform and opacity.',
      'Too many simultaneously animated elements, or an overdrawn canvas.',
      'A frame loop driven by setInterval rather than requestAnimationFrame.',
    ],
    howToFix: [
      'Animate only transform and opacity — those run on the compositor and skip layout entirely.',
      'Batch DOM reads and writes separately rather than interleaving them.',
      'Use will-change sparingly on elements that genuinely animate.',
      'Drive frame loops with requestAnimationFrame, which also pauses in background tabs.',
    ],
    doesNotProve:
      'A good average hides stalls. Check the long-frame count alongside it — 60fps average with four 200ms freezes feels worse than a steady 45.',
  },
  {
    id: 'long_frames',
    label: 'Long frames',
    unit: 'count',
    direction: 'lower-is-better',
    goodAtOrBelow: 0,
    needsImprovementAtOrBelow: 3,
    source: 'Our judgement. The 50ms threshold follows the RAIL model, where 50ms is the limit before a user perceives delay.',
    referenceUrl: 'https://web.dev/articles/rail',
    whatItMeans: 'How many individual frames took longer than 50 milliseconds during the sample — each one a visible hitch.',
    whyItMatters:
      'Average frame rate hides stalls. This is the number that corresponds to what a person describes as "it keeps freezing".',
    commonCauses: [
      'A long synchronous task — parsing, sorting, or a large re-render.',
      'Garbage collection triggered by allocation inside the frame loop.',
      'Synchronous network or storage access on the main thread.',
    ],
    howToFix: [
      'Find the task in a performance profile rather than guessing; long frames have a single dominant cause more often than not.',
      'Move heavy computation to a Web Worker.',
      'Avoid allocating objects inside the animation loop.',
    ],
  },
  {
    id: 'heap_used',
    label: 'JavaScript heap in use',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 50 * 1024 * 1024,
    needsImprovementAtOrBelow: 150 * 1024 * 1024,
    source:
      'Our judgement, anchored on mobile behaviour: Safari on iOS terminates tabs in the low hundreds of megabytes, and low-end Android devices evict background tabs sooner.',
    whatItMeans: 'How much memory the page’s JavaScript is holding at the moment of measurement.',
    whyItMatters:
      'A page that grows without bound is eventually killed by the browser. On mobile that appears to the user as the site reloading itself when they switch back to it.',
    commonCauses: [
      'Event listeners attached and never removed, keeping their whole scope alive.',
      'Detached DOM nodes still referenced by a closure or a cache.',
      'Unbounded caches or arrays that only ever grow.',
      'Timers that outlive the component that created them.',
    ],
    howToFix: [
      'Remove listeners in cleanup — useEffect returns, disconnectedCallback, or an AbortController.',
      'Take two heap snapshots in DevTools with the leaking interaction between them and compare retained objects.',
      'Cap caches with an eviction policy rather than trusting them to stay small.',
    ],
  },
  {
    id: 'heap_growth',
    label: 'Heap growth during idle',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 1024 * 1024,
    needsImprovementAtOrBelow: 5 * 1024 * 1024,
    source: 'Our judgement. Any sustained growth while the page is idle is the signal; the bands set how loudly we say it.',
    whatItMeans: 'How much memory the page allocated while doing nothing, measured across a settle window after load.',
    whyItMatters:
      'An idle page should not grow. Growth with no interaction is the clearest available signal of a leak, and it compounds over a long session.',
    commonCauses: [
      'A polling timer accumulating results it never discards.',
      'An animation loop allocating objects every frame.',
      'A subscription that reconnects and registers a new handler each time.',
    ],
    howToFix: [
      'Identify what runs on a timer while idle and confirm each one releases what it allocates.',
      'Reuse objects inside animation loops rather than creating them per frame.',
    ],
    doesNotProve:
      'A small number here does not rule out a leak. Leaks often only appear across navigation or repeated interaction, which a single page load does not exercise.',
  },
  {
    id: 'dom_nodes',
    label: 'DOM nodes',
    unit: 'count',
    direction: 'lower-is-better',
    goodAtOrBelow: 1500,
    needsImprovementAtOrBelow: 3000,
    source: 'Lighthouse — warns above 1,400 and flags an error above 3,000 nodes.',
    referenceUrl: 'https://developer.chrome.com/docs/lighthouse/performance/dom-size',
    whatItMeans: 'How many elements exist in the page at once.',
    whyItMatters:
      'Every style recalculation and layout pass walks this tree. A large DOM makes every interaction more expensive, and the cost is paid on the slowest device, not yours.',
    commonCauses: [
      'Rendering a long list in full rather than virtualising it.',
      'Deeply nested wrapper elements from a component library.',
      'Hidden content that is rendered anyway — modals, tabs, off-screen carousels.',
    ],
    howToFix: [
      'Virtualise long lists so only visible rows exist.',
      'Render tab and modal content on demand rather than up front.',
      'Flatten unnecessary wrapper nesting.',
    ],
  },
  {
    id: 'event_listeners',
    label: 'Event listeners',
    unit: 'count',
    direction: 'lower-is-better',
    goodAtOrBelow: 500,
    needsImprovementAtOrBelow: 1500,
    source: 'Our judgement. There is no published budget; the value is in watching it grow rather than in the absolute number.',
    whatItMeans: 'How many event listeners are registered across the page.',
    whyItMatters:
      'A count that climbs on every navigation is a leak in progress — each listener holds its entire closure scope alive.',
    commonCauses: [
      'Listeners added on mount without a matching removal on unmount.',
      'Delegation avoided in favour of per-row handlers on a long list.',
    ],
    howToFix: [
      'Use one delegated listener on a container rather than one per child.',
      'Pass an AbortController signal to addEventListener and abort it in cleanup.',
    ],
  },
  {
    id: 'transfer_bytes',
    label: 'Transfer size',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 1600 * 1024,
    needsImprovementAtOrBelow: 4 * 1024 * 1024,
    source:
      'Our judgement, anchored on the widely-cited 1.6 MB page-weight budget for a usable mobile experience on 3G.',
    referenceUrl: 'https://web.dev/articles/your-first-performance-budget',
    whatItMeans: 'Total bytes downloaded to render the page, summed from every response.',
    whyItMatters:
      'On a metered or congested connection this is both a wait and a cost. It is also the metric that most directly translates to bounce rate on mobile.',
    commonCauses: [
      'Uncompressed or oversized images.',
      'Shipping an entire JavaScript library to use one function from it.',
      'No compression on text responses.',
      'Fonts in multiple weights that are never used.',
    ],
    howToFix: [
      'Serve AVIF or WebP at display size, with srcset for density.',
      'Enable Brotli on text responses.',
      'Split bundles by route so the first page does not carry the whole application.',
      'Subset fonts to the characters actually used.',
    ],
  },

  {
    id: 'js_bytes',
    label: 'JavaScript weight',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 300 * 1024,
    needsImprovementAtOrBelow: 600 * 1024,
    source:
      'Widely-published performance budget of 300 KB compressed JavaScript, cited as the level that keeps the main thread free enough to pass INP.',
    referenceUrl: 'https://web.dev/articles/your-first-performance-budget',
    whatItMeans: 'Total compressed JavaScript downloaded to render the page.',
    whyItMatters:
      'JavaScript is the most expensive byte on the web: it must be downloaded, parsed, compiled and executed, and all of that competes with the main thread that handles taps. It is the single biggest lever on INP.',
    commonCauses: [
      'Importing a whole library for one function.',
      'No route-level code splitting, so the first page carries the entire application.',
      'Polyfills shipped to browsers that do not need them.',
      'Third-party tags — analytics, chat, A/B testing — added one at a time and never removed.',
    ],
    howToFix: [
      'Split by route so a visitor downloads only the page they asked for.',
      'Audit the bundle before guessing; the largest dependency is rarely the one you expect.',
      'Load third-party scripts after interaction rather than in the head.',
    ],
  },
  {
    id: 'css_bytes',
    label: 'CSS weight',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 80 * 1024,
    needsImprovementAtOrBelow: 200 * 1024,
    source: 'Widely-published performance budget of 80 KB compressed CSS.',
    referenceUrl: 'https://web.dev/articles/your-first-performance-budget',
    whatItMeans: 'Total compressed CSS downloaded, all of which blocks the first render.',
    whyItMatters:
      'Unlike JavaScript, CSS blocks rendering by default. Every byte here is time the visitor spends looking at nothing.',
    commonCauses: [
      'A full framework stylesheet where a handful of utilities were used.',
      'Unpurged utility CSS.',
      'Styles for pages the visitor is not on.',
    ],
    howToFix: [
      'Purge unused selectors at build time.',
      'Inline the critical CSS for the first screen and load the rest asynchronously.',
    ],
  },
  {
    id: 'hero_image_bytes',
    label: 'Hero image weight',
    unit: 'bytes',
    direction: 'lower-is-better',
    goodAtOrBelow: 200 * 1024,
    needsImprovementAtOrBelow: 500 * 1024,
    source: 'Published budget of 200 KB for the LCP image, cited as the level compatible with a 2.5s LCP.',
    referenceUrl: 'https://web.dev/articles/optimize-lcp',
    whatItMeans: 'Weight of the largest above-the-fold image — usually the element LCP is measured against.',
    whyItMatters:
      'On most content pages the hero image IS the LCP element, so its weight sets the ceiling on the score no other change can lift.',
    commonCauses: [
      'A full-resolution photograph served at display size by CSS rather than resized.',
      'PNG used for a photograph.',
      'No srcset, so a phone downloads the desktop asset.',
    ],
    howToFix: [
      'Serve AVIF or WebP with a JPEG fallback.',
      'Provide srcset and sizes so each device gets an appropriate file.',
      'Add fetchpriority="high" and never loading="lazy" on the LCP image.',
    ],
  },

  // -------------------------------------------------------------------------
  // Model and game budgets. Ours, and labelled as such.
  // -------------------------------------------------------------------------
  {
    id: 'model_triangles',
    label: 'Model triangles',
    unit: 'count',
    direction: 'lower-is-better',
    goodAtOrBelow: 100_000,
    needsImprovementAtOrBelow: 300_000,
    source:
      'Our judgement, anchored on mobile GPU capability for a single character-scale asset. Not a published standard, and scene budgets differ from per-model budgets.',
    whatItMeans: 'How many triangles the 3D model contains, counted from the glTF accessors rather than estimated.',
    whyItMatters:
      'Triangle count sets the floor on GPU cost. It is per-model, so a scene containing several of these multiplies it.',
    commonCauses: [
      'Exporting a film-resolution or sculpting-resolution mesh directly.',
      'Subdivision or turbosmooth modifiers left enabled on export.',
      'No level-of-detail chain, so the full mesh renders at every distance.',
    ],
    howToFix: [
      'Decimate to a game-resolution mesh and bake the detail into a normal map.',
      'Export an LOD chain so distant instances use a cheaper mesh.',
    ],
    doesNotProve:
      'Triangle count predicts cost; it does not measure frame rate. A low-poly model with expensive shaders can still be slow.',
  },
  {
    id: 'texture_edge',
    label: 'Largest texture edge',
    unit: 'px',
    direction: 'lower-is-better',
    goodAtOrBelow: 2048,
    needsImprovementAtOrBelow: 4096,
    source: 'Our judgement, anchored on common mobile GPU texture limits and memory behaviour.',
    whatItMeans: 'The longest edge of the largest texture, read from the image headers inside the model.',
    whyItMatters:
      'Texture memory scales with area, so doubling the edge quadruples the cost. Mobile drivers frequently downsample large textures anyway — the bytes are paid for and the detail is not delivered.',
    commonCauses: [
      'Authoring at 4K and exporting without downsampling.',
      'PNG textures where a compressed format would do.',
    ],
    howToFix: [
      'Downsample to 2048px or below unless the asset genuinely fills the screen.',
      'Use KTX2/Basis supercompressed textures, which stay compressed in GPU memory.',
    ],
  },
];

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));

export function metric(id: string): MetricDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Rates a value against its metric's bands.
 *
 * Returns 'unrated' when the metric is unknown or the value is null — never a
 * default of 'good'. A missing measurement rendered green is a lie told by
 * omission, and it is the easiest one to ship.
 */
export function rate(metricId: string, value: number | null | undefined): Rating {
  const def = BY_ID.get(metricId);
  if (!def || value === null || value === undefined || Number.isNaN(value)) return 'unrated';

  if (def.direction === 'lower-is-better') {
    if (def.goodAtOrBelow !== undefined && value <= def.goodAtOrBelow) return 'good';
    if (def.needsImprovementAtOrBelow !== undefined && value <= def.needsImprovementAtOrBelow) {
      return 'needs-improvement';
    }
    return 'poor';
  }

  if (def.goodAtOrAbove !== undefined && value >= def.goodAtOrAbove) return 'good';
  if (def.needsImprovementAtOrAbove !== undefined && value >= def.needsImprovementAtOrAbove) {
    return 'needs-improvement';
  }
  return 'poor';
}

/** Colour tokens for a rating. Referenced, never hardcoded at call sites. */
export const RATING_COLOR: Readonly<Record<Rating, string>> = {
  good: 'var(--brand-emerald-400)',
  'needs-improvement': 'var(--brand-amber-400)',
  poor: 'var(--brand-rose-400)',
  unrated: 'var(--brand-slate-500)',
};

export const RATING_LABEL: Readonly<Record<Rating, string>> = {
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  poor: 'Poor',
  // Said plainly rather than shown as a dash, so nobody reads a blank as a pass.
  unrated: 'Not measured',
};

/** Human-readable band description, for the tooltip and the reference page. */
export function bandsText(def: MetricDefinition): string {
  const u = def.unit === 'bytes' ? '' : ` ${def.unit}`;
  const fmt = (n: number): string =>
    def.unit === 'bytes'
      ? n >= 1024 * 1024
        ? `${(n / 1024 / 1024).toFixed(1)} MB`
        : `${(n / 1024).toFixed(0)} KB`
      : `${n.toLocaleString()}${u}`;

  if (def.direction === 'lower-is-better') {
    return (
      `Good: ${fmt(def.goodAtOrBelow ?? 0)} or less · ` +
      `Needs improvement: up to ${fmt(def.needsImprovementAtOrBelow ?? 0)} · ` +
      `Poor: above ${fmt(def.needsImprovementAtOrBelow ?? 0)}`
    );
  }
  return (
    `Good: ${fmt(def.goodAtOrAbove ?? 0)} or more · ` +
    `Needs improvement: ${fmt(def.needsImprovementAtOrAbove ?? 0)} and above · ` +
    `Poor: below ${fmt(def.needsImprovementAtOrAbove ?? 0)}`
  );
}

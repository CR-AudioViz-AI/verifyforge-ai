/**
 * lib/engine/discover.ts
 *
 * Route discovery.
 *
 * A customer types one URL. Everything downstream needs a surface to test, and
 * assembling that surface by hand is the difference between a demo and a
 * product. This finds it.
 *
 * Four sources, in order of reliability:
 *   1. sitemap.xml, including sitemap indexes — what the site says it has.
 *   2. robots.txt — for the sitemap pointer and the exclusions we will honour.
 *   3. Links crawled breadth-first from the entry point — what is reachable.
 *   4. Route strings extracted from JavaScript bundles — what exists but is not
 *      linked. This is where the pages nobody remembers building turn up, and it
 *      is where hollow routes concentrate.
 *
 * Source four is the one that matters. A crawler that only follows links finds
 * the pages someone maintained well enough to link to. The eighty null-returning
 * pages we found on our own platform were mostly unlinked.
 *
 * Every request is rate-limited to the target's declared budget and the whole
 * crawl is bounded by page count, depth, and wall-clock time. A scan that
 * degrades the thing it is measuring is not a scan.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { Target } from '../modules/target';
import { guardedFetch } from '@/lib/net/egress-guard';

export interface DiscoveredRoute {
  readonly url: string;
  readonly source: 'sitemap' | 'link' | 'bundle' | 'entry';
  readonly depth: number;
}

export interface DiscoveryBudget {
  readonly maxPages: number;
  readonly maxDepth: number;
  readonly maxWallClockMs: number;
}

export interface DiscoveryResult {
  readonly routes: readonly DiscoveredRoute[];
  readonly bySource: Readonly<Record<DiscoveredRoute['source'], number>>;
  readonly excludedByRobots: readonly string[];
  readonly unreachable: readonly string[];
  readonly requestsIssued: number;
  readonly budgetExhausted: boolean;
  /** Stated plainly so a truncated crawl is never read as a complete one. */
  readonly completeness: 'complete' | 'truncated';
}

const USER_AGENT = 'JavariVerify/1.0 (+https://craudiovizai.com)';

export const DEFAULT_BUDGET: DiscoveryBudget = {
  maxPages: 500,
  maxDepth: 6,
  maxWallClockMs: 180_000,
};

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsRules {
  readonly disallowed: readonly string[];
  readonly sitemaps: readonly string[];
}

function parseRobots(text: string): RobotsRules {
  const disallowed: string[] = [];
  const sitemaps: string[] = [];
  let appliesToUs = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line.length === 0) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      appliesToUs = value === '*' || value.toLowerCase().includes('javariverify');
      continue;
    }
    if (field === 'disallow' && appliesToUs && value.length > 0) {
      disallowed.push(value);
    }
  }

  return { disallowed, sitemaps };
}

function isDisallowed(pathname: string, rules: RobotsRules): boolean {
  return rules.disallowed.some((rule) => pathname.startsWith(rule));
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extractLinks(html: string, base: URL): string[] {
  const found: string[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const href = match[1];
    if (href === undefined) continue;
    if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue;
    try {
      found.push(new URL(href, base).toString());
    } catch {
      // Unparseable href. Ignore rather than fail the crawl.
    }
  }
  return found;
}

function extractScriptSources(html: string, base: URL): string[] {
  const found: string[] = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const src = match[1];
    if (src === undefined) continue;
    try {
      const resolved = new URL(src, base);
      if (resolved.origin === base.origin) found.push(resolved.toString());
    } catch {
      // Ignore.
    }
  }
  return found;
}

/**
 * Route-shaped string literals inside a JavaScript bundle.
 *
 * Deliberately conservative. A bundle contains thousands of strings and most are
 * not routes; a loose pattern produces a crawl full of 404s, which is a gate
 * that cries wolf. Requires a leading slash, a plausible path segment, and
 * excludes anything that looks like an asset or a MIME type.
 */
function extractRoutesFromBundle(source: string): string[] {
  const found = new Set<string>();
  const pattern = /["'](\/[a-z0-9][a-z0-9\-_/]{1,60})["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const candidate = match[1];
    if (candidate === undefined) continue;
    if (/\.(js|css|png|jpe?g|svg|webp|ico|woff2?|map|json|txt|xml)$/i.test(candidate)) continue;
    if (/^\/(_next|static|assets|api|node_modules)\b/i.test(candidate)) continue;
    if (candidate.includes('//')) continue;
    found.add(candidate);
  }
  return [...found];
}

function extractSitemapUrls(xml: string): { urls: string[]; nested: string[] } {
  const urls: string[] = [];
  const nested: string[] = [];
  const isIndex = /<sitemapindex\b/i.test(xml);
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const loc = match[1];
    if (loc === undefined) continue;
    if (isIndex) nested.push(loc);
    else urls.push(loc);
  }
  return { urls, nested };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export async function discover(
  target: Target,
  budget: DiscoveryBudget = DEFAULT_BUDGET,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const entry = new URL(target.address);
  const origin = entry.origin;
  const startedAt = Date.now();
  const minIntervalMs = Math.ceil(1000 / Math.max(target.rateLimitRps, 0.1));

  const seen = new Map<string, DiscoveredRoute>();
  const excludedByRobots: string[] = [];
  const unreachable: string[] = [];
  let requestsIssued = 0;
  let budgetExhausted = false;

  const outOfBudget = (): boolean =>
    seen.size >= budget.maxPages ||
    Date.now() - startedAt > budget.maxWallClockMs ||
    signal?.aborted === true;

  async function get(url: string): Promise<string | null> {
    requestsIssued += 1;
    try {
      const response = await guardedFetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        ...(signal !== undefined ? { signal } : {}),
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      unreachable.push(url);
      return null;
    } finally {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
    }
  }

  // --- robots.txt -----------------------------------------------------------
  let rules: RobotsRules = { disallowed: [], sitemaps: [] };
  if (target.respectRobotsTxt) {
    const robotsText = await get(`${origin}/robots.txt`);
    if (robotsText !== null) rules = parseRobots(robotsText);
  }

  const admit = (rawUrl: string, source: DiscoveredRoute['source'], depth: number): void => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.origin !== origin) return;

    parsed.hash = '';
    const normalised = parsed.toString();
    if (seen.has(normalised)) return;

    if (target.respectRobotsTxt && isDisallowed(parsed.pathname, rules)) {
      excludedByRobots.push(normalised);
      return;
    }
    if (seen.size >= budget.maxPages) {
      budgetExhausted = true;
      return;
    }
    seen.set(normalised, { url: normalised, source, depth });
  };

  admit(entry.toString(), 'entry', 0);

  // --- sitemaps -------------------------------------------------------------
  const sitemapCandidates = [...rules.sitemaps, `${origin}/sitemap.xml`];
  const visitedSitemaps = new Set<string>();

  while (sitemapCandidates.length > 0 && !outOfBudget()) {
    const candidate = sitemapCandidates.shift();
    if (candidate === undefined || visitedSitemaps.has(candidate)) continue;
    visitedSitemaps.add(candidate);

    const xml = await get(candidate);
    if (xml === null) continue;

    const { urls, nested } = extractSitemapUrls(xml);
    for (const url of urls) admit(url, 'sitemap', 1);
    // Bounded: a malicious or misconfigured index will not spiral.
    for (const child of nested.slice(0, 20)) sitemapCandidates.push(child);
  }

  // --- breadth-first link crawl + bundle extraction -------------------------
  const queue: DiscoveredRoute[] = [...seen.values()];
  const fetched = new Set<string>();
  const bundlesRead = new Set<string>();

  while (queue.length > 0 && !outOfBudget()) {
    const current = queue.shift();
    if (current === undefined) continue;
    if (fetched.has(current.url) || current.depth >= budget.maxDepth) continue;
    fetched.add(current.url);

    const html = await get(current.url);
    if (html === null) continue;

    const base = new URL(current.url);

    for (const link of extractLinks(html, base)) {
      const before = seen.size;
      admit(link, 'link', current.depth + 1);
      const added = seen.get(new URL(link, base).toString().replace(/#.*$/, ''));
      if (seen.size > before && added !== undefined) queue.push(added);
    }

    // Bundles are read from the entry page and the first level only. Reading
    // every bundle on every page costs requests and returns the same routes.
    if (current.depth <= 1) {
      for (const scriptUrl of extractScriptSources(html, base).slice(0, 8)) {
        if (bundlesRead.has(scriptUrl) || outOfBudget()) continue;
        bundlesRead.add(scriptUrl);

        const source = await get(scriptUrl);
        if (source === null) continue;

        for (const path of extractRoutesFromBundle(source)) {
          admit(`${origin}${path}`, 'bundle', current.depth + 1);
        }
      }
    }
  }

  if (Date.now() - startedAt > budget.maxWallClockMs || seen.size >= budget.maxPages) {
    budgetExhausted = true;
  }

  const routes = [...seen.values()];
  const bySource: Record<DiscoveredRoute['source'], number> = {
    entry: 0,
    sitemap: 0,
    link: 0,
    bundle: 0,
  };
  for (const route of routes) bySource[route.source] += 1;

  return {
    routes,
    bySource,
    excludedByRobots,
    unreachable,
    requestsIssued,
    budgetExhausted,
    completeness: budgetExhausted ? 'truncated' : 'complete',
  };
}

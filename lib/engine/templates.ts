/**
 * lib/engine/templates.ts
 *
 * Template clustering — the answer to "can you test a site the size of Target?"
 *
 * You cannot politely crawl a million URLs. At the 4 requests/second we hold
 * ourselves to, a million pages is 69 hours, and it would hammer the customer's
 * origin for three days. That is not a scan, it is a denial-of-service with an
 * invoice.
 *
 * You also do not NEED to. A million-product retail site has perhaps twenty to
 * fifty page TEMPLATES — a product page, a category page, a search result, a
 * cart, an account page. A defect lives in a template, not a URL: if the product
 * template leaks data or returns hollow, it does so on all million instances.
 * Test one live instance of each template, plus a statistical sample to catch
 * per-instance data problems, and you have covered the site.
 *
 * This clusters discovered routes into templates by URL shape and lets the
 * scanner test representatives rather than the whole population. It is what makes
 * the product work at any size, and it is what the size-based pricing tiers are
 * actually measuring: number of distinct templates, not raw URL count.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { DiscoveredRoute } from './discover';

export interface RouteTemplate {
  /** The normalized shape, e.g. "/product/{id}" or "/c/{slug}/{slug}". */
  readonly pattern: string;
  /** Every route that matches this shape. */
  readonly members: readonly DiscoveredRoute[];
  /** Routes chosen to actually test — one canonical plus a sample. */
  readonly representatives: readonly DiscoveredRoute[];
}

export interface ClusterResult {
  readonly templates: readonly RouteTemplate[];
  readonly totalRoutes: number;
  readonly totalTemplates: number;
  /** Routes we will actually test, across all templates. */
  readonly routesToTest: readonly string[];
  readonly coverageNote: string;
}

/**
 * Reduces a path segment to a shape token. Numbers, UUIDs, slugs and hashes all
 * become their type, so /product/8412 and /product/9931 collapse to the same
 * template while /product and /cart stay distinct.
 */
function tokenizeSegment(segment: string): string {
  if (segment.length === 0) return segment;
  if (/^\d+$/.test(segment)) return '{id}';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return '{uuid}';
  if (/^[0-9a-f]{16,}$/i.test(segment)) return '{hash}';
  if (/^[A-Z0-9]{6,}$/.test(segment)) return '{sku}';
  // A segment with digits mixed into words is usually a slug-with-id.
  if (/\d/.test(segment) && /[a-z]/i.test(segment)) return '{slug}';
  // Long hyphenated lowercase strings are slugs (product-title-here).
  if (segment.length > 20 && segment.includes('-')) return '{slug}';
  return segment;
}

function templateOf(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return url;
  }
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '/';
  return '/' + segments.map(tokenizeSegment).join('/');
}

/**
 * Chooses which members of a template to actually test.
 *
 * One is never enough for a data-bearing template — a product page can be sound
 * for product A and leak for product B if authorization is per-record. So we
 * take the first (canonical) plus a square-root sample of the rest, capped, so a
 * template with 100,000 members contributes a bounded, representative handful
 * rather than all 100,000.
 */
function pickRepresentatives(
  members: readonly DiscoveredRoute[],
  maxPerTemplate: number,
): readonly DiscoveredRoute[] {
  if (members.length <= maxPerTemplate) return members;

  const sampleSize = Math.min(maxPerTemplate, Math.max(2, Math.ceil(Math.sqrt(members.length))));
  const chosen: DiscoveredRoute[] = [];
  const first = members[0];
  if (first !== undefined) chosen.push(first);

  // Even stride across the population so the sample is spread, not clustered.
  const stride = Math.max(1, Math.floor(members.length / sampleSize));
  for (let i = stride; i < members.length && chosen.length < sampleSize; i += stride) {
    const member = members[i];
    if (member !== undefined) chosen.push(member);
  }
  return chosen;
}

export function clusterRoutes(
  routes: readonly DiscoveredRoute[],
  maxPerTemplate = 5,
): ClusterResult {
  const byTemplate = new Map<string, DiscoveredRoute[]>();

  for (const route of routes) {
    const pattern = templateOf(route.url);
    const bucket = byTemplate.get(pattern);
    if (bucket === undefined) byTemplate.set(pattern, [route]);
    else bucket.push(route);
  }

  const templates: RouteTemplate[] = [];
  const routesToTest: string[] = [];

  for (const [pattern, members] of byTemplate) {
    const representatives = pickRepresentatives(members, maxPerTemplate);
    templates.push({ pattern, members, representatives });
    for (const rep of representatives) routesToTest.push(rep.url);
  }

  // Largest templates first — they carry the most risk and the most instances.
  templates.sort((a, b) => b.members.length - a.members.length);

  const totalRoutes = routes.length;
  const sampledTemplates = templates.filter((t) => t.representatives.length < t.members.length);

  const coverageNote =
    sampledTemplates.length === 0
      ? `All ${totalRoutes} routes fall into ${templates.length} templates, and every ` +
        `route was tested directly.`
      : `${totalRoutes} routes reduce to ${templates.length} templates. ` +
        `${sampledTemplates.length} template${sampledTemplates.length === 1 ? '' : 's'} ` +
        `had more instances than the sample size, so ${routesToTest.length} representative ` +
        `routes were tested. A defect in a template is present on every instance of it; ` +
        `per-instance data defects outside the sample are the one thing this cannot rule out, ` +
        `and that limitation is stated on the report.`;

  return {
    templates,
    totalRoutes,
    totalTemplates: templates.length,
    routesToTest,
    coverageNote,
  };
}

/**
 * The blind spot template sampling introduces, for the report. Honest about the
 * exact thing sampling cannot see: a defect that exists on some instances of a
 * template but not the ones we sampled.
 */
export function samplingBlindSpots(result: ClusterResult): readonly string[] {
  const sampled = result.templates.filter((t) => t.representatives.length < t.members.length);
  if (sampled.length === 0) return [];
  return [
    `This site was tested by template: ${result.totalRoutes} routes across ` +
      `${result.totalTemplates} templates, with representative instances sampled from the ` +
      `largest templates. A defect present on the whole template was caught; a defect on ` +
      `specific instances outside the sample (for example, one product record among ` +
      `thousands with a unique authorization flaw) may not have been. To test every ` +
      `instance of a template exhaustively, scan that template's routes directly.`,
  ];
}

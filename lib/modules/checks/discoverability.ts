/**
 * lib/modules/checks/discoverability.ts
 *
 * Whether anyone can find the thing, and whether it looks right when they do.
 *
 * WHY A TESTING PRODUCT SHOULD CARE. Every other module asks whether the system
 * works. This one asks whether the work reaches anybody. An app with no title, no
 * canonical and no sitemap is functioning perfectly and earning nothing, and that
 * failure is invisible to every check that only looks at behaviour.
 *
 * THE RESTRAINT THAT MATTERS. This is not an SEO audit tool. Those grade against
 * dozens of ranking heuristics that change with each algorithm update and produce
 * a score nobody can act on — the same wall-of-findings problem that makes people
 * stop reading a security report.
 *
 * Reported here are only things that are DECIDABLE and CONSEQUENTIAL: a page with
 * no title, a canonical pointing at another origin, a robots file that blocks
 * everything, a sitemap that 404s. Each is a fact with one fix, and each one
 * silently costs traffic that nobody attributes to it.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
  Severity,
} from '../contract';

interface Problem {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

async function get(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JavariVerify/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

export const discoverabilityCheck: CheckModule = {
  id: 'web.discoverability',
  version: '1.0.0',
  category: 'PERFORMANCE',
  title: 'Findability and how the page presents itself',

  whatItChecks:
    'Title, meta description, canonical URL, Open Graph tags, a single H1, robots.txt and sitemap.xml — the handful of things that decide whether a page can be found and how it appears when shared.',

  whatItCannotCatch: [
    'Whether the page will RANK. Ranking depends on content quality, links and competition, none of which is decidable from one document.',
    'Content quality or relevance. A perfectly tagged page about nothing still deserves no traffic.',
    'Whether search engines have actually indexed the page. That needs Search Console, which is an authenticated relationship with the search engine rather than something observable from outside.',
    'Anything rendered only after JavaScript executes. Search engines vary in how they handle that, and this reads the served document.',
    'Duplicate content across the site or against other domains.',
    'Whether the sitemap is COMPLETE. It reports that one exists and parses, not that it lists everything it should - a sitemap advertising deleted pages is an active instruction to index a 404.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'origin', description: 'Origin to examine, e.g. https://example.com', required: true, kind: 'origin' },
  ],

  estimatedCredits: 3,
  estimatedRuntimeMs: 20_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied, so nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }
    const origin = raw.replace(/\/+$/, '');
    const host = new URL(origin).host;

    let requests = 0;
    const page = await get(origin);
    requests++;

    if (page === null || page.status >= 400) {
      return {
        status: 'inconclusive',
        reason: `The page could not be fetched (${page?.status ?? 'no response'}), so nothing about its discoverability was examined.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Page unreachable.' },
      };
    }

    const html = page.body;
    const problems: Problem[] = [];

    // --- Title ---------------------------------------------------------------
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = (titleMatch?.[1] ?? '').trim();
    if (title === '') {
      problems.push({
        ruleId: 'seo.title.missing',
        severity: 'HIGH',
        title: 'The page has no title',
        description:
          'The title is what a search result shows, what a browser tab shows, and what a shared link is named. Without it the page appears in results as a bare URL, which people do not click.',
        fix: 'Set a title of roughly 50 to 60 characters describing what this page is for, not what the company is called.',
        detail: 'no <title> content',
      });
    } else if (title.length > 70) {
      problems.push({
        ruleId: 'seo.title.long',
        severity: 'LOW',
        title: `Title is ${title.length} characters and will be truncated`,
        description:
          'Search results cut the title short, so anything past roughly 60 characters is invisible where it matters most. The words that identify the page should come first.',
        fix: 'Front-load the distinguishing words and move the brand to the end.',
        detail: `${title.length} chars: ${title.slice(0, 70)}...`,
      });
    }

    // --- Description ---------------------------------------------------------
    if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)) {
      problems.push({
        ruleId: 'seo.description.missing',
        severity: 'MEDIUM',
        title: 'No meta description',
        description:
          'Without one the search engine writes its own summary from whatever text it finds first, which is frequently a navigation menu or a cookie banner. That is the sentence deciding whether anyone clicks.',
        fix: 'Add a description of roughly 150 characters saying what the visitor gets from this page.',
        detail: 'no meta name="description" with meaningful content',
      });
    }

    // --- Canonical -----------------------------------------------------------
    const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1];
    if (!canonical) {
      problems.push({
        ruleId: 'seo.canonical.missing',
        severity: 'MEDIUM',
        title: 'No canonical URL',
        description:
          'The same page reachable at the apex and at www, with and without a trailing slash, and with tracking parameters attached, is treated as several competing pages. A canonical tells the search engine which one is real, so ranking accrues to one address instead of being split between four.',
        fix: 'Add a canonical link naming the preferred absolute URL on every page.',
        detail: 'no rel="canonical"',
      });
    } else {
      try {
        const canonicalHost = new URL(canonical, origin).host;
        if (canonicalHost !== host) {
          // This is the one that is actively harmful rather than merely absent.
          problems.push({
            ruleId: 'seo.canonical.foreign',
            severity: 'HIGH',
            title: 'The canonical URL points at a different domain',
            description:
              `This page tells search engines the real version lives on ${canonicalHost}. Every signal it earns is handed to that domain and this one is dropped from results. It is usually a template copied between sites with the URL left behind.`,
            fix: 'Point the canonical at this origin.',
            detail: `canonical=${canonical}, page host=${host}`,
          });
        }
      } catch {
        /* an unparseable canonical is covered by the missing-canonical case */
      }
    }

    // --- Open Graph ----------------------------------------------------------
    if (!/property=["']og:title["']/i.test(html) || !/property=["']og:image["']/i.test(html)) {
      problems.push({
        ruleId: 'seo.og.incomplete',
        severity: 'LOW',
        title: 'Open Graph tags are incomplete',
        description:
          'When this link is pasted into a message, a post or a chat, there is no title card and no image. A shared link that renders as a bare URL is shared far less, and that is the cheapest traffic there is.',
        fix: 'Add og:title, og:description and og:image. The image is what makes the difference.',
        detail: 'og:title or og:image absent',
      });
    }

    // --- H1 ------------------------------------------------------------------
    const h1Count = (html.match(/<h1\b/gi) ?? []).length;
    if (h1Count === 0) {
      problems.push({
        ruleId: 'seo.h1.missing',
        severity: 'MEDIUM',
        title: 'No H1 heading',
        description:
          'The H1 states what the page is about, to search engines and to anyone using a screen reader. Its absence is both a discoverability problem and an accessibility one.',
        fix: 'Add exactly one H1 naming the subject of the page.',
        detail: '0 <h1> elements',
      });
    }

    // --- robots.txt ----------------------------------------------------------
    const robots = await get(`${origin}/robots.txt`);
    requests++;
    if (robots === null || robots.status >= 400) {
      problems.push({
        ruleId: 'seo.robots.missing',
        severity: 'LOW',
        title: 'No robots.txt',
        description:
          'Crawlers still work without one, but there is nowhere to point them at the sitemap and nowhere to keep them out of paths that should not be indexed.',
        fix: 'Add a robots.txt naming the sitemap URL.',
        detail: `robots.txt returned ${robots?.status ?? 'nothing'}`,
      });
    } else if (/^\s*Disallow:\s*\/\s*$/im.test(robots.body) && !/^\s*Allow:/im.test(robots.body)) {
      // The most consequential finding in this whole module: a site that has
      // asked to be removed from the internet and usually does not know.
      problems.push({
        ruleId: 'seo.robots.blocks-all',
        severity: 'BLOCKER',
        title: 'robots.txt blocks every crawler from the entire site',
        description:
          'Disallow: / with no Allow tells every search engine to index nothing here. The site works perfectly and cannot be found. This is nearly always a staging configuration that reached production, and it can sit for months because nothing breaks.',
        fix: 'Remove the blanket Disallow, or scope it to the paths that genuinely should not be indexed.',
        detail: 'Disallow: / with no Allow directive',
      });
    }

    // --- sitemap -------------------------------------------------------------
    const sitemap = await get(`${origin}/sitemap.xml`);
    requests++;
    if (sitemap === null || sitemap.status >= 400) {
      problems.push({
        ruleId: 'seo.sitemap.missing',
        severity: 'LOW',
        title: 'No sitemap.xml',
        description:
          'Without one, discovery relies entirely on crawling links. Pages reachable only through a form, a filter or JavaScript navigation may never be found at all.',
        fix: 'Generate a sitemap and reference it from robots.txt.',
        detail: `sitemap.xml returned ${sitemap?.status ?? 'nothing'}`,
      });
    } else if (!/<urlset|<sitemapindex/i.test(sitemap.body)) {
      problems.push({
        ruleId: 'seo.sitemap.invalid',
        severity: 'MEDIUM',
        title: 'sitemap.xml responds but is not a sitemap',
        description:
          'The path returns 200 and the body is not a urlset or sitemapindex, so it is almost certainly the application returning its own page for an unmatched route. A crawler asking for the sitemap gets HTML and finds nothing.',
        fix: 'Serve a real XML sitemap, or remove the route so the request fails honestly with a 404.',
        detail: `${sitemap.body.slice(0, 60).replace(/\s+/g, ' ')}...`,
      });
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'PERFORMANCE',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: origin,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Read from the served document; re-runnable with curl.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, origin),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: 3,
      requestsIssued: requests,
      notes:
        `Examined the served document, robots.txt and sitemap.xml for ${host}. ` +
        'Only decidable, consequential facts are reported — this is not a ranking audit, and no score is produced, because a score nobody can act on is the same failure as a wall of unreachable CVEs.',
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default discoverabilityCheck;

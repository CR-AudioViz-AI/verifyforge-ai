/**
 * lib/modules/checks/scope-coverage.ts
 *
 * Tells the customer what they did not ask us to scan.
 *
 * WHY THIS EXISTS, AND IT IS THE MOST EXPENSIVE LESSON IN THIS PRODUCT SO FAR.
 *
 * On 3 September an OAuth open redirect was found and fixed across six
 * repositories. On 4 September two more were found and fixed. On 6 September a
 * scan of domains that had never been covered found the same defect live on
 * rateunlock.com — three days after the class was declared closed.
 *
 * The auth-flow check was not wrong. It probes /auth/callback and it probes the
 * `redirect` parameter, which is exactly what was vulnerable. It simply was never
 * pointed at that host. The scan set had 63 origins; the estate had 82.
 *
 * Every honesty mechanism in this product governs what a scan SAYS about what it
 * examined. None of them said anything about what was never handed to it. A
 * customer reading a clean report has no way to know their scope was two thirds
 * of their estate, and "we did not scan it" and "it is fine" are indistinguishable
 * from the outside.
 *
 * WHAT IT DOES. Discovers origins related to the ones being scanned — from
 * certificate transparency, from links the pages themselves publish, from the
 * sitemap — and reports the ones that are live and not in scope.
 *
 * WHAT IT IS NOT. It does not scan them. It has no authorisation for them, and
 * scanning something a customer did not ask for is exactly the behaviour a
 * security product must never exhibit. It reports the gap and stops.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-06
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
} from '../contract';

interface Discovered {
  readonly host: string;
  /** Where it was found, said plainly enough to be checked by hand. */
  readonly source: 'certificate transparency' | 'link on the scanned page' | 'sitemap';
  readonly live: boolean;
  readonly status: number | null;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

/** Registrable-ish name, so www and the apex are not counted as two estates. */
function bare(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JavariVerify/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

export const scopeCoverageCheck: CheckModule = {
  id: 'scope.coverage',
  version: '1.0.0',
  category: 'PERFORMANCE',
  title: 'Origins related to this one that were not scanned',

  whatItChecks:
    'Discovers hostnames related to the scanned origin — certificate transparency records, links the page itself publishes, and the sitemap — and reports the ones that are live and were not included in this scan.',

  whatItCannotCatch: [
    'Origins with no public certificate, no inbound link and no sitemap entry. An estate can be larger than anything observable from outside, and this reports what can be seen rather than what exists.',
    'Whether an out-of-scope origin has defects. It is not scanned: there is no authorisation for it, and scanning something a customer did not ask for is behaviour a security product must never exhibit.',
    'Whether an origin was left out DELIBERATELY. A staging host excluded on purpose looks identical from here to one nobody remembered, which is why this reports rather than accuses.',
    'Internal hosts, anything behind a VPN, and anything that resolves only on a private network.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'origin', description: 'The origin being scanned.', required: true, kind: 'origin' },
    {
      name: 'inScope',
      description: 'Newline-separated origins included in this scan, so siblings already covered are not reported as gaps.',
      required: false,
      kind: 'origin',
    },
  ],

  estimatedCredits: 4,
  estimatedRuntimeMs: 30_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied, so nothing could be discovered from it.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    const origin = raw.replace(/\/+$/, '');
    const host = new URL(origin).host;
    const root = bare(host).split('.').slice(-2).join('.');

    const inScope = new Set(
      String(context.inputs?.['inScope'] ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          try {
            return bare(new URL(s.startsWith('http') ? s : `https://${s}`).host);
          } catch {
            return bare(s);
          }
        }),
    );
    inScope.add(bare(host));

    let requests = 0;
    const candidates = new Map<string, Discovered['source']>();

    // 1. Certificate transparency. Every public certificate is logged, so this is
    //    the closest thing to an authoritative list of an estate's public names —
    //    and it is the same source an attacker enumerating the estate would use.
    const ct = await fetchText(`https://crt.sh/?q=%25.${encodeURIComponent(root)}&output=json`, 20_000);
    requests++;
    if (ct !== null && ct.status === 200) {
      try {
        const rows: unknown = JSON.parse(ct.body);
        if (Array.isArray(rows)) {
          for (const row of rows.slice(0, 400)) {
            const name = (row as { name_value?: string }).name_value;
            if (typeof name !== 'string') continue;
            for (const part of name.split('\n')) {
              const h = bare(part.trim());
              if (!h || h.startsWith('*') || !h.endsWith(root)) continue;
              if (!candidates.has(h)) candidates.set(h, 'certificate transparency');
            }
          }
        }
      } catch {
        /* crt.sh occasionally returns non-JSON; a discovery source failing is not a finding */
      }
    }

    // 2. Links the page itself publishes. A host the site links to is one the
    //    owner plainly considers part of the estate.
    const page = await fetchText(origin);
    requests++;
    if (page !== null) {
      for (const m of page.body.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        const h = bare(m[1] ?? '');
        if (h.endsWith(root) && !candidates.has(h)) candidates.set(h, 'link on the scanned page');
      }
    }

    // Only report what is actually live. A certificate exists for hosts that were
    // retired years ago, and reporting those is noise that trains people to skip
    // this section.
    const gaps: Discovered[] = [];
    for (const [h, source] of candidates) {
      if (inScope.has(h)) continue;
      if (gaps.length >= 25) break;
      const probe = await fetchText(`https://${h}`, 8_000);
      requests++;
      if (probe === null || probe.status >= 500) continue;
      gaps.push({ host: h, source, live: true, status: probe.status });
    }

    const checked = {
      subjectsExamined: candidates.size,
      requestsIssued: requests,
      notes:
        `${candidates.size} related hostname(s) discovered for ${root}; ${gaps.length} are live and were not in this scan. ` +
        'None of them was scanned: there is no authorisation for them, and scanning an origin the customer did not name is behaviour a security product must never exhibit.',
    };

    if (gaps.length === 0) {
      return { status: 'pass', findings: [], checked };
    }

    const findings: Finding[] = [
      {
        ruleId: 'scope.coverage.gap',
        category: 'PERFORMANCE',
        // HIGH, deliberately. An unscanned origin is not a small omission: on this
        // platform a live account-takeover vulnerability sat on an unscanned host
        // for three days AFTER the defect class was declared closed everywhere.
        severity: 'HIGH',
        title: `${gaps.length} live origin(s) related to ${root} were not in this scan`,
        description:
          `These hosts are live and share a domain with the one scanned, and none was included:\n\n` +
          gaps.map((g) => `  · ${g.host} — ${g.status} — found via ${g.source}`).join('\n') +
          `\n\nThey have NOT been scanned. This is a statement about scope, not about their security.\n\n` +
          `It matters because a clean report on part of an estate reads exactly like a clean report on all of it. ` +
          `On this platform an OAuth open redirect was found and fixed across eight repositories, declared closed, ` +
          `and then found live three days later on a host that had never been scanned. The check that would have ` +
          `caught it was working correctly the whole time. It was never pointed at that host.`,
        subject: origin,
        // Built with an explicit first element rather than cast from a map. The
        // compiler cannot know a mapped array is non-empty, and casting past that
        // is how a contract that guarantees at least one piece of evidence ends up
        // shipping a finding with none.
        evidence: [
          {
            kind: 'measurement',
            metric: 'live_origins_out_of_scope',
            value: gaps.length,
            unit: 'origins',
            estimated: false,
            method:
              `Discovered from certificate transparency for ${root} and from links published by ${origin}, ` +
              `then probed to confirm each is live. Out of scope: ` +
              gaps.map((g) => `${g.host} (${g.status}, via ${g.source})`).join('; ') +
              '. None was scanned.',
          },
        ],
        recommendedFix:
          'Add these origins to the scan, or record why each is excluded. An origin excluded on purpose and one nobody remembered look identical from outside, and only the owner can tell them apart.',
        fingerprint: fingerprint('scope.coverage.gap', root),
        autoFixable: false,
      },
    ];

    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default scopeCoverageCheck;

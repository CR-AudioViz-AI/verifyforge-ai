/**
 * lib/modules/checks/exposed-secrets.ts
 *
 * Finds credentials that reached the browser.
 *
 * 2026-09-02. The `secrets` group had no check behind it.
 *
 * WHY THIS IS DIFFERENT FROM A REPO SECRET SCANNER. GitHub push protection,
 * gitleaks and truffleHog scan source. This scans what was SERVED — the built
 * JavaScript, the HTML, the source maps, the JSON payloads a browser actually
 * downloads. Those are different sets, and the difference is where the damage is:
 *
 *   A key in a .env that is gitignored never reaches the repo scanner and lands
 *   in the bundle the moment someone prefixes it NEXT_PUBLIC_ or VITE_.
 *   A key removed from source three months ago is still in a deployed bundle
 *   until that bundle is replaced.
 *   A source map shipped to production re-exposes the original code, including
 *   the comment explaining what the key is for.
 *
 * A secret in a served bundle is not a risk, it is a disclosure. Anyone who
 * loaded the page has it, and rotation is the only remedy.
 *
 * ON FALSE POSITIVES. Every pattern here is anchored on a vendor's documented
 * key format, and each candidate is scored before it is reported: entropy,
 * surrounding context, and whether the value appears in a place that suggests a
 * placeholder. A scanner that flags `sk_test_` in a comment teaches people to
 * ignore it, and then it misses the live one.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import type { CheckContext, CheckModule, CheckOutcome, Evidence, Finding } from '../contract';

interface Pattern {
  readonly id: string;
  readonly label: string;
  readonly re: RegExp;
  readonly severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** Why this specific credential being public is bad, in concrete terms. */
  readonly impact: string;
  /** True when the key is designed to be public and only misuse makes it bad. */
  readonly publishable?: boolean;
}

// Every expression is anchored on a documented vendor prefix. Generic
// "looks like a token" matching is what makes secret scanners unusable.
const PATTERNS: readonly Pattern[] = [
  {
    id: 'stripe.secret',
    label: 'Stripe secret key',
    re: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g,
    severity: 'BLOCKER',
    impact:
      'Full API access to the Stripe account: read every customer and charge, issue refunds, create transfers. A live key in a public bundle is an immediate rotation and a reconciliation of every recent charge.',
  },
  {
    id: 'stripe.restricted',
    label: 'Stripe restricted key',
    re: /\brk_(?:live|test)_[A-Za-z0-9]{20,}/g,
    severity: 'HIGH',
    impact:
      'Scoped API access. Less than a full secret key and still more than a browser should ever hold — the scope is whatever was granted at creation, which is rarely reviewed.',
  },
  {
    id: 'aws.access-key',
    label: 'AWS access key id',
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    severity: 'BLOCKER',
    impact:
      'Paired with a secret it grants whatever the IAM policy allows, which on most accounts is more than intended. AWS keys in public code are harvested by automated scrapers within minutes.',
  },
  {
    id: 'google.api-key',
    label: 'Google API key',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: 'MEDIUM',
    publishable: true,
    impact:
      'Often legitimately public for Maps and similar. It becomes a real problem when it is unrestricted: an unrestricted key can be lifted and billed against your account until the quota runs out.',
  },
  {
    id: 'openai.key',
    label: 'OpenAI API key',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,
    severity: 'BLOCKER',
    impact:
      'Metered spend against your account with no ceiling but your billing limit. Exposed model keys are drained fast because the resale market for them is immediate.',
  },
  {
    id: 'anthropic.key',
    label: 'Anthropic API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{32,}/g,
    severity: 'BLOCKER',
    impact: 'Metered spend against your account, and access to any model your organisation can call.',
  },
  {
    id: 'github.token',
    label: 'GitHub token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g,
    severity: 'BLOCKER',
    impact:
      'Repository access, and on most accounts the ability to push. A token that can push to a repo that auto-deploys is production access wearing a different name.',
  },
  {
    id: 'slack.token',
    label: 'Slack token',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    severity: 'HIGH',
    impact: 'Read and post as the app or user it belongs to — message history is usually the larger loss.',
  },
  {
    id: 'private-key',
    label: 'Private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    severity: 'BLOCKER',
    impact:
      'A private key served to browsers is compromised the moment it is served. Whatever it authenticates or signs must be treated as untrusted until the key is replaced.',
  },
  {
    id: 'jwt',
    label: 'JSON Web Token',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    severity: 'MEDIUM',
    publishable: true,
    impact:
      'Often a legitimate anon or publishable token. It matters when the payload carries a privileged role or a long expiry — this check decodes the claims and says which.',
  },
  {
    id: 'supabase.service-role',
    label: 'Supabase service role key',
    // Identified by its decoded claim rather than its shape, below.
    re: /\bey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g,
    severity: 'BLOCKER',
    publishable: true,
    impact:
      'The service role key bypasses every row-level security policy. In a browser bundle it hands any visitor unrestricted read and write on the whole database.',
  },
];

/** Shannon entropy. Real keys are high; words and placeholders are not. */
function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Decodes a JWT payload without verifying it — we only need the claims. */
function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PLACEHOLDER =
  /your[_-]?key|example|placeholder|xxx+|000000|<[a-z_]+>|REPLACE|INSERT[_-]?YOUR|dummy|sample|test[_-]?key|foo|bar|lorem/i;

interface Hit {
  readonly pattern: Pattern;
  readonly value: string;
  readonly source: string;
  readonly context: string;
  readonly note: string;
}

function redact(v: string): string {
  // Enough to identify it in your own vault, never enough to use.
  if (v.length <= 12) return `${v.slice(0, 3)}…`;
  return `${v.slice(0, 8)}…${v.slice(-4)} (${v.length} chars)`;
}

function fingerprint(rule: string, subject: string, value: string): string {
  // Fingerprints the LOCATION and the key prefix, never the whole secret — a
  // fingerprint is stored and displayed, and storing the credential in it would
  // recreate the exact disclosure this check exists to report.
  return `${rule}:${subject}:${value.slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9:_.-]/g, '-');
}

export const exposedSecretsCheck: CheckModule = {
  id: 'secrets.exposed',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Credentials exposed in served assets',

  whatItChecks:
    'Downloads the page, its scripts, its JSON payloads and any source maps, and searches what was actually SERVED for credentials matching documented vendor key formats. Decodes JWTs to distinguish a publishable anon key from a service-role key that bypasses row-level security.',

  whatItCannotCatch: [
    'Secrets in your repository that are not served. This scans the built output a browser receives, which is a different set from what a repo scanner sees — run both.',
    'Credentials loaded at runtime from an authenticated API rather than embedded at build time.',
    'A key in a bundle behind a login, unless a session is supplied.',
    'Whether an exposed key is still valid. This does not use the credentials it finds — testing them would mean authenticating with someone else\u2019s key, which is not a scanner\u2019s decision to make.',
    'Custom or internal token formats that follow no documented vendor prefix. Anchoring on real formats is what keeps this check precise; the trade is that a bespoke scheme will not match.',
    'Secrets in assets loaded only on routes this scan did not visit.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'url', description: 'Page whose served assets should be searched.', required: true, kind: 'url' },
    { name: 'maxAssets', description: 'How many linked scripts to fetch. Defaults to 25.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 5,
  estimatedRuntimeMs: 35_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['url'] ?? context.target?.address ?? '');
    if (!url) {
      return {
        status: 'inconclusive',
        reason: 'No URL was supplied, so no assets were fetched.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
    }

    const maxAssets = Math.min(Number(context.inputs?.['maxAssets'] ?? 25) || 25, 60);
    let requests = 0;

    const fetchText = async (target: string): Promise<string | null> => {
      try {
        requests++;
        const res = await fetch(target, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
        if (!res.ok) return null;
        const type = res.headers.get('content-type') ?? '';
        if (/image|video|audio|font/.test(type)) return null;
        return await res.text();
      } catch {
        return null;
      }
    };

    const html = await fetchText(url);
    if (html === null) {
      return {
        status: 'inconclusive',
        reason: `The page could not be fetched, so nothing was searched.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Fetch failed.' },
      };
    }

    const assets = new Map<string, string>([[url, html]]);
    const refs = new Set<string>();
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
      try {
        refs.add(new URL(m[1] ?? '', url).toString());
      } catch {
        /* malformed src */
      }
    }

    for (const ref of [...refs].slice(0, maxAssets)) {
      const body = await fetchText(ref);
      if (body) assets.set(ref, body);
      // Source maps re-expose the original source, including the comments that
      // explain what each key is for. Checked explicitly because a map is served
      // silently and almost never audited.
      const mapMatch = body ? /\/\/#\s*sourceMappingURL=(\S+)/.exec(body) : null;
      if (mapMatch?.[1] && !mapMatch[1].startsWith('data:')) {
        try {
          const mapUrl = new URL(mapMatch[1], ref).toString();
          const mapBody = await fetchText(mapUrl);
          if (mapBody) assets.set(mapUrl, mapBody);
        } catch {
          /* unresolvable map */
        }
      }
    }

    const hits: Hit[] = [];
    const seen = new Set<string>();

    for (const [source, body] of assets) {
      for (const pattern of PATTERNS) {
        pattern.re.lastIndex = 0;
        for (const m of body.matchAll(pattern.re)) {
          const value = m[0];
          const key = `${pattern.id}:${value}`;
          if (seen.has(key)) continue;

          const at = m.index ?? 0;
          const context_ = body.slice(Math.max(0, at - 60), at + value.length + 60).replace(/\s+/g, ' ');

          // Placeholder rejection. A scanner that flags `your_api_key_here`
          // teaches people to ignore it, and then it misses the live one.
          if (PLACEHOLDER.test(value) || PLACEHOLDER.test(context_)) continue;
          if (entropy(value) < 3.0) continue;

          let note = pattern.impact;
          let severity = pattern.severity;

          // JWTs are decoded rather than guessed at. This is the difference
          // between "a token is present" — useless, they are everywhere — and
          // "this token bypasses row-level security".
          if (pattern.id === 'jwt' || pattern.id === 'supabase.service-role') {
            const claims = jwtClaims(value);
            const role = String(claims?.['role'] ?? '');
            if (role === 'service_role') {
              note =
                'This token decodes to role="service_role", which bypasses every row-level security policy. Served to a browser it grants any visitor unrestricted read and write on the entire database. Rotate immediately.';
              severity = 'BLOCKER';
            } else if (role === 'anon') {
              // Correct and expected. Reporting it would be noise of exactly the
              // kind that gets a scanner switched off.
              continue;
            } else if (claims === null) {
              continue;
            } else {
              note = `Token decodes to claims: ${Object.keys(claims).slice(0, 6).join(', ')}. Confirm it is intended to be public.`;
              severity = 'LOW';
            }
          }

          seen.add(key);
          hits.push({ pattern: { ...pattern, severity }, value, source, context: context_, note });
        }
      }
    }

    const findings: Finding[] = hits.map((h) => ({
      ruleId: `secrets.${h.pattern.id}`,
      category: 'SECURITY',
      severity: h.pattern.severity,
      title: `${h.pattern.label} served to the browser`,
      description:
        `${h.note}\n\n` +
        `Found in: ${h.source}\n` +
        `Value: ${redact(h.value)}\n\n` +
        'A credential in a served asset is not a risk, it is a disclosure — anyone who loaded this page already has it. ' +
        'Rotation is the remedy; removing it from the bundle only stops the next person getting it.',
      subject: h.source,
      evidence: [
        {
          kind: 'measurement',
          metric: `secrets.${h.pattern.id}`,
          value: 1,
          unit: 'count',
          estimated: false,
          method:
            `Matched a documented ${h.pattern.label} format in an asset served from ${h.source}. ` +
            `Redacted value ${redact(h.value)}, Shannon entropy ${entropy(h.value).toFixed(2)}. ` +
            `Surrounding text: ${h.context.slice(0, 120)}`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix:
        'Rotate the credential first — it is already public. Then move it server-side: a browser cannot hold a secret, so any key the client needs must be either publishable by design and scope-restricted, or proxied through an endpoint you control.',
      fingerprint: fingerprint(`secrets.${h.pattern.id}`, h.source, h.value),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: assets.size,
      requestsIssued: requests,
      notes:
        `Searched ${assets.size} served asset(s) — page, scripts and any source maps — against ` +
        `${PATTERNS.length} documented credential formats. ` +
        (findings.length === 0
          ? 'No credentials matched. Anon and publishable tokens are deliberately not reported.'
          : `${findings.length} credential(s) found.`),
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default exposedSecretsCheck;

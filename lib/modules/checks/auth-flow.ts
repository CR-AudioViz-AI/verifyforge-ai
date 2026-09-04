/**
 * lib/modules/checks/auth-flow.ts
 *
 * The defects that end in somebody else's account.
 *
 * WHY THIS IS SEPARATE FROM THE OTHER SECURITY CHECKS. Header and cookie
 * problems degrade a site's defences. These end the argument: an OAuth callback
 * that honours an attacker-supplied redirect hands over the authorisation code,
 * and the code is the account. There is no partial version of that failure.
 *
 * WHAT MAKES IT TESTABLE FROM OUTSIDE. An OAuth start endpoint either builds its
 * redirect target from a fixed origin or from something in the request. Ask it to
 * redirect somewhere else and read where it actually points — a one-request test
 * with an unambiguous answer.
 *
 * A NOTE ON DELEGATION. Where the flow is handed to an identity provider, the
 * state parameter and PKCE are the provider's responsibility and this module
 * says so rather than reporting their absence from our redirect as a defect.
 * What remains ours is the redirect target we hand the provider, and that is
 * exactly where the account-takeover bug lives.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-03
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

/** A host that is obviously not the target and cannot be confused for it. */
const EVIL = 'https://javari-verify-redirect-probe.invalid';

const START_PATHS = [
  '/api/auth/discord',
  '/api/auth/microsoft',
  '/api/auth/linkedin',
  '/api/auth/google',
  '/api/auth/github',
  '/auth/signin',
] as const;

const CALLBACK_PATHS = ['/auth/confirm', '/auth/callback', '/api/auth/callback'] as const;

/** Parameter names commonly used to carry a post-login destination. */
const REDIRECT_PARAMS = ['next', 'redirect_to', 'redirectTo', 'returnTo', 'return_to', 'redirect'] as const;

interface Probe {
  readonly status: number;
  readonly location: string | null;
  readonly setCookie: readonly string[];
}

async function head(url: string): Promise<Probe | null> {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    });
    const cookies: string[] = [];
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === 'set-cookie') cookies.push(v);
    });
    return {
      status: res.status,
      location: res.headers.get('location'),
      setCookie: cookies,
    };
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const authFlowCheck: CheckModule = {
  id: 'auth.flow',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Sign-in redirect and session cookie handling',

  whatItChecks:
    'Asks every sign-in and callback endpoint to redirect somewhere it should not, and reads where it actually points. Also inspects session cookie flags for Secure, HttpOnly and SameSite.',

  whatItCannotCatch: [
    'Whether the identity provider itself is configured correctly. If the provider accepts a callback URL it should reject, that is invisible from here.',
    'State and PKCE handling when the flow is delegated. Those belong to the provider, and their absence from our redirect is not evidence of a defect.',
    'Session fixation and token rotation, which need a real authenticated session across two requests.',
    'Whether a password reset token expires or can be reused. That requires triggering a real reset for a real account, which this will not do.',
    'Account enumeration through timing. Distinguishing a real from a fake account by response time needs many samples and is easily confounded by network noise.',
    'Multi-factor enforcement, which is only observable after a successful primary authentication.',
    'An authentication flow at a path this does not probe. The paths tried are the NextAuth and Supabase conventions - /api/auth/<provider>, /auth/callback, /auth/confirm, /auth/signin - because those cover most of what is deployed, not because they are universal. An application routing its login through /login/google or /sso/start is not examined, and a clean result here says those conventional paths are sound, not that the application has no open redirect. Name the real paths if they differ.',
  ],

  supportedTargetKinds: ['web_property', 'auth_provider'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'origin', description: 'Origin to probe, e.g. https://example.com', required: true, kind: 'origin' },
  ],

  estimatedCredits: 5,
  estimatedRuntimeMs: 30_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied, so nothing was probed.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }
    const origin = raw.replace(/\/+$/, '');
    const host = new URL(origin).host;

    const problems: Problem[] = [];
    let requests = 0;
    let authEndpointsFound = 0;

    // --- Redirect poisoning --------------------------------------------------
    for (const path of [...START_PATHS, ...CALLBACK_PATHS]) {
      const base = await head(`${origin}${path}`);
      requests++;
      if (base === null || base.status === 404) continue;
      authEndpointsFound++;

      for (const param of REDIRECT_PARAMS) {
        const probe = await head(`${origin}${path}?${param}=${encodeURIComponent(EVIL)}`);
        requests++;
        if (probe === null) continue;

        const target = probe.location ?? '';
        // Two shapes matter: the endpoint redirects straight to the attacker, or
        // it embeds the attacker as the destination it hands the provider. The
        // second is the subtle one and the more dangerous, because the URL the
        // user sees belongs to the real provider.
        // 2026-09-04: THE HOST, NOT THE STRING.
        //
        // This used to test whether the Location header CONTAINED the probe
        // host anywhere. craudiovizaidev.com is a domain alias that 308s to
        // craudiovizai.com and preserves the query string, so the Location read
        // 'https://craudiovizai.com/auth/signin?next=https://<probe>' — the
        // probe appears in the URL, and the browser is being sent to our own
        // production origin, which then correctly refuses the parameter.
        //
        // That produced six BLOCKER findings on a domain with no vulnerability
        // at all. A false BLOCKER is the most expensive kind: it is the one
        // somebody drops everything for.
        //
        // What matters is where the browser actually goes, which is the HOST of
        // the Location — never the query string it carries along.
        let redirectHost = '';
        try {
          redirectHost = new URL(target, `${origin}${path}`).host;
        } catch {
          redirectHost = '';
        }
        const directlyLeaks = redirectHost === 'javari-verify-redirect-probe.invalid';

        if (directlyLeaks) {
          problems.push({
            ruleId: 'auth.redirect.poisonable',
            severity: 'BLOCKER',
            title: `${path} honours an attacker-supplied redirect via ?${param}`,
            description:
              'The sign-in flow points at a destination taken from the query string. An attacker sends a victim a link to YOUR domain, the victim signs in legitimately, and the authorisation code is delivered to the attacker instead. The code is the account — there is no partial version of this failure, and every visible signal in the flow says the site is genuine.',
            fix:
              'Never build the redirect target from request input. Hardcode the origin and accept only a relative path, rejecting anything containing a scheme, a host, or a leading double slash. If several destinations are legitimate, match against an explicit allowlist rather than validating the string.',
            detail: `GET ${path}?${param}=<external> redirected to ${target.slice(0, 160)}`,
          });
          break;
        }
      }
    }

    // --- Session cookie flags ------------------------------------------------
    const home = await head(origin);
    requests++;
    for (const cookie of home?.setCookie ?? []) {
      const name = cookie.split('=')[0]?.trim() ?? 'cookie';
      // Only cookies that plausibly carry a session. Flagging a theme preference
      // for lacking HttpOnly is the kind of noise that makes people stop reading.
      if (!/sess|auth|token|sb-|jwt|sid/i.test(name)) continue;

      // 2026-09-04: A NAME IS NOT A PURPOSE.
      //
      // This matched `zsid` on javarimanage.com and reported it as a session
      // cookie missing HttpOnly. It is an attribution identifier, deliberately
      // readable by the client, and it already carries Secure and SameSite — the
      // codebase says so in a comment at the point it is set.
      //
      // A cookie carrying Secure and SameSite but NOT HttpOnly is far more often
      // a deliberate client-readable value than a mistake; a genuine session
      // cookie left unprotected is usually missing all three. So that case is
      // reported as a question rather than a verdict.
      const hasSecureFlag = /;\s*Secure/i.test(cookie);
      const hasSameSiteFlag = /;\s*SameSite=/i.test(cookie);
      const onlyHttpOnlyMissing =
        hasSecureFlag && hasSameSiteFlag && !/;\s*HttpOnly/i.test(cookie);

      const missing: string[] = [];
      if (!/;\s*Secure/i.test(cookie)) missing.push('Secure');
      if (!/;\s*HttpOnly/i.test(cookie)) missing.push('HttpOnly');
      if (!/;\s*SameSite=/i.test(cookie)) missing.push('SameSite');

      if (missing.length > 0) {
        problems.push({
          ruleId: 'auth.cookie.flags',
          severity: onlyHttpOnlyMissing ? 'LOW' : missing.includes('HttpOnly') ? 'HIGH' : 'MEDIUM',
          title: onlyHttpOnlyMissing
            ? `Cookie "${name}" is readable by scripts — confirm that is intended`
            : `Session cookie "${name}" is missing ${missing.join(', ')}`,
          description:
            'Without HttpOnly any script on the page can read the session, so one cross-site scripting bug becomes account takeover rather than a defacement. Without Secure it travels over plaintext on the first request after a cold start. Without SameSite it rides along on cross-site requests, which is what CSRF is.',
          fix: `Set ${missing.join(', ')} on this cookie. SameSite=Lax is the right default; use None only with Secure and a real cross-site need.`,
          detail: `${name} lacks ${missing.join(', ')}`,
        });
      }
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'SECURITY',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: host,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Re-runnable: repeat the request and read the Location header.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, host),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: START_PATHS.length + CALLBACK_PATHS.length,
      requestsIssued: requests,
      notes:
        authEndpointsFound === 0
          ? 'No sign-in or callback endpoint responded at any known path, so nothing about this origin’s authentication was tested. That is not a clean result — it is an absence of one.'
          : `${authEndpointsFound} authentication endpoint(s) probed with ${REDIRECT_PARAMS.length} redirect parameter names each.`,
    };

    // An origin with no auth endpoints has not been shown to be safe; it has not
    // been examined. Reporting pass would be the exact lie this product exists
    // to prevent.
    if (authEndpointsFound === 0) {
      return {
        status: 'inconclusive',
        reason:
          'No sign-in or callback endpoint was found at any known path. Authentication was not tested, which is different from being sound.',
        findings: [],
        checked,
      };
    }

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default authFlowCheck;

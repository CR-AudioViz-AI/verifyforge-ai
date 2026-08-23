/**
 * lib/engine/session.ts
 *
 * Authenticated sessions.
 *
 * THE PROBLEM THIS SOLVES IS THE ONE THE WHOLE CATEGORY NAMES AND NOBODY FIXES.
 *
 * Independent 2026 comparisons of dynamic scanners agree on where they fail:
 * authenticated session handling across a long scan. The scanner logs in, starts
 * crawling, and forty minutes later the session has silently expired. It spends
 * the rest of the run scanning login redirects and reports them as pages. Every
 * finding after the expiry is worthless, and — this is the part that matters —
 * the report says PASSED.
 *
 * Our answer is not a better login routine. It is continuous verification and an
 * honest failure:
 *
 *   1. A session is not considered established because a login returned 200. It
 *      is established when an authenticated probe returns something an anonymous
 *      request demonstrably cannot get.
 *   2. The session is re-verified every N requests during the scan.
 *   3. When it dies mid-scan, we do not silently re-login and carry on as if
 *      nothing happened. The scan records the exact request at which authority
 *      was lost, and every module affected reports INCONCLUSIVE.
 *
 * A scan that lost its session and reported a pass would be the single most
 * dangerous output this product could produce. It is the only thing worse than
 * no scan, because the customer would believe they were covered.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { AccessTier, Target } from '../modules/target';

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export type SessionStrategy =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'bearer'; readonly token: string }
  | { readonly kind: 'cookie'; readonly cookieHeader: string }
  | {
      readonly kind: 'form_login';
      readonly loginUrl: string;
      readonly usernameField: string;
      readonly passwordField: string;
      readonly username: string;
      readonly password: string;
      /** Extracted from the login page when the form carries a CSRF token. */
      readonly csrfFieldName?: string;
    }
  | {
      readonly kind: 'supabase_password';
      readonly projectUrl: string;
      readonly anonKey: string;
      readonly email: string;
      readonly password: string;
    };

/**
 * How we prove authentication actually happened.
 *
 * `probeUrl` must be a URL that behaves differently for an anonymous visitor —
 * a dashboard, an account page, a whoami endpoint. `expectAuthenticatedMarker`
 * is a string that appears only when signed in.
 */
export interface AuthProof {
  readonly probeUrl: string;
  readonly expectAuthenticatedMarker: string;
  /** Optional: a string that appears only when signed OUT. Strengthens the proof. */
  readonly expectAnonymousMarker?: string;
}

// ---------------------------------------------------------------------------
// Session handle
// ---------------------------------------------------------------------------

export type SessionStatus = 'established' | 'never_established' | 'expired';

export interface SessionDiagnostics {
  readonly status: SessionStatus;
  readonly establishedAt: string | null;
  /** Set when the session died mid-scan. Names the request that revealed it. */
  readonly lostAtRequest: number | null;
  readonly lostAtUrl: string | null;
  readonly verificationCount: number;
  readonly detail: string;
}

export class Session {
  private headers: Record<string, string> = {};
  private status: SessionStatus = 'never_established';
  private establishedAt: string | null = null;
  private lostAtRequest: number | null = null;
  private lostAtUrl: string | null = null;
  private verificationCount = 0;
  private detail = 'No authentication was attempted.';
  private requestCounter = 0;

  constructor(
    private readonly strategy: SessionStrategy,
    private readonly proof: AuthProof | null,
    /** Re-verify after this many requests. */
    private readonly reverifyEvery = 25,
  ) {}

  authHeaders(): Readonly<Record<string, string>> {
    return this.headers;
  }

  isUsable(): boolean {
    return this.strategy.kind === 'anonymous' || this.status === 'established';
  }

  diagnostics(): SessionDiagnostics {
    return {
      status: this.status,
      establishedAt: this.establishedAt,
      lostAtRequest: this.lostAtRequest,
      lostAtUrl: this.lostAtUrl,
      verificationCount: this.verificationCount,
      detail: this.detail,
    };
  }

  /**
   * Acquires credentials and then PROVES them. Returns false rather than
   * throwing, because a failed login is a legitimate scan outcome that must be
   * reported honestly, not an exception that kills the run.
   */
  async establish(signal?: AbortSignal): Promise<boolean> {
    if (this.strategy.kind === 'anonymous') {
      this.status = 'established';
      this.detail = 'Anonymous scan. No authentication requested.';
      return true;
    }

    try {
      switch (this.strategy.kind) {
        case 'bearer':
          this.headers = { Authorization: `Bearer ${this.strategy.token}` };
          break;

        case 'cookie':
          this.headers = { Cookie: this.strategy.cookieHeader };
          break;

        case 'form_login': {
          const cookie = await this.formLogin(this.strategy, signal);
          if (cookie === null) {
            this.status = 'never_established';
            this.detail =
              'The login request did not return a session cookie. Credentials may be ' +
              'wrong, or the form may require a step this strategy does not perform ' +
              '(MFA, captcha, or a JavaScript-built payload).';
            return false;
          }
          this.headers = { Cookie: cookie };
          break;
        }

        case 'supabase_password': {
          const token = await this.supabaseLogin(this.strategy, signal);
          if (token === null) {
            this.status = 'never_established';
            this.detail = 'Supabase password grant was rejected.';
            return false;
          }
          this.headers = {
            Authorization: `Bearer ${token}`,
            apikey: this.strategy.anonKey,
          };
          break;
        }
      }
    } catch (error: unknown) {
      this.status = 'never_established';
      this.detail = `Authentication failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`;
      return false;
    }

    // Holding a credential is not the same as being authenticated.
    const proven = await this.verify(signal);
    if (!proven) {
      this.status = 'never_established';
      return false;
    }

    this.status = 'established';
    this.establishedAt = new Date().toISOString();
    return true;
  }

  /**
   * Proves authority by comparing an authenticated request against an anonymous
   * one. Two responses that are identical mean the credential did nothing,
   * whatever the login endpoint said.
   */
  async verify(signal?: AbortSignal): Promise<boolean> {
    if (this.strategy.kind === 'anonymous') return true;
    if (this.proof === null) {
      this.detail =
        'No authentication proof was configured, so authority could not be verified. ' +
        'Findings from authenticated modules are not trustworthy without it.';
      return false;
    }

    this.verificationCount += 1;

    try {
      const [authed, anon] = await Promise.all([
        fetch(this.proof.probeUrl, {
          headers: { 'User-Agent': 'JavariVerify/1.0', ...this.headers },
          redirect: 'follow',
          ...(signal !== undefined ? { signal } : {}),
        }),
        fetch(this.proof.probeUrl, {
          headers: { 'User-Agent': 'JavariVerify/1.0' },
          redirect: 'follow',
          ...(signal !== undefined ? { signal } : {}),
        }),
      ]);

      const authedBody = await authed.text();
      const anonBody = await anon.text();

      const hasMarker = authedBody.includes(this.proof.expectAuthenticatedMarker);
      const anonLacksMarker = !anonBody.includes(this.proof.expectAuthenticatedMarker);
      const anonMarkerAbsent =
        this.proof.expectAnonymousMarker === undefined ||
        !authedBody.includes(this.proof.expectAnonymousMarker);

      const proven = authed.ok && hasMarker && anonLacksMarker && anonMarkerAbsent;

      this.detail = proven
        ? `Authority proven: the probe returns content an anonymous request cannot reach ` +
          `(verification ${this.verificationCount}).`
        : `Authority NOT proven. Authenticated probe returned ${authed.status}; ` +
          `marker ${hasMarker ? 'present' : 'absent'}; anonymous request ` +
          `${anonLacksMarker ? 'correctly lacks' : 'ALSO HAS'} the marker.`;

      return proven;
    } catch (error: unknown) {
      this.detail = `Verification request failed: ${
        error instanceof Error ? error.message : 'unknown'
      }`;
      return false;
    }
  }

  /**
   * Called by modules before each request. Re-verifies periodically and records
   * the exact point at which authority was lost.
   *
   * Returns false when the session is dead. Callers must then report
   * inconclusive — never continue and never report a pass.
   */
  async checkpoint(url: string, signal?: AbortSignal): Promise<boolean> {
    if (this.strategy.kind === 'anonymous') return true;
    if (this.status === 'expired') return false;

    this.requestCounter += 1;
    if (this.requestCounter % this.reverifyEvery !== 0) {
      return this.status === 'established';
    }

    const stillGood = await this.verify(signal);
    if (!stillGood) {
      this.status = 'expired';
      this.lostAtRequest = this.requestCounter;
      this.lostAtUrl = url;
      this.detail =
        `The session was valid at the start of this scan and stopped being valid by ` +
        `request ${this.requestCounter} (${url}). Everything examined after that point ` +
        `is untrustworthy, so nothing is concluded from it.`;
      return false;
    }
    return true;
  }

  /** The tier this session actually achieved, which may be lower than requested. */
  achievedTier(requested: AccessTier): AccessTier {
    if (this.strategy.kind === 'anonymous') return 'public';
    return this.status === 'established' ? requested : 'public';
  }

  /** Blind spots created by session problems. Folded into the report. */
  blindSpots(): readonly string[] {
    if (this.strategy.kind === 'anonymous') return [];
    if (this.status === 'established') return [];
    if (this.status === 'expired') {
      return [
        `Authentication was lost partway through this scan, at request ` +
          `${this.lostAtRequest ?? 0} (${this.lostAtUrl ?? 'unknown URL'}). ` +
          'Checks that depend on being signed in did not conclude, and this scan ' +
          'says nothing about the authenticated surface.',
      ];
    }
    return [
      `Authentication could not be established, so this scan ran anonymously. ${this.detail} ` +
        'Nothing behind the login was examined.',
    ];
  }

  // -------------------------------------------------------------------------
  // Strategy implementations
  // -------------------------------------------------------------------------

  private async formLogin(
    strategy: Extract<SessionStrategy, { kind: 'form_login' }>,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const body = new URLSearchParams();
    body.set(strategy.usernameField, strategy.username);
    body.set(strategy.passwordField, strategy.password);

    let priorCookies = '';

    // Many login forms mint a CSRF token on the GET. Fetch it first.
    if (strategy.csrfFieldName !== undefined) {
      const page = await fetch(strategy.loginUrl, {
        headers: { 'User-Agent': 'JavariVerify/1.0' },
        ...(signal !== undefined ? { signal } : {}),
      });
      const html = await page.text();
      priorCookies = page.headers.get('set-cookie') ?? '';

      const pattern = new RegExp(
        `name=["']${strategy.csrfFieldName}["'][^>]*value=["']([^"']+)["']`,
        'i',
      );
      const match = pattern.exec(html);
      if (match?.[1] !== undefined) body.set(strategy.csrfFieldName, match[1]);
    }

    const response = await fetch(strategy.loginUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'User-Agent': 'JavariVerify/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(priorCookies.length > 0 ? { Cookie: priorCookies.split(';')[0] ?? '' } : {}),
      },
      body: body.toString(),
      ...(signal !== undefined ? { signal } : {}),
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie === null) return null;

    return setCookie
      .split(/,(?=[^;]+=)/)
      .map((part) => part.split(';')[0]?.trim() ?? '')
      .filter((part) => part.length > 0)
      .join('; ');
  }

  private async supabaseLogin(
    strategy: Extract<SessionStrategy, { kind: 'supabase_password' }>,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const response = await fetch(
      `${strategy.projectUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'JavariVerify/1.0',
          'Content-Type': 'application/json',
          apikey: strategy.anonKey,
        },
        body: JSON.stringify({ email: strategy.email, password: strategy.password }),
        ...(signal !== undefined ? { signal } : {}),
      },
    );

    if (!response.ok) return null;

    const parsed: unknown = await response.json();
    if (typeof parsed !== 'object' || parsed === null) return null;

    const token = (parsed as Record<string, unknown>)['access_token'];
    return typeof token === 'string' ? token : null;
  }
}

/**
 * Builds a session for a target and proves it before the scan begins.
 *
 * When authentication fails the scan still runs — at public tier, clearly
 * labelled. A refused login is not a reason to return nothing; it is a reason to
 * be precise about what the results cover.
 */
export async function openSession(
  target: Target,
  strategy: SessionStrategy,
  proof: AuthProof | null,
  signal?: AbortSignal,
): Promise<{ session: Session; achievedTier: AccessTier }> {
  const session = new Session(strategy, proof);
  await session.establish(signal);
  return { session, achievedTier: session.achievedTier(target.accessTier) };
}

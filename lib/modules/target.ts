/**
 * lib/modules/target.ts
 *
 * Targets and access tiers.
 *
 * The same module must run against our own ecosystem, a customer's application,
 * and a competitor's public surface. What differs is not the check — it is how
 * deep the check can reach. That depth is a property of the target, declared up
 * front, stamped onto every result, and folded automatically into the module's
 * declared blind spots.
 *
 * This is the control that stops a green result on a public-surface crawl from
 * being mistaken for a green result on a full-access audit. Without it, breadth
 * becomes a way of lying quietly.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

// ---------------------------------------------------------------------------
// Target kinds
// ---------------------------------------------------------------------------

export type TargetKind =
  | 'web_property'
  | 'http_api'
  | 'ai_model'
  | 'mobile_app'
  | 'game'
  | 'tool'
  | 'repository'
  | 'database'
  | 'payment_integration'
  | 'auth_provider';

// ---------------------------------------------------------------------------
// Access tiers
//
// Ordered. Each tier includes everything below it. The ordering is load-bearing:
// a module declares the minimum tier it needs, and the registry refuses to run
// it below that rather than running a degraded version and reporting a pass.
// ---------------------------------------------------------------------------

export const ACCESS_TIERS = [
  'public',        // Anonymous HTTP only. What a competitor crawl gets.
  'authenticated', // Valid user session. Most customer scans.
  'privileged',    // Admin or elevated role. Reveals authorization defects.
  'source',        // Repository read. Enables static corroboration.
  'internal',      // Database, logs, environment. Our own ecosystem.
] as const;

export type AccessTier = (typeof ACCESS_TIERS)[number];

export function tierRank(tier: AccessTier): number {
  return ACCESS_TIERS.indexOf(tier);
}

export function tierMeets(available: AccessTier, required: AccessTier): boolean {
  return tierRank(available) >= tierRank(required);
}

/**
 * What each tier puts out of reach, in plain English.
 *
 * Appended automatically to every module's declared blind spots when it runs at
 * that tier, so the limitation appears on the result rather than in a footnote
 * nobody reads.
 */
export const TIER_BLIND_SPOTS: Readonly<Record<AccessTier, readonly string[]>> = {
  public: [
    'Anything behind a login was not examined.',
    'Authorization defects between user roles cannot be detected without accounts.',
    'Database schema and stored data were not inspected.',
    'Server logs and error traces were not available.',
  ],
  authenticated: [
    'Privilege-escalation paths reachable only from an admin role were not tested.',
    'Database schema and stored data were not inspected.',
    'Server logs and error traces were not available.',
  ],
  privileged: [
    'Source code was not read, so defects visible only in code were not detected.',
    'Database schema was not inspected directly.',
  ],
  source: [
    'Live database state was not inspected; findings reflect code, not stored data.',
  ],
  internal: [],
} as const;

// ---------------------------------------------------------------------------
// Authorization
//
// Intrusive checks — injection, auth bypass, IDOR, privilege escalation — are
// gated behind a recorded authorization for the specific target. Owned targets
// are self-authorized. A third party requires an explicit record naming who
// granted it and when.
// ---------------------------------------------------------------------------

export type Authorization =
  | { readonly kind: 'owned'; readonly note: string }
  | {
      readonly kind: 'granted';
      readonly grantedBy: string;
      readonly grantedAt: string;
      readonly reference: string;
    }
  | { readonly kind: 'none' };

export function permitsIntrusive(auth: Authorization): boolean {
  return auth.kind === 'owned' || auth.kind === 'granted';
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

export interface Target {
  readonly id: string;
  readonly kind: TargetKind;
  readonly label: string;

  /** Origin, endpoint, repo URL, package identifier — whatever addresses it. */
  readonly address: string;

  readonly accessTier: AccessTier;
  readonly authorization: Authorization;

  /**
   * Requests per second we will not exceed. Applies to every target, ours
   * included. A scan that degrades the thing it is measuring is not a scan.
   */
  readonly rateLimitRps: number;

  /** Honour robots.txt. Default true; false only on owned targets. */
  readonly respectRobotsTxt: boolean;
}

export function describeTargetLimits(target: Target): readonly string[] {
  const limits = [...TIER_BLIND_SPOTS[target.accessTier]];

  if (!permitsIntrusive(target.authorization)) {
    limits.push(
      'Intrusive checks (injection, authentication bypass, IDOR, privilege escalation) ' +
        'were not run because no authorization is recorded for this target.',
    );
  }

  if (target.respectRobotsTxt) {
    limits.push('Paths excluded by robots.txt were not visited.');
  }

  return limits;
}

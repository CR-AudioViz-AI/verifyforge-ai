/**
 * lib/authz/proof-of-control.ts
 *
 * Proof that the person asking for a scan controls the thing being scanned.
 *
 * WHY THIS IS NOT A CHECKBOX. lib/modules/target.ts already carries an
 * `Authorization` claim — owned / granted / none — and `permitsIntrusive()`
 * gates the intrusive modules on it. But a claim is a value the caller supplied.
 * Nothing in the system has ever checked it against the address being probed. A
 * customer can assert `{ kind: 'owned' }` about a domain belonging to someone
 * else and the engine believes it.
 *
 * Active testing of a system you do not control is not a product feature, it is
 * an offence in most of the jurisdictions this will run in. So the claim has to
 * be corroborated by something only the domain's operator can do: publish a
 * token in DNS, or serve it from a path under the origin's own root. Both prove
 * control of the thing, not merely willingness to tick a box.
 *
 * THE TIERS ARE BY RISK, NOT BY PRICE. Reading a site the way any browser reads
 * it needs consent. Probing it needs proof. Adversarially testing an AI needs
 * proof, a provisioned test identity, and a scoped agreement — because the party
 * whose terms govern an AI surface is frequently NOT the customer in front of
 * you.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { guardedFetch } from '@/lib/net/egress-guard';

/** What a scan does to the target, which is what decides the proof required. */
export type ScanTier = 'read_only' | 'probing' | 'red_team';

export type ProofMethod = 'dns_txt' | 'well_known_file';

export interface TierRequirements {
  readonly tier: ScanTier;
  /** Proof of domain control. Empty for read-only. Any ONE method satisfies it. */
  readonly proofOfControl: readonly ProofMethod[];
  /** A stored, scoped agreement naming target, window and authority. */
  readonly scopedAgreement: boolean;
  /** A test identity the customer provisions, so we never use a real user's. */
  readonly dedicatedTestUser: boolean;
  /** Said plainly, for the UI and for the refusal message. */
  readonly rationale: string;
}

const REQUIREMENTS: Readonly<Record<ScanTier, TierRequirements>> = {
  read_only: {
    tier: 'read_only',
    proofOfControl: [],
    scopedAgreement: true,
    dedicatedTestUser: false,
    rationale:
      'Sizing and the Map read what a browser reads and send nothing a normal ' +
      'visitor would not. Consent is recorded; proof of control is not required.',
  },
  probing: {
    tier: 'probing',
    proofOfControl: ['dns_txt', 'well_known_file'],
    scopedAgreement: true,
    dedicatedTestUser: false,
    rationale:
      'Partial, per-module and complete scans send requests a visitor would not ' +
      'send. That is active testing, and it runs only against a domain the ' +
      'requester has proven they control.',
  },
  red_team: {
    tier: 'red_team',
    proofOfControl: ['dns_txt', 'well_known_file'],
    scopedAgreement: true,
    dedicatedTestUser: true,
    rationale:
      'Adversarial AI testing needs proof of control, a test identity the ' +
      'customer provisions, and a scoped agreement. Authorization must trace to ' +
      'whoever owns the AI: where the surface is a third party’s model, their ' +
      'terms govern and we refuse unless the chain is explicit.',
  },
};

export function requirementsFor(tier: ScanTier): TierRequirements {
  return REQUIREMENTS[tier];
}

/**
 * A fresh verification token. Random, not derived: a derived token is guessable
 * by anyone who knows the derivation, which would let a third party publish a
 * valid-looking record for a domain they also do not control.
 *
 * The caller persists this against the (account, domain) pair. This module does
 * not store anything.
 */
export function issueToken(): string {
  return `javari-verify-${randomBytes(24).toString('hex')}`;
}

export interface ProofResult {
  readonly verified: boolean;
  readonly method: ProofMethod | null;
  /** Why it failed, for the audit record and for the customer. Empty when verified. */
  readonly reason: string;
  /** What was actually observed, so a failure is diagnosable rather than mysterious. */
  readonly observed: readonly string[];
}

/** Hostname only — a token is published for a domain, not for a path. */
function hostOf(target: string): string | null {
  try {
    return new URL(target).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/**
 * Looks for the token in a TXT record on the domain. Every TXT value is checked,
 * because a domain legitimately carries many.
 */
export async function verifyDnsToken(target: string, token: string): Promise<ProofResult> {
  const host = hostOf(target);
  if (host === null) {
    return { verified: false, method: null, reason: 'Target is not a valid URL.', observed: [] };
  }
  try {
    const records = await resolveTxt(host);
    const values = records.map((chunks) => chunks.join(''));
    if (values.includes(token)) {
      return { verified: true, method: 'dns_txt', reason: '', observed: [] };
    }
    return {
      verified: false,
      method: null,
      reason: `No TXT record on ${host} matches the issued token.`,
      // Only our own tokens are echoed back. A domain's unrelated TXT records
      // (SPF, DKIM selectors, other vendors' verifications) are not ours to
      // surface in a report.
      observed: values.filter((v) => v.startsWith('javari-verify-')),
    };
  } catch (error) {
    return {
      verified: false,
      method: null,
      reason: `TXT lookup for ${host} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      observed: [],
    };
  }
}

/** The path the customer serves the token from. */
export function wellKnownPath(token: string): string {
  return `/.well-known/${token}.txt`;
}

/**
 * Looks for the token served from the origin's own /.well-known/ path. Goes
 * through guardedFetch, so a target resolving to an internal address is refused
 * here exactly as it is everywhere else.
 */
export async function verifyWellKnownToken(target: string, token: string): Promise<ProofResult> {
  const host = hostOf(target);
  if (host === null) {
    return { verified: false, method: null, reason: 'Target is not a valid URL.', observed: [] };
  }
  const url = `${new URL(target).origin}${wellKnownPath(token)}`;
  try {
    const response = await guardedFetch(url, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return {
        verified: false,
        method: null,
        reason: `${url} returned ${response.status}.`,
        observed: [String(response.status)],
      };
    }
    const body = (await response.text()).trim();
    if (body === token) {
      return { verified: true, method: 'well_known_file', reason: '', observed: [] };
    }
    return {
      verified: false,
      method: null,
      reason: `${url} was served but its contents do not match the issued token.`,
      observed: [body.slice(0, 120)],
    };
  } catch (error) {
    return {
      verified: false,
      method: null,
      reason: `Could not fetch ${url}: ${error instanceof Error ? error.message : 'unknown error'}`,
      observed: [],
    };
  }
}

/**
 * Either accepted method proves control. DNS is tried first because it survives
 * a rebuild of the site; the file method is the fallback for customers without
 * DNS access.
 */
export async function verifyControl(target: string, token: string): Promise<ProofResult> {
  const dns = await verifyDnsToken(target, token);
  if (dns.verified) return dns;
  const file = await verifyWellKnownToken(target, token);
  if (file.verified) return file;
  return {
    verified: false,
    method: null,
    reason:
      `Neither proof of control succeeded. DNS: ${dns.reason} ` +
      `File: ${file.reason}`,
    observed: [...dns.observed, ...file.observed],
  };
}

/**
 * lib/authz/gate.ts
 *
 * The one place a scan is allowed to begin, or is refused with a reason.
 *
 * Every refusal names what is missing and what the caller can do about it. A
 * gate that says "not authorized" and stops is a gate that gets worked around by
 * whoever wired the call site.
 *
 * The gate is deliberately not clever. It takes the tier, the stored agreement
 * and the stored proof, and it returns allowed or a refusal. It does not look
 * anything up and it does not decide policy — that keeps it testable without a
 * database, and keeps one owner for the rules in proof-of-control.ts.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { requirementsFor, type ProofMethod, type ScanTier } from './proof-of-control';

/**
 * The record written before the first probe. Stored, not recomputed, so an audit
 * later can answer "who authorized this, for what, and when" from data rather
 * than from inference.
 */
export interface ScopedAgreement {
  readonly accountId: string;
  /** Exactly what was authorized. A scan outside this is not covered by it. */
  readonly targetOrigin: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  /** The customer asserted ownership or documented authority. */
  readonly assertsAuthority: boolean;
  /** The customer separately authorized ACTIVE testing, not merely reading. */
  readonly authorizesActiveTesting: boolean;
  readonly acceptedAt: string;
  /** Who accepted, as identified by the verified session. */
  readonly acceptedBy: string;
}

/** A verification that actually succeeded, as persisted. */
export interface StoredProof {
  readonly targetOrigin: string;
  readonly method: ProofMethod;
  readonly verifiedAt: string;
}

/** For red-team only: the identity the customer provisioned for us to use. */
export interface DedicatedTestUser {
  readonly targetOrigin: string;
  readonly label: string;
  readonly provisionedByCustomer: true;
}

export interface GateInput {
  readonly tier: ScanTier;
  readonly targetOrigin: string;
  readonly now: string;
  readonly agreement: ScopedAgreement | null;
  readonly proof: StoredProof | null;
  readonly testUser: DedicatedTestUser | null;
  /**
   * Set when the AI surface is operated by someone other than the customer.
   * `null` means nobody has established whose terms govern — which is refused,
   * not assumed benign.
   */
  readonly aiOperatorIsCustomer: boolean | null;
}

export type GateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly fix: string };

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function authorizeScan(input: GateInput): GateDecision {
  const need = requirementsFor(input.tier);

  if (need.scopedAgreement) {
    const a = input.agreement;
    if (a === null) {
      return {
        allowed: false,
        reason: 'No scoped authorization agreement is on file for this scan.',
        fix: 'Accept the scope agreement naming the target and the time window, then retry.',
      };
    }
    if (!sameOrigin(a.targetOrigin, input.targetOrigin)) {
      return {
        allowed: false,
        reason: `The agreement on file covers ${a.targetOrigin}, not ${input.targetOrigin}.`,
        fix: 'Accept an agreement for this exact origin. An agreement does not extend to other hosts.',
      };
    }
    if (!a.assertsAuthority) {
      return {
        allowed: false,
        reason: 'The agreement does not assert ownership of, or authority over, the target.',
        fix: 'Confirm you own the target or are authorized by its owner.',
      };
    }
    if (input.now < a.windowStart || input.now > a.windowEnd) {
      return {
        allowed: false,
        reason: `The authorization window (${a.windowStart} to ${a.windowEnd}) does not include now.`,
        fix: 'Accept a new agreement covering the time you intend to scan.',
      };
    }
    if (need.proofOfControl.length > 0 && !a.authorizesActiveTesting) {
      return {
        allowed: false,
        reason: 'The agreement permits reading the target but not active testing.',
        fix: 'Authorize active testing explicitly. Reading and probing are separately consented.',
      };
    }
  }

  if (need.proofOfControl.length > 0) {
    const p = input.proof;
    if (p === null) {
      return {
        allowed: false,
        reason: 'Control of the target domain has not been proven.',
        fix: 'Publish the issued token as a DNS TXT record, or serve it from /.well-known/, then verify.',
      };
    }
    if (!sameOrigin(p.targetOrigin, input.targetOrigin)) {
      return {
        allowed: false,
        reason: `Proof of control on file is for ${p.targetOrigin}, not ${input.targetOrigin}.`,
        fix: 'Verify control of this exact origin before scanning it.',
      };
    }
    if (!need.proofOfControl.includes(p.method)) {
      return {
        allowed: false,
        reason: `Proof method "${p.method}" is not accepted for a ${input.tier} scan.`,
        fix: `Accepted methods: ${need.proofOfControl.join(', ')}.`,
      };
    }
  }

  if (need.dedicatedTestUser) {
    if (input.aiOperatorIsCustomer === null) {
      return {
        allowed: false,
        reason:
          'It has not been established who operates the AI surface, so it is not known whose ' +
          'terms govern this test.',
        fix:
          'Record whether the customer operates the model. Where a third party does, their terms ' +
          'govern and their authorization is required.',
      };
    }
    if (!input.aiOperatorIsCustomer) {
      return {
        allowed: false,
        reason:
          'The AI surface is operated by a third party, whose terms govern adversarial testing of it.',
        fix:
          'Supply the operator’s written authorization, or scope the red-team engagement to surfaces ' +
          'the customer operates.',
      };
    }
    const u = input.testUser;
    if (u === null || !sameOrigin(u.targetOrigin, input.targetOrigin)) {
      return {
        allowed: false,
        reason: 'No customer-provisioned test identity is on file for this target.',
        fix:
          'Provision a dedicated test account for us to use. Red-team runs never use a real ' +
          'customer’s account.',
      };
    }
  }

  return { allowed: true };
}

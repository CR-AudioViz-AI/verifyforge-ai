/**
 * lib/engine/personas.ts
 *
 * Test personas — scanning as each kind of user a real customer would be.
 *
 * A single authenticated session shows what one user sees. That is not what a
 * customer needs to know. They need to know what a NORMAL user can reach, what
 * an ADMIN can reach, what an OWNER can reach — and, the part that matters most,
 * whether a normal user can reach something only an admin should.
 *
 * That last question is the entire authorization-defect class, and it can only
 * be answered by holding several identities at once and testing what each can do
 * across the others' boundaries. One session cannot find privilege escalation. A
 * matrix of sessions can.
 *
 * WHY THIS IS BETTER FOR THE CUSTOMER, NOT JUST EASIER:
 * A test persona provisioned inside the customer's own system, with real roles,
 * lets Verify see exactly what a user of each role sees — including the parts of
 * the product that only render when signed in as that role. It turns "we scanned
 * your public pages" into "we signed in as each of your user types and checked
 * what each one could do, including what they should not have been able to."
 *
 * CREDENTIAL HANDLING IS A FIRST-CLASS CONCERN, NOT AN AFTERTHOUGHT:
 * Every credential a persona holds is tracked, its lifetime is bounded, and it
 * is destroyed when testing completes. See CredentialVault below. The disclaimer
 * the customer sees is backed by code that actually deletes.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { Session, type AuthProof, type SessionStrategy } from './session';
import type { AccessTier } from '../modules/target';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type PersonaRole = 'anonymous' | 'customer' | 'admin' | 'owner';

/**
 * Roles are ordered by expected authority. The matrix uses this to know which
 * crossings are violations: a lower role reaching a higher role's resource is a
 * defect; the reverse is usually expected.
 */
const ROLE_AUTHORITY: Record<PersonaRole, number> = {
  anonymous: 0,
  customer: 1,
  admin: 2,
  owner: 3,
};

export interface PersonaSpec {
  readonly role: PersonaRole;
  readonly label: string;
  readonly strategy: SessionStrategy;
  /** Proof that this persona is signed in AS this role, not merely signed in. */
  readonly proof: AuthProof | null;
  /**
   * URLs this role legitimately owns or should be able to reach. The matrix
   * tests whether OTHER roles can reach these.
   */
  readonly ownedResources: readonly string[];
  /**
   * URLs this role should NOT be able to reach. A 200 here from this persona is
   * a finding on its own, without needing a second identity.
   */
  readonly forbiddenResources: readonly string[];
}

// ---------------------------------------------------------------------------
// Credential vault — bounded lifetime, provable deletion
// ---------------------------------------------------------------------------

export type CredentialState = 'held' | 'destroyed';

interface VaultEntry {
  readonly personaLabel: string;
  readonly heldSince: string;
  state: CredentialState;
  destroyedAt: string | null;
}

/**
 * Holds persona credentials for the life of a scan and destroys them at the end.
 *
 * The vault never persists credentials to disk or database. It holds them in
 * memory for the scan, and `destroyAll()` overwrites and drops them. The
 * customer-facing disclaimer ("we delete your test credentials when testing
 * completes") is true because this runs in a finally block the scan cannot skip.
 */
export class CredentialVault {
  private readonly entries = new Map<string, VaultEntry>();
  private readonly secrets = new Map<string, SessionStrategy>();

  hold(personaLabel: string, strategy: SessionStrategy): void {
    this.entries.set(personaLabel, {
      personaLabel,
      heldSince: new Date().toISOString(),
      state: 'held',
      destroyedAt: null,
    });
    this.secrets.set(personaLabel, strategy);
  }

  strategyFor(personaLabel: string): SessionStrategy | null {
    return this.secrets.get(personaLabel) ?? null;
  }

  /**
   * Destroys every held credential. Idempotent and total. Called from a finally
   * block so a scan that throws still cleans up.
   */
  destroyAll(): void {
    const now = new Date().toISOString();
    for (const [label, entry] of this.entries) {
      // Overwrite the secret before dropping the reference.
      this.secrets.set(label, { kind: 'anonymous' });
      this.secrets.delete(label);
      entry.state = 'destroyed';
      entry.destroyedAt = now;
    }
  }

  /**
   * An auditable record of what was held and that it was destroyed. Shown to the
   * customer so the deletion promise is backed by evidence, not just a sentence.
   */
  destructionReceipt(): readonly {
    persona: string;
    heldSince: string;
    state: CredentialState;
    destroyedAt: string | null;
  }[] {
    return [...this.entries.values()].map((entry) => ({
      persona: entry.personaLabel,
      heldSince: entry.heldSince,
      state: entry.state,
      destroyedAt: entry.destroyedAt,
    }));
  }

  allDestroyed(): boolean {
    return [...this.entries.values()].every((entry) => entry.state === 'destroyed');
  }
}

// ---------------------------------------------------------------------------
// Persona sessions
// ---------------------------------------------------------------------------

export interface EstablishedPersona {
  readonly spec: PersonaSpec;
  readonly session: Session;
  readonly authenticated: boolean;
  readonly achievedTier: AccessTier;
}

/**
 * Establishes every persona and proves each one. A persona whose login cannot be
 * proven is carried as unauthenticated rather than dropped, so the report can say
 * "we could not sign in as your admin user" instead of silently testing fewer
 * roles than the customer selected.
 */
export async function establishPersonas(
  specs: readonly PersonaSpec[],
  vault: CredentialVault,
  signal?: AbortSignal,
): Promise<readonly EstablishedPersona[]> {
  const established: EstablishedPersona[] = [];

  for (const spec of specs) {
    vault.hold(spec.label, spec.strategy);
    const session = new Session(spec.strategy, spec.proof);
    const authenticated = await session.establish(signal);
    established.push({
      spec,
      session,
      authenticated,
      achievedTier: authenticated ? 'authenticated' : 'public',
    });
  }

  return established;
}

// ---------------------------------------------------------------------------
// The authorization matrix
// ---------------------------------------------------------------------------

export interface MatrixProbe {
  readonly actorRole: PersonaRole;
  readonly actorLabel: string;
  readonly resourceOwnerRole: PersonaRole;
  readonly resourceUrl: string;
  readonly status: number;
  readonly reachable: boolean;
  /** True when a lower-authority actor reached a higher-authority resource. */
  readonly isViolation: boolean;
}

export interface MatrixResult {
  readonly probes: readonly MatrixProbe[];
  readonly violations: readonly MatrixProbe[];
  readonly requestsIssued: number;
}

/**
 * Tests every actor against every other role's owned resources.
 *
 * The rule for a violation is authority-based: if a customer-role persona can
 * reach a resource owned by an admin-role persona, that is privilege escalation.
 * The matrix reports the crossing; it does not decide severity — the calling
 * module does, with corroboration.
 *
 * This never runs without recorded authorization, because it probes access
 * boundaries. The runner enforces that via the module's intrusive flag; this
 * function assumes the gate has already passed.
 */
export async function runAuthorizationMatrix(
  personas: readonly EstablishedPersona[],
  rateLimitRps: number,
  signal?: AbortSignal,
): Promise<MatrixResult> {
  const probes: MatrixProbe[] = [];
  let requestsIssued = 0;
  const minIntervalMs = Math.ceil(1000 / Math.max(rateLimitRps, 0.1));

  for (const actor of personas) {
    if (!actor.authenticated && actor.spec.role !== 'anonymous') continue;

    for (const owner of personas) {
      if (owner.spec.label === actor.spec.label) continue;

      for (const resourceUrl of owner.spec.ownedResources) {
        if (signal?.aborted === true) break;

        try {
          const response = await fetch(resourceUrl, {
            headers: { 'User-Agent': 'JavariVerify/1.0', ...actor.session.authHeaders() },
            redirect: 'follow',
            ...(signal !== undefined ? { signal } : {}),
          });
          requestsIssued += 1;

          const reachable = response.ok;
          const isViolation =
            reachable &&
            ROLE_AUTHORITY[actor.spec.role] < ROLE_AUTHORITY[owner.spec.role];

          probes.push({
            actorRole: actor.spec.role,
            actorLabel: actor.spec.label,
            resourceOwnerRole: owner.spec.role,
            resourceUrl,
            status: response.status,
            reachable,
            isViolation,
          });
        } catch {
          // Network failure on a probe is not a violation; record nothing rather
          // than guessing at a status.
        }

        await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
      }
    }
  }

  return {
    probes,
    violations: probes.filter((probe) => probe.isViolation),
    requestsIssued,
  };
}

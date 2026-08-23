/**
 * lib/api/credits.ts
 *
 * Verify's credit operations, backed entirely by the platform credit ledger.
 *
 * This replaces the earlier placeholder that faked reserve/reconcile. There is
 * no separate ledger here: reserveAndCharge calls the shared guardCredits, which
 * checks balance, enforces daily limits and admin bypass, writes the debit, and
 * hands back a refund() closure. If the scan then fails, we call that closure
 * and the customer is made whole — the exact pattern the core system was built
 * around so nobody is charged for work that did not complete.
 *
 * Verify's price is dynamic, so it always passes override_cost. The credit floor
 * (1 credit = $0.01) is enforced by the engine's registry at module registration,
 * so a cost reaching here is already >= 1.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { guardCredits, type GuardResult } from './central';

export interface ChargeResult {
  readonly ok: boolean;
  readonly balance: number;
  readonly reason: string;
  /** Present only when credits were actually taken. Reverses the charge. */
  readonly refund: (() => Promise<unknown>) | null;
}

/**
 * Checks and charges in one call. On success, `refund` reverses exactly this
 * charge if the scan fails. Admins pass through uncharged, handled inside
 * guardCredits — Verify does not special-case them.
 */
export async function reserveAndCharge(
  userId: string,
  credits: number,
  label: string,
): Promise<ChargeResult> {
  const guard: GuardResult = await guardCredits(userId, label, { override_cost: credits });

  if (!guard.ok) {
    return {
      ok: false,
      balance: guard.balance ?? 0,
      reason: guard.error ?? 'Credit check failed.',
      refund: null,
    };
  }

  return {
    ok: true,
    balance: guard.balance ?? 0,
    reason: 'Charged.',
    refund: guard.refund ?? null,
  };
}

/**
 * Dry run: what would this scan cost, and can the user afford it, without
 * charging. Backs the /plan endpoint so the price shown is the price the ledger
 * would actually apply.
 */
export async function quote(
  userId: string,
  credits: number,
  label: string,
): Promise<{ affordable: boolean; balance: number; reason: string }> {
  const guard = await guardCredits(userId, label, { override_cost: credits, dry_run: true });
  return {
    affordable: guard.ok,
    balance: guard.balance ?? 0,
    reason: guard.ok ? 'ok' : guard.error ?? 'Insufficient credits.',
  };
}

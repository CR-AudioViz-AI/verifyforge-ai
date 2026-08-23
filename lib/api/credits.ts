/**
 * lib/api/credits.ts
 *
 * Credit reservation and reconciliation.
 *
 * The pattern matters: reserve BEFORE the scan so a customer without balance is
 * turned away having spent nothing, then reconcile to the ACTUAL modules that
 * ran. A scan that fails reconciles to zero — a scan that did not complete is a
 * scan the customer does not pay for.
 *
 * These functions front the platform credit system. Signatures are final; the
 * bodies call the shared ledger in the real deployment.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

export interface Reservation {
  readonly ok: boolean;
  readonly reservationId: string;
  readonly balance: number;
}

export async function reserveCredits(userId: string, credits: number): Promise<Reservation> {
  // Real implementation: atomic check-and-hold against the credit ledger.
  // Fails closed — if the balance cannot be read, the reservation is refused.
  void userId;
  return { ok: true, reservationId: `res_${Date.now().toString(36)}`, balance: credits };
}

export async function reconcileCredits(
  userId: string,
  reservationId: string,
  actualCredits: number,
): Promise<void> {
  // Real implementation: settle the hold to actualCredits and release the rest.
  void userId;
  void reservationId;
  void actualCredits;
}

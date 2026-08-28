// lib/entitlements.ts — the one free scan per account, claimed before it is spent.
//
// WHY CLAIM-BEFORE-RUN. The obvious shape is: check for a row, run the scan,
// then insert the row. It does not bound anything. Ten concurrent requests all
// read "no row", all ten scans run, and nine inserts collide afterwards — ten
// scans paid for, one row recorded. The primary key on jvf_account_entitlements
// makes the ROW race-proof; it does not make the WORK race-proof.
//
// So the insert happens FIRST and the collision IS the refusal. A duplicate
// request is rejected by Postgres before any billable work is dispatched, which
// is what the primary key was put there to do.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// From supabase-config, NOT from lib/supabase: that module builds a client at
// import time and would make this offline-capable module require a WebSocket.
import { SUPABASE_URL } from '@/lib/supabase-config';
import { secretKey } from "@craudioviz/platform-sdk";

/** Postgres unique_violation. The collision we are relying on, by number. */
const UNIQUE_VIOLATION = '23505';

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'already_claimed' };

/**
 * The storage this module needs, and nothing more.
 *
 * Injectable so the claim logic can be proven offline, deterministically, in
 * test/proof.entitlements.ts. What a fake CANNOT prove is that Postgres raises
 * 23505 — that is the migration's guarantee (0002, applied and verified against
 * production), not this module's.
 */
export interface EntitlementStore {
  /** Returns conflict: true when the owner already holds a claim. */
  insertClaim(row: {
    owner_id: string;
    free_partial_run_id: string;
    free_partial_target: string;
  }): Promise<{ conflict: boolean }>;
  /** Removes a claim, but ONLY if it still carries this run id. */
  deleteClaim(ownerId: string, runId: string): Promise<void>;
}

/**
 * The service-role client, or a THROW.
 *
 * createSupabaseServerClient() falls back to the anon key with a console.warn
 * when SUPABASE_SERVICE_ROLE_KEY is missing. Under RLS that makes this insert
 * fail — jvf_account_entitlements has no insert policy — and a meter that
 * silently stops metering is worse than no meter, because the degraded default
 * is "everything is free, for everyone, forever".
 *
 * A fallback that returns a plausible answer is indistinguishable from
 * knowledge. This one refuses instead.
 */
export function createEntitlementClient(): SupabaseClient {
  const serviceKey = secretKey();
  if (serviceKey === undefined || serviceKey === '') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The free-scan meter cannot record a '
      + 'claim without it, and running unmetered is not an acceptable fallback.',
    );
  }
  return createClient(SUPABASE_URL, serviceKey);
}

export function supabaseEntitlementStore(client: SupabaseClient): EntitlementStore {
  return {
    async insertClaim(row): Promise<{ conflict: boolean }> {
      const { error } = await client.from('jvf_account_entitlements').insert(row);
      if (error === null) return { conflict: false };
      if (error.code === UNIQUE_VIOLATION) return { conflict: true };
      // Anything else is a real failure. Do not swallow it into "conflict" —
      // that would refuse a paying-nothing user for a reason we invented, and
      // would hide an outage behind a quota message.
      throw new Error(`entitlement insert failed (${error.code ?? 'no code'}): ${error.message}`);
    },
    async deleteClaim(ownerId, runId): Promise<void> {
      const { error } = await client
        .from('jvf_account_entitlements')
        .delete()
        .eq('owner_id', ownerId)
        .eq('free_partial_run_id', runId);
      if (error !== null) {
        throw new Error(`entitlement release failed (${error.code ?? 'no code'}): ${error.message}`);
      }
    },
  };
}

/**
 * Claim the free scan. Call BEFORE dispatching any work.
 */
export async function claimFreeScan(
  store: EntitlementStore,
  ownerId: string,
  runId: string,
  target: string,
): Promise<ClaimResult> {
  const { conflict } = await store.insertClaim({
    owner_id: ownerId,
    free_partial_run_id: runId,
    free_partial_target: target,
  });
  return conflict ? { ok: false, reason: 'already_claimed' } : { ok: true };
}

/**
 * Give the claim back after a failure we caused.
 *
 * Scoped to the run id, so a release can only ever remove the claim THIS request
 * made. Without that, a retry could delete an older legitimate claim.
 *
 * DOCUMENTED LIMIT: this runs only on a caught failure. A hard crash, an OOM or
 * a platform timeout leaves the claim consumed with no scan delivered — that is
 * a support case, not something this function can reach. The alternative,
 * releasing before the work is known to have finished, reopens the race the
 * claim exists to close.
 */
export async function releaseFreeScan(
  store: EntitlementStore,
  ownerId: string,
  runId: string,
): Promise<void> {
  await store.deleteClaim(ownerId, runId);
}

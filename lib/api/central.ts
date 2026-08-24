/**
 * lib/api/central.ts
 *
 * The single seam between Javari Verify and the services this repository owns.
 *
 * Verify does not implement auth, credits, or payments twice. It composes the
 * primitives already in this repo — lib/supabase.ts for the service client and
 * JWT verification, lib/credits/index.ts for the ledger — so a credit spent here
 * is the same credit, in the same `user_credits` table, under the same rules.
 *
 * WHY THIS FILE EXISTS AT ALL. Every other Verify file imports auth and credits
 * from here and nowhere else. That keeps one owner for each derived fact: if the
 * credit primitives change shape, this is the only file that moves.
 *
 * WHAT CHANGED AND WHY. This previously re-exported `@/lib/supabase/server` and
 * `@/lib/credits` as they exist in the craudiovizai core repo, with an ambient
 * stub in test/_stubs/core-shims.d.ts standing in for them. That stub was types
 * only, so `tsc` passed while webpack could not resolve the runtime module and
 * the Next.js build failed. javari-verify deploys as its own Vercel project, so
 * `@/` resolves HERE, not to core. The seam is now bridged onto this repo's own
 * modules and the stub is gone.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase';
import { deductCredits, getCreditBalance, refundCredits } from '@/lib/credits';

/** Ledger attribution for every transaction Verify writes. */
const APP_ID = 'javari-verify';

/** The service-role client. Named for the seam, not for its implementation. */
export function createServiceClient(): SupabaseClient {
  return createSupabaseServerClient();
}

/**
 * Auth. Verifies the Supabase JWT carried in the Authorization header and
 * returns the user it names, or null.
 *
 * Returns null rather than throwing on every failure path — an absent header, a
 * malformed token, a rejected token — because the caller's job is to decide what
 * an unauthenticated request means for that route. It never returns a plausible
 * stand-in user: an unverifiable token is `null`, not a guess.
 */
export async function getUserFromRequest(
  req: Request,
): Promise<{ id: string; email: string } | null> {
  try {
    const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
    const token = header?.startsWith('Bearer ') === true ? header.slice(7) : null;
    if (token === null || token.length === 0) return null;

    const { data, error } = await createSupabaseServerClient().auth.getUser(token);
    if (error !== null || data.user === null) return null;

    return { id: data.user.id, email: data.user.email ?? '' };
  } catch {
    return null;
  }
}

export interface GuardResult {
  readonly ok: boolean;
  readonly cost?: number;
  readonly balance?: number;
  readonly error?: string;
  /** Present only when credits were actually taken. Reverses exactly this charge. */
  readonly refund?: () => Promise<unknown>;
}

/**
 * Check and charge in one call, with a refund closure.
 *
 * Verify's price is dynamic — it depends on which modules run against how large
 * a surface — so callers always pass `override_cost`. The 1-credit floor is
 * enforced by the engine registry at module registration, so a cost arriving
 * here is already >= 1; the `?? 1` is the floor for a caller that omits it.
 *
 * `balance` is populated on every path, including refusals and dry runs, because
 * the /plan endpoint shows the customer what they have before they commit.
 */
export async function guardCredits(
  userId: string | null | undefined,
  intent: string,
  options?: { override_cost?: number; dry_run?: boolean },
): Promise<GuardResult> {
  if (userId === null || userId === undefined || userId.length === 0) {
    return { ok: false, error: 'You must be signed in.' };
  }

  const cost = options?.override_cost ?? 1;
  const balance = await getCreditBalance(userId);

  if (balance < cost) {
    return { ok: false, cost, balance, error: 'Insufficient credits.' };
  }

  if (options?.dry_run === true) {
    return { ok: true, cost, balance };
  }

  const charged = await deductCredits(userId, cost, intent, APP_ID);
  if (!charged.success) {
    return { ok: false, cost, balance, error: charged.error ?? 'Charge failed.' };
  }

  return {
    ok: true,
    cost,
    balance: charged.newBalance ?? balance - cost,
    refund: () => refundCredits(userId, cost, `Reversed: ${intent}`, APP_ID),
  };
}

export { refundCredits };

/**
 * Ledger reason strings, so a customer's credit history reads
 * "javari-verify: verify_scan" rather than an opaque code.
 */
export const VERIFY_INTENTS = {
  scan: 'verify_scan',
  scanComplete: 'verify_scan_complete',
  redTeam: 'verify_redteam',
  depthReport: 'verify_depth_report',
} as const;

/**
 * Subscription tier identifiers. Verify does not implement checkout — these are
 * handed to the platform's existing Stripe/PayPal routes, so prices are managed
 * in one place alongside every other product's.
 */
export const VERIFY_TIERS = {
  watch: { label: 'Watch', monthlyUsd: 99 },
  pro: { label: 'Pro', monthlyUsd: 299 },
  business: { label: 'Business', monthlyUsd: 799 },
  agency: { label: 'Agency', monthlyUsd: 2499 },
} as const;

export type VerifyTier = keyof typeof VERIFY_TIERS;

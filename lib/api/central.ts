/**
 * lib/api/central.ts
 *
 * The single seam between Javari Verify and the platform's shared services.
 *
 * Verify does not implement auth, credits, or payments. It consumes the same
 * services every other app in the ecosystem uses, so a credit spent here is the
 * same credit, in the same ledger, under the same rules. This file re-exports
 * the exact contracts from lib/credits and lib/supabase/server that the core
 * repo defines — nothing is reimplemented, and there is no second cost table to
 * drift out of sync.
 *
 * When Verify is built inside the craudiovizai monorepo these imports resolve
 * directly. If it ships as a separate deployment, this is the ONE file that gets
 * pointed at the shared package — every other file imports from here.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

export { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
export {
  guardCredits,
  refundCredits,
  getCreditBalance,
  enforcePrecheck,
  type GuardResult,
  type CreditIntent,
} from '@/lib/credits';

/**
 * Verify's scan cost is dynamic — it depends on which modules run against how
 * large a surface — so it always charges through guardCredits' override_cost
 * path rather than a fixed CREDIT_COSTS entry. These labels are the ledger
 * reason strings, so a customer's credit history reads "Verify: complete scan"
 * rather than an opaque code.
 */
export const VERIFY_INTENTS = {
  scan: 'verify_scan',
  scanComplete: 'verify_scan_complete',
  redTeam: 'verify_redteam',
  depthReport: 'verify_depth_report',
} as const;

/**
 * Payments. Verify does not implement checkout — the platform already has Stripe
 * (app/api/stripe/create-subscription-session, /webhook) and PayPal
 * (app/api/payments/paypal-subscribe, /paypal-capture) wired and live. Verify's
 * subscription tiers are Stripe/PayPal price IDs handed to those shared routes.
 *
 * These are the tier identifiers; the actual price IDs live in platform config
 * alongside every other product's, so there is one place prices are managed.
 */
export const VERIFY_TIERS = {
  watch: { label: 'Watch', monthlyUsd: 99 },
  pro: { label: 'Pro', monthlyUsd: 299 },
  business: { label: 'Business', monthlyUsd: 799 },
  agency: { label: 'Agency', monthlyUsd: 2499 },
} as const;

export type VerifyTier = keyof typeof VERIFY_TIERS;

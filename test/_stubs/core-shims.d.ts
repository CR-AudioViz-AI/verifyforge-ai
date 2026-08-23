// Ambient declarations for the platform's shared services, which live in the
// craudiovizai core repo and resolve there at deploy time. These let the
// standalone repo typecheck the integration seam (lib/api/central.ts) without
// vendoring core. They are types only — no runtime behaviour.
declare module '@/lib/supabase/server' {
  import type { SupabaseClient } from '@supabase/supabase-js';
  export function createServiceClient(): SupabaseClient;
  export function getUserFromRequest(req: Request): Promise<{ id: string; email: string } | null>;
}
declare module '@/lib/credits' {
  export interface GuardResult { ok: boolean; cost?: number; balance?: number; error?: string; refund?: () => Promise<unknown>; }
  export type CreditIntent = string;
  export function guardCredits(userId: string | null | undefined, intent: string, options?: { override_cost?: number; dry_run?: boolean }): Promise<GuardResult>;
  export function refundCredits(params: { userId: string; amount: number; reason: string; originalTransactionId?: string }): Promise<unknown>;
  export function getCreditBalance(userId: string): Promise<{ balance: number } | null>;
  export function enforcePrecheck(userId: string | null | undefined, source: string): Promise<unknown>;
}

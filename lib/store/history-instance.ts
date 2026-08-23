/**
 * lib/store/history-instance.ts
 *
 * Resolves the HistoryStore. Uses Supabase when the service credentials are
 * present, and returns null otherwise so a scan still runs without history
 * rather than failing. A missing store means "no memory this run", reported as
 * a blind spot — never a fabricated empty history.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { createClient } from '@supabase/supabase-js';
import type { HistoryStore } from '../engine/history';
import { SupabaseHistoryStore } from './supabase-history';

export function getHistoryStore(): HistoryStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== 'string' || typeof serviceKey !== 'string') return null;
  return new SupabaseHistoryStore(createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

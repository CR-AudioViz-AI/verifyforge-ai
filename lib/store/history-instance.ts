/**
 * lib/store/history-instance.ts
 *
 * Resolves the HistoryStore using the platform's shared service client, so
 * Verify's run history lives in the same database under the same connection
 * management as everything else. Returns a store unconditionally — the shared
 * client is always available inside the ecosystem — so run memory is never
 * silently absent.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { HistoryStore } from '../engine/history';
import { SupabaseHistoryStore } from './supabase-history';

export function getHistoryStore(): HistoryStore {
  return new SupabaseHistoryStore(createServiceClient());
}

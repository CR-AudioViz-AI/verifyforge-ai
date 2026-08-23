/**
 * lib/store/history-instance.ts
 *
 * Resolves the HistoryStore using the service client from Verify's one seam
 * (lib/api/central), so run history lives in the same database under the same
 * connection management as everything else. Returns a store unconditionally, so
 * run memory is never silently absent.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { createServiceClient } from '@/lib/api/central';
import type { HistoryStore } from '../engine/history';
import { SupabaseHistoryStore } from './supabase-history';

export function getHistoryStore(): HistoryStore {
  return new SupabaseHistoryStore(createServiceClient());
}

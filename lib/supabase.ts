/**
 * CR AudioViz AI - Supabase Client
 * =================================
 * 
 * Universal database client for CR AudioViz AI apps.
 * For authentication, credits, and central services, use:
 * 
 *   import { CentralServices, CentralAuth, CentralCredits } from './central-services';
 * 
 * This client is for app-specific database operations only.
 * Auth, payments, and credits should ALWAYS go through central services.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { secretKey } from "@craudioviz/platform-sdk";

// Re-export admin utilities from central services
export { isAdmin, shouldChargeCredits, ADMIN_EMAILS, CentralServices } from './central-services';

// Centralized Supabase configuration. Defined in lib/supabase-config.ts, which
// has NO side effects — this module creates a client on import, so anything that
// only wants a URL must be able to get one without paying for that. See #61.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';

// 2026-08-27: THE ROOT CAUSE BEHIND EVERY #61 DISGUISE.
//
// This was `export const supabase = createClient(...)` - a client CONSTRUCTED AT
// MODULE SCOPE. A module-level side effect runs on IMPORT, so every one of the
// five modules importing anything from this file paid for it, and inherited the
// Node<22 WebSocket requirement that comes with it. One landmine, many symptoms.
//
// VERIFIED BEFORE CHANGING IT: zero files import the eager `supabase` const.
// All five importers use the FACTORY functions - createSupabaseBrowserClient and
// createSupabaseServerClient. So making it lazy needs no call-site changes at all.
//
// The Proxy preserves the `supabase.from(...)` shape for any consumer added later
// while deferring construction to first use. If nothing touches it, no client is
// ever built and no WebSocket requirement is inherited.
//
// NOTE: lib/supabase/client.ts in the CORE repo is a deliberate module-level
// singleton for the BROWSER, because chunked cookies get corrupted by racing
// client instances (locked 2026-07-15). That is the opposite case and must stay
// eager. Same shape, opposite correct answer - which is why this needed checking
// rather than pattern-matching.
let _lazyClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_lazyClient) _lazyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _lazyClient;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const client = getSupabase() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// Browser client for auth (SSR-safe singleton pattern)
let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // Server-side: return new client each time
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  
  // Client-side: return singleton
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return browserClient;
}

// Server client for API routes
export function createSupabaseServerClient(): SupabaseClient {
  const serviceKey = secretKey();
  if (!serviceKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set, using anon key');
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return createClient(SUPABASE_URL, serviceKey);
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
export default supabase;

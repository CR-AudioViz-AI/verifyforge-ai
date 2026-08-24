/**
 * lib/auth/session.ts
 *
 * The client's half of authentication: one session store, one way to get a
 * token, one way to call an API with it.
 *
 * WHY NOT CentralServices.Auth. That path posts to CENTRAL_API_BASE — core's
 * domain, a different origin — with `credentials: 'include'`. Whatever session
 * it establishes is a cookie on core's origin: not readable from JavaScript
 * here, not a Supabase JWT, and so useless for an Authorization header. It also
 * returns a User and no token at all. Modern third-party cookie policy would
 * block the request regardless.
 *
 * createSupabaseBrowserClient() was already configured with persistSession and
 * autoRefreshToken and was never used to sign anyone in. It is now. The session
 * lives on this origin, its access_token is a real Supabase JWT, and
 * getUserFromRequest() on the server verifies that token against the same
 * project core uses — so the user id matches core's user_credits rows without
 * the session being shared across origins.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { createSupabaseBrowserClient } from '@/lib/supabase';

/** Keys written by the pre-auth localStorage flow. Read only to clear them. */
const LEGACY_KEYS = ['verifyforge_auth', 'verifyforge_user'] as const;

/**
 * The access token for the current session, or null when there is no session.
 *
 * Returns null rather than throwing, and never returns a stand-in: a caller with
 * no token must be treated as signed out, not as some default identity.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseBrowserClient().auth.getSession();
    if (error !== null || data.session === null) return null;
    return data.session.access_token;
  } catch {
    return null;
  }
}

export interface SignedInUser {
  readonly id: string;
  readonly email: string;
}

/** The signed-in user from the live session, or null. */
export async function getCurrentUser(): Promise<SignedInUser | null> {
  try {
    const { data, error } = await createSupabaseBrowserClient().auth.getUser();
    if (error !== null || data.user === null) return null;
    return { id: data.user.id, email: data.user.email ?? '' };
  } catch {
    return null;
  }
}

/**
 * Removes the pre-auth localStorage keys.
 *
 * Those "accounts" were an object with an invented `user_${Date.now()}` id that
 * maps to no Supabase user and no user_credits row. They are not sessions and
 * they are not migratable — there is no password to carry over, because sign-in
 * never checked one. Clearing them and routing to real signup is the honest
 * outcome; preserving them would mean keeping a fake identity alive against a
 * real ledger.
 */
export function clearLegacySession(): void {
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    // A browser refusing localStorage is already signed out for our purposes.
  }
}

/** True when the pre-auth flow left anything behind. */
export function hasLegacySession(): boolean {
  try {
    return LEGACY_KEYS.some((key) => window.localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

/**
 * fetch() with the session's bearer token attached.
 *
 * Throws when there is no session rather than sending an unauthenticated
 * request that the server will refuse: the caller gets a clear failure at the
 * point the token was missing, not a 401 to interpret.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (token === null) {
    throw new Error('Not signed in.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

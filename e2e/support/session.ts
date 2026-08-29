// e2e/support/session.ts — sign a test account in WITHOUT a password form.
//
// 2026-08-27. /auth no longer has an email field, and that is correct: the page was
// rewritten on 2026-08-29 to remove 197 lines of local authentication because
// ARCHITECTURE-CORE-VS-APP-LAW says an app consumes core OAuth and never implements
// its own. Local auth creates a SECOND user record outside core's CRM — same person,
// two identities, two credit balances, two support histories.
//
// So sign-in.ts's signIn() fills fields that no longer exist and times out. The app
// is right; the helper is stale.
//
// You cannot script a Google consent screen in CI, and you should not try. The
// documented way to obtain a real session for a real user is the admin API:
//
//   POST /auth/v1/admin/generate_link   service-role key   -> hashed_token
//   POST /auth/v1/verify                anon key           -> a real session
//
// PROVEN AGAINST THE LIVE PROJECT before this file was written: 200, with
// access_token, refresh_token and user all present. The first attempt sent
// { type, token } and got "Only an email address or phone number should be provided
// on verify" — the field is token_hash, and verify is called with the ANON key
// because it is a public endpoint.
//
// This is a REAL session issued by Supabase, not a forged one. The tokens are signed
// by the project and every RLS policy applies exactly as it would to a human. A test
// that fakes a session proves nothing about authorization.
//
// CR AudioViz AI, LLC · EIN 39-3646201

import { type Page } from '@playwright/test';

// 2026-08-27: SUPABASE_URL, not URL. Naming it URL SHADOWED THE GLOBAL URL
// CONSTRUCTOR, so `new URL(...)` in storageKey() resolved to a string and the
// typecheck reported 'This expression is not constructable'.
//
// It would have compiled if storageKey had used string splitting instead — a
// latent shadow waiting for the first person to reach for the global.
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const ANON = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SRK = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const EMAIL = process.env['E2E_TEST_EMAIL'];

/** True when CI has everything needed to mint a session. Specs skip rather than fail. */
export const CAN_SIGN_IN =
  Boolean(SUPABASE_URL) && Boolean(ANON) && Boolean(SRK) && Boolean(EMAIL);

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

/**
 * Mint a real Supabase session for E2E_TEST_EMAIL via the admin API.
 *
 * Throws rather than returning null: a spec that silently proceeds without a
 * session tests the signed-out path while claiming to test the signed-in one, which
 * is worse than failing.
 */
export async function mintSession(): Promise<Session> {
  if (!CAN_SIGN_IN) {
    throw new Error(
      'mintSession: missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ' +
        'SUPABASE_SERVICE_ROLE_KEY or E2E_TEST_EMAIL',
    );
  }

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SRK as string,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  });

  if (!linkRes.ok) {
    // The body, not just the status. A 4xx here names the reason — an unknown user,
    // a disabled provider — and discarding it costs the next person the diagnosis.
    throw new Error(`generate_link ${linkRes.status}: ${(await linkRes.text()).slice(0, 300)}`);
  }

  const link = (await linkRes.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new Error('generate_link returned no hashed_token');

  // verify is a PUBLIC endpoint and takes the anon key. Sending the service-role key
  // here is rejected, and would be wrong anyway — this step is what a real user's
  // browser performs.
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });

  if (!verifyRes.ok) {
    throw new Error(`verify ${verifyRes.status}: ${(await verifyRes.text()).slice(0, 300)}`);
  }

  const session = (await verifyRes.json()) as Session;
  if (!session.access_token) throw new Error('verify returned no access_token');
  return session;
}

/** The storage key supabase-js v2 uses: sb-<project-ref>-auth-token. */
function storageKey(): string {
  const ref = new URL(SUPABASE_URL as string).hostname.split('.')[0];
  if (!ref) throw new Error('could not derive the project ref from NEXT_PUBLIC_SUPABASE_URL');
  return `sb-${ref}-auth-token`;
}

/**
 * Put a real session into the page before any app code runs.
 *
 * addInitScript, not an evaluate after goto: lib/supabase/client.ts is a
 * MODULE-LEVEL singleton that reads localStorage when it is first imported. Writing
 * the session after navigation means the client has already decided nobody is
 * signed in, and the app renders signed-out no matter what storage says afterwards.
 */
export async function signInAs(page: Page): Promise<Session> {
  const session = await mintSession();
  const key = storageKey();
  const value = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
    token_type: session.token_type ?? 'bearer',
    user: session.user,
  });

  await page.addInitScript(
    ([k, v]: [string, string]) => {
      window.localStorage.setItem(k, v);
    },
    [key, value] as [string, string],
  );

  return session;
}

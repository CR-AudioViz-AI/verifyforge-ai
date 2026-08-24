// e2e/support/sign-in.ts — one owner for "sign a test account in".
//
// Extracted when a second spec needed it. Two copies of a sign-in helper is two
// places for a locator to drift, and the locators here are the ones that already
// went wrong once: the first version used getByPlaceholder(/email/i) against
// placeholders reading 'you@example.com' and a run of bullets.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24

import { expect, type Page } from '@playwright/test';

export const EMAIL = process.env['E2E_TEST_EMAIL'];
export const PASSWORD = process.env['E2E_TEST_PASSWORD'];

export const HAVE_CREDENTIALS = typeof EMAIL === 'string' && EMAIL.length > 0
  && typeof PASSWORD === 'string' && PASSWORD.length > 0;

/**
 * Sign in through the ACCESSIBLE names of the fields.
 *
 * getByLabel asserts the label/input association rather than routing around its
 * absence — remove an htmlFor on /auth and this goes red, which is how the
 * missing associations were found in the first place.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill(EMAIL as string);
  await page.getByLabel(/password/i).fill(PASSWORD as string);
  // Scoped to the form: the toggle beneath it reads "Already have an account?
  // Sign in" in sign-up mode, and an unscoped locator would go strict-mode
  // ambiguous the first time a test starts there.
  await page.locator('form').getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/** The Supabase access token this browser is holding, or null. */
export async function accessToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null && 'access_token' in parsed) {
            const value = (parsed as { access_token: unknown }).access_token;
            return typeof value === 'string' ? value : null;
          }
        } catch { return null; }
      }
    }
    return null;
  });
}

/** The account id (JWT `sub`) the token belongs to. */
export function ownerIdFromToken(token: string): string {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('access token has no payload segment');
  const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  if (typeof decoded === 'object' && decoded !== null && 'sub' in decoded) {
    const sub = (decoded as { sub: unknown }).sub;
    if (typeof sub === 'string') return sub;
  }
  throw new Error('access token carries no string `sub`');
}

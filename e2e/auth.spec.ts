import { test, expect } from '@playwright/test';
import { signIn, EMAIL, PASSWORD, HAVE_CREDENTIALS } from './support/sign-in';

/**
 * e2e/auth.spec.ts — proof that authentication actually works.
 *
 * WHY THIS EXISTS RATHER THAN A MANUAL CHECK. The preview sits behind Vercel
 * deployment protection, so the API cannot be reached from outside to confirm
 * that an unauthenticated request is refused. That is not a preview quirk to
 * work around once — it is how the environment is configured, permanently. This
 * suite runs INSIDE the Playwright container against the app the config starts
 * itself, so protection is irrelevant and the check re-runs on every PR.
 *
 * The assertion that matters most is the 401: it is the "no anonymous billable
 * path" guarantee, and a guarantee confirmed by hand once is a guarantee nobody
 * will notice losing.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

// EMAIL / PASSWORD / HAVE_CREDENTIALS / signIn now live in ./support/sign-in,
// so the meter spec and this one cannot drift apart.

/**
 * Skipping is LOUD, deliberately.
 *
 * A missing secret must read as "the auth proof did not run", never as a green
 * suite. The mobile project spent months reporting failures while asserting
 * nothing (issue #59) and the run summary never said so. A skip that whispers is
 * the same defect wearing a different colour.
 */
// Printed at COLLECTION time, not in a beforeAll hook. A describe-level skip
// never runs its hooks, so a banner inside beforeAll would be silent in exactly
// the case it exists to announce — the guard failing the same way the thing it
// guards against failed.
if (!HAVE_CREDENTIALS) {
  console.error(
  '\n' +
  '################################################################\n' +
      '#  AUTH E2E DID NOT RUN                                        #\n' +
      '#                                                              #\n' +
      '#  E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set, so the      #\n' +
      '#  sign-in, bearer-token and no-anonymous-billable-path proofs #\n' +
      '#  were SKIPPED. This suite passing proves NOTHING about       #\n' +
      '#  authentication. Set both secrets in CI.                     #\n' +
  '################################################################\n',
  );
}

test.describe('Authentication', () => {
  test.skip(!HAVE_CREDENTIALS, 'AUTH E2E DID NOT RUN — E2E_TEST_EMAIL / E2E_TEST_PASSWORD unset.');

  test('a real sign-in establishes a session that survives a reload', async ({ page }) => {
    await signIn(page);

    // The dashboard is gated on a verified session, so arriving is itself the
    // assertion: the previous localStorage flag could not have got us here.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // A session that does not survive a reload is not persistence.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);

    const token = await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key !== null && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          return window.localStorage.getItem(key);
        }
      }
      return null;
    });
    expect(token, 'a Supabase session should be persisted on this origin').not.toBeNull();
  });

  test('the API refuses an unauthenticated request — no anonymous billable path', async ({ request }) => {
    // No Authorization header. This is the whole point of the file.
    const response = await request.post('/api/tests/submit', {
      multipart: { test_type: 'web', target_url: 'https://example.com' },
      failOnStatusCode: false,
    });
    expect(response.status(), 'an unauthenticated scan request must be refused').toBe(401);

    const progress = await request.get('/api/tests/submit?action=progress&id=whatever', {
      failOnStatusCode: false,
    });
    expect(progress.status(), 'unauthenticated progress reads must be refused too').toBe(401);
  });

  test('the API accepts the same request with a bearer token', async ({ page, request }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    const token = await page.evaluate(() => {
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
    expect(token, 'sign-in should yield an access token').not.toBeNull();

    // Deliberately an INVALID body. A 400 proves the auth gate was passed and
    // validation was reached; a 200 would mean actually running a scan against a
    // live target, which is not this test's job and is not free.
    const response = await request.post('/api/tests/submit', {
      headers: { Authorization: `Bearer ${token as string}` },
      multipart: { economy_mode: 'standard' },
      failOnStatusCode: false,
    });
    expect(
      response.status(),
      'with a valid token the request should reach validation, not the auth gate',
    ).toBe(400);
  });

  test('a stale verifyforge_auth flag no longer grants dashboard access', async ({ page }) => {
    // Exactly what the removed flow wrote. Anyone who used the old app still has
    // this in their browser, and anyone can set it in devtools.
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('verifyforge_auth', 'true');
      window.localStorage.setItem(
        'verifyforge_user',
        JSON.stringify({ email: 'ghost@example.com', id: 'user_1700000000000' }),
      );
    });

    await page.goto('/dashboard');
    await expect(page, 'a localStorage flag must not authenticate anyone').toHaveURL(/\/auth/, {
      timeout: 15_000,
    });

    const cleared = await page.evaluate(() => window.localStorage.getItem('verifyforge_auth'));
    expect(cleared, 'the stale flag should be cleared, not merely ignored').toBeNull();
  });
});

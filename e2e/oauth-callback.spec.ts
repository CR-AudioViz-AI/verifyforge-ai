import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * e2e/oauth-callback.spec.ts — the half of the OAuth callback that can be
 * proven without a provider.
 *
 * WHAT THIS DOES NOT COVER. A successful round trip needs a real identity
 * provider and a human at a consent screen. That stays a manual check and is
 * named as such — nothing here should be read as "OAuth works".
 *
 * WHAT IT DOES COVER is the failure path, and that is not a consolation prize:
 * the defect this page fixes was a SILENT one. app/api/auth/callback/route.ts
 * exchanged the code on a server-side client with no cookie adapter, discarded
 * the session, and redirected the caller as though signed in. The redirect
 * looked identical to success. A denial from the provider went the same way —
 * straight to a dashboard that bounced the user back with nothing explained.
 *
 * A path that fails silently is exactly the path a test has to hold, because
 * nobody will notice losing it. Every assertion below is reachable with a plain
 * HTTP request and no credentials.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

/**
 * The page's OWN alert, not the framework's.
 *
 * Next.js injects <div role="alert" id="__next-route-announcer__"> into every
 * page for route-change announcements. It is permanently empty, but it makes a
 * bare getByRole('alert') resolve to two elements and fail Playwright's strict
 * mode — which is how this was found, on a page that was rendering correctly.
 *
 * Excluded by id rather than by matching its text, so these assertions stay
 * independent of the wording on the page.
 */
function pageAlert(page: Page): Locator {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

// What a provider actually sends on denial. error_description is URL-encoded in
// the real redirect; Playwright encodes it for us when it builds the URL.
const DENIED = '/auth/callback?error=access_denied&error_description=The user denied the request';

test.describe('OAuth callback — provider failures are surfaced, not swallowed', () => {
  test('a provider denial shows the reason and does not pretend to sign the user in', async ({ page }) => {
    await page.goto(DENIED);

    const alert = pageAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('The user denied the request');

    // THE ASSERTION THAT MATTERS. The old route redirected here regardless, so a
    // denied sign-in arrived at a dashboard that immediately bounced the user
    // back to /auth with no explanation. Staying put IS the fix.
    await expect(page).toHaveURL(/\/auth\/callback/);
    expect(page.url()).not.toContain('/dashboard');
  });

  test('the error alert offers a way back rather than stranding the user', async ({ page }) => {
    await page.goto(DENIED);

    const back = page.getByRole('link', { name: /back to sign in/i });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('error alone is surfaced when the provider sends no description', async ({ page }) => {
    // The page prefers error_description and falls back to error. A provider
    // that sends only the code must not produce a blank alert.
    await page.goto('/auth/callback?error=server_error');

    const alert = pageAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('server_error');
  });

  test('a callback with neither a code nor an error says so instead of hanging', async ({ page }) => {
    // Reachable by opening a stale or hand-edited callback URL. Without this
    // branch the page would spin on "Completing sign-in…" forever, which is a
    // silent failure wearing a loading spinner.
    await page.goto('/auth/callback');

    const alert = pageAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/missing its code/i);
    await expect(page).toHaveURL(/\/auth\/callback/);
  });
});

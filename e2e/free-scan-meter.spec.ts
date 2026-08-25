import { test, expect } from '@playwright/test';
import { signIn, accessToken, ownerIdFromToken, HAVE_CREDENTIALS } from './support/sign-in';

/**
 * e2e/free-scan-meter.spec.ts — the cost gate, exercised end to end.
 *
 * WHY THIS EXISTS RATHER THAN THE UNIT PROOF ALONE. test/proof.entitlements.ts
 * proves the claim LOGIC against a fake store. It cannot prove that the route
 * actually calls it, that Postgres actually raises 23505, or that the refusal
 * reaches the caller as a 429 — and this is the gate that stops an account
 * running unbounded billable work. A cost gate resting on a fake store and a
 * code review is not a gate.
 *
 * WHY IT CLEANS UP. The entitlement is one row per account FOREVER, by design —
 * no monthly reset. A test that consumes it without cleaning up passes exactly
 * once and fails on every run after, which is worse than no test. The service
 * role deletes the row before and after, so the suite is repeatable.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']
  ?? 'https://kteobfyferrukqeolofj.supabase.co';

const HAVE_SERVICE_KEY = typeof SERVICE_KEY === 'string' && SERVICE_KEY.length > 0;
const CAN_RUN = HAVE_CREDENTIALS && HAVE_SERVICE_KEY;

// LOUD, at collection time. A silent skip on the cost gate is the failure mode
// this whole suite exists to refuse.
if (!CAN_RUN) {
  console.error(
  '\n' +
  '################################################################\n' +
      '#  FREE-SCAN METER E2E DID NOT RUN                             #\n' +
      '#                                                              #\n' +
      `#  credentials: ${HAVE_CREDENTIALS ? 'present' : 'MISSING '}   service key: ${HAVE_SERVICE_KEY ? 'present' : 'MISSING '}       #\n` +
      '#  The one-free-scan cost gate was NOT exercised. This suite   #\n' +
      '#  passing proves NOTHING about metering.                      #\n' +
  '################################################################\n',
  );
}

/**
 * PostgREST directly, NOT createClient().
 *
 * createClient() builds a RealtimeClient, which needs a global WebSocket. The
 * Playwright container runs Node 20, which has none, so it throws:
 *
 *     Error: Node.js detected but native WebSocket not found.
 *     Suggested solution: Ensure you are running Node.js 22+ ...
 *
 * That is issue #61 — the @supabase/supabase-js Node<22 deprecation warning —
 * arriving as a hard failure. The APP is unaffected: Next.js polyfills
 * WebSocket in its server runtime, which is why every other auth test passes.
 * It is a bare Node process calling createClient that breaks.
 *
 * This test needs two table operations and no realtime, no auth and no session,
 * so it talks to PostgREST over fetch and depends on no Node version at all.
 * Bumping CI to Node 22 is the right fix for #61 and belongs in its own change,
 * not smuggled into a metering PR.
 */
async function pgrest(query: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jvf_account_entitlements?${query}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY as string}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`PostgREST ${init.method ?? 'GET'} failed ${res.status}: ${await res.text()}`);
  }
  return res;
}

async function clearClaim(ownerId: string): Promise<void> {
  await pgrest(`owner_id=eq.${ownerId}`, { method: 'DELETE' });
}

async function claimRowCount(ownerId: string): Promise<number> {
  const res = await pgrest(`owner_id=eq.${ownerId}&select=owner_id`, { method: 'GET' });
  const rows: unknown = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

test.describe('The free scan is metered', () => {
  test.skip(!CAN_RUN, 'FREE-SCAN METER E2E DID NOT RUN — credentials or service key unset.');

  // One account, one row, ever — so these must not interleave.
  test.describe.configure({ mode: 'serial' });

  test('a second scan is refused, and the first one claimed the row', async ({ page, request }) => {
    test.setTimeout(180_000); // the first request runs a real scan

    await signIn(page);
    const token = await accessToken(page);
    expect(token, 'sign-in should yield an access token').not.toBeNull();
    const ownerId = ownerIdFromToken(token as string);

    // Start from a known state rather than whatever a previous run left behind.
    await clearClaim(ownerId);
    expect(await claimRowCount(ownerId), 'precondition: no claim held').toBe(0);

    try {
      // FIRST scan — allowed. Runs real work against a real target.
      const first = await request.post('/api/tests/submit', {
        headers: { Authorization: `Bearer ${token as string}` },
        multipart: { test_type: 'web', target_url: 'https://example.com' },
        failOnStatusCode: false,
        timeout: 120_000,
      });
      expect(first.status(), 'the first free scan should be allowed').toBe(200);

      // The claim was taken. This is the half a fake store cannot prove.
      expect(await claimRowCount(ownerId), 'the first scan should claim the row').toBe(1);

      // SECOND scan — refused BEFORE any work. This is the cost gate.
      const second = await request.post('/api/tests/submit', {
        headers: { Authorization: `Bearer ${token as string}` },
        multipart: { test_type: 'web', target_url: 'https://example.com' },
        failOnStatusCode: false,
        timeout: 30_000,
      });
      expect(second.status(), 'a second free scan must be refused').toBe(429);

      const body: unknown = await second.json();
      const refusal = body as { error?: string; message?: string };
      expect(refusal.error).toContain('Free scan already used');
      // The refusal must not invent a purchase. /pricing is a 404.
      expect(JSON.stringify(body)).not.toContain('/pricing');

      // Still exactly one row: the refusal did not write a second.
      expect(await claimRowCount(ownerId), 'a refusal writes no row').toBe(1);
    } finally {
      // Always, even on failure above. Otherwise the next run starts refused.
      await clearClaim(ownerId);
    }
  });

  test('a malformed request does not burn the free scan', async ({ page, request }) => {
    await signIn(page);
    const token = await accessToken(page);
    const ownerId = ownerIdFromToken(token as string);

    await clearClaim(ownerId);
    try {
      // No test_type. Validation runs before the claim, deliberately, so this
      // must be rejected without consuming anything.
      const bad = await request.post('/api/tests/submit', {
        headers: { Authorization: `Bearer ${token as string}` },
        multipart: { economy_mode: 'standard' },
        failOnStatusCode: false,
      });
      expect(bad.status(), 'a malformed request is a 400, not a claim').toBe(400);
      expect(await claimRowCount(ownerId), 'a 400 must not consume the free scan').toBe(0);
    } finally {
      await clearClaim(ownerId);
    }
  });
});

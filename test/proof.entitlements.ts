// test/proof.entitlements.ts — the free scan is claimed once, and only once.
//
// Runs offline. No network, no database. It proves the CLAIM LOGIC: that a
// collision refuses, that a refusal is not confused with an outage, and that a
// release can only remove the claim its own run made.
//
// WHAT IT DOES NOT PROVE, said plainly: that Postgres raises 23505. That is the
// primary key in migration 0002 — applied and verified against production —
// not this module. A fake store cannot substitute for that guarantee and is not
// pretending to.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24

import {
  claimFreeScan,
  releaseFreeScan,
  type EntitlementStore,
} from '../lib/entitlements';

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) { console.log(`  ok   ${label}`); return; }
  console.error(`  FAIL ${label}`);
  failures += 1;
}

/** A store that behaves the way the primary key makes Postgres behave. */
function fakeStore(): EntitlementStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>(); // owner_id -> run_id
  return {
    rows,
    async insertClaim(row) {
      if (rows.has(row.owner_id)) return { conflict: true };
      rows.set(row.owner_id, row.free_partial_run_id);
      return { conflict: false };
    },
    async deleteClaim(ownerId, runId) {
      if (rows.get(ownerId) === runId) rows.delete(ownerId);
    },
  };
}

async function main(): Promise<void> {
  console.log('proof.entitlements');

  // 1. The first claim succeeds.
  const s1 = fakeStore();
  const first = await claimFreeScan(s1, 'user-a', 'run-1', 'https://example.com');
  check('a first free scan is granted', first.ok === true);

  // 2. THE ASSERTION THIS FILE EXISTS FOR. The second is refused.
  const second = await claimFreeScan(s1, 'user-a', 'run-2', 'https://example.com');
  check('a second free scan is REFUSED', second.ok === false);
  check('the refusal names its reason',
    second.ok === false && second.reason === 'already_claimed');

  // 3. The refusal happens at claim time, so no work is dispatched. The row
  //    still belongs to the first run — the second never overwrote it.
  check('the surviving claim is the first run', s1.rows.get('user-a') === 'run-1');

  // 4. Concurrency: the shape the old run-then-record design got wrong. Ten
  //    simultaneous claims, one winner.
  const s2 = fakeStore();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      claimFreeScan(s2, 'user-b', `run-${i}`, 'https://example.com')),
  );
  check('ten concurrent claims yield exactly one grant',
    results.filter((r) => r.ok).length === 1);
  check('ten concurrent claims yield nine refusals',
    results.filter((r) => !r.ok).length === 9);

  // 5. Another account is unaffected.
  const other = await claimFreeScan(s1, 'user-c', 'run-9', 'https://example.com');
  check('a different account still gets its own free scan', other.ok === true);

  // 6. Release gives the claim back after a failure we caused.
  const s3 = fakeStore();
  await claimFreeScan(s3, 'user-d', 'run-x', 'https://example.com');
  await releaseFreeScan(s3, 'user-d', 'run-x');
  const afterRelease = await claimFreeScan(s3, 'user-d', 'run-y', 'https://example.com');
  check('a released claim can be claimed again', afterRelease.ok === true);

  // 7. Release is scoped to its own run. A late retry must not delete the claim
  //    a different run is holding.
  const s4 = fakeStore();
  await claimFreeScan(s4, 'user-e', 'run-real', 'https://example.com');
  await releaseFreeScan(s4, 'user-e', 'run-stale');
  check('releasing a foreign run id removes nothing',
    s4.rows.get('user-e') === 'run-real');

  // 8. A store failure is an outage, not a quota refusal. Refusing a user
  //    because the database blinked would be a number we invented.
  const broken: EntitlementStore = {
    async insertClaim() { throw new Error('connection reset'); },
    async deleteClaim() { /* unused */ },
  };
  let threw = false;
  try { await claimFreeScan(broken, 'user-f', 'run-z', 'https://example.com'); }
  catch { threw = true; }
  check('a store failure throws rather than reading as already_claimed', threw);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nall entitlement checks passed');
}

void main();

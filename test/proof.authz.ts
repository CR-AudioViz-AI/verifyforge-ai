/**
 * test/proof.authz.ts — the authorization gate refuses what it must.
 *
 * No network. Every case is the gate's own logic, which is why the gate takes
 * stored records rather than looking anything up.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { authorizeScan, type GateInput, type ScopedAgreement, type StoredProof } from '../lib/authz/gate';
import { requirementsFor, issueToken, wellKnownPath } from '../lib/authz/proof-of-control';

let passed = 0;
let failed = 0;
function ck(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed += 1; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed += 1; console.log(`✗ FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ORIGIN = 'https://customer.example';
const NOW = '2026-08-24T12:00:00.000Z';

const agreement = (over: Partial<ScopedAgreement> = {}): ScopedAgreement => ({
  accountId: 'acct_1',
  targetOrigin: ORIGIN,
  windowStart: '2026-08-24T00:00:00.000Z',
  windowEnd: '2026-08-25T00:00:00.000Z',
  assertsAuthority: true,
  authorizesActiveTesting: true,
  acceptedAt: NOW,
  acceptedBy: 'user_1',
  ...over,
});

const proof = (over: Partial<StoredProof> = {}): StoredProof => ({
  targetOrigin: ORIGIN,
  method: 'dns_txt',
  verifiedAt: NOW,
  ...over,
});

const base = (over: Partial<GateInput> = {}): GateInput => ({
  tier: 'probing',
  targetOrigin: ORIGIN,
  now: NOW,
  agreement: agreement(),
  proof: proof(),
  testUser: null,
  aiOperatorIsCustomer: null,
  ...over,
});

console.log('\n=== read-only needs consent, not proof of control ===');
ck('read_only requires no proof method', requirementsFor('read_only').proofOfControl.length === 0);
ck('read_only still requires an agreement', requirementsFor('read_only').scopedAgreement);
ck('read_only allowed with agreement and no proof',
  authorizeScan(base({ tier: 'read_only', proof: null })).allowed);

console.log('\n=== probing requires proven control ===');
ck('probing allowed with agreement + proof', authorizeScan(base()).allowed);

const noProof = authorizeScan(base({ proof: null }));
ck('probing refused with no proof', !noProof.allowed);
ck('refusal names a fix', !noProof.allowed && noProof.fix.length > 0,
  !noProof.allowed ? noProof.fix.slice(0, 60) : '');

const wrongHost = authorizeScan(base({ proof: proof({ targetOrigin: 'https://someone-else.example' }) }));
ck('proof for another origin does not transfer', !wrongHost.allowed);

const readOnlyConsent = authorizeScan(base({ agreement: agreement({ authorizesActiveTesting: false }) }));
ck('reading consent does not authorize probing', !readOnlyConsent.allowed);

const noAuthority = authorizeScan(base({ agreement: agreement({ assertsAuthority: false }) }));
ck('no asserted authority is refused', !noAuthority.allowed);

console.log('\n=== the window is enforced ===');
ck('before the window is refused',
  !authorizeScan(base({ now: '2026-08-23T23:59:59.000Z' })).allowed);
ck('after the window is refused',
  !authorizeScan(base({ now: '2026-08-25T00:00:01.000Z' })).allowed);

console.log('\n=== an agreement does not extend to other hosts ===');
ck('scanning a different origin than the agreement is refused',
  !authorizeScan(base({ targetOrigin: 'https://other.example' })).allowed);

console.log('\n=== red-team: unknown AI operator is refused, not assumed benign ===');
const redBase = (over: Partial<GateInput> = {}): GateInput =>
  base({ tier: 'red_team', ...over });

const unknownOperator = authorizeScan(redBase());
ck('unknown operator refused', !unknownOperator.allowed);
ck('refusal says whose terms govern is unestablished',
  !unknownOperator.allowed && /who operates/i.test(unknownOperator.reason));

const thirdParty = authorizeScan(redBase({ aiOperatorIsCustomer: false }));
ck('third-party-operated AI refused', !thirdParty.allowed);

const noTestUser = authorizeScan(redBase({ aiOperatorIsCustomer: true, testUser: null }));
ck('red-team without a provisioned test identity refused', !noTestUser.allowed);

const redOk = authorizeScan(redBase({
  aiOperatorIsCustomer: true,
  testUser: { targetOrigin: ORIGIN, label: 'javari-test', provisionedByCustomer: true },
}));
ck('red-team allowed only with all three', redOk.allowed);

console.log('\n=== tokens ===');
const t1 = issueToken();
const t2 = issueToken();
ck('tokens are unguessable and unique', t1 !== t2 && t1.length > 40);
ck('well-known path is under /.well-known/', wellKnownPath(t1).startsWith('/.well-known/'));

console.log(`\n═══ authz: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed === 0 ? 0 : 1);

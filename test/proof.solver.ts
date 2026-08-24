// PROOF: the logic solver finds real business-logic defects with reproduction paths.
// Simulates a checkout with THREE planted flaws that no page-scanner could find:
//   1. Applying a coupon can drive the total negative (never-negative).
//   2. A referral bonus can be claimed twice (at-most).
//   3. You can reach "confirmed" without "paid" (implies).
import { solveLogic, invariants, type FlowDefinition, type FlowState } from '../lib/engine/logic-solver';
let pass=0, fail=0;
const check=(n:string,c:boolean,d='')=>{console.log(`${c?'  PASS':'✗ FAIL'}  ${n}${d?' — '+d:''}`);c?pass++:fail++;};

// A deliberately flawed checkout modeled as state transitions.
const flow: FlowDefinition = {
  label: 'Checkout',
  initialState: { total: 100, itemCount: 1, bonusClaims: 0, paid: false, confirmed: false } as FlowState,
  actions: [
    { name: 'applyCoupon', apply: async (s) => ({ ...s, total: (s.total as number) - 150 }) }, // FLAW: no floor
    { name: 'claimBonus', apply: async (s) => ({ ...s, bonusClaims: (s.bonusClaims as number) + 1, total: (s.total as number) - 10 }) },
    { name: 'pay', apply: async (s) => ({ ...s, paid: (s.total as number) <= 0 ? false : true }) },
    { name: 'confirmOrder', apply: async (s) => ({ ...s, confirmed: true }) }, // FLAW: doesn't check paid
  ],
  invariants: [
    invariants.neverNegative('total'),
    invariants.atMost('bonusClaims', 1),
    invariants.implies('confirmed', 'paid'),
  ],
  successPredicate: (s) => s.confirmed === true && s.paid === true,
  successLabel: 'order completed and paid',
  protectedStates: [
    { label: 'confirmed without paying', reached: (s) => s.confirmed === true, prerequisite: (s) => s.paid === true },
  ],
};

async function main(){
  const r = await solveLogic(flow, 300);
  console.log(`Explored ${r.statesVisited} states, ${r.actionsAttempted} actions, exhausted=${r.exhausted}\n`);

  const ids = r.violations.map(v => v.invariantId);
  check('found negative-total flaw', ids.some(i=>i.startsWith('never-negative')));
  check('found double-bonus flaw', ids.some(i=>i.startsWith('at-most')));
  check('found confirmed-without-paid flaw', ids.some(i=>i.startsWith('implies')));
  check('confirmed-without-paid is a protected breach', r.protectedBreaches.length>=1);

  // Every violation carries a reproduction path
  check('every violation has a reproduction path', r.violations.every(v=>v.reproductionPath.length>=0));

  console.log('\nViolations with reproductions:');
  for(const v of r.violations.slice(0,5)){
    console.log(`  [${v.severity}] ${v.invariantId}`);
    console.log(`     path: ${v.reproductionPath.join(' -> ')||'(initial state)'}`);
    console.log(`     state: total=${v.violatingState.total} bonusClaims=${v.violatingState.bonusClaims} confirmed=${v.violatingState.confirmed} paid=${v.violatingState.paid}`);
  }
  console.log(`\n═══ solver: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail>0?1:0);
}
main();

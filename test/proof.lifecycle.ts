// PROOF: the finding lifecycle honors "no marking your own homework".
import { InMemoryHistoryStore, diffRun, type RunSnapshot } from '../lib/engine/history';
import type { Finding } from '../lib/modules/contract';
let pass=0, fail=0;
const check=(n:string,c:boolean,d='')=>{console.log(`${c?'  PASS':'✗ FAIL'}  ${n}${d?' — '+d:''}`);c?pass++:fail++;};
const mk=(fp:string):Finding=>({ruleId:'redirect-integrity',category:'WEB',severity:'BLOCKER',title:'Loop',
  description:'x',subject:'/'+fp,evidence:[{kind:'measurement',metric:'h',value:2,unit:'hops',estimated:false,method:'t'}],
  recommendedFix:'fix',fingerprint:fp,autoFixable:false});
const snap=(id:string,at:string,f:Finding[],c:string[]):RunSnapshot=>({runId:id,targetId:'t',completedAt:at,accessTier:'public',findings:f,concludedModuleIds:c});
async function main(){
  const store=new InMemoryHistoryStore();
  const A=mk('a'), B=mk('b');
  let d=diffRun(snap('r1','2026-08-01T00:00:00Z',[A,B],['redirect-integrity']),null,[]);
  check('baseline: 2 new',d.counts.new===2);
  await store.persist(snap('r1','2026-08-01T00:00:00Z',[A,B],['redirect-integrity']),d.tracked);

  // A gone, module concluded -> may be marked fixed
  d=diffRun(snap('r2','2026-08-08T00:00:00Z',[B],['redirect-integrity']),await store.latestSnapshot('t'),await store.trackedFindings('t'));
  const fixedA=d.tracked.find(x=>x.fingerprint==='a');
  check('A verified fixed only after independent run',d.counts.fixed===1 && fixedA?.verifiedAt!==null);
  await store.persist(snap('r2','2026-08-08T00:00:00Z',[B],['redirect-integrity']),d.tracked);

  // B gone BUT module did NOT conclude -> must NOT be fixed
  d=diffRun(snap('r3','2026-08-15T00:00:00Z',[],[]),await store.latestSnapshot('t'),await store.trackedFindings('t'));
  check('B NOT closed when its module did not run',d.counts.fixed===0 && d.unverifiable.includes('b'));
  await store.persist(snap('r3','2026-08-15T00:00:00Z',[],[]),d.tracked);

  // A returns -> regression
  d=diffRun(snap('r4','2026-08-22T00:00:00Z',[A],['redirect-integrity']),await store.latestSnapshot('t'),await store.trackedFindings('t'));
  check('A flagged as regression when it returns',d.counts.regressed===1);
  console.log(`\n═══ lifecycle: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail>0?1:0);
}
main();

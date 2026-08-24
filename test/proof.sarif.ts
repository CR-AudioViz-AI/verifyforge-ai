// PROOF: SARIF interop — inconclusive never becomes a pass, blind spots ride into GitHub, round-trip survives.
import { toSarif, fromSarif } from '../lib/export/sarif';
import type { ScanReport } from '../lib/modules/report';
import type { CheckResult, CheckModule } from '../lib/modules/contract';
import { redirectIntegrityModule } from '../lib/modules/checks/redirect-integrity';
let pass=0, fail=0;
const check=(n:string,c:boolean,d='')=>{console.log(`${c?'  PASS':'✗ FAIL'}  ${n}${d?' — '+d:''}`);c?pass++:fail++;};
const report:ScanReport={targetLabel:'D',targetAddress:'https://x.com',accessTier:'public',verdict:'INCOMPLETE',
  headline:'h',findings:[{ruleId:'redirect-integrity',category:'WEB',severity:'BLOCKER',title:'Loop',description:'x',
  subject:'https://x.com/a',evidence:[{kind:'measurement',metric:'h',value:2,unit:'hops',estimated:false,method:'t'}],
  recommendedFix:'f',fingerprint:'ri-1',autoFixable:false}],
  findingsBySeverity:{BLOCKER:1,HIGH:0,MEDIUM:0,LOW:0},unconfirmedSignals:[],modulesRun:2,modulesConcluded:1,
  didNotRun:[{moduleId:'idor-access',reason:'needs auth'}],didNotConclude:[{moduleId:'hollow-response',reason:'unreachable'}],
  blindSpots:['Login not examined.'],subjectsExamined:8,requestsIssued:31,durationMs:1000,creditsCharged:3,generatedAt:'2026-08-23T05:00:00Z'};
const results:CheckResult[]=[{moduleId:'redirect-integrity',moduleVersion:'1.0.0',targetId:'t',accessTier:'public',
  outcome:{status:'pass',findings:[],checked:{subjectsExamined:8,requestsIssued:31,notes:''}},blindSpots:[],
  startedAt:'2026-08-23T04:59:00Z',durationMs:1000,creditsCharged:3}];
const mods=new Map<string,CheckModule>([['redirect-integrity',redirectIntegrityModule]]);
const s=toSarif(report,results,mods) as any;
const run=s.runs[0];
check('SARIF version 2.1.0', s.version==='2.1.0');
check('INCOMPLETE -> executionSuccessful false', run.invocations[0].executionSuccessful===false);
check('inconclusive + did-not-run become notifications', run.invocations[0].toolExecutionNotifications.length===2);
check('notifications are warnings not passes', run.invocations[0].toolExecutionNotifications.every((n:any)=>n.level==='warning'));
check('blind spots ride into GitHub rule help', run.tool.driver.rules[0].help.text.includes('CANNOT CATCH'));
check('blocker -> security-severity 9.5', run.results[0].properties['security-severity']==='9.5');
const back=fromSarif(JSON.parse(JSON.stringify(s)));
check('round-trip ingest recovers finding', back.length===1 && back[0]?.subject==='https://x.com/a');
check('malformed SARIF -> 0 findings no throw', fromSarif({runs:'garbage'}).length===0);
console.log(`\n═══ sarif: ${pass} passed, ${fail} failed ═══`);
process.exit(fail>0?1:0);

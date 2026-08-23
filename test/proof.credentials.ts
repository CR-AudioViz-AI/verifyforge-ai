// PROOF: the credential-deletion promise is a mechanism, not a sentence.
import { CredentialVault, runAuthorizationMatrix, type EstablishedPersona, type PersonaSpec } from '../lib/engine/personas';
import { Session } from '../lib/engine/session';
let pass=0, fail=0;
const check=(n:string,c:boolean,d='')=>{console.log(`${c?'  PASS':'✗ FAIL'}  ${n}${d?' — '+d:''}`);c?pass++:fail++;};
async function main(){
  const v=new CredentialVault();
  v.hold('Customer',{kind:'bearer',token:'c'}); v.hold('Admin',{kind:'bearer',token:'a'}); v.hold('Owner',{kind:'bearer',token:'o'});
  check('all held before destroy', v.destructionReceipt().every(r=>r.state==='held'));
  v.destroyAll();
  check('allDestroyed() true after destroy', v.allDestroyed());
  check('secret actually gone (not just flagged)', v.strategyFor('Admin')===null);
  check('receipt shows destroyedAt timestamp', v.destructionReceipt().every(r=>r.destroyedAt!==null));

  // matrix flags a lower role reaching a higher role's resource
  const mk=(role:any,label:string,owned:string[]):EstablishedPersona=>{
    const s=new Session({kind:'anonymous'},null); (s as any).status='established';
    return {spec:{role,label,strategy:{kind:'anonymous'},proof:null,ownedResources:owned,forbiddenResources:[]} as PersonaSpec,
            session:s,authenticated:true,achievedTier:'authenticated'};
  };
  const res=await runAuthorizationMatrix([mk('customer','Cust',[]),mk('admin','Admin',['https://example.com/'])],5);
  check('customer reaching admin resource = violation', res.violations.length===1,
    res.violations[0]?`${res.violations[0].actorRole}->${res.violations[0].resourceOwnerRole}`:'none');
  console.log(`\n═══ credentials+matrix: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail>0?1:0);
}
main();

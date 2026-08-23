import { guardUrl, isBlockedIp } from '../lib/net/egress-guard';
let pass=0,fail=0; const ck=(n:string,c:boolean,d='')=>{console.log(`${c?'  PASS':'✗ FAIL'}  ${n}${d?' — '+d:''}`);c?pass++:fail++;};
async function main(){
  // IP range checks
  ck('blocks 169.254.169.254 (cloud metadata)', isBlockedIp('169.254.169.254'));
  ck('blocks 127.0.0.1', isBlockedIp('127.0.0.1'));
  ck('blocks 10.x', isBlockedIp('10.1.2.3'));
  ck('blocks 192.168.x', isBlockedIp('192.168.1.1'));
  ck('blocks 172.16-31', isBlockedIp('172.20.0.1'));
  ck('blocks ::1', isBlockedIp('::1'));
  ck('blocks IPv4-mapped ::ffff:127.0.0.1', isBlockedIp('::ffff:127.0.0.1'));
  ck('allows public 8.8.8.8', !isBlockedIp('8.8.8.8'));
  // URL-level
  ck('blocks file: scheme', !(await guardUrl('file:///etc/passwd')).allowed);
  ck('blocks http://localhost', !(await guardUrl('http://localhost/')).allowed);
  ck('blocks http://169.254.169.254', !(await guardUrl('http://169.254.169.254/latest/meta-data/')).allowed);
  ck('blocks .internal suffix', !(await guardUrl('http://db.internal/')).allowed);
  ck('allows https://example.com', (await guardUrl('https://example.com/')).allowed);
  // DNS rebinding: a hostname that resolves to loopback must be refused
  const v = await guardUrl('http://localhost.localtest.me/');  // resolves to 127.0.0.1
  ck('catches DNS pointing at 127.0.0.1', !v.allowed, v.reason.slice(0,50));
  console.log(`\n═══ egress guard: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail>0?1:0);
}
main();

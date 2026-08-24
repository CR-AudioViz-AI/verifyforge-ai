// PROOF SUITE — every claim the product makes, tested against reality.
// Not "it compiles" — "it does what the marketing says, and refuses what it should."
import { ModuleRegistry, runProfile } from '../lib/modules/registry';
import { buildReport } from '../lib/modules/report';
import { hollowResponseModule } from '../lib/modules/checks/hollow-response';
import { redirectIntegrityModule } from '../lib/modules/checks/redirect-integrity';
import { idorAccessModule } from '../lib/modules/checks/idor-access';
import { Session } from '../lib/engine/session';
import type { Target } from '../lib/modules/target';
import type { ScanProfile } from '../lib/modules/contract';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? '  PASS' : '✗ FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  cond ? pass++ : fail++;
}

async function main() {
  const reg = new ModuleRegistry();
  reg.register(hollowResponseModule);
  reg.register(redirectIntegrityModule);
  reg.register(idorAccessModule);
  const anon = new Session({ kind: 'anonymous' }, null);
  const t = (over: Partial<Target> = {}): Target => ({
    id: 'tgt', kind: 'web_property', label: 'T', address: 'https://example.com/',
    accessTier: 'public', authorization: { kind: 'owned', note: 't' },
    rateLimitRps: 5, respectRobotsTxt: true, ...over,
  });

  console.log('\n=== CLAIM 1: registry enforces invariants at registration ===');
  try { reg.register(hollowResponseModule); check('duplicate id rejected', false); }
  catch { check('duplicate id rejected', true); }
  const noBlind = { ...hollowResponseModule, id: 'x', whatItCannotCatch: [] as string[] };
  try { reg.register(noBlind as never); check('module with no blind spots rejected', false); }
  catch { check('module with no blind spots rejected', true); }

  console.log('\n=== CLAIM 2: "could not run never shows green" ===');
  {
    const prof: ScanProfile = { id: 'p', name: 'p', moduleIds: ['idor-access'], inputs: {} };
    const run = await runProfile(prof, t({ accessTier: 'public' }), reg, anon, () => {});
    const rep = buildReport(run, t({ accessTier: 'public' }));
    check('IDOR at public tier does not run', run.skipped.some(s => s.moduleId === 'idor-access'),
      run.skipped[0]?.reason.slice(0, 50));
    check('verdict is INCOMPLETE not CLEAR', rep.verdict === 'INCOMPLETE', rep.verdict);
  }

  console.log('\n=== CLAIM 3: redirect module finds REAL loops (live) ===');
  {
    const prof: ScanProfile = { id: 'p', name: 'p', moduleIds: ['redirect-integrity'],
      inputs: { routes: 'https://docs.claude.com/docs/en/home\nhttps://docs.claude.com/docs/en/intro' } };
    const run = await runProfile(prof, t({ address: 'https://docs.claude.com/', rateLimitRps: 4 }), reg, anon, () => {});
    const r = run.results[0];
    const findings = r?.outcome.status === 'fail' ? r.outcome.findings : [];
    check('found redirect loops on live site', findings.length >= 1, `${findings.length} findings`);
    check('each finding has >=5 evidence paths', findings.every(f => f.evidence.length >= 5),
      findings[0] ? `${findings[0].evidence.length} paths` : 'none');
    check('severity is BLOCKER for loops', findings.every(f => f.severity === 'BLOCKER'));
  }

  console.log('\n=== CLAIM 4: hollow-response does NOT false-positive on real content (live) ===');
  {
    const prof: ScanProfile = { id: 'p', name: 'p', moduleIds: ['hollow-response'],
      inputs: { routes: 'https://example.com/' } };
    const run = await runProfile(prof, t(), reg, anon, () => {});
    const r = run.results[0];
    check('example.com is not flagged hollow', r?.outcome.status === 'pass', r?.outcome.status);
  }

  console.log('\n=== CLAIM 5: session refuses unproven authority ===');
  {
    const s = new Session({ kind: 'bearer', token: 'fake' },
      { probeUrl: 'https://example.com/', expectAuthenticatedMarker: 'Example Domain' });
    await s.establish();
    check('worthless token -> not usable', !s.isUsable());
    check('achieved tier downgraded to public', s.achievedTier('authenticated') === 'public');
  }

  console.log('\n=== CLAIM 6: evidence cannot be faked — estimated flag survives ===');
  {
    const prof: ScanProfile = { id: 'p', name: 'p', moduleIds: ['redirect-integrity'],
      inputs: { routes: 'https://docs.claude.com/docs/en/home' } };
    const run = await runProfile(prof, t({ address: 'https://docs.claude.com/', rateLimitRps: 4 }), reg, anon, () => {});
    const r = run.results[0];
    const f = r?.outcome.status === 'fail' ? r.outcome.findings[0] : undefined;
    const measured = f?.evidence.filter(e => e.kind === 'measurement') ?? [];
    check('measurements declare estimated=false', measured.every(e => e.kind === 'measurement' && e.estimated === false),
      `${measured.length} measurements`);
  }

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
  process.exit(fail > 0 ? 1 : 0);
}
main();

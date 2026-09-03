/**
 * lib/modules/checks/platform-posture.ts
 *
 * Checks the things that are true of a REPOSITORY and its deployment, not of a
 * running page.
 *
 * WHY THIS EXISTS. On 2 September 2026 an ecosystem sweep with this product found
 * 536 findings across 60 sites. Every one of them was about a running web page,
 * because that is all the modules could examine. The defects that caused the most
 * damage that night were invisible to all of them:
 *
 *   107 repositories on strict:false or an es5 target. javari-business failed its
 *   production build on "Property 'res' does not exist on type 'AuthResult'" —
 *   correct auth-guard code that the compiler refuses to narrow without
 *   strictNullChecks. An earlier fleet pass fixed 46 and covered only repos
 *   carrying the platform env shim, so 61 kept the defect for a month.
 *
 *   A production site serving from an ARCHIVED, read-only repository. Nobody can
 *   patch it without unarchiving, and nothing announces that.
 *
 *   A Vercel project deploying from a repository GitHub says does not exist.
 *
 *   A registered cron returning 401 every two minutes since it was created,
 *   because CRON_SECRET was never set on that project. Vercel does not alert on a
 *   failing cron, so it failed silently for its entire life.
 *
 *   A sitemap advertising pages that had been deleted — an active instruction to
 *   search engines to index a 404, which is worse than a dead link in a footer.
 *
 * Each of those was found by hand, once, and nothing would have caught it
 * happening again. That is the gap this module closes: the Sign-Off Law says a
 * defect found once becomes an automated check, and a defect that only a person
 * noticed is a defect that will come back.
 *
 * WHAT IT DOES NOT DO is read application logic. It examines configuration, which
 * is where the cheap, silent, fleet-wide defects live.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-03
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
  Severity,
} from '../contract';

interface RepoFinding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

const GH = 'https://api.github.com';

async function gh(path: string, token: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${GH}${path}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Decodes a base64 file body from the contents API. */
function decode(payload: unknown): string | null {
  const rec = payload as { content?: string } | null;
  if (!rec?.content) return null;
  try {
    return Buffer.from(rec.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Strips // comments so tsconfig, which allows them, parses as JSON. */
function parseJsonc(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.replace(/^\s*\/\/[^\n]*$/gm, '')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const platformPostureCheck: CheckModule = {
  id: 'platform.posture',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Repository and deployment configuration',

  whatItChecks:
    'Examines a GitHub repository for the configuration defects that do not show up on a running page: TypeScript strictness and compile target, GitHub Actions pinned to a moving tag rather than a commit, archived repositories still serving production, and workflows with no timeout.',

  whatItCannotCatch: [
    'Anything about the running application. This reads configuration, not behaviour — pair it with the web checks.',
    'Whether the code is correct. A repository can be perfectly configured and still be wrong.',
    'Secrets committed to history. Detecting those needs a full history scan, which this does not perform.',
    'Whether a Vercel project deploys from this repository at all. That link lives in Vercel, and this module only sees GitHub.',
    'Private repository contents without a token that can read them. Without one the check reports inconclusive rather than assuming a repository is clean.',
  ],

  supportedTargetKinds: ['repository'],
  minimumAccessTier: 'source',
  intrusive: false,

  inputs: [
    { name: 'repo', description: 'owner/name of the repository.', required: true, kind: 'repo' },
    { name: 'githubToken', description: 'Token with read access.', required: true, kind: 'credentials' },
  ],

  estimatedCredits: 4,
  estimatedRuntimeMs: 20_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const repo = String(context.inputs?.['repo'] ?? context.target?.address ?? '').replace(
      /^https?:\/\/github\.com\//,
      '',
    );
    const token = String(context.inputs?.['githubToken'] ?? '');

    if (!repo || !token) {
      return {
        status: 'inconclusive',
        reason: 'A repository and a GitHub token are both required; nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    let requests = 0;
    const meta = (await gh(`/repos/${repo}`, token)) as
      | { archived?: boolean; default_branch?: string; private?: boolean }
      | null;
    requests++;

    if (meta === null) {
      // Never reported as clean. A repository we could not read is a repository we
      // know nothing about, and saying otherwise is the failure this whole product
      // exists to prevent.
      return {
        status: 'inconclusive',
        reason: `Could not read ${repo}. The token may lack access, or the repository may not exist under that name — a Vercel project pointing at a repository GitHub does not recognise is itself worth investigating.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Repository unreadable.' },
      };
    }

    const problems: RepoFinding[] = [];

    // --- Archived, and therefore unpatchable --------------------------------
    if (meta.archived === true) {
      problems.push({
        ruleId: 'platform.repo.archived',
        severity: 'HIGH',
        title: 'Repository is archived and read-only',
        description:
          'GitHub refuses every push to an archived repository. If anything deploys from here, it cannot be patched — not for a security fix, not for an outage — until somebody unarchives it. Nothing about the running site reveals this.',
        fix: 'Unarchive it if it is still serving production, or move the deployment to a repository that is maintained.',
        detail: `${repo} has archived=true`,
      });
    }

    // --- TypeScript configuration -------------------------------------------
    const tsRaw = decode(await gh(`/repos/${repo}/contents/tsconfig.json`, token));
    requests++;
    if (tsRaw !== null) {
      const ts = parseJsonc(tsRaw);
      const opts = (ts?.['compilerOptions'] ?? {}) as Record<string, unknown>;
      const hasRefs = Array.isArray(ts?.['references']);

      // A project-reference root legitimately carries no compilerOptions. Flagging
      // one would be a false positive, and this module found two while being
      // written.
      if (!hasRefs) {
        const target = String(opts['target'] ?? '').toLowerCase();
        const strict = opts['strict'];

        if (target === '' || ['es5', 'es3', 'es2015', 'es2016', 'es2017'].includes(target)) {
          problems.push({
            ruleId: 'platform.tsconfig.target',
            severity: 'MEDIUM',
            title:
              target === ''
                ? 'No TypeScript target declared, so it defaults to ES5'
                : `TypeScript target is ${target}`,
            description:
              'With no target declared TypeScript defaults to ES5, where `[...new Set(...)]` does not compile. That broke lender deduplication in one app and rescue-owner deduplication in another, and both looked like ordinary bugs rather than a configuration default nobody chose.',
            fix: 'Set "target": "ES2020". Raising a target only ever removes errors — it widens what the compiler accepts.',
            detail: `target = ${target || 'undeclared'}`,
          });
        }

        if (strict !== true) {
          problems.push({
            ruleId: 'platform.tsconfig.strict',
            severity: 'HIGH',
            title: 'TypeScript strict mode is off',
            description:
              'Without strictNullChecks the compiler cannot narrow a discriminated union, so it REJECTS correct code. An auth guard returning `{ ok: true; userId } | { ok: false; res }` fails to compile on `if (!auth.ok) return auth.res` — the guard is the thing that will not build. One app failed its production deploy on exactly this, and turning strict ON in another took it from three errors to one.',
            fix: 'Set "strict": true. Expect it to surface real defects rather than noise; that is the point.',
            detail: `strict = ${String(strict)}`,
          });
        }
      }
    }

    // --- GitHub Actions supply chain ----------------------------------------
    const wfList = (await gh(`/repos/${repo}/contents/.github/workflows`, token)) as
      | { name: string; path: string }[]
      | null;
    requests++;

    if (Array.isArray(wfList)) {
      let tagPinned = 0;
      let shaPinned = 0;
      let untimed = 0;
      const examples: string[] = [];

      for (const file of wfList.slice(0, 12)) {
        const body = decode(await gh(`/repos/${repo}/contents/${file.path}`, token));
        requests++;
        if (body === null) continue;

        for (const m of body.matchAll(/uses:\s*([^\s@]+)@([^\s]+)/g)) {
          const ref = m[2] ?? '';
          if (/^[0-9a-f]{40}$/.test(ref)) shaPinned++;
          else {
            tagPinned++;
            if (examples.length < 3) examples.push(`${m[1]}@${ref}`);
          }
        }
        // A workflow with no timeout runs to the platform default of six hours.
        // Seven untimed jobs once froze this platform's Actions budget twice in
        // one day.
        if (/jobs:/.test(body) && !/timeout-minutes:/.test(body)) untimed++;
      }

      if (tagPinned > 0) {
        problems.push({
          ruleId: 'platform.actions.unpinned',
          severity: 'HIGH',
          title: `${tagPinned} GitHub Action(s) pinned to a moving tag`,
          description:
            'A tag is a pointer someone else controls. Whoever can move it can run code in your CI, and your CI holds your deploy tokens — this is the tj-actions/changed-files attack class. A commit SHA cannot be moved.',
          fix: 'Pin every action to a full 40-character commit SHA, with the version in a trailing comment so it stays readable.',
          detail: `${tagPinned} tag-pinned, ${shaPinned} sha-pinned. Examples: ${examples.join(', ')}`,
        });
      }

      if (untimed > 0) {
        problems.push({
          ruleId: 'platform.actions.untimed',
          severity: 'LOW',
          title: `${untimed} workflow(s) with no timeout-minutes`,
          description:
            'A job with no timeout runs to the platform default of six hours. Seven untimed jobs on this platform exhausted the Actions budget twice in a single day, and a hung job looks identical to a slow one until the bill arrives.',
          fix: 'Set timeout-minutes on every job. Ten minutes is generous for most builds.',
          detail: `${untimed} of ${wfList.length} workflow file(s)`,
        });
      }
    }

    const evidenceFor = (p: RepoFinding): [Evidence, ...Evidence[]] => [
      {
        kind: 'source_location',
        repo,
        path:
          p.ruleId.includes('tsconfig')
            ? 'tsconfig.json'
            : p.ruleId.includes('actions')
              ? '.github/workflows'
              : 'repository settings',
        line: 0,
        excerpt: p.detail,
      },
    ];

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'SECURITY',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: repo,
      evidence: evidenceFor(p),
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, repo),
      autoFixable: p.ruleId.includes('tsconfig'),
    }));

    const checked = {
      subjectsExamined: 1,
      requestsIssued: requests,
      notes:
        `${repo}: archived=${String(meta.archived)}, tsconfig ${tsRaw === null ? 'absent' : 'read'}, ` +
        `${Array.isArray(wfList) ? wfList.length : 0} workflow file(s) examined.`,
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default platformPostureCheck;

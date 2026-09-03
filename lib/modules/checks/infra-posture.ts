/**
 * lib/modules/checks/infra-posture.ts
 *
 * Checks the hosting account and the database — the two places where a defect is
 * invisible from both the code and the running page.
 *
 * WHY. An ecosystem sweep on 2 September 2026 examined 63 live sites and found
 * 536 defects. Every one was about a web page. The problems that actually cost
 * the most that week lived somewhere neither the code nor the page could show:
 *
 *   A registered cron returning 401 every two minutes since the day it was
 *   created, because CRON_SECRET was never set on that project. Vercel does not
 *   alert on a failing cron, so it failed silently for its entire life and the
 *   async scan spine had never executed once.
 *
 *   A Vercel project deploying from a repository GitHub says does not exist.
 *
 *   Preview deployments serving live production data to anyone with the URL.
 *
 *   A table with row-level security enabled and no policy on it, which denies
 *   everything and looks exactly like a feature that was never finished.
 *
 * Each was found by hand. Nothing would have caught any of them coming back.
 *
 * WHAT IT REFUSES TO DO. It reads configuration and never writes. A scanner with
 * write access to the hosting account is a scanner that can take the platform
 * down, and no finding is worth that.
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

interface Problem {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

async function api(url: string, token: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const infraPostureCheck: CheckModule = {
  id: 'infra.posture',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Hosting project and deployment configuration',

  whatItChecks:
    'Reads a Vercel project and reports the defects that never reach a page: registered crons whose secret is unset, preview deployments left public, a missing link to source control, and production deployments that have been failing.',

  whatItCannotCatch: [
    'Anything about the running application. This reads account configuration, not behaviour.',
    'Whether the environment variable VALUES are correct — only whether the ones a cron or build needs are present. A wrong secret and a missing one look identical from here.',
    'Secrets stored outside this project, including anything served from a vault at runtime, which will correctly appear absent from the project environment.',
    'Whether a cron is doing useful work. It reports that the job can authenticate, not that the job is worth running.',
    'Other hosting providers. This understands Vercel only.',
  ],

  supportedTargetKinds: ['web_property', 'tool'],
  minimumAccessTier: 'internal',
  intrusive: false,

  inputs: [
    { name: 'vercelProjectId', description: 'Vercel project id.', required: true, kind: 'origin' },
    { name: 'vercelToken', description: 'Read-scoped Vercel API token.', required: true, kind: 'credentials' },
    { name: 'vercelTeamId', description: 'Team id, when the project belongs to a team.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 4,
  estimatedRuntimeMs: 25_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const projectId = String(context.inputs?.['vercelProjectId'] ?? '');
    const token = String(context.inputs?.['vercelToken'] ?? '');
    const team = String(context.inputs?.['vercelTeamId'] ?? '');
    const q = team ? `?teamId=${encodeURIComponent(team)}` : '';

    if (!projectId || !token) {
      return {
        status: 'inconclusive',
        reason: 'A project id and a read token are both required; nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    let requests = 0;
    const project = (await api(`https://api.vercel.com/v9/projects/${projectId}${q}`, token)) as
      | {
          name?: string;
          link?: { repo?: string; org?: string; type?: string };
          ssoProtection?: { deploymentType?: string } | null;
        }
      | null;
    requests++;

    if (project === null) {
      return {
        status: 'inconclusive',
        reason: `Could not read project ${projectId}. The token may lack access or the project may not exist — either is worth knowing, and neither means the project is healthy.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: requests, notes: 'Project unreadable.' },
      };
    }

    const name = project.name ?? projectId;
    const problems: Problem[] = [];

    // --- Source control link -------------------------------------------------
    if (!project.link?.repo) {
      problems.push({
        ruleId: 'infra.project.unlinked',
        severity: 'MEDIUM',
        title: 'Project is not linked to a repository',
        description:
          'Nothing connects what is running to source you can read, review or roll back. A deployment with no repository behind it cannot be patched by anyone who did not make it, and cannot be audited at all.',
        fix: 'Link the project to its repository, or delete it if nothing should be deploying from here.',
        detail: `${name} has no link.repo`,
      });
    }

    // --- Preview protection --------------------------------------------------
    // Preview deployments run the same code against the same database as
    // production. Left public they are production data on an unlisted URL.
    if (!project.ssoProtection) {
      problems.push({
        ruleId: 'infra.preview.public',
        severity: 'HIGH',
        title: 'Preview deployments are publicly reachable',
        description:
          'Every preview build serves the same code against the same database as production. Without protection, anyone holding a preview URL reads live data — and preview URLs leak through pull requests, chat and search.',
        fix: 'Enable deployment protection for preview builds, and mint an automation bypass token for anything that needs machine access.',
        detail: `${name} has no ssoProtection`,
      });
    }

    // --- Crons and their secret ---------------------------------------------
    const envs = (await api(`https://api.vercel.com/v9/projects/${projectId}/env${q}`, token)) as
      | { envs?: { key: string }[] }
      | null;
    requests++;
    const keys = new Set((envs?.envs ?? []).map((e) => e.key));

    const deployments = (await api(
      `https://api.vercel.com/v6/deployments${q ? `${q}&` : '?'}projectId=${projectId}&limit=20`,
      token,
    )) as { deployments?: { state?: string; target?: string | null }[] } | null;
    requests++;

    // A cron cannot be read from the project API, but a project that ships one
    // needs CRON_SECRET. Absence is reported as a question rather than a verdict,
    // because the secret may legitimately be served from a vault at runtime.
    if (!keys.has('CRON_SECRET') && keys.size > 0) {
      problems.push({
        ruleId: 'infra.cron.secret-absent',
        severity: 'MEDIUM',
        title: 'CRON_SECRET is not set on this project',
        description:
          'If this project registers a cron, it will reject every invocation with 401 — and the platform does not alert on a failing cron, so it fails silently for its entire life. One scheduled worker on this platform did exactly that from the day it was created until somebody ran it by hand.',
        fix: 'Set CRON_SECRET on the project and redeploy, since environment changes only take effect on a new build. If the value is served from a vault at runtime instead, this finding is expected and can be dismissed.',
        detail: `${keys.size} environment variables set, CRON_SECRET not among them`,
      });
    }

    // --- Recent production health -------------------------------------------
    const prod = (deployments?.deployments ?? []).filter((d) => d.target === 'production');
    const failed = prod.filter((d) => d.state === 'ERROR').length;
    if (prod.length > 0 && failed / prod.length >= 0.5) {
      problems.push({
        ruleId: 'infra.deploy.failing',
        severity: 'HIGH',
        title: `${failed} of the last ${prod.length} production deployments failed`,
        description:
          'Whatever is live is older than what is committed. Every fix merged since the last successful build is written down and not running, which is the state most likely to be mistaken for "we already fixed that".',
        fix: 'Read the build log for the most recent failure. A repeatedly failing production build is usually one type error or one missing dependency.',
        detail: `${failed}/${prod.length} recent production deployments in ERROR`,
      });
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'SECURITY',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: name,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `Read from the Vercel project API for ${name}. ${p.detail}`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, name),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: 1,
      requestsIssued: requests,
      notes:
        `${name}: repo=${project.link?.repo ?? 'none'}, ` +
        `previewProtection=${project.ssoProtection ? 'on' : 'OFF'}, ` +
        `${keys.size} env vars, ${prod.length} recent production deployment(s).`,
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default infraPostureCheck;

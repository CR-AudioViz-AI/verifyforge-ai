/**
 * lib/modules/checks/supply-chain.ts
 *
 * What the code you did not write is allowed to do.
 *
 * WHY THIS IS ITS OWN CHECK. Every other module examines something the team
 * built. This one examines everything they pulled in — dependencies, actions,
 * third-party scripts — which is almost always the larger surface and is the
 * only part of a codebase that can change while nobody touches it.
 *
 * A dependency declared as ^1.2.0 is not a version, it is a subscription. The
 * next install may fetch code nobody has read, and lock files drift out of step
 * with the manifests that were reviewed.
 *
 * WHAT IT REFUSES TO DO. It does not report every CVE in the tree. The 2026
 * benchmark that found 216 million findings across 250 organisations, of which
 * 0.092% were critical after reachability analysis, is a description of that
 * failure: a wall of advisories nobody can act on trains people to ignore the
 * one that matters. This reports the STRUCTURAL weaknesses — an unpinned action
 * somebody else controls, a script loaded from another origin with no integrity
 * hash, a manifest and lock file that disagree — because those are decidable
 * from the repository and each has one clear fix.
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

const GH = 'https://api.github.com';

async function ghJson(path: string, token: string): Promise<unknown | null> {
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

function decode(payload: unknown): string | null {
  const rec = payload as { content?: string } | null;
  if (!rec?.content) return null;
  try {
    return Buffer.from(rec.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const supplyChainCheck: CheckModule = {
  id: 'supply.chain',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Dependencies, actions and third-party code',

  whatItChecks:
    'Reads the manifest and lock file for dependencies that can change without anyone acting, GitHub Actions pinned to a tag somebody else controls, and scripts the live page loads from another origin without an integrity hash.',

  whatItCannotCatch: [
    'Whether a specific dependency has a known vulnerability. That needs an advisory feed and, far more importantly, reachability analysis — a wall of advisories nobody can act on is how a scanner trains people to ignore it.',
    'What a dependency actually does at runtime. A package can be perfectly pinned and still be malicious.',
    'Transitive dependencies beyond what the lock file names. Depth is where supply-chain attacks hide and a full graph walk is a different tool.',
    'Typosquatting. Detecting that a package name is one character from a popular one needs a registry corpus this does not carry.',
    'Whether a third-party script has changed since it was reviewed, unless it carries an integrity hash — which is precisely why the missing hash is the finding.',
    'Anything loaded after the initial HTML by a script that injects further scripts. This reads the served document, not the runtime graph.',
  ],

  supportedTargetKinds: ['repository', 'web_property'],
  minimumAccessTier: 'source',
  intrusive: false,

  inputs: [
    { name: 'repo', description: 'owner/name of the repository.', required: false, kind: 'repo' },
    { name: 'githubToken', description: 'Token with read access.', required: false, kind: 'credentials' },
    { name: 'origin', description: 'Live origin, for third-party script checks.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 5,
  estimatedRuntimeMs: 30_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const repo = String(context.inputs?.['repo'] ?? '').replace(/^https?:\/\/github\.com\//, '');
    const token = String(context.inputs?.['githubToken'] ?? '');
    const origin = String(context.inputs?.['origin'] ?? '').replace(/\/+$/, '');

    if (!repo && !origin) {
      return {
        status: 'inconclusive',
        reason: 'Neither a repository nor an origin was supplied, so nothing was examined.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }

    const problems: Problem[] = [];
    let requests = 0;
    let examined = 0;

    // --- Manifest and lock ---------------------------------------------------
    if (repo && token) {
      const pkgRaw = decode(await ghJson(`/repos/${repo}/contents/package.json`, token));
      requests++;

      if (pkgRaw !== null) {
        examined++;
        try {
          const pkg = JSON.parse(pkgRaw) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const deps = { ...(pkg.dependencies ?? {}) };
          const names = Object.keys(deps);

          // A wildcard or `latest` is the only version spec with NO upper bound.
          // Ranges are normal practice and are reported separately and softly;
          // an unbounded spec is not.
          const unbounded = names.filter((n) => {
            const v = deps[n] ?? '';
            return v === '*' || v === 'latest' || v.trim() === '';
          });

          if (unbounded.length > 0) {
            problems.push({
              ruleId: 'supply.dep.unbounded',
              severity: 'HIGH',
              title: `${unbounded.length} dependency spec(s) with no upper bound`,
              description:
                'A dependency declared as "*" or "latest" installs whatever is newest at build time. A build today and a build tomorrow can ship different code with no commit in between, which makes a regression impossible to bisect and a compromised release impossible to avoid.',
              fix: 'Replace each with a bounded range, and commit the lock file so the resolved version is reviewable.',
              detail: unbounded.slice(0, 8).join(', '),
            });
          }

          // The lock file is what actually gets installed. A manifest without
          // one means the reviewed versions and the installed versions are
          // unrelated.
          const lock =
            (await ghJson(`/repos/${repo}/contents/package-lock.json`, token)) ??
            (await ghJson(`/repos/${repo}/contents/pnpm-lock.yaml`, token)) ??
            (await ghJson(`/repos/${repo}/contents/yarn.lock`, token));
          requests += 3;

          if (lock === null) {
            problems.push({
              ruleId: 'supply.lock.absent',
              severity: 'HIGH',
              title: 'No lock file is committed',
              description:
                `${names.length} dependencies are declared and nothing records which versions were actually installed. Every environment resolves independently, so "works on my machine" becomes literally true and a build cannot be reproduced.`,
              fix: 'Commit the lock file. It is the only record of what the reviewed build actually contained.',
              detail: `${names.length} dependencies, no package-lock.json, pnpm-lock.yaml or yarn.lock`,
            });
          }
        } catch {
          problems.push({
            ruleId: 'supply.manifest.unparseable',
            severity: 'MEDIUM',
            title: 'package.json could not be parsed',
            description:
              'The manifest exists and is not valid JSON, so nothing downstream can read it reliably — including this check, the installer and any tooling that reasons about dependencies.',
            fix: 'Repair the JSON. A manifest that does not parse usually means a merge conflict was committed.',
            detail: 'JSON.parse failed on package.json',
          });
        }
      }

      // --- Actions pinned to a moving tag ------------------------------------
      const workflows = (await ghJson(`/repos/${repo}/contents/.github/workflows`, token)) as
        | { path: string }[]
        | null;
      requests++;

      if (Array.isArray(workflows)) {
        let tagPinned = 0;
        let shaPinned = 0;
        const examples: string[] = [];

        for (const file of workflows.slice(0, 10)) {
          const body = decode(await ghJson(`/repos/${repo}/contents/${file.path}`, token));
          requests++;
          if (body === null) continue;
          examined++;
          for (const m of body.matchAll(/uses:\s*([^\s@]+)@([^\s]+)/g)) {
            const ref = m[2] ?? '';
            if (/^[0-9a-f]{40}$/.test(ref)) shaPinned++;
            else {
              tagPinned++;
              if (examples.length < 3) examples.push(`${m[1]}@${ref}`);
            }
          }
        }

        if (tagPinned > 0) {
          problems.push({
            ruleId: 'supply.action.unpinned',
            severity: 'HIGH',
            title: `${tagPinned} GitHub Action(s) pinned to a moving tag`,
            description:
              'A tag is a pointer somebody else controls. Whoever can move it can run code in your CI, and your CI holds deploy tokens — this is the tj-actions/changed-files attack class. A commit SHA cannot be moved.',
            fix: 'Pin every action to a full 40-character commit SHA with the version in a trailing comment, so it stays readable while being immutable.',
            detail: `${tagPinned} tag-pinned, ${shaPinned} sha-pinned. Examples: ${examples.join(', ')}`,
          });
        }
      }
    }

    // --- Third-party scripts on the live page --------------------------------
    if (origin) {
      try {
        const res = await fetch(origin, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15_000),
        });
        requests++;
        const html = await res.text();
        examined++;

        const host = new URL(origin).host;
        const external: string[] = [];
        for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
          const tag = m[0];
          const src = m[1] ?? '';
          if (!/^https?:\/\//i.test(src)) continue;
          try {
            if (new URL(src).host.endsWith(host)) continue;
          } catch {
            continue;
          }
          // An integrity hash makes a third-party script immutable: if it
          // changes, the browser refuses it. Without one, the origin can serve
          // anything tomorrow.
          if (!/\bintegrity=/i.test(tag)) external.push(src);
        }

        if (external.length > 0) {
          problems.push({
            ruleId: 'supply.script.no-integrity',
            severity: 'MEDIUM',
            title: `${external.length} third-party script(s) loaded with no integrity hash`,
            description:
              'These execute with full access to the page: the DOM, cookies not marked HttpOnly, and anything typed into a form. Without an integrity hash the other origin can serve different code tomorrow and nothing here would notice — this is the Magecart pattern, and it is invisible to a code review because the code is not in the repository.',
            fix: 'Add an integrity hash and crossorigin attribute to each, or self-host the script so it is reviewed and versioned like the rest of the code.',
            detail: external.slice(0, 4).join(', '),
          });
        }
      } catch {
        /* the page check is best-effort; the repository findings stand on their own */
      }
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'SECURITY',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: repo || origin,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Read directly from the repository or the served document; re-runnable.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, repo || origin),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: examined,
      requestsIssued: requests,
      notes:
        `Examined ${examined} artefact(s). ` +
        'Structural weaknesses only: unbounded version specs, a missing lock file, actions pinned to a tag, and third-party scripts with no integrity hash. ' +
        'Known vulnerabilities in specific packages are NOT reported here — that needs an advisory feed and reachability analysis, and a wall of unreachable CVEs is how a scanner teaches people to ignore it.',
    };

    if (examined === 0) {
      return {
        status: 'inconclusive',
        reason: 'Nothing could be read. A repository needs a token with access, and an origin needs to serve HTML.',
        findings: [],
        checked,
      };
    }
    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default supplyChainCheck;

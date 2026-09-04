/**
 * lib/modules/catalog-meta.ts
 *
 * Grouping, presets and selection metadata for the check catalog.
 *
 * THE PRINCIPLE THIS FILE ENCODES: inform, do not decide.
 *
 * A CISO is managing twenty other things. They should be able to see what a
 * check finds, how noisy it is, and why it matters — and then choose. Hiding a
 * capability because we judged it too noisy makes the decision for someone who
 * has more context about their own risk than we ever will.
 *
 * That is a different position from the industry's. The 2026 research is
 * unanimous that alert volume is the problem: the OX Security benchmark found
 * 216 million findings across 250 organizations, of which 0.092% were critical
 * after exploitability analysis, and reported false-positive rates run 71-90%.
 * The common response is to ship fewer checks.
 *
 * We ship MORE checks and fewer FINDINGS. Those are different axes, and
 * conflating them is a mistake. A check that is switched off produces no noise
 * at all. Alert fatigue is about UNSOLICITED findings — a finding you asked for
 * reads completely differently from one imposed on you. Selection is consent.
 *
 * The alternative is what Contrast Security called the "tool-swamp": teams
 * layering disparate tools hoping the combination yields a secure outcome. A
 * narrow scanner FORCES that swamp. Breadth with selection is the cure.
 *
 * THREE THINGS EVERY CHECK MUST DECLARE HERE:
 *
 *   signalQuality   Our honest read on how often this check is wrong. No
 *                   competitor publishes this. It is the trust play, and it is
 *                   the natural extension of the contract already demanding
 *                   `whatItCannotCatch`.
 *   whyItMatters    With a real citation. The info button exists so the reader
 *                   can weigh the evidence rather than take our ordering on
 *                   faith.
 *   defaultOn       The default is our opinion. The catalog is the capability.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

export type SignalQuality = 'precise' | 'high' | 'broad';

export interface SignalNote {
  readonly quality: SignalQuality;
  /** Said plainly, in the words we would use to a customer. */
  readonly note: string;
}

export const SIGNAL: Readonly<Record<SignalQuality, string>> = {
  precise:
    'Deterministic. A finding here is a fact about the target, not an inference — it was observed and the evidence is attached. Expect close to zero false positives.',
  high:
    'Measured against a published or stated threshold. The measurement is real; whether the threshold is right for you is a judgement you can disagree with on the record.',
  broad:
    'Casts wide deliberately. Catches more, and some of what it catches will not matter in your context. Worth running when you want coverage over quiet.',
};

export interface CheckGroup {
  readonly id: string;
  readonly label: string;
  /** One line. What this group is for. */
  readonly purpose: string;
  /** Where this sits in the list. Lower is higher — see ORDERING below. */
  readonly rank: number;
}

/**
 * ORDERING IS AN OPINION AND IT IS STATED AS ONE.
 *
 * The research is consistent that tools flag everything with equal weight and
 * leave prioritisation to the customer. We rank instead, and every rank carries
 * its reasoning in the info panel so it can be argued with.
 *
 * The ordering principle: things that let someone IN come before things that
 * are merely wrong. An exposed credential is a breach; a slow page is a
 * disappointment.
 */
export const GROUPS: readonly CheckGroup[] = [
  {
    id: 'access',
    label: 'Access & authorisation',
    purpose:
      'Whether one user can reach another user\u2019s data, and whether endpoints enforce the permissions they claim to.',
    rank: 1,
  },
  {
    id: 'secrets',
    label: 'Secrets & credentials',
    purpose: 'Exposed keys, tokens in client bundles, credential age, and unused machine identities.',
    rank: 2,
  },
  {
    id: 'ai',
    label: 'AI & agents',
    purpose:
      'Prompt injection, system prompt disclosure, PII echo, token ceilings, model drift, and MCP tool exposure.',
    rank: 3,
  },
  {
    id: 'payments',
    label: 'Payments & webhooks',
    purpose:
      'Signature verification, replay windows, idempotency, and whether a payment path can be reached without auth.',
    rank: 4,
  },
  {
    id: 'supply',
    label: 'Supply chain',
    purpose:
      'Dependencies, CI pinning, third-party script integrity, and what the code you did not write is allowed to do.',
    rank: 5,
  },
  {
    id: 'data',
    label: 'Data & privacy',
    purpose:
      'PII in logs and responses, deletion that actually deletes, backup restore proof, and row-level security coverage.',
    rank: 6,
  },
  {
    id: 'integrity',
    label: 'Integrity',
    purpose:
      'Responses that report success while delivering nothing, broken redirects, and queries against columns that do not exist.',
    rank: 7,
  },
  {
    id: 'transport',
    label: 'Certificates, DNS & headers',
    purpose:
      'Certificate lifetime and transparency logs, dangling DNS, email authentication, and browser security headers.',
    rank: 8,
  },
  {
    id: 'a11y',
    label: 'Accessibility',
    purpose: 'WCAG 2.2 conformance measured against the rendered page, not the markup.',
    rank: 9,
  },
  {
    id: 'performance',
    label: 'Performance & experience',
    purpose:
      'Core Web Vitals, frame rate, memory and payload measured in a real browser under real device conditions.',
    rank: 10,
  },
];

export interface CheckMeta {
  readonly moduleId: string;
  readonly groupId: string;
  /**
   * On unless the user says otherwise. The default is our opinion about what
   * most people should run; everything remains one click away.
   */
  readonly defaultOn: boolean;
  readonly signal: SignalNote;
  /** Shown behind the info button. Plain language, then the evidence. */
  readonly whyItMatters: string;
  /** Named source, so the claim can be checked rather than believed. */
  readonly evidence?: string;
}

export const CHECK_META: readonly CheckMeta[] = [
  {
    moduleId: 'idor-access',
    groupId: 'access',
    defaultOn: true,
    signal: { quality: 'precise', note: SIGNAL.precise },
    whyItMatters:
      'One signed-in user reading another user\u2019s records. It needs two real identities to detect, which is why most scanners never find it — and why it is the failure that becomes a breach notification rather than a bug ticket.',
    evidence:
      'Broken object-level authorisation is consistently ranked the top API risk by OWASP, and DAST guidance in 2026 highlights it as the class static analysis cannot reach because it requires request sequences with actual user roles.',
  },
  {
    moduleId: 'secrets.exposed',
    groupId: 'secrets',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Every pattern is anchored on a documented vendor key format, and each candidate is filtered by entropy and surrounding context before it is reported. JWTs are decoded rather than guessed at, so a publishable anon key is never reported and a service-role key always is.',
    },
    whyItMatters:
      'A credential in a served asset is not a risk, it is a disclosure — anyone who loaded the page already has it, and rotation is the only remedy. This scans what was SERVED rather than what is in the repository, which is a different set: a key becomes public the moment someone prefixes it NEXT_PUBLIC_, and a key deleted from source months ago is still in a deployed bundle until that bundle is replaced.',
    evidence:
      'Source maps are fetched explicitly because they re-expose the original source, including the comments explaining what each key is for, and they are served silently and almost never audited.',
  },
  {
    moduleId: 'ai.safety',
    groupId: 'ai',
    defaultOn: true,
    signal: {
      quality: 'high',
      note:
        'A model is non-deterministic, so each probe runs several times and the result is reported as a rate — "bypassed 3 of 5 attempts" — rather than a verdict. One refusal is not proof of safety.',
    },
    whyItMatters:
      'Content the model reads becomes instructions it obeys. A support bot that summarises a customer email will follow what the email told it, and the same endpoint will repeat a card number back into your logs.',
    evidence:
      'Invariant Labs\u2019 MCPTox benchmark recorded an 84.2% tool-poisoning success rate against agents with auto-approval enabled. Endor Labs analysed 2,614 MCP servers and found 82% prone to path traversal and 67% to code injection.',
  },
  {
    moduleId: 'hollow-response',
    groupId: 'integrity',
    defaultOn: true,
    signal: { quality: 'precise', note: SIGNAL.precise },
    whyItMatters:
      'A route returning HTTP 200 with the 404 page inside it passes every test suite that asserts on status codes. So does an endpoint answering { success: true } over an empty body. The build is green and the customer is stuck.',
    evidence:
      'Found 34 times in this platform\u2019s own code during the 2026 pre-launch audit, which is why the check exists at all.',
  },
  {
    moduleId: 'schema-columns',
    groupId: 'integrity',
    defaultOn: true,
    signal: { quality: 'precise', note: SIGNAL.precise },
    whyItMatters:
      'A query selecting a column the database does not have. The row comes back missing the field instead of erroring, so the feature silently does nothing — an admin flag that is never true, a total that is always zero.',
  },
  {
    moduleId: 'redirect-integrity',
    groupId: 'integrity',
    defaultOn: true,
    signal: { quality: 'precise', note: SIGNAL.precise },
    whyItMatters:
      'Loops, excessive hops, protocol downgrades and cross-origin hand-offs. An infinite redirect on a payment webhook loses every delivery and the sender sees a redirect rather than an error, so nothing alerts.',
    evidence:
      'Found on this platform\u2019s own /api/billing/webhook on 2 September 2026 — it 308-redirected to itself.',
  },
  {
    moduleId: 'api.false-success',
    groupId: 'integrity',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Requests a path that cannot exist, asking for JSON. A success status carrying a web page is not an interpretation - it means every client sees a deleted endpoint as a working one.',
    },
    whyItMatters:
      'It breaks nothing by itself. It removes the ability of every client to notice that something else is broken: a renamed route, a deleted handler, a typo in a fetch call all become silent successes.',
    evidence:
      'Measured 4 September 2026. On this platform a live resume builder had a real form - somebody could type their resume, press submit, and be told complete, while nothing was sent, because the endpoint had never been built. Tested against four origins: two of this estate answered a nonexistent POST with 200 and a web page, one third-party site did the same on one prefix, and github.com answered honestly with 404 and 422 throughout.',
  },
  {
    moduleId: 'data.source-of-truth',
    groupId: 'data',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Compares named values across endpoints and reports any that differ. It never decides which is right - only the owner knows which figure they meant, and a scanner that guessed would tell somebody to correct the correct one.',
    },
    whyItMatters:
      'A customer shown one price and charged another is a chargeback and a complaint, and from outside it is indistinguishable from deliberate. The dangerous version is the one harming nobody yet: a plausible endpoint with the wrong numbers, waiting for a page to be wired to it.',
    evidence:
      'Measured on this platform 4 September 2026: /api/pricing served Business at $79.99 from the database while /api/pricing/tiers served a hardcoded Premium at $99.99 that exists in no table, alongside a Starter and a Free Forever that do not exist either. Both endpoints were live and returned 200. Nothing customer-facing called the second, so no customer had been shown a wrong price - which is exactly why it had survived.',
  },
  {
    moduleId: 'db.function-integrity',
    groupId: 'data',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Resolves every table.column reference and INSERT column list in every public-schema function against information_schema. A named column either exists or it does not - there is nothing to interpret.',
    },
    whyItMatters:
      'PostgreSQL does not validate a function body against the schema when the function is created. It resolves columns at run time, so a function can reference a column dropped years ago and still install cleanly. Nothing fails until somebody calls it, and by then the caller usually sees a boolean.',
    evidence:
      'Measured on this platform 4 September 2026: debit_credits and refund_credits - the code paths that take a customer\'s credits and return them - both selected profiles.is_admin, which does not exist, and both inserted operation and metadata into a table with neither. Every call raised 42703. No credit was ever debited or refunded through them. Both had row locking, an admin bypass and an audit trail; a code review would have passed them. Only running them found it.',
  },
  {
    moduleId: 'scope.coverage',
    groupId: 'performance',
    defaultOn: true,
    signal: {
      quality: 'broad',
      note:
        'Discovers related hostnames from certificate transparency and the page\'s own links, then reports the live ones not in scope. It never scans them - there is no authorisation, and scanning an origin the customer did not name is behaviour a security product must never exhibit.',
    },
    whyItMatters:
      'A clean report on part of an estate reads exactly like a clean report on all of it. Every other honesty mechanism here governs what a scan says about what it examined; none of them says anything about what was never handed to it.',
    evidence:
      'Measured on this platform: an OAuth open redirect was found and fixed across eight repositories on 3 and 4 September, declared closed, and found LIVE on 6 September on rateunlock.com - a host that had never been scanned. The auth-flow check probes that exact route and that exact parameter. It was never pointed at that host.',
  },
  {
    moduleId: 'web.discoverability',
    groupId: 'performance',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Reads the served document, robots.txt and sitemap.xml. Every finding is a fact about a file with one fix. No score is produced - a score nobody can act on is the same failure as a wall of unreachable CVEs.',
    },
    whyItMatters:
      'An app with no title, no canonical and no sitemap is functioning perfectly and earning nothing. The worst case is a robots.txt with Disallow: / that reached production from staging - the site works, cannot be found, and nothing breaks to announce it.',
    evidence:
      'Measured across 22 live sites on this platform 4 September 2026: 22 had titles, 19 had canonicals, 19 had a sitemap and 19 had robots.txt - so real gaps existed on roughly one site in seven.',
  },
  {
    moduleId: 'supply.chain',
    groupId: 'supply',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Reads the manifest, the lock file and the served document directly. Each finding is a fact about a file with one clear fix. Known CVEs are deliberately NOT reported: a wall of advisories nobody can act on is how a scanner trains people to ignore it.',
    },
    whyItMatters:
      'This is the only part of a codebase that can change while nobody touches it. A tag is a pointer somebody else controls, and whoever moves it runs code in your CI - which holds your deploy tokens. A third-party script with no integrity hash can serve different code tomorrow, invisible to a code review because the code is not in the repository.',
    evidence:
      'Measured on this platform 3 September 2026: every GitHub Action across the org was pinned to a moving tag rather than a commit SHA, and 63 of 65 dependencies in core use ranges rather than exact versions.',
  },
  {
    moduleId: 'data.resilience',
    groupId: 'data',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Reads the backup record directly. It reports that a backup EXISTS, is recent and covers what it should - and states plainly that whether it would actually restore is not tested, because proving that means a real drill into an isolated target.',
    },
    whyItMatters:
      'A backup that has never been restored is a hope rather than a control. The failure modes only appear on the way back: a schema that has moved on, a dependency order that will not replay, an encryption key nobody kept. Auditors want evidence a control OPERATED, not a screenshot proving it exists.',
    evidence:
      'Recovery plans with no test evidence are among the most commonly cited SOC 2 A1.3 gaps, and they are cited because they are almost always true. This platform backs up 371 tables nightly and no restore had ever been rehearsed as of September 2026.',
  },
  {
    moduleId: 'database.exposure',
    groupId: 'data',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Judged on ROWS RETURNED, never on status code. A 200 with an empty array is row-level security working correctly and is not reported. The first version of this probe treated 200 as readable and would have declared the user credits table publicly exposed when it was not.',
    },
    whyItMatters:
      'The publishable key ships in every page. Row-level security is the only thing between a PostgREST table and the internet — a table with RLS off is not misconfigured, it is published.',
    evidence:
      'Found on this platform on 3 September 2026: one table in a 904-table schema had RLS disabled and served merchant identifiers and ingest data to any anonymous browser. The other 80 tables with RLS enabled and no policy were correctly NOT flagged - that is the right configuration for service-role-only data.',
  },
  {
    moduleId: 'auth.flow',
    groupId: 'access',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'An endpoint either builds its redirect from a fixed origin or from the request. Ask it to point elsewhere and read where it actually points — one request, unambiguous answer. An origin with no sign-in endpoint is reported inconclusive, never pass.',
    },
    whyItMatters:
      'An attacker sends a victim a link to YOUR domain, the victim signs in legitimately, and the authorisation code is delivered to the attacker. The code is the account, and every visible signal in the flow says the site is genuine.',
    evidence:
      'Probed on this platform on 3 September 2026: the Discord, Microsoft and LinkedIn start endpoints all build redirect_to from a hardcoded origin and ignore next, redirect_to and returnTo entirely, so poisoning is impossible. The check exists to keep that true.',
  },
  {
    moduleId: 'commerce.integrity',
    groupId: 'payments',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'A handler that verifies signatures rejects an unsigned request; one that does not, accepts it. That is a one-request test with an unambiguous answer. Every payload sent is inert - structurally valid but referring to objects that cannot exist - so a handler that wrongly accepts one still has nothing to act on.',
    },
    whyItMatters:
      'A payment endpoint that accepts a forged webhook does not error, does not slow down, and appears in logs as ordinary traffic. It simply marks orders paid and grants credits to whoever asked. This is the only defect class where the attacker is paid rather than merely admitted.',
    evidence:
      'Probed on this platform on 3 September 2026: /api/admin/credits/grant, /api/auth/seed-credits and /api/admin/billing all correctly returned 401 to an anonymous caller, and both payment webhooks refused an unsigned event. The check exists to keep that true.',
  },
  {
    moduleId: 'infra.posture',
    groupId: 'supply',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Reads the hosting account directly. A finding is a fact about a project setting. A project that cannot be read is reported inconclusive, never clean.',
    },
    whyItMatters:
      'The defects that cost the most live where neither the code nor the page can show them: a cron rejecting every invocation because its secret was never set, preview builds serving live production data to anyone with the URL, a project deploying from a repository that does not exist.',
    evidence:
      'Found on this platform on 2 September 2026 — a scan worker returned 401 to its own scheduler every two minutes from the day it was created, because CRON_SECRET was never set on that project. The platform does not alert on a failing cron, so the async scan spine had never executed once.',
  },
  {
    moduleId: 'platform.posture',
    groupId: 'supply',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Reads configuration files directly from the repository. A finding is a fact about a file, not an inference — and a repository that cannot be read is reported inconclusive rather than clean.',
    },
    whyItMatters:
      'The defects that cost the most are invisible from outside: TypeScript strict off so the compiler rejects correct auth guards, Actions pinned to a tag someone else controls, a production site serving from an archived repository nobody can patch.',
    evidence:
      'Found on this platform on 3 September 2026 — 107 repositories on strict:false or an es5 target, one production site deploying from an archived read-only repo, and every GitHub Action tag-pinned rather than SHA-pinned. An August fleet pass had fixed 46 and covered only repos carrying the platform env shim.',
  },
  {
    moduleId: 'security.posture',
    groupId: 'transport',
    defaultOn: true,
    signal: {
      quality: 'precise',
      note:
        'Headers and cookie flags are read from the live response. DNS is resolved over DNS-over-HTTPS against a named public resolver, and the module proves its resolver works before trusting any negative — a lookup that returns nothing is reported as unverifiable, never as a missing record.',
    },
    whyItMatters:
      'A domain with no mail server is still spoofable, and that is the part people miss: it costs an attacker nothing to send mail as a domain that never sends mail. SPF and DMARC are two DNS records and they decide whether a phishing campaign can wear your name.',
    evidence:
      'Found on this platform on 2 September 2026 — seven of eight domains had neither SPF nor DMARC. The mail-sending domain was correctly configured; the others were not, and those are the ones an attacker would choose.',
  },
  {
    moduleId: 'a11y.wcag',
    groupId: 'a11y',
    defaultOn: true,
    signal: {
      quality: 'high',
      note:
        'Computed from the rendered page with alpha compositing and gradient stop analysis, so translucent overlays and gradients are measured rather than guessed at or skipped. Contrast findings are exact; heading and target-size findings are structural and occasionally debatable.',
    },
    whyItMatters:
      'Automated testing catches roughly a third of WCAG. That third is worth having — and a clean result is not an accessible site, which is the most consequential misreading in this category.',
    evidence:
      'WCAG 2.2 Level A and AA. Accessibility litigation continues to rise year over year, and contrast plus missing labels remain the most commonly cited defects.',
  },
  {
    moduleId: 'runtime.performance',
    groupId: 'performance',
    defaultOn: true,
    signal: {
      quality: 'high',
      note:
        'Real measurements from a real browser. The thresholds are Google\u2019s published Core Web Vitals bands where they exist, and ours — labelled as ours — where they do not.',
    },
    whyItMatters:
      'A site measured on a laptop is measured under the best conditions it will ever face. This platform\u2019s own homepage resolves LCP in 540ms on desktop and 3,380ms on a mid-range Android: a 6.3x gap invisible from a developer machine.',
    evidence:
      'Google assesses Core Web Vitals at the 75th percentile of real visits over 28 days. A lab run finds and proves the problem; it is not the figure Search Console reports.',
  },
  {
    moduleId: 'mobile.readiness',
    groupId: 'performance',
    defaultOn: true,
    signal: { quality: 'high', note: SIGNAL.high },
    whyItMatters:
      'Viewport configuration, zoom permission, render-blocking weight and PWA installability, fetched as a phone. Blocking zoom is a documented WCAG failure, not a design preference.',
  },
  {
    moduleId: 'game.payload',
    groupId: 'performance',
    defaultOn: false,
    signal: {
      quality: 'high',
      note:
        'Measures real transfer weight per asset and detects the renderer and frame-loop style from source. It does NOT report frame rate — that needs the game running on real hardware.',
    },
    whyItMatters:
      'A game that ships fifty megabytes before it plays is a minute of blank screen on mobile data, and mobile browsers evict tabs that sit unresponsive that long. The player never reaches the game.',
  },
  {
    moduleId: 'model.geometry',
    groupId: 'performance',
    defaultOn: false,
    signal: { quality: 'precise', note: SIGNAL.precise },
    whyItMatters:
      'Triangle, texture, joint and animation counts read out of the actual glTF binary. Relevant when you ship 3D assets and irrelevant when you do not, which is why it is off by default rather than absent.',
  },
];

const META_BY_ID = new Map(CHECK_META.map((m) => [m.moduleId, m]));

export function metaFor(moduleId: string): CheckMeta | undefined {
  return META_BY_ID.get(moduleId);
}

export function groupFor(groupId: string): CheckGroup | undefined {
  return GROUPS.find((g) => g.id === groupId);
}

export interface Preset {
  readonly id: string;
  readonly label: string;
  /** What situation this is for, in the words someone would use to describe it. */
  readonly forWhen: string;
  /** Module ids. An empty list means "everything registered". */
  readonly moduleIds: readonly string[];
  /** Set when the preset is deliberately noisy, so nobody is surprised. */
  readonly volumeWarning?: string;
}

/**
 * PRESETS EXIST BECAUSE CHOICE PARALYSIS IS THE REAL RISK OF A WIDE CATALOG.
 *
 * Nobody wants to tick sixty boxes on their first visit. They want "I am
 * launching on Thursday" and one click. The preset is a starting point, not a
 * cage — every selection stays editable afterwards.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'pre-launch',
    label: 'Pre-launch',
    forWhen: 'You are shipping soon and want everything that should block a go-live.',
    moduleIds: [
      'idor-access',
      'hollow-response',
      'schema-columns',
      'redirect-integrity',
      'ai.safety',
      'a11y.wcag',
      'runtime.performance',
      'mobile.readiness',
    ],
  },
  {
    id: 'weekly-watch',
    label: 'Weekly watch',
    forWhen:
      'Ongoing monitoring. Cheap, high-signal checks that catch drift without filling anyone\u2019s queue.',
    moduleIds: ['hollow-response', 'redirect-integrity', 'schema-columns', 'runtime.performance'],
  },
  {
    id: 'ai-product',
    label: 'AI product',
    forWhen: 'Your product exposes a model or an agent to users.',
    moduleIds: ['ai.safety', 'idor-access', 'hollow-response', 'secrets.exposed'],
  },
  {
    id: 'accessibility',
    label: 'Accessibility review',
    forWhen: 'A conformance push, a procurement requirement, or a complaint.',
    moduleIds: ['a11y.wcag', 'mobile.readiness'],
  },
  {
    id: 'deep-audit',
    label: 'Deep audit',
    forWhen: 'Everything available, including the checks that are off by default.',
    moduleIds: [],
    volumeWarning:
      'This runs every registered check, including broad ones. Expect findings you will decide are not relevant to you — that is the trade for coverage, and it is why this is not the default.',
  },
];

/** Resolves a preset to concrete module ids against what is actually registered. */
export function resolvePreset(preset: Preset, registeredIds: readonly string[]): string[] {
  if (preset.moduleIds.length === 0) return [...registeredIds];
  // Intersected with the registry rather than trusted: a preset naming a module
  // that was renamed or removed would otherwise silently select nothing, and the
  // scan would report a clean result for checks that never ran.
  return preset.moduleIds.filter((id) => registeredIds.includes(id));
}

/** Default selection: every check marked defaultOn that is actually registered. */
export function defaultSelection(registeredIds: readonly string[]): string[] {
  return registeredIds.filter((id) => metaFor(id)?.defaultOn ?? true);
}

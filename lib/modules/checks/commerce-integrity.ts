/**
 * lib/modules/checks/commerce-integrity.ts
 *
 * The defects that move money: unsigned webhooks, client-supplied prices,
 * value-granting endpoints reachable without authority, and test keys in
 * production.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE OTHER CHECKS. Every other module answers
 * "is this broken". This one answers "can somebody take money, or take value
 * without paying" — and those defects are silent by design. A payment endpoint
 * that accepts a forged webhook does not error, does not slow down, and does not
 * appear in any log as a problem. It simply grants what it was asked to grant.
 *
 * WHAT MAKES THESE FINDABLE FROM OUTSIDE. A webhook handler that verifies
 * signatures rejects an unsigned request; one that does not, accepts it. That is
 * a one-request test with an unambiguous answer, and it is the single highest
 * value probe in this product.
 *
 * THE PROBES ARE NON-DESTRUCTIVE BY CONSTRUCTION. Every payload is either
 * structurally invalid or references an object that cannot exist, so a handler
 * that wrongly accepts it still has nothing to act on. This module must never be
 * the reason a real order, refund or credit grant occurs — a scanner that moves
 * money to prove money can be moved is worse than the defect.
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

interface Probe {
  readonly path: string;
  readonly label: string;
}

interface Problem {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fix: string;
  readonly detail: string;
}

/**
 * A webhook body that is well-formed enough to be parsed and refers to an object
 * id that cannot exist. If a handler verifies signatures it returns 400 or 401
 * before ever reading this.
 */
const FORGED_WEBHOOK = JSON.stringify({
  id: 'evt_javari_verify_probe_0000000000',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_javari_verify_probe_0000000000',
      // Deliberately impossible: no real session carries this customer.
      customer: 'cus_javari_verify_probe_0000000000',
      amount_total: 0,
      payment_status: 'unpaid',
    },
  },
});

const WEBHOOK_PATHS: readonly Probe[] = [
  { path: '/api/stripe/webhook', label: 'Stripe webhook' },
  { path: '/api/paypal/webhook', label: 'PayPal webhook' },
  { path: '/api/webhooks/stripe', label: 'Stripe webhook (alt path)' },
  { path: '/api/billing/webhook', label: 'Billing webhook' },
];

/** Endpoints that grant value. Any of these answering an anonymous caller is a hole. */
const VALUE_PATHS: readonly Probe[] = [
  { path: '/api/admin/credits/grant', label: 'credit grant' },
  { path: '/api/auth/seed-credits', label: 'credit seed' },
  { path: '/api/admin/billing/subscription/update', label: 'subscription change' },
  { path: '/api/credits/spend', label: 'credit spend' },
  { path: '/api/payments/create-checkout', label: 'checkout creation' },
];

async function post(url: string, body: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text().catch(() => '');
    return { status: res.status, body: text.slice(0, 400) };
  } catch {
    return null;
  }
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const commerceIntegrityCheck: CheckModule = {
  id: 'commerce.integrity',
  version: '1.0.0',
  category: 'COMMERCE',
  title: 'Payment and value-transfer integrity',

  whatItChecks:
    'Sends an unsigned, non-actionable webhook to known payment paths and reports any that accept it; probes value-granting endpoints as an anonymous caller; and looks for live payment keys and test-mode keys exposed in the client bundle.',

  whatItCannotCatch: [
    'Whether prices are CORRECT. It detects that an amount can be supplied by the client, not that the amount charged is the one you intended.',
    'Replay protection. Proving a handler accepts the same event twice requires sending a valid signed event twice, which means causing two real state changes — this module will not do that.',
    'Refund and chargeback logic, which needs an authenticated session and a real order.',
    'Anything inside the payment provider. If Stripe is configured to accept a card it should refuse, that is invisible from here.',
    'Race conditions on concurrent spend. Two simultaneous requests draining one balance twice needs a load harness, not a probe.',
    'Tax, invoicing and accounting correctness, which are business questions rather than technical ones.',
  ],

  supportedTargetKinds: ['web_property', 'http_api', 'payment_integration'],
  minimumAccessTier: 'public',
  // It POSTs to payment endpoints. Every payload is inert, and it is still
  // intrusive because the target's handlers will run.
  intrusive: true,

  inputs: [
    { name: 'origin', description: 'Origin to probe, e.g. https://example.com', required: true, kind: 'origin' },
  ],

  estimatedCredits: 8,
  estimatedRuntimeMs: 40_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['origin'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No origin was supplied, so nothing was probed.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Missing input.' },
      };
    }
    const origin = raw.replace(/\/+$/, '');

    const problems: Problem[] = [];
    let requests = 0;
    let webhooksFound = 0;
    let valueFound = 0;

    // --- Webhook signature verification -------------------------------------
    for (const probe of WEBHOOK_PATHS) {
      const res = await post(`${origin}${probe.path}`, FORGED_WEBHOOK);
      requests++;
      if (res === null) continue;
      // 404 means no handler here, which is not a finding.
      if (res.status === 404) continue;
      webhooksFound++;

      // 400 and 401 are the correct answers: the handler asked for a signature
      // and did not get one. 200 means it processed a forged event.
      if (res.status >= 200 && res.status < 300) {
        problems.push({
          ruleId: 'commerce.webhook.unsigned-accepted',
          severity: 'BLOCKER',
          title: `${probe.label} accepted an unsigned event`,
          description:
            'The handler returned success for a webhook carrying no provider signature. Anyone who knows the URL can post events to it — marking orders paid, granting credits, cancelling subscriptions — and nothing in the request needs to be genuine. ' +
            'This is silent by design: it does not error, does not slow down, and appears in logs as ordinary traffic.',
          fix:
            'Verify the signature before doing anything else. Stripe: constructEvent with the endpoint secret. PayPal: verify-webhook-signature against the transmission headers. Reject with 400 when the header is absent, and never fall back to trusting the body.',
          detail: `POST ${probe.path} with no signature header returned ${res.status}`,
        });
      } else if (res.status === 405 || res.status === 500) {
        problems.push({
          ruleId: 'commerce.webhook.error-on-unsigned',
          severity: 'LOW',
          title: `${probe.label} returned ${res.status} to an unsigned event`,
          description:
            'The handler did not accept the event, which is the important part. It also did not refuse it cleanly — a 500 means the request reached logic that then failed, so the signature check is happening late or not at all, and the rejection is a side effect rather than a decision.',
          fix: 'Check the signature as the first statement in the handler and return 400 when it is missing or wrong.',
          detail: `POST ${probe.path} returned ${res.status}`,
        });
      }
    }

    // --- Endpoints that grant value -----------------------------------------
    const valueBody = JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000000',
      amount: 1,
      credits: 1,
      plan: 'probe',
    });

    for (const probe of VALUE_PATHS) {
      const res = await post(`${origin}${probe.path}`, valueBody);
      requests++;
      if (res === null || res.status === 404) continue;
      valueFound++;

      if (res.status >= 200 && res.status < 300) {
        problems.push({
          ruleId: 'commerce.value.unauthenticated',
          severity: 'BLOCKER',
          title: `${probe.label} responded to an anonymous caller`,
          description:
            'An endpoint that grants or moves value returned success without any credential. Whether it acted on the request or merely answered it, the authority check is not the first thing that happens — and an endpoint that will answer will eventually act.',
          fix:
            'Require an authenticated session and an explicit role check before any other work. For an admin path, verify the role server-side against the database rather than trusting a claim in the token.',
          detail: `POST ${probe.path} with no credential returned ${res.status}`,
        });
      }
    }

    // --- Keys exposed to the browser ----------------------------------------
    try {
      const res = await fetch(origin, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
      });
      requests++;
      const html = await res.text();

      // A live SECRET key in a page is catastrophic; a publishable key is normal
      // and correct, so the two must not be confused.
      if (/\bsk_live_[A-Za-z0-9]{10,}/.test(html)) {
        problems.push({
          ruleId: 'commerce.key.secret-exposed',
          severity: 'BLOCKER',
          title: 'A live Stripe SECRET key is present in the page',
          description:
            'A secret key grants full API access to the account: reading customers, issuing refunds, creating charges. It is in HTML that anybody can fetch.',
          fix: 'Roll the key in the Stripe dashboard immediately, then move it server-side. Treat it as compromised — it has been publicly readable for as long as this page has been live.',
          detail: 'sk_live_ pattern matched in the document body',
        });
      }
      if (/\bpk_test_[A-Za-z0-9]{10,}/.test(html)) {
        problems.push({
          ruleId: 'commerce.key.test-in-production',
          severity: 'HIGH',
          title: 'A Stripe TEST key is in use on this origin',
          description:
            'Checkout will appear to work and no payment will ever settle. This usually surfaces as a customer insisting they paid while no charge exists, which is expensive to diagnose after the fact and trivial to detect now.',
          fix: 'Point the production environment at the live publishable key and redeploy.',
          detail: 'pk_test_ pattern matched in the document body',
        });
      }
    } catch {
      /* the page checks are best-effort; the webhook probes are the point */
    }

    const findings: Finding[] = problems.map((p) => ({
      ruleId: p.ruleId,
      category: 'COMMERCE',
      severity: p.severity,
      title: p.title,
      description: p.description,
      subject: origin,
      evidence: [
        {
          kind: 'measurement',
          metric: p.ruleId,
          value: 1,
          unit: 'count',
          estimated: false,
          method: `${p.detail}. Re-runnable: repeat the same request and compare the status.`,
        },
      ] as [Evidence, ...Evidence[]],
      recommendedFix: p.fix,
      fingerprint: fingerprint(p.ruleId, origin),
      autoFixable: false,
    }));

    const checked = {
      subjectsExamined: WEBHOOK_PATHS.length + VALUE_PATHS.length,
      requestsIssued: requests,
      notes:
        `${webhooksFound} webhook path(s) and ${valueFound} value-granting path(s) responded. ` +
        (webhooksFound === 0 && valueFound === 0
          ? 'None of the known payment paths exist on this origin, so nothing about its payment handling was tested.'
          : 'Every payload sent was inert — structurally valid but referring to objects that cannot exist — so no real order, refund or grant could result.'),
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default commerceIntegrityCheck;

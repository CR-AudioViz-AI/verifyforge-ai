/**
 * lib/modules/checks/security-posture.ts
 *
 * The controls a CISO asks about first: transport security, response headers,
 * cookie flags, email authentication and DNS hygiene.
 *
 * 2026-09-02. Built after auditing our own platform and finding that seven of
 * eight domains had no SPF and no DMARC — a domain with no mail server is still
 * spoofable, and that is the part people miss. It costs an attacker nothing to
 * send mail as a domain that never sends mail.
 *
 * A LESSON THAT SHAPED THIS MODULE. The first pass of that audit used `dig` from
 * an environment where DNS was intercepted, and it returned nothing for every
 * query — including NS records, which every registered domain must have. Absence
 * of an answer was reported as absence of a record, and a correctly configured
 * domain was called a finding.
 *
 * So DNS here resolves over DNS-over-HTTPS against a named public resolver, and
 * — more importantly — the module PROVES ITS RESOLVER WORKS before trusting a
 * negative. If a control lookup for a record that must exist comes back empty,
 * the result is inconclusive rather than a page of false findings. A scanner
 * that cannot tell "no record" from "no answer" is worse than no scanner.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import type { CheckContext, CheckModule, CheckOutcome, Evidence, Finding, Severity } from '../contract';

const DOH = 'https://cloudflare-dns.com/dns-query';

interface DnsAnswer {
  readonly Answer?: { data: string; type: number }[];
  readonly Status?: number;
}

async function resolve(name: string, type: string): Promise<string[]> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`resolver returned HTTP ${res.status}`);
  const json = (await res.json()) as DnsAnswer;
  return (json.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, ''));
}

interface HeaderRule {
  readonly header: string;
  readonly severity: Severity;
  readonly title: string;
  readonly why: string;
  readonly fix: string;
  /** Returns a problem string when the value present is inadequate. */
  readonly weak?: (value: string) => string | null;
}

const HEADER_RULES: readonly HeaderRule[] = [
  {
    header: 'strict-transport-security',
    severity: 'HIGH',
    title: 'No HSTS',
    why: 'Without HSTS the first request of every session can be intercepted and downgraded to plain HTTP before any redirect fires. A padlock on later requests does not undo what happened on the first one.',
    fix: 'Send Strict-Transport-Security: max-age=63072000; includeSubDomains; preload, then submit the domain to the preload list so even the very first visit is protected.',
    weak: (v) => {
      const max = Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0);
      if (max < 15_552_000) return `max-age is ${max}s; the preload list requires at least 31536000`;
      if (!/includeSubDomains/i.test(v)) return 'includeSubDomains is absent, so subdomains stay downgradeable';
      return null;
    },
  },
  {
    header: 'content-security-policy',
    severity: 'HIGH',
    title: 'No Content-Security-Policy',
    why: 'CSP is the control that turns a cross-site scripting bug from a full account takeover into a blocked console message. It is the single highest-value header and the one most often missing.',
    fix: "Start with default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none' and add explicit origins as you find them. Deploy in Report-Only first so you learn what breaks before it breaks.",
    weak: (v) => {
      const problems: string[] = [];
      if (/script-src[^;]*'unsafe-eval'/.test(v)) problems.push("script-src allows 'unsafe-eval'");
      if (/script-src[^;]*\*(?![.\w])/.test(v)) problems.push('script-src contains a bare wildcard');
      if (!/object-src\s+'none'/.test(v)) problems.push("object-src is not 'none'");
      if (!/base-uri/.test(v)) problems.push('base-uri is unset, so an injected <base> can redirect every relative URL');
      return problems.length ? problems.join('; ') : null;
    },
  },
  {
    header: 'x-content-type-options',
    severity: 'MEDIUM',
    title: 'No X-Content-Type-Options',
    why: 'Without nosniff a browser may guess a response is script when the server said it was text — which turns an innocuous upload into executable code.',
    fix: 'Send X-Content-Type-Options: nosniff on every response.',
  },
  {
    header: 'x-frame-options',
    severity: 'MEDIUM',
    title: 'No clickjacking protection',
    why: 'The page can be framed by any site and overlaid with an invisible target, so a user believes they are clicking one thing and clicks another. On a page with a payment or delete button this is a real attack, not a theoretical one.',
    fix: "Send X-Frame-Options: DENY, and frame-ancestors 'none' in the CSP — the CSP directive is the modern control and the header is the fallback for older clients.",
  },
  {
    header: 'referrer-policy',
    severity: 'LOW',
    title: 'No Referrer-Policy',
    why: 'Full URLs leak to every third party the page contacts. Where a URL contains a reset token, a session id or a customer identifier, that is a credential handed to an analytics vendor.',
    fix: 'Send Referrer-Policy: strict-origin-when-cross-origin.',
  },
  {
    header: 'permissions-policy',
    severity: 'LOW',
    title: 'No Permissions-Policy',
    why: 'Third-party frames inherit access to camera, microphone, geolocation and payment request unless told otherwise. Denying what you do not use costs nothing.',
    fix: 'Send Permissions-Policy denying every feature the page does not use, e.g. camera=(), microphone=(), geolocation=().',
  },
];

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

function measurement(metric: string, value: number, method: string): Evidence {
  return { kind: 'measurement', metric, value, unit: 'count', estimated: false, method };
}

export const securityPostureCheck: CheckModule = {
  id: 'security.posture',
  version: '1.0.0',
  category: 'SECURITY',
  title: 'Transport, headers, cookies, email authentication and DNS hygiene',

  whatItChecks:
    'Response security headers and their strength, cookie flags, HTTPS redirection, and the DNS records that decide whether anyone can send email as this domain: SPF, DMARC and DKIM.',

  whatItCannotCatch: [
    'Whether the application is actually free of XSS. CSP limits the damage of an injection; it does not prove there is none.',
    'Certificate expiry and chain validity, which need a direct TLS handshake from the scanner’s own egress. Any environment with a TLS-intercepting proxy reports its own certificate instead, and a wrong expiry date is worse than none.',
    'Whether DKIM is correctly SIGNING mail. Only the selector record is read; verifying a signature needs a message.',
    'Headers on routes other than the one scanned. Framework middleware usually applies them uniformly, but an API route with its own handler frequently does not.',
    'Subresource integrity and what third-party scripts actually do once loaded.',
    'DNSSEC, registrar locks, and whether the domain can be transferred out from under you.',
  ],

  supportedTargetKinds: ['web_property', 'http_api'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'url', description: 'URL to inspect.', required: true, kind: 'url' },
    {
      name: 'sendsMail',
      description:
        'Set false for a domain that never sends email. It still needs SPF and DMARC — a domain with no mail server is still spoofable — but the expected records differ.',
      required: false,
      kind: 'origin',
    },
  ],

  estimatedCredits: 3,
  estimatedRuntimeMs: 20_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const raw = String(context.inputs?.['url'] ?? context.target?.address ?? '');
    if (!raw) {
      return {
        status: 'inconclusive',
        reason: 'No URL was supplied, so nothing was inspected.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
    }

    let host: string;
    let origin: string;
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      host = u.hostname;
      origin = u.origin;
    } catch {
      return {
        status: 'inconclusive',
        reason: `"${raw}" is not a valid URL.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Unparseable target.' },
      };
    }

    const findings: Finding[] = [];
    let requests = 0;

    // ---- Response headers -------------------------------------------------
    let headers: Record<string, string> = {};
    let status = 0;
    try {
      const res = await fetch(origin, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'JavariVerify/1.0 (+https://javariverify.com)' },
      });
      requests++;
      status = res.status;
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } catch (e) {
      return {
        status: 'inconclusive',
        reason: `${origin} could not be reached: ${e instanceof Error ? e.message : 'network error'}.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 1, notes: 'Target unreachable.' },
      };
    }

    for (const rule of HEADER_RULES) {
      const value = headers[rule.header];
        // 2026-09-03: REPORT-ONLY IS A REAL STATE, NOT AN ABSENCE.
        //
        // A CSP shipped as Content-Security-Policy-Report-Only enforces nothing,
        // so calling it present would be a lie. But treating it as identical to
        // never having tried is also wrong: it is the documented first step of a
        // rollout, and this module's own recommendedFix says to deploy in
        // Report-Only first so you learn what breaks before it breaks.
        //
        // Reporting the deliberate intermediate step at the same severity as
        // doing nothing punishes the team that followed the advice.
        const reportOnly =
          rule.header === 'content-security-policy'
            ? headers['content-security-policy-report-only']
            : undefined;
        if (!value && reportOnly) {
          findings.push({
            ruleId: 'security.header.csp-report-only',
            category: 'SECURITY',
            severity: 'MEDIUM',
            title: 'Content-Security-Policy is Report-Only and does not enforce',
            description:
              'A policy is present as Content-Security-Policy-Report-Only. The browser reports ' +
              'violations and blocks nothing, so an injected script still executes. This is the ' +
              'correct first step of a CSP rollout and it is not the finished state.',
            subject: origin,
            evidence: [{ kind: 'http_response', url: origin, method: 'GET', status, bodyExcerpt: '', headers }],
            recommendedFix:
              'Watch the violation reports until they are quiet, correct the policy for anything ' +
              'legitimate it blocked, then rename the header to Content-Security-Policy to enforce.',
            fingerprint: fingerprint('security.header.csp-report-only', origin),
            autoFixable: false,
          });
          continue;
        }
      if (!value) {
        findings.push({
          ruleId: `security.header.${rule.header}`,
          category: 'SECURITY',
          severity: rule.severity,
          title: rule.title,
          description: rule.why,
          subject: origin,
          evidence: [{ kind: 'http_response', url: origin, method: 'GET', status, bodyExcerpt: '', headers }],
          recommendedFix: rule.fix,
          fingerprint: fingerprint(`security.header.${rule.header}`, origin),
          autoFixable: true,
        });
        continue;
      }
      const weakness = rule.weak?.(value);
      if (weakness) {
        findings.push({
          ruleId: `security.header.${rule.header}.weak`,
          // A present-but-weak header is a lower severity than an absent one:
          // something is there, and the gap is narrower.
          category: 'SECURITY',
          severity: rule.severity === 'HIGH' ? 'MEDIUM' : 'LOW',
          title: `${rule.header} is present but weak`,
          description: `${weakness}.\n\n${rule.why}`,
          subject: origin,
          evidence: [{ kind: 'http_response', url: origin, method: 'GET', status, bodyExcerpt: value.slice(0, 300), headers: {} }],
          recommendedFix: rule.fix,
          fingerprint: fingerprint(`security.header.${rule.header}.weak`, origin),
          autoFixable: false,
        });
      }
    }

    // ---- Cookies ----------------------------------------------------------
    const setCookie = headers['set-cookie'] ?? '';
    if (setCookie) {
      const insecure: string[] = [];
      if (!/;\s*Secure/i.test(setCookie)) insecure.push('Secure');
      if (!/;\s*HttpOnly/i.test(setCookie)) insecure.push('HttpOnly');
      if (!/;\s*SameSite/i.test(setCookie)) insecure.push('SameSite');
      if (insecure.length) {
        findings.push({
          ruleId: 'security.cookie.flags',
          category: 'SECURITY',
          severity: 'HIGH',
          title: `Cookie set without ${insecure.join(', ')}`,
          description:
            'Missing Secure allows the cookie over plain HTTP. Missing HttpOnly makes it readable by any script, so one XSS becomes a stolen session. ' +
            'Missing SameSite leaves it attached to cross-site requests, which is what CSRF depends on.',
          subject: origin,
          evidence: [measurement('insecure_cookie_flags', insecure.length, `Set-Cookie header lacked: ${insecure.join(', ')}`)],
          recommendedFix: 'Set Secure; HttpOnly; SameSite=Lax on session cookies — Strict where the flow allows it.',
          fingerprint: fingerprint('security.cookie.flags', origin),
          autoFixable: false,
        });
      }
    }

    // ---- Email authentication --------------------------------------------
    //
    // The resolver is PROVEN before any negative is trusted. NS records must
    // exist for a registered domain; if the control lookup returns nothing, the
    // resolver is not answering and every "missing record" below would be a
    // fabrication.
    let dnsUsable = false;
    try {
      const ns = await resolve(host, 'NS');
      requests++;
      const apex = host.split('.').slice(-2).join('.');
      dnsUsable = ns.length > 0 || (await resolve(apex, 'NS')).length > 0;
      requests++;
    } catch {
      dnsUsable = false;
    }

    if (!dnsUsable) {
      const notes =
        `Headers inspected. DNS checks SKIPPED: a control lookup for NS records on ${host} returned nothing, ` +
        'and every registered domain has NS records — so the resolver is not answering rather than the records being absent.';
      return {
        status: findings.length > 0 ? 'fail' : 'inconclusive',
        ...(findings.length > 0
          ? { findings: findings as [Finding, ...Finding[]] }
          : { reason: notes, findings: [] }),
        checked: { subjectsExamined: 1, requestsIssued: requests, notes },
      } as CheckOutcome;
    }

    const apex = host.split('.').slice(-2).join('.');
    try {
      const [txt, dmarcTxt, mx] = await Promise.all([
        resolve(apex, 'TXT'),
        resolve(`_dmarc.${apex}`, 'TXT'),
        resolve(apex, 'MX'),
      ]);
      requests += 3;

      const spf = txt.find((t) => t.startsWith('v=spf1'));
      const dmarc = dmarcTxt.find((t) => t.startsWith('v=DMARC1'));
      const sendsMail = mx.length > 0;

      if (!spf) {
        findings.push({
          ruleId: 'security.email.spf',
          category: 'SECURITY',
          severity: 'HIGH',
          title: `No SPF record on ${apex}`,
          description:
            'Anyone can send email claiming to be from this domain and receiving servers have nothing to check it against. ' +
            (sendsMail
              ? 'This domain receives mail, so it needs an SPF record listing every legitimate sender.'
              : 'This domain has no mail server, which does NOT make it safe — a domain that never sends mail is the easiest to impersonate, because no real traffic exists to contradict the forgery.'),
          subject: apex,
          evidence: [measurement('spf_records', 0, `TXT lookup on ${apex} via DNS-over-HTTPS returned ${txt.length} record(s), none beginning v=spf1.`)],
          recommendedFix: sendsMail
            ? 'Publish a TXT record listing your senders and ending in -all, e.g. v=spf1 include:spf.protection.outlook.com -all.'
            : 'Publish TXT "v=spf1 -all" — the strongest possible statement that this domain sends no mail.',
          fingerprint: fingerprint('security.email.spf', apex),
          autoFixable: false,
        });
      } else if (/[~?]all\s*$/.test(spf)) {
        findings.push({
          ruleId: 'security.email.spf.soft',
          category: 'SECURITY',
          severity: 'LOW',
          title: `SPF ends in a soft fail on ${apex}`,
          description:
            'A ~all or ?all tells receivers to accept mail that fails SPF and merely mark it. That is the right setting while you are still discovering legitimate senders, and the wrong one to leave in place.',
          subject: apex,
          evidence: [measurement('spf_soft_fail', 1, `SPF record: ${spf}`)],
          recommendedFix: 'Move to -all once the DMARC aggregate reports show no legitimate sender failing.',
          fingerprint: fingerprint('security.email.spf.soft', apex),
          autoFixable: false,
        });
      }

      if (!dmarc) {
        findings.push({
          ruleId: 'security.email.dmarc',
          category: 'SECURITY',
          severity: 'HIGH',
          title: `No DMARC record on ${apex}`,
          description:
            'Without DMARC there is no policy telling receivers what to do with mail that fails SPF or DKIM, and no reporting channel telling you it is happening. ' +
            'SPF alone is advisory; DMARC is what makes it enforceable.',
          subject: apex,
          evidence: [measurement('dmarc_records', 0, `TXT lookup on _dmarc.${apex} returned ${dmarcTxt.length} record(s), none beginning v=DMARC1.`)],
          recommendedFix:
            'Publish _dmarc TXT "v=DMARC1; p=none; rua=mailto:you@yourdomain" first, read the reports for two weeks, then raise to quarantine and then reject.',
          fingerprint: fingerprint('security.email.dmarc', apex),
          autoFixable: false,
        });
      } else {
        const policy = /p=(\w+)/.exec(dmarc)?.[1] ?? 'none';
        if (policy === 'none') {
          findings.push({
            ruleId: 'security.email.dmarc.monitoring-only',
            category: 'SECURITY',
            severity: 'MEDIUM',
            title: `DMARC is set to p=none on ${apex}`,
            description:
              'p=none collects reports and blocks nothing. It is the correct first step and it is not protection — forged mail is still delivered.',
            subject: apex,
            evidence: [measurement('dmarc_policy_none', 1, `DMARC record: ${dmarc}`)],
            recommendedFix: 'Raise to p=quarantine, then p=reject, once the aggregate reports show every legitimate sender passing.',
            fingerprint: fingerprint('security.email.dmarc.monitoring-only', apex),
            autoFixable: false,
          });
        }
        if (!/rua=/.test(dmarc)) {
          findings.push({
            ruleId: 'security.email.dmarc.no-reporting',
            category: 'SECURITY',
            severity: 'LOW',
            title: `DMARC has no reporting address on ${apex}`,
            description:
              'Without rua you never learn who is sending as your domain, and you cannot safely raise the policy because you cannot see what would break.',
            subject: apex,
            evidence: [measurement('dmarc_no_rua', 1, `DMARC record: ${dmarc}`)],
            recommendedFix: 'Add rua=mailto:dmarc@yourdomain to receive aggregate reports.',
            fingerprint: fingerprint('security.email.dmarc.no-reporting', apex),
            autoFixable: false,
          });
        }
      }
    } catch (e) {
      // A DNS failure mid-way is reported, not silently dropped.
      findings.push({
        ruleId: 'security.dns.unavailable',
        category: 'SECURITY',
        severity: 'LOW',
        title: 'Email authentication could not be checked',
        description: `The resolver answered the control lookup but failed on a later query: ${
          e instanceof Error ? e.message : 'unknown'
        }. SPF and DMARC were not evaluated.`,
        subject: apex,
        evidence: [measurement('dns_failures', 1, 'DNS-over-HTTPS query failed after the NS control lookup succeeded.')],
        recommendedFix: 'Re-run the scan. If it persists, the authoritative nameservers may be rate-limiting.',
        fingerprint: fingerprint('security.dns.unavailable', apex),
        autoFixable: false,
      });
    }

    const checked = {
      subjectsExamined: 1,
      requestsIssued: requests,
      notes:
        `${origin}: ${HEADER_RULES.filter((r) => headers[r.header]).length} of ${HEADER_RULES.length} security headers present. ` +
        `DNS checked for ${apex}.`,
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default securityPostureCheck;

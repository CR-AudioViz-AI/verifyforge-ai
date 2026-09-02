/**
 * lib/modules/checks/accessibility.ts
 *
 * WCAG 2.2 checks run against the rendered page in a real browser.
 *
 * 2026-09-02. ACCESSIBILITY was a declared category with no check behind it.
 *
 * WHY IN A BROWSER RATHER THAN AGAINST THE HTML. Almost every meaningful
 * accessibility defect only exists after render. Contrast depends on computed
 * styles, not markup. A tap target's real size comes from the box model. An
 * element hidden by CSS is not in the accessibility tree at all, and flagging it
 * would be a false positive that teaches people to ignore the report.
 *
 * WHAT IS DELIBERATELY NOT HERE. Automated testing catches roughly a third of
 * WCAG failures. Nothing here judges whether alt text is USEFUL, whether reading
 * order makes sense, or whether a flow can be completed with a screen reader —
 * those need a person, and the module says so rather than implying a clean scan
 * means an accessible site. That implication is the most common lie in this
 * category and it has legal consequences for whoever believes it.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import type { CheckContext, CheckModule, CheckOutcome, Evidence, Finding } from '../contract';
import { launch, profileById, type DeviceProfile } from '../../engine/browser';

interface AxeIssue {
  readonly rule: string;
  readonly wcag: string;
  readonly severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly count: number;
  readonly sample: string;
  readonly title: string;
  readonly why: string;
  readonly fix: string;
}

/**
 * Runs in the page. Everything here is computed from the rendered DOM, so a
 * result reflects what a user actually meets rather than what the markup implies.
 */
const AUDIT_SCRIPT = `
(() => {
  const out = [];
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    return (el.tagName.toLowerCase() + id + cls).slice(0, 80);
  };

  // --- Images without an accessible name -----------------------------------
  const imgs = [...document.querySelectorAll('img')].filter(visible).filter((i) => {
    // A decorative image with alt="" and aria-hidden is correct, not a defect.
    if (i.getAttribute('aria-hidden') === 'true') return false;
    if (i.hasAttribute('alt')) return false;
    return !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && i.getAttribute('role') !== 'presentation';
  });
  if (imgs.length) out.push({ rule: 'img-alt', count: imgs.length, sample: imgs.slice(0,3).map(describe).join(', ') });

  // --- Form fields with no label -------------------------------------------
  const fields = [...document.querySelectorAll('input, select, textarea')].filter(visible).filter((f) => {
    const t = (f.getAttribute('type') || '').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset') return false;
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) return false;
    if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return false;
    return !f.closest('label');
  });
  if (fields.length) out.push({ rule: 'form-label', count: fields.length, sample: fields.slice(0,3).map(describe).join(', ') });

  // --- Buttons and links with no accessible name ---------------------------
  const controls = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(visible).filter((b) => {
    const text = (b.textContent || '').trim();
    if (text) return false;
    if (b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.getAttribute('title')) return false;
    // An icon-only control whose <img> has alt text is named.
    const img = b.querySelector('img[alt]:not([alt=""])');
    return !img;
  });
  if (controls.length) out.push({ rule: 'control-name', count: controls.length, sample: controls.slice(0,3).map(describe).join(', ') });

  // --- Heading order --------------------------------------------------------
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  let skips = 0, prev = 0, firstSkip = '';
  for (const h of heads) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) { skips++; if (!firstSkip) firstSkip = 'h' + prev + ' → h' + lvl + ' at "' + (h.textContent||'').trim().slice(0,40) + '"'; }
    prev = lvl;
  }
  if (skips) out.push({ rule: 'heading-order', count: skips, sample: firstSkip });
  const h1s = document.querySelectorAll('h1');
  if (h1s.length === 0 && heads.length > 0) out.push({ rule: 'no-h1', count: 1, sample: 'page has ' + heads.length + ' heading(s), none an h1' });

  // --- Language -------------------------------------------------------------
  const lang = document.documentElement.getAttribute('lang');
  if (!lang || !lang.trim()) out.push({ rule: 'html-lang', count: 1, sample: '<html> has no lang attribute' });

  // --- Tap targets (WCAG 2.2, 2.5.8: 24x24 CSS px minimum) -----------------
  const small = [...document.querySelectorAll('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"]')]
    .filter(visible)
    .filter((el) => {
      const r = el.getBoundingClientRect();
      // Inline links inside a paragraph are exempt under 2.5.8.
      if (el.tagName === 'A' && el.closest('p, li')) return false;
      return r.width < 24 || r.height < 24;
    });
  if (small.length) out.push({ rule: 'target-size', count: small.length, sample: small.slice(0,3).map((e) => describe(e) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).join(', ') });

  // --- Text contrast (WCAG 1.4.3) ------------------------------------------
  const lum = (c) => {
    const m = c.match(/[\\d.]+/g);
    if (!m || m.length < 3) return null;
    const [r,g,b] = m.slice(0,3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
  };
  const textEls = [...document.querySelectorAll('p, span, a, li, h1, h2, h3, h4, h5, h6, button, label, td')]
    .filter(visible)
    .filter((el) => (el.textContent||'').trim().length > 2)
    .slice(0, 400);
  let lowContrast = 0, worst = 99, worstDesc = '';
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const fg = lum(s.color), bg = lum(bgOf(el));
    if (fg === null || bg === null) continue;
    const ratio = (Math.max(fg,bg) + 0.05) / (Math.min(fg,bg) + 0.05);
    const size = parseFloat(s.fontSize) || 16;
    const boldish = (parseInt(s.fontWeight,10) || 400) >= 700;
    // Large text (18.66px bold, or 24px) needs 3:1; everything else 4.5:1.
    const required = (size >= 24 || (size >= 18.66 && boldish)) ? 3 : 4.5;
    if (ratio < required) {
      lowContrast++;
      if (ratio < worst) { worst = ratio; worstDesc = describe(el) + ' ' + ratio.toFixed(2) + ':1 (needs ' + required + ':1)'; }
    }
  }
  if (lowContrast) out.push({ rule: 'contrast', count: lowContrast, sample: worstDesc });

  return out;
})();
`;

const RULES: Readonly<Record<string, Omit<AxeIssue, 'count' | 'sample' | 'rule'>>> = {
  'img-alt': {
    wcag: 'WCAG 2.2 · 1.1.1 Non-text Content (Level A)',
    severity: 'HIGH',
    title: 'Images with no alternative text',
    why: 'A screen reader announces the filename, or nothing. If the image carries meaning, that meaning is simply unavailable — and if it is decorative, alt="" says so explicitly rather than leaving it ambiguous.',
    fix: 'Add alt describing what the image conveys in context. For purely decorative images use alt="" — an empty alt is correct and a missing alt is not.',
  },
  'form-label': {
    wcag: 'WCAG 2.2 · 3.3.2 Labels or Instructions (Level A)',
    severity: 'BLOCKER',
    title: 'Form fields with no label',
    why: 'A screen reader user hears "edit text" with no indication of what to type. Placeholder text does not count: it disappears on focus, exactly when it is needed, and is frequently too low-contrast to read.',
    fix: 'Add a <label for="…"> bound to the field id, or aria-label where a visible label is genuinely inappropriate.',
  },
  'control-name': {
    wcag: 'WCAG 2.2 · 4.1.2 Name, Role, Value (Level A)',
    severity: 'BLOCKER',
    title: 'Buttons or links with no accessible name',
    why: 'An icon-only control with no name is announced as "button" — the user is told something is actionable but not what it does. This is the most common defect in icon-driven interfaces.',
    fix: 'Add aria-label to the control, or alt text to the icon it contains. Visually-hidden text also works and survives icon changes.',
  },
  'heading-order': {
    wcag: 'WCAG 2.2 · 1.3.1 Info and Relationships (Level A)',
    severity: 'MEDIUM',
    title: 'Heading levels skip',
    why: 'Screen reader users navigate by heading. A jump from h2 to h4 implies a level that does not exist, which makes the document outline misleading rather than merely untidy.',
    fix: 'Use heading levels for structure, not size. Style with CSS.',
  },
  'no-h1': {
    wcag: 'WCAG 2.2 · 1.3.1 Info and Relationships (Level A)',
    severity: 'MEDIUM',
    title: 'Page has headings but no h1',
    why: 'The h1 is what a screen reader user jumps to first to learn what the page is. Without one the page opens with no orientation.',
    fix: 'Give every page exactly one h1 describing its purpose.',
  },
  'html-lang': {
    wcag: 'WCAG 2.2 · 3.1.1 Language of Page (Level A)',
    severity: 'MEDIUM',
    title: 'No language declared on <html>',
    why: 'A screen reader guesses the language and may read English with a French voice, or vice versa. It is a one-attribute fix that changes whether the page is comprehensible at all.',
    fix: 'Add lang="en" — or the correct code — to the <html> element.',
  },
  'target-size': {
    wcag: 'WCAG 2.2 · 2.5.8 Target Size Minimum (Level AA)',
    severity: 'MEDIUM',
    title: 'Tap targets below 24×24 CSS pixels',
    why: 'Small targets are hard to hit with a thumb, and disproportionately so for anyone with a tremor or limited dexterity. Measured from the rendered box, not the markup, and inline links inside paragraphs are exempt.',
    fix: 'Give interactive elements at least 24×24 CSS pixels of hit area — padding counts, so the visual size need not change.',
  },
  contrast: {
    wcag: 'WCAG 2.2 · 1.4.3 Contrast Minimum (Level AA)',
    severity: 'HIGH',
    title: 'Text below the minimum contrast ratio',
    why: 'Low-contrast text is unreadable in bright light, on a cheap screen, or with any degree of visual impairment — which is most people at some point. Computed from the rendered colours against the nearest opaque ancestor background.',
    fix: 'Raise contrast to at least 4.5:1 for body text, or 3:1 for text 24px and above (18.66px if bold).',
  },
};

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const accessibilityCheck: CheckModule = {
  id: 'a11y.wcag',
  version: '1.0.0',
  category: 'ACCESSIBILITY',
  title: 'WCAG 2.2 accessibility audit',

  whatItChecks:
    'Renders the page in a real browser at a mobile viewport and audits the computed result against WCAG 2.2 Level A and AA: image alternatives, form labels, control names, heading structure, page language, tap target size and text contrast.',

  whatItCannotCatch: [
    'Roughly two thirds of WCAG. Automated testing reliably catches about a third of accessibility failures — a clean result here is not an accessible site, and treating it as one is the most common and most consequential mistake in this category.',
    'Whether alt text is USEFUL. "image.png" as alt text passes this check and helps nobody.',
    'Reading order, focus order, and whether a keyboard user can complete a flow.',
    'Screen reader behaviour. Only a person using one can tell you whether the page makes sense through it.',
    'Content behind interaction — modals, menus and tabs are only audited in the state the page loads in.',
    'Contrast over background images or gradients, where there is no single computed colour to measure against.',
  ],

  supportedTargetKinds: ['web_property'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    { name: 'url', description: 'Page to audit.', required: true, kind: 'url' },
    { name: 'profile', description: 'Device profile id. Defaults to phone-midrange, where tap-target failures actually matter.', required: false, kind: 'origin' },
  ],

  estimatedCredits: 6,
  estimatedRuntimeMs: 45_000,
  requiresAuthenticatedSession: false,
  requiresBrowser: true,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['url'] ?? context.target?.address ?? '');
    if (!url) {
      return {
        status: 'inconclusive',
        reason: 'No URL was supplied, so no page was audited.',
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Nothing was examined.' },
      };
    }

    const profile: DeviceProfile =
      profileById(String(context.inputs?.['profile'] ?? 'phone-midrange')) ??
      (profileById('phone-midrange') as DeviceProfile);

    let browser;
    try {
      browser = await launch();
    } catch (e) {
      return {
        status: 'inconclusive',
        reason: `The browser runtime could not start: ${
          e instanceof Error ? e.message : 'unknown error'
        }. This is a Verify infrastructure problem, not a defect in the target.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 0, notes: 'Browser launch failed.' },
      };
    }

    const findings: Finding[] = [];
    let issues: { rule: string; count: number; sample: string }[] = [];

    try {
      const ctx = await browser.newContext({
        userAgent: profile.userAgent,
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
      });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
      // Let late content settle. Auditing at load misses anything a framework
      // paints on hydration, which on a modern site is most of the page.
      await page.waitForTimeout(1500);

      issues = (await page.evaluate(AUDIT_SCRIPT)) as typeof issues;
      await ctx.close();
    } catch (e) {
      await browser.close().catch(() => undefined);
      return {
        status: 'inconclusive',
        reason: `The page could not be audited: ${e instanceof Error ? e.message : 'load failed'}.`,
        findings: [],
        checked: { subjectsExamined: 0, requestsIssued: 1, notes: 'Navigation or audit failed.' },
      };
    } finally {
      await browser.close().catch(() => undefined);
    }

    for (const issue of issues) {
      const rule = RULES[issue.rule];
      if (!rule) continue;
      const evidence: Evidence[] = [
        {
          kind: 'measurement',
          metric: `a11y.${issue.rule}`,
          value: issue.count,
          unit: 'count',
          estimated: false,
          method:
            `Computed from the rendered DOM in Chromium at ${profile.width}x${profile.height} ` +
            `(${profile.label}). Examples: ${issue.sample}`,
        },
      ];
      findings.push({
        ruleId: `a11y.${issue.rule}`,
        category: 'ACCESSIBILITY',
        severity: rule.severity,
        title: `${rule.title} — ${issue.count} instance(s)`,
        description: `${rule.wcag}\n\n${rule.why}\n\nExamples: ${issue.sample}`,
        subject: url,
        evidence: evidence as [Evidence, ...Evidence[]],
        recommendedFix: rule.fix,
        fingerprint: fingerprint(`a11y.${issue.rule}`, url),
        autoFixable: false,
      });
    }

    const checked = {
      subjectsExamined: 1,
      requestsIssued: 1,
      notes:
        `Audited at ${profile.label} (${profile.width}x${profile.height}). ` +
        (issues.length === 0
          ? 'No automated WCAG failures detected. Automated testing catches roughly a third of WCAG — this is not an accessibility audit.'
          : issues.map((i) => `${i.rule}: ${i.count}`).join(' · ')),
    };

    if (findings.length === 0) return { status: 'pass', findings: [], checked };
    return { status: 'fail', findings: findings as [Finding, ...Finding[]], checked };
  },
};

export default accessibilityCheck;

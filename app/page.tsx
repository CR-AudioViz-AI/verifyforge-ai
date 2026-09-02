// app/page.tsx — javari-verify
//
// 2026-09-02: REWRITTEN. The previous page sold "AI-powered fact verification —
// verify claims, check sources, and get trust scores in seconds."
//
// That product does not exist here. What exists is a 189-file integrity scanner:
// a crawler, a discovery pass, personas, an execution queue, SARIF export, and four
// checks each written from a defect found live in production. The front door
// described a different product than the one behind it, which is the same class of
// failure the scanner itself is built to catch — a response that reports one thing
// while delivering another.
//
// POSITIONING, from a competitor review on 2026-09-02:
//
// mabl, testRigor, QA.tech, Applitools, Katalon, Shiplight and Checkly all answer
// one question: DOES MY APP DO WHAT I SCRIPTED? They author, run and heal end-to-end
// tests, and they are good at it.
//
// None of them answers the question this scanner was built for: DOES MY APP ONLY
// LOOK LIKE IT WORKS? A route returning HTTP 200 with the 404 page inside it passes
// every E2E suite that asserts on status codes. So does an endpoint answering
// { success: true } over an empty body. So does one user reading another user's
// record, because the test only ever signs in as one user.
//
// Those are not exotic. Every one was found in this platform's own code this month.
//
// Colours reference the brand tokens in app/layout.tsx. No hex literal for a palette
// colour belongs in this file: emerald-500 shipped here as an inline style and passed
// the forbidden-colour check, which only inspected class names.
'use client'

const CHECKS = [
  {
    e: '🕳️',
    t: 'Hollow responses',
    d: 'A page that returns 200 with a header, a footer and nothing between them. An endpoint that answers { success: true } over an empty body. Passes every status-code assertion; fails the customer.',
  },
  {
    e: '🔓',
    t: 'IDOR access',
    d: 'One signed-in user reaching another user\u2019s records. Needs two real identities to detect, which is why most scanners never find it — and why it is the one that leaks customer data.',
  },
  {
    e: '↩️',
    t: 'Redirect integrity',
    d: 'Loops, excessive hops, protocol downgrades and cross-origin hand-offs. Written after a crawl found 22 broken destinations in a site\u2019s own published navigation.',
  },
  {
    e: '🗄️',
    t: 'Schema drift',
    d: 'Queries selecting columns the database does not have. A query asks for is_admin, the table only has role, and the row comes back missing the field instead of erroring.',
  },
]

const HOW = [
  { n: '1', t: 'Discover', d: 'Crawls the target and maps what it actually publishes — not a sitemap you maintain by hand.' },
  { n: '2', t: 'Plan', d: 'Builds a scan from what it found, scoped to the access tier you granted.' },
  { n: '3', t: 'Execute', d: 'Runs each check in an isolated worker. A check that throws is inconclusive with the error stated — never a pass. A check that hangs is aborted and reported as inconclusive.' },
  { n: '4', t: 'Report', d: 'Every finding stamped with the tier it ran at and the evidence behind it. SARIF export for your existing pipeline.' },
]

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--brand-slate-200)', fontFamily: 'system-ui' }}>
      <div style={{ height: 60 }} />

      <section style={{ textAlign: 'center', padding: '64px 24px 24px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 800, margin: '0 0 18px', color: 'var(--brand-cyan-400)', lineHeight: 1.15 }}>
          Your tests pass. Your customers still hit broken pages.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--brand-slate-400)', maxWidth: 600, margin: '0 auto 14px', lineHeight: 1.65 }}>
          Javari Verify scans a live site for the defects that report success and deliver
          nothing — hollow responses, exposed records, broken redirect chains, and queries
          asking for columns that do not exist.
        </p>
        <p style={{ fontSize: 15, color: 'var(--brand-slate-500)', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6 }}>
          A green build is not evidence. Every check here was written from a defect found
          live in production.
        </p>
        <a href="https://craudiovizai.com/auth/signup" style={{ background: 'var(--brand-cyan-500)', color: '#000', borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
          Scan a site free →
        </a>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 8px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 6px' }}>What it looks for</h2>
        <p style={{ fontSize: 14, color: 'var(--brand-slate-500)', margin: '0 0 24px' }}>
          Four checks, each written from a real defect rather than a threat model.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          {CHECKS.map((c) => (
            <div key={c.t} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{c.e}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-slate-200)', marginBottom: 8 }}>{c.t}</div>
              <div style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.6 }}>{c.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 8px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 24px' }}>How a scan runs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {HOW.map((h) => (
            <div key={h.n} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-cyan-400)', marginBottom: 8 }}>STEP {h.n}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-slate-200)', marginBottom: 8 }}>{h.t}</div>
              <div style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.6 }}>{h.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 72px' }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 12px' }}>
            This is not a replacement for your test suite
          </h2>
          <p style={{ fontSize: 15, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: '0 0 12px' }}>
            Playwright, Cypress, mabl and testRigor answer <em>does my app do what I
            scripted</em>. Keep them. They are good at it.
          </p>
          <p style={{ fontSize: 15, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: 0 }}>
            Verify answers a different question — <em>does my app only look like it
            works</em> — against the running site, with no scripts to write and nothing to
            maintain when the UI changes.
          </p>
        </div>
      </section>
    </div>
  )
}

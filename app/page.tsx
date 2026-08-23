// app/page.tsx — javari-verify
// Colours reference the brand tokens declared in app/layout.tsx. No hex literal
// for a palette colour belongs in this file: emerald-500 (#10b981) shipped here
// as an inline style and passed the forbidden-colour check, which only inspected
// class names. See app/layout.tsx for the tokens and their measured contrast.
'use client'
const getFeatures = () => [
  { e: '✅', t: 'AI Verification', d: 'Verify facts, claims, and data with AI-powered accuracy checks' },
  { e: '🔍', t: 'Source Analysis', d: 'Cross-reference multiple sources to validate information' },
  { e: '📊', t: 'Trust Scores', d: 'Every verification gets a confidence score and explanation' },
  { e: '🔗', t: 'Platform', d: 'Connected to all 150+ Javari apps' },
]
export default function Page() {
  const features = getFeatures()
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--brand-slate-200)', fontFamily: 'system-ui' }}>
      <div style={{ height: 60 }} />
      <section style={{ textAlign: 'center', padding: '64px 24px 40px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, margin: '0 0 16px', color: 'var(--brand-cyan-400)' }}>Javari Verify</h1>
        <p style={{ fontSize: 18, color: 'var(--brand-slate-400)', maxWidth: 520, margin: '0 auto 32px', lineHeight: 1.65 }}>AI-powered fact verification — verify claims, check sources, and get trust scores in seconds.</p>
        <a href="https://craudiovizai.com/auth/signup" style={{ background: 'var(--brand-cyan-500)', color: '#000', borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Start Free →</a>
      </section>
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        {features.map(f => (
          <div key={f.t} style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 16px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{f.e}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand-slate-200)', marginBottom: 4 }}>{f.t}</div>
            <div style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.5 }}>{f.d}</div>
          </div>
        ))}
      </section>
      <footer style={{ background: '#050609', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--brand-slate-400)', fontSize: 14, margin: 0 }}>© 2026 CR AudioViz AI, LLC — EIN: 39-3646201 · <a href="https://craudiovizai.com/auth/signup" style={{ color: 'var(--brand-cyan-400)', textDecoration: 'none' }}>Sign Up Free</a></p>
      </footer>
    </div>
  )
}

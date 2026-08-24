// app/layout.tsx — server-rendered brand shell
// CR AudioViz AI · EIN: 39-3646201 · May 2026 · brand tokens added 2026-08-23
import type { Metadata } from 'next'

/**
 * BRAND TOKENS. Declared as named CSS custom properties rather than sprinkled
 * hex literals, for two reasons.
 *
 * First, the palette becomes readable: `var(--brand-cyan-400)` says what it is,
 * `#22d3ee` does not. Second, the Henderson compliance suite checks that an
 * approved brand colour is actually present by looking for the names in the
 * rendered markup. Naming the tokens satisfies that check honestly — the
 * alternative was dropping a stray `#0891b2` somewhere to match a substring,
 * which would pass the test while telling the truth about nothing.
 *
 * Contrast is measured against the near-black page background, not assumed:
 *   cyan-400  #22d3ee on #0a0a0f  = 10.93:1   accent text, headings, links
 *   cyan-500  #06b6d4 w/ black    =  8.65:1   call-to-action backgrounds
 *   slate-200 #e2e8f0 on #0a0a0f  = 16.05:1   body text
 *   slate-400 #94a3b8 on #0a0a0f  =  7.70:1   muted and footer text
 *
 * These replace emerald-500 (#10b981) and the greys #6b7280 / #374151 / #1f2937.
 * Emerald is a forbidden family under the brand standard; it survived because it
 * was written as a hex literal in an inline style, and the forbidden-colour
 * check only inspected class names. The greys were never checked at all and two
 * of them failed WCAG AA outright — #374151 on #0a0a0f measured 1.92:1.
 */
const BRAND_TOKENS = `:root{
  --brand-cyan-400:#22d3ee;
  --brand-cyan-500:#06b6d4;
  --brand-slate-200:#e2e8f0;
  --brand-slate-400:#94a3b8;
}`

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Javari Verify',
  description: 'AI identity verification and document authentication platform.',
  openGraph: { title: 'Javari Verify', description: 'AI identity verification and document authentication platform.', type: 'website' },
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif' }}>
        <style dangerouslySetInnerHTML={{ __html: BRAND_TOKENS }} />
        <div style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', padding: '6px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 200 }}>
          <a href="https://craudiovizai.com" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            <span>✅</span>
            <span style={{ color: 'var(--brand-cyan-400)' }}>Javari Verify</span>
            <span style={{ color: 'var(--brand-slate-400)', fontSize: 14, marginLeft: 4 }}>· CR AudioViz AI · EIN 39-3646201</span>
          </a>
          <a href="https://craudiovizai.com/auth/signup" style={{ background: 'var(--brand-cyan-500)', color: '#000', borderRadius: 6, padding: '4px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Free to Start →
          </a>
        </div>
        {children}
        <footer style={{ background: '#050608', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '16px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--brand-slate-400)', fontSize: 14, margin: 0, fontFamily: 'system-ui' }}>
            © 2026 CR AudioViz AI, LLC — EIN: 39-3646201 · Fort Myers, Florida · Your Story. Our Design. ·{' '}
            <a href="https://craudiovizai.com" style={{ color: 'var(--brand-slate-400)', textDecoration: 'none' }}>craudiovizai.com</a>
            {' '}·{' '}
            <a href="https://craudiovizai.com/auth/signup" style={{ color: 'var(--brand-cyan-400)', textDecoration: 'none', fontWeight: 600 }}>Sign Up Free</a>
          </p>
        </footer>
      </body>
    </html>
  )
}

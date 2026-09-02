// app/metrics/page.tsx — javari-verify
//
// The metric index. Every measurement Verify reports, with its bands, in one
// place.
//
// 2026-09-02. Static and public by design: this is the page a developer lands on
// from a report link at 2am, and it is the part of the product most likely to be
// shared outside it.

import Link from 'next/link';
import { METRICS, bandsText } from '@/lib/metrics/catalog';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Metric reference — what every number means | Javari Verify',
  description:
    'Every measurement Javari Verify reports, with the thresholds that make it meaningful and what to change when it is poor.',
};

export default function MetricsIndex(): React.ReactElement {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--brand-slate-200)', fontFamily: 'system-ui' }}>
      <div style={{ height: 60 }} />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px 80px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, color: 'var(--brand-cyan-400)', margin: '0 0 12px' }}>
          Metric reference
        </h1>
        <p style={{ fontSize: 16, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: '0 0 8px', maxWidth: 620 }}>
          Every number Javari Verify reports, with the thresholds that make it mean something
          and what to change when it is poor.
        </p>
        <p style={{ fontSize: 14, color: 'var(--brand-slate-500)', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 620 }}>
          Where a threshold is our own judgement rather than a published standard, the metric’s
          page says so. You should be able to disagree with our numbers on the record.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          {METRICS.map((m) => (
            <Link
              key={m.id}
              href={`/metrics/${m.id}`}
              style={{
                display: 'block',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                padding: 18,
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--brand-slate-200)', marginBottom: 6 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.6, marginBottom: 8 }}>
                {m.whatItMeans}
              </div>
              <div style={{ fontSize: 12, color: 'var(--brand-slate-500)', fontFamily: 'ui-monospace, monospace' }}>
                {bandsText(m)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

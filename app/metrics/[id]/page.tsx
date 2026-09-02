// app/metrics/[id]/page.tsx — javari-verify
//
// The page every "what does this mean?" link opens.
//
// 2026-09-02. A measurement without a threshold is trivia, and a threshold
// without guidance is a scolding. This page carries all three: what the number
// means, where the good/bad line comes from, and what to change.
//
// It is a SERVER component and a static route. No auth, no credits, no
// JavaScript — someone reading a report at 2am with a failing build should not
// have to sign in to find out what INP is. It is also the part of the product
// most likely to be linked to from outside, which is the cheapest marketing
// this app has.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  METRICS,
  bandsText,
  metric as findMetric,
  RATING_COLOR,
  FIELD_DATA_CAVEAT,
  type MetricDefinition,
} from '@/lib/metrics/catalog';

export const dynamic = 'force-static';

/** Pre-renders every metric page at build time. */
export function generateStaticParams(): { id: string }[] {
  return METRICS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<{ title: string; description: string }> {
  // Next 15: params is a Promise. Reading it synchronously compiles and returns
  // undefined at runtime.
  const { id } = await params;
  const def = findMetric(id);
  if (!def) return { title: 'Metric — Javari Verify', description: 'Metric reference.' };
  return {
    title: `${def.label} — what it means and how to fix it | Javari Verify`,
    description: def.whatItMeans,
  };
}

function Band({ def }: { def: MetricDefinition }): React.ReactElement {
  const fmt = (n: number | undefined): string => {
    if (n === undefined) return '—';
    if (def.unit === 'bytes') {
      return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
    }
    return `${n.toLocaleString()}${def.unit === 'score' || def.unit === 'count' ? '' : ` ${def.unit}`}`;
  };

  const lower = def.direction === 'lower-is-better';
  const rows: { label: string; range: string; color: string }[] = lower
    ? [
        { label: 'Good', range: `${fmt(def.goodAtOrBelow)} or less`, color: RATING_COLOR.good },
        {
          label: 'Needs improvement',
          range: `up to ${fmt(def.needsImprovementAtOrBelow)}`,
          color: RATING_COLOR['needs-improvement'],
        },
        {
          label: 'Poor',
          range: `above ${fmt(def.needsImprovementAtOrBelow)}`,
          color: RATING_COLOR.poor,
        },
      ]
    : [
        { label: 'Good', range: `${fmt(def.goodAtOrAbove)} or more`, color: RATING_COLOR.good },
        {
          label: 'Needs improvement',
          range: `${fmt(def.needsImprovementAtOrAbove)} and above`,
          color: RATING_COLOR['needs-improvement'],
        },
        {
          label: 'Poor',
          range: `below ${fmt(def.needsImprovementAtOrAbove)}`,
          color: RATING_COLOR.poor,
        },
      ];

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `4px solid ${r.color}`,
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <span style={{ color: r.color, fontWeight: 700, fontSize: 14, minWidth: 150 }}>{r.label}</span>
          <span style={{ color: 'var(--brand-slate-300)', fontSize: 14 }}>{r.range}</span>
        </div>
      ))}
    </div>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }): React.ReactElement {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 10px' }}>
        {title}
      </h2>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
        {items.map((t) => (
          <li key={t} style={{ color: 'var(--brand-slate-400)', fontSize: 15, lineHeight: 1.65 }}>
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function MetricPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const def = findMetric(id);
  if (!def) notFound();

  const isCoreWebVital = ['lcp', 'cls', 'inp'].includes(def.id);
  // "Our judgement" appears verbatim in the catalog for thresholds we set
  // ourselves. Surfacing it here rather than only in the source is the point —
  // a reader can weigh the number instead of assuming it is a standard.
  const isOurJudgement = def.source.toLowerCase().includes('our judgement');

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--brand-slate-200)', fontFamily: 'system-ui' }}>
      <div style={{ height: 60 }} />
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' }}>
        <Link href="/metrics" style={{ color: 'var(--brand-cyan-400)', fontSize: 14, textDecoration: 'none' }}>
          ← All metrics
        </Link>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: 'var(--brand-cyan-400)', margin: '16px 0 10px' }}>
          {def.label}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--brand-slate-300)', lineHeight: 1.65, margin: '0 0 8px' }}>
          {def.whatItMeans}
        </p>
        <p style={{ fontSize: 15, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: 0 }}>
          {def.whyItMatters}
        </p>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 4px' }}>
            What counts as good
          </h2>
          <Band def={def} />
          <p style={{ fontSize: 13, color: 'var(--brand-slate-500)', lineHeight: 1.6, marginTop: 12 }}>
            <strong style={{ color: isOurJudgement ? 'var(--brand-amber-400)' : 'var(--brand-slate-400)' }}>
              {isOurJudgement ? 'Our threshold: ' : 'Source: '}
            </strong>
            {def.source}
            {def.referenceUrl ? (
              <>
                {' '}
                <a href={def.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-cyan-400)' }}>
                  Read the reference →
                </a>
              </>
            ) : null}
          </p>
          {isCoreWebVital ? (
            <p
              style={{
                fontSize: 13,
                color: 'var(--brand-slate-500)',
                lineHeight: 1.6,
                marginTop: 10,
                borderLeft: '3px solid var(--brand-slate-600)',
                paddingLeft: 12,
              }}
            >
              {FIELD_DATA_CAVEAT}
            </p>
          ) : null}
        </section>

        <List title="What usually causes a poor result" items={def.commonCauses} />
        <List title="How to fix it" items={def.howToFix} />

        {def.doesNotProve ? (
          <section
            style={{
              marginTop: 28,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: 18,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 8px' }}>
              What a good score here does not prove
            </h2>
            <p style={{ fontSize: 15, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: 0 }}>
              {def.doesNotProve}
            </p>
          </section>
        ) : null}
      </article>
    </div>
  );
}

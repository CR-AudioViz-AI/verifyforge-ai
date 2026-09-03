// app/pricing/page.tsx — Javari Verify
//
// Prices are FETCHED, never written here. The tiers and credit_packs tables are
// what the checkout charges, and a number typed into this file would be a second
// source of truth that agrees with the first right up until somebody changes one.
// The failure mode is a page quoting $9.99 while the card is charged $12, which
// ends in a chargeback rather than a bug report.
//
// The page also states what a scan actually costs and why that varies. A pricing
// page that shows a plan price and hides the consumption model is the reason
// people feel misled by usage billing even when nothing was hidden from them
// deliberately.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Tier {
  id: string;
  name: string;
  price_monthly_usd: number;
  price_annual_usd: number | null;
  monthly_credits: number;
  seat_limit: number;
  signup_bonus: number | null;
}

interface Pack {
  name: string;
  credits: number;
  price_cents: number;
  centsPerCredit: number | null;
}

export default function PricingPage(): React.ReactElement {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/pricing', { cache: 'no-store' });
        const data = (await res.json()) as { tiers?: Tier[]; packs?: Pack[]; error?: string };
        if (cancelled) return;
        if (!res.ok || data.error) {
          setError(data.error ?? 'Prices could not be loaded.');
        } else {
          setTiers(data.tiers ?? []);
          setPacks(data.packs ?? []);
        }
      } catch {
        if (!cancelled) setError('Prices could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 22,
  };

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 80px', color: 'var(--brand-slate-200)' }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, margin: '0 0 10px' }}>Pricing</h1>
      <p style={{ fontSize: 15.5, color: 'var(--brand-slate-400)', maxWidth: 640, lineHeight: 1.7, margin: '0 0 8px' }}>
        A scan costs credits in proportion to the work it does. A single origin with a handful of
        routes costs a few; a site with hundreds of pages and a browser-rendered performance run
        costs more. The estimate is shown before anything is charged, and you approve it.
      </p>
      <p style={{ fontSize: 14, color: 'var(--brand-slate-500)', maxWidth: 640, lineHeight: 1.7, margin: '0 0 32px' }}>
        Credits are only spent on work that completes. A scan that fails is refunded, and a scan
        that finds nothing still costs what it cost to look — because looking properly is the
        thing you are paying for.
      </p>

      {loading ? (
        <p style={{ color: 'var(--brand-slate-500)' }}>Loading prices…</p>
      ) : error !== null ? (
        <div
          role="alert"
          style={{
            ...card,
            borderColor: 'rgba(245,158,11,0.35)',
            color: 'var(--brand-amber-400)',
            maxWidth: 640,
          }}
        >
          {error} Nothing is shown rather than a figure that might be wrong — if you were about to
          buy, please try again shortly or contact us.
        </div>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
            {tiers.map((t) => (
              <div key={t.id} style={card}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: 'var(--brand-cyan-400)' }}>
                  {t.name.toUpperCase()}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, margin: '8px 0 2px' }}>
                  ${t.price_monthly_usd}
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--brand-slate-500)' }}>
                    {t.price_monthly_usd > 0 ? '/mo' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--brand-slate-400)', lineHeight: 1.6, marginTop: 10 }}>
                  {t.monthly_credits > 0 ? (
                    <>
                      {t.monthly_credits.toLocaleString()} credits a month
                      <br />
                    </>
                  ) : t.signup_bonus ? (
                    <>
                      {t.signup_bonus} credits to start, once
                      <br />
                    </>
                  ) : null}
                  {t.seat_limit} {t.seat_limit === 1 ? 'seat' : 'seats'}
                </div>
              </div>
            ))}
          </section>

          <h2 style={{ fontSize: 21, fontWeight: 700, margin: '44px 0 6px' }}>Credit packs</h2>
          <p style={{ fontSize: 14, color: 'var(--brand-slate-500)', maxWidth: 620, lineHeight: 1.65, margin: '0 0 16px' }}>
            One-off, for a month that needs more than the plan allows. Packs price above the plan
            rate — the per-credit cost is shown so you can see that rather than work it out.
          </p>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            {packs.map((p) => (
              <div key={p.name} style={card}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 2px' }}>
                  ${(p.price_cents / 100).toFixed(2)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--brand-slate-400)' }}>
                  {p.credits.toLocaleString()} credits
                </div>
                {p.centsPerCredit !== null ? (
                  <div style={{ fontSize: 12, color: 'var(--brand-slate-500)', marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>
                    {p.centsPerCredit}¢ per credit
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        </>
      )}

      <section style={{ marginTop: 48, ...card, maxWidth: 720 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>What you are actually buying</h2>
        <p style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.75, margin: '0 0 10px' }}>
          Every finding carries evidence you can re-run yourself. Every check states what it cannot
          catch. A scan that finds nothing says so plainly and lists what it did not examine, because
          a clean result is not the same as a system being safe.
        </p>
        <p style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.75, margin: 0 }}>
          Before a scan reports anything, known defects are planted in disposable material and the
          checks have to find them. If they do not, your result is marked unverified rather than
          clean — you will be told when the tool was not working properly, which is not a thing most
          scanners will tell you.
        </p>
      </section>

      <p style={{ marginTop: 32, fontSize: 14 }}>
        <Link href="/scan" style={{ color: 'var(--brand-cyan-400)' }}>
          Run a scan →
        </Link>
        <span style={{ color: 'var(--brand-slate-600)', margin: '0 10px' }}>·</span>
        <Link href="/metrics" style={{ color: 'var(--brand-cyan-400)' }}>
          What every metric means →
        </Link>
      </p>
    </main>
  );
}

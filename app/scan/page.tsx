// app/scan/page.tsx — javari-verify
//
// The scan screen. Point Verify at a URL, watch it run, read the result.
//
// 2026-09-02. Everything before this existed and was unreachable: a crawler, a
// discovery pass, four static checks, a browser lab measuring real Core Web
// Vitals across device profiles, and a metric catalog with thresholds and fixes.
// A customer had no way to run any of it.
//
// THREE THINGS THIS SCREEN REFUSES TO DO:
//
//   It does not show a spinner that gives up. The queue endpoint says plainly
//   that "planning a mid-sized site takes minutes, not seconds", so the UI polls
//   until the run reaches a terminal state and shows elapsed time while it does.
//   A progress bar that completes before the work does is a lie with an
//   animation.
//
//   It does not render a missing measurement as a pass. rate() returns
//   'unrated' for anything absent, and that renders as "Not measured" in grey —
//   never a green tick. A blank shown as good is the easiest lie to ship.
//
//   It does not show a number without its meaning. Every metric carries its
//   colour, its band, and a link to the page explaining what to do about it.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CheckSelector, { type SelectableCheck } from '@/components/CheckSelector';
import {
  METRICS,
  bandsText,
  metric as findMetric,
  rate,
  RATING_COLOR,
  RATING_LABEL,
  type Rating,
} from '@/lib/metrics/catalog';

interface StatusResponse {
  ok: boolean;
  runId: string;
  status: string;
  done: boolean;
  verdict: string | null;
  timing: { queuedAt: string | null; startedAt: string | null; completedAt: string | null; durationMs: number | null };
  attempts: number;
  error: string | null;
  progress: { phase?: string; completed?: number; total?: number } | null;
  target: { address: string; accessTier: string };
  findings?: FindingView[];
  measurements?: Record<string, number | null>;
}

interface FindingView {
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  recommendedFix?: string;
  subject?: string;
  /** Stable identity for a finding — used as the React key so a re-poll does not
   *  remount every card. The contract guarantees it; the interface has to say so. */
  fingerprint?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  BLOCKER: 'var(--brand-rose-400)',
  HIGH: 'var(--brand-rose-400)',
  MEDIUM: 'var(--brand-amber-400)',
  LOW: 'var(--brand-slate-400)',
};

/** A single measured number with its rating, band and reference link. */
function MetricRow({ id, value }: { id: string; value: number | null | undefined }): React.ReactElement | null {
  const def = findMetric(id);
  if (!def) return null;

  const rating: Rating = rate(id, value);
  const color = RATING_COLOR[rating];

  const shown =
    value === null || value === undefined
      ? '—'
      : def.unit === 'bytes'
        ? value >= 1048576
          ? `${(value / 1048576).toFixed(2)} MB`
          : `${(value / 1024).toFixed(0)} KB`
        : `${Math.round(value * 1000) / 1000}${def.unit === 'score' || def.unit === 'count' ? '' : ` ${def.unit}`}`;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: 12,
        alignItems: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-slate-200)' }}>{def.label}</span>
          {/* The info link. Opens the reference page for this metric — what it
              means, where the threshold comes from, and how to fix it. */}
          <Link
            href={`/metrics/${def.id}`}
            target="_blank"
            title={`${bandsText(def)} — ${def.source}`}
            style={{
              fontSize: 11,
              color: 'var(--brand-cyan-400)',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 999,
              padding: '1px 7px',
              lineHeight: 1.6,
            }}
          >
            i
          </Link>
        </div>
        <div style={{ fontSize: 11, color: 'var(--brand-slate-500)', fontFamily: 'ui-monospace, monospace', marginTop: 3 }}>
          {bandsText(def)}
        </div>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
        {shown}
      </span>
      <span style={{ fontSize: 11, color, whiteSpace: 'nowrap', minWidth: 110, textAlign: 'right' }}>
        {RATING_LABEL[rating]}
      </span>
    </div>
  );
}

export default function ScanPage(): React.ReactElement {
  const [url, setUrl] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);
  const [catalog, setCatalog] = useState<SelectableCheck[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // The catalog is fetched from the live registry rather than hardcoded here.
  // A UI listing a check that is not registered would let someone select it, run
  // a scan, and receive a clean result for a check that never executed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/checks', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { checks: SelectableCheck[] };
        if (!cancelled) setCatalog(data.checks ?? []);
      } catch (e) {
        if (!cancelled) {
          // Said out loud rather than silently rendering an empty list, which
          // would look like a product with no checks.
          setCatalogError(
            `The check catalog could not be loaded (${e instanceof Error ? e.message : 'network error'}). ` +
              'A scan started now would run the default set.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Elapsed time, shown throughout. A scan that takes four minutes with a
  // visible clock reads as working; the same scan with a silent spinner reads
  // as broken, and the customer reloads and starts it again.
  useEffect(() => {
    if (!runId || status?.done) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [runId, status?.done]);

  // Polling. Backs off from 2s to 10s so a long scan does not hammer the API,
  // and stops on a terminal state rather than polling a finished run forever.
  useEffect(() => {
    if (!runId || status?.done) return;
    let cancelled = false;
    let delay = 2000;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/scan/status?run_id=${encodeURIComponent(runId)}`, { cache: 'no-store' });
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(data);
        if (data.done) return;
      } catch {
        // A dropped poll is not a failed scan. Keep polling; the run continues
        // server-side regardless of whether this tab can reach it.
      }
      if (!cancelled) {
        delay = Math.min(delay * 1.4, 10_000);
        setTimeout(poll, delay);
      }
    };

    const id = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [runId, status?.done]);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus(null);
    setRunId(null);
    setElapsed(0);

    let normalised = url.trim();
    if (!normalised) {
      setError('Enter a URL to scan.');
      return;
    }
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try {
      // Validate here rather than letting the API reject it — a round trip to be
      // told about a typo is a round trip wasted.
      new URL(normalised);
    } catch {
      setError('That does not look like a valid URL.');
      return;
    }

    if (selectedChecks.length === 0) {
      // The API rejects an empty moduleIds array. Saying so here saves a round
      // trip to be told about a choice the user can see on this screen.
      setError('Select at least one check. A scan with none would return a clean result having tested nothing.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/scan/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The shape the API actually validates: a target object and a profile
        // carrying moduleIds. My first version sent { url, checks } and would
        // have been rejected with 'Missing "target" object' on every scan —
        // caught by reading lib/api/resolve.ts rather than assuming.
        body: JSON.stringify({
          target: { kind: 'web_property', address: normalised, accessTier: 'public' },
          profile: { id: 'custom', moduleIds: selectedChecks, inputs: { url: normalised } },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; runId?: string; error?: string };

      if (res.status === 401) {
        setError('Sign in to run a scan.');
        return;
      }
      if (!res.ok || !data.runId) {
        setError(data.error ?? `The scan could not be queued (HTTP ${res.status}).`);
        return;
      }

      startedAt.current = Date.now();
      setRunId(data.runId);
      setStatus({
        ok: true,
        runId: data.runId,
        status: 'queued',
        done: false,
        verdict: null,
        timing: { queuedAt: null, startedAt: null, completedAt: null, durationMs: null },
        attempts: 0,
        error: null,
        progress: null,
        target: { address: normalised, accessTier: 'public' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scan could not be started.');
    } finally {
      setBusy(false);
    }
  }, [url, selectedChecks]);

  const running = Boolean(runId) && !status?.done;
  const measurements = status?.measurements ?? {};
  const findings = status?.findings ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--brand-slate-200)', fontFamily: 'system-ui' }}>
      <div style={{ height: 60 }} />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-cyan-400)', margin: '0 0 10px' }}>
          Scan a site
        </h1>
        <p style={{ fontSize: 15, color: 'var(--brand-slate-400)', lineHeight: 1.7, margin: '0 0 6px', maxWidth: 600 }}>
          Verify loads the page in a real browser under real device conditions — a throttled
          mid-range phone and a desktop — and reports what it actually did.
        </p>
        <p style={{ fontSize: 13, color: 'var(--brand-slate-500)', lineHeight: 1.65, margin: '0 0 28px', maxWidth: 600 }}>
          Every number links to what it means and how to fix it.{' '}
          <Link href="/metrics" style={{ color: 'var(--brand-cyan-400)' }}>
            See the metric reference →
          </Link>
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && !running) void start();
            }}
            placeholder="example.com"
            disabled={running}
            aria-label="URL to scan"
            style={{
              flex: '1 1 320px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 10,
              padding: '13px 15px',
              color: 'var(--brand-slate-200)',
              fontSize: 15,
            }}
          />
          <button
            onClick={() => void start()}
            disabled={busy || running}
            style={{
              background: running ? 'rgba(255,255,255,0.08)' : 'var(--brand-cyan-500)',
              color: running ? 'var(--brand-slate-400)' : '#000',
              border: 'none',
              borderRadius: 10,
              padding: '13px 26px',
              fontSize: 15,
              fontWeight: 700,
              cursor: running || busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Starting…' : running ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              background: 'rgba(244,63,94,0.08)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 14,
              color: 'var(--brand-rose-400)',
              marginTop: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        {catalogError ? (
          <div
            role="alert"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--brand-amber-400)',
              marginTop: 12,
              lineHeight: 1.6,
            }}
          >
            {catalogError}
          </div>
        ) : null}

        {catalog.length > 0 && !running ? (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 6px' }}>
              What to check
            </h2>
            <p
              style={{
                fontSize: 13.5,
                color: 'var(--brand-slate-400)',
                margin: '0 0 20px',
                maxWidth: 620,
                lineHeight: 1.65,
              }}
            >
              Every check says what it finds, how often it is wrong, and what it cannot catch. The
              defaults are our opinion about what most people should run — you have more context
              about your own risk than we do, so all of it stays one click away.
            </p>
            <CheckSelector checks={catalog} onChange={setSelectedChecks} />
          </section>
        ) : null}

        {status ? (
          <div
            style={{
              marginTop: 24,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--brand-slate-500)' }}>{status.target.address}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--brand-slate-200)', marginTop: 4 }}>
                  {status.done
                    ? status.verdict === 'pass'
                      ? 'No issues found'
                      : status.status === 'failed'
                        ? 'Scan failed'
                        : `${findings.length} issue${findings.length === 1 ? '' : 's'} found`
                    : `${status.progress?.phase ?? status.status}…`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--brand-slate-500)' }}>elapsed</div>
                <div style={{ fontSize: 17, fontFamily: 'ui-monospace, monospace', color: 'var(--brand-slate-300)' }}>
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </div>
              </div>
            </div>

            {running ? (
              <p style={{ fontSize: 13, color: 'var(--brand-slate-500)', lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
                Discovery and execution run in the background. A mid-sized site takes minutes,
                not seconds — you can close this tab and come back to it.
              </p>
            ) : null}

            {status.error ? (
              <p style={{ fontSize: 14, color: 'var(--brand-rose-400)', lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
                {status.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {status?.done && Object.keys(measurements).length > 0 ? (
          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 12px' }}>
              Measurements
            </h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {METRICS.filter((m) => m.id in measurements).map((m) => (
                <MetricRow key={m.id} id={m.id} value={measurements[m.id]} />
              ))}
            </div>
          </section>
        ) : null}

        {status?.done && findings.length > 0 ? (
          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--brand-slate-200)', margin: '0 0 12px' }}>
              Findings
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {findings.map((f) => (
                <div
                  key={f.fingerprint ?? `${f.ruleId}-${f.title}`}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderLeft: `4px solid ${SEVERITY_COLOR[f.severity] ?? 'var(--brand-slate-500)'}`,
                    borderRadius: 10,
                    padding: 18,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: SEVERITY_COLOR[f.severity] ?? 'var(--brand-slate-500)',
                        letterSpacing: 0.5,
                      }}
                    >
                      {f.severity}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--brand-slate-500)', fontFamily: 'ui-monospace, monospace' }}>
                      {f.ruleId}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-slate-200)', marginBottom: 8 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--brand-slate-400)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                    {f.description}
                  </div>
                  {f.recommendedFix ? (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 14,
                        color: 'var(--brand-slate-300)',
                        lineHeight: 1.65,
                      }}
                    >
                      <strong style={{ color: 'var(--brand-emerald-400)' }}>How to fix: </strong>
                      {f.recommendedFix}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {status?.done && status.verdict === 'pass' && findings.length === 0 ? (
          <div
            style={{
              marginTop: 24,
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: 10,
              padding: 18,
              fontSize: 14,
              color: 'var(--brand-slate-300)',
              lineHeight: 1.7,
            }}
          >
            Nothing failed the checks that ran. That is not the same as nothing being wrong —
            each check states what it cannot catch, and a clean scan means those specific
            defects were not found under these specific conditions.
          </div>
        ) : null}
      </div>
    </div>
  );
}

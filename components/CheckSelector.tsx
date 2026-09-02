// components/CheckSelector.tsx — javari-verify
//
// The selection surface. Presets, grouped checks, and an info panel behind every
// one carrying the evidence for why it matters.
//
// 2026-09-02. THE PRINCIPLE: inform, do not decide.
//
// A CISO is managing twenty other things. They should see what a check finds,
// how noisy it is, and why it matters — and then choose. Hiding a capability
// because we judged it too noisy makes the decision for someone with far more
// context about their own risk than we have.
//
// WHY EVERY CHECK SHOWS ITS SIGNAL QUALITY. No competitor publishes how often
// their own checks are wrong. Saying "this one is broad, expect to dismiss some"
// costs a little credibility on that row and buys it back across the whole
// product — because the checks marked `precise` are then believed.
//
// WHY THE OFF SWITCH IS ALWAYS VISIBLE. The 2026 research is unanimous that
// alert volume is the problem: 216 million findings across 250 organisations,
// 0.092% critical after exploitability analysis. The answer is not to hide
// capability, it is to make declining it a single obvious click.

'use client';

import { useMemo, useState } from 'react';
import {
  GROUPS,
  PRESETS,
  CHECK_META,
  SIGNAL,
  metaFor,
  resolvePreset,
  defaultSelection,
  type SignalQuality,
} from '@/lib/modules/catalog-meta';

export interface SelectableCheck {
  readonly id: string;
  readonly title: string;
  readonly whatItChecks: string;
  readonly whatItCannotCatch: readonly string[];
  readonly estimatedCredits: number;
  readonly estimatedRuntimeMs: number;
  readonly intrusive: boolean;
  readonly requiresBrowser: boolean;
}

const SIGNAL_COLOR: Record<SignalQuality, string> = {
  precise: 'var(--brand-emerald-400)',
  high: 'var(--brand-cyan-400)',
  broad: 'var(--brand-amber-400)',
};

const SIGNAL_LABEL: Record<SignalQuality, string> = {
  precise: 'Precise',
  high: 'Measured',
  broad: 'Broad',
};

export function CheckSelector({
  checks,
  onChange,
}: {
  checks: readonly SelectableCheck[];
  onChange?: (selected: string[]) => void;
}): React.ReactElement {
  const ids = useMemo(() => checks.map((c) => c.id), [checks]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelection(ids)));
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const apply = (next: Set<string>, preset: string | null): void => {
    setSelected(next);
    setActivePreset(preset);
    onChange?.([...next]);
  };

  const toggle = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Any manual change clears the preset label. Showing "Pre-launch" over a
    // selection the user has since edited would be a quiet lie about what is
    // about to run.
    apply(next, null);
  };

  const usePreset = (presetId: string): void => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    apply(new Set(resolvePreset(preset, ids)), presetId);
  };

  const byGroup = useMemo(() => {
    const map = new Map<string, SelectableCheck[]>();
    for (const c of checks) {
      const g = metaFor(c.id)?.groupId ?? 'other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)?.push(c);
    }
    return map;
  }, [checks]);

  const chosen = checks.filter((c) => selected.has(c.id));
  const credits = chosen.reduce((s, c) => s + c.estimatedCredits, 0);
  // Runtime is summed, not maxed: checks run sequentially so a browser check
  // does not contend with another for the same throttled CPU.
  const runtimeMin = Math.ceil(chosen.reduce((s, c) => s + c.estimatedRuntimeMs, 0) / 60000);
  const intrusiveCount = chosen.filter((c) => c.intrusive).length;
  const activePresetObj = PRESETS.find((p) => p.id === activePreset);

  return (
    <div style={{ color: 'var(--brand-slate-200)' }}>
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Start from a preset</h2>
        <p style={{ fontSize: 13, color: 'var(--brand-slate-500)', margin: '0 0 12px', maxWidth: 560, lineHeight: 1.6 }}>
          A starting point, not a cage — everything stays editable underneath.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => usePreset(p.id)}
              title={p.forWhen}
              style={{
                background: activePreset === p.id ? 'var(--brand-cyan-500)' : 'rgba(255,255,255,0.04)',
                color: activePreset === p.id ? '#000' : 'var(--brand-slate-300)',
                border: `1px solid ${activePreset === p.id ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 999,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {activePresetObj ? (
          <p style={{ fontSize: 13, color: 'var(--brand-slate-400)', marginTop: 10, lineHeight: 1.6 }}>
            {activePresetObj.forWhen}
          </p>
        ) : null}
        {activePresetObj?.volumeWarning ? (
          <p
            style={{
              fontSize: 13,
              color: 'var(--brand-amber-400)',
              marginTop: 8,
              lineHeight: 1.6,
              borderLeft: '3px solid var(--brand-amber-400)',
              paddingLeft: 12,
              maxWidth: 620,
            }}
          >
            {activePresetObj.volumeWarning}
          </p>
        ) : null}
      </section>

      {GROUPS.slice()
        .sort((a, b) => a.rank - b.rank)
        .map((group) => {
          const groupChecks = byGroup.get(group.id) ?? [];
          if (groupChecks.length === 0) return null;
          const allOn = groupChecks.every((c) => selected.has(c.id));

          return (
            <section key={group.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>{group.label}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--brand-slate-500)', margin: 0, lineHeight: 1.55, maxWidth: 620 }}>
                    {group.purpose}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const next = new Set(selected);
                    for (const c of groupChecks) {
                      if (allOn) next.delete(c.id);
                      else next.add(c.id);
                    }
                    apply(next, null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-cyan-400)',
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {allOn ? 'none' : 'all'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {groupChecks.map((check) => {
                  const meta = metaFor(check.id);
                  const on = selected.has(check.id);
                  const quality = meta?.signal.quality ?? 'high';
                  const infoOpen = openInfo === check.id;

                  return (
                    <div
                      key={check.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${on ? 'rgba(0,180,216,0.28)' : 'rgba(255,255,255,0.07)'}`,
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(check.id)}
                          id={`chk-${check.id}`}
                          style={{ marginTop: 3, width: 17, height: 17, accentColor: 'var(--brand-cyan-500)', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label htmlFor={`chk-${check.id}`} style={{ fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
                              {check.title}
                            </label>
                            <span
                              title={meta?.signal.note ?? SIGNAL[quality]}
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: SIGNAL_COLOR[quality],
                                border: `1px solid ${SIGNAL_COLOR[quality]}`,
                                borderRadius: 999,
                                padding: '1px 7px',
                                letterSpacing: 0.3,
                              }}
                            >
                              {SIGNAL_LABEL[quality]}
                            </span>
                            {check.intrusive ? (
                              <span
                                title="Sends real requests that cost the target money or change state. Anything that costs the target money is intrusive whatever its intent."
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: 'var(--brand-amber-400)',
                                  border: '1px solid var(--brand-amber-400)',
                                  borderRadius: 999,
                                  padding: '1px 7px',
                                }}
                              >
                                INTRUSIVE
                              </span>
                            ) : null}
                            <button
                              onClick={() => setOpenInfo(infoOpen ? null : check.id)}
                              aria-expanded={infoOpen}
                              aria-label={`Why ${check.title} matters`}
                              style={{
                                background: 'none',
                                border: '1px solid rgba(255,255,255,0.16)',
                                borderRadius: 999,
                                color: 'var(--brand-cyan-400)',
                                fontSize: 11,
                                width: 20,
                                height: 20,
                                cursor: 'pointer',
                                lineHeight: 1,
                                padding: 0,
                              }}
                            >
                              i
                            </button>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--brand-slate-400)', margin: '6px 0 0', lineHeight: 1.6 }}>
                            {check.whatItChecks}
                          </p>
                          <p style={{ fontSize: 11.5, color: 'var(--brand-slate-500)', margin: '6px 0 0', fontFamily: 'ui-monospace, monospace' }}>
                            ~{check.estimatedCredits} credits · ~{Math.max(1, Math.round(check.estimatedRuntimeMs / 1000))}s
                            {check.requiresBrowser ? ' · real browser' : ''}
                          </p>
                        </div>
                      </div>

                      {infoOpen ? (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'grid',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-slate-300)', marginBottom: 4 }}>
                              WHY IT MATTERS
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--brand-slate-400)', margin: 0, lineHeight: 1.65 }}>
                              {meta?.whyItMatters}
                            </p>
                          </div>

                          {meta?.evidence ? (
                            <div>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-slate-300)', marginBottom: 4 }}>
                                EVIDENCE
                              </div>
                              <p style={{ fontSize: 12.5, color: 'var(--brand-slate-500)', margin: 0, lineHeight: 1.65 }}>
                                {meta.evidence}
                              </p>
                            </div>
                          ) : null}

                          <div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: SIGNAL_COLOR[quality], marginBottom: 4 }}>
                              SIGNAL QUALITY — {SIGNAL_LABEL[quality].toUpperCase()}
                            </div>
                            <p style={{ fontSize: 12.5, color: 'var(--brand-slate-500)', margin: 0, lineHeight: 1.65 }}>
                              {meta?.signal.note ?? SIGNAL[quality]}
                            </p>
                          </div>

                          {/* The section that makes the rest believable. A check
                              that will not say what it misses is asking to be
                              taken on faith. */}
                          <div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-slate-300)', marginBottom: 4 }}>
                              WHAT THIS CHECK CANNOT CATCH
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                              {check.whatItCannotCatch.map((b) => (
                                <li key={b} style={{ fontSize: 12.5, color: 'var(--brand-slate-500)', lineHeight: 1.6 }}>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'rgba(10,10,15,0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '14px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--brand-slate-400)' }}>
          <strong style={{ color: 'var(--brand-slate-200)' }}>
            {chosen.length} of {checks.length}
          </strong>{' '}
          selected · ~{credits} credits · ~{runtimeMin} min
          {intrusiveCount > 0 ? (
            <span style={{ color: 'var(--brand-amber-400)' }}> · {intrusiveCount} intrusive</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => apply(new Set(defaultSelection(ids)), null)}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8,
              color: 'var(--brand-slate-400)',
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>

      {chosen.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--brand-amber-400)', marginTop: 12, lineHeight: 1.6 }}>
          Nothing is selected, so a scan would return a clean result having tested nothing. Pick at
          least one check.
        </p>
      ) : null}
    </div>
  );
}

export default CheckSelector;

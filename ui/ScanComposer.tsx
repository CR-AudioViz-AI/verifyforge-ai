import { useState, useMemo } from "react";

/**
 * Javari Verify — scan composition.
 *
 * Design thesis: this is a measuring instrument, not a security dashboard. The
 * subject's world is the laboratory bench — calibration, honest readings, stated
 * tolerances. The signature element is the live coverage ledger on the right: as
 * you toggle checks and change access, it shows in real time exactly what WILL
 * and WON'T be tested and what it costs. The product's whole claim is that it
 * tells you what it cannot see, so the interface makes that visible before you
 * ever run a scan, not buried in a report afterward.
 *
 * Palette: deep ink ground, warm paper panels, a single signal amber for the
 * live reading, restrained slate for structure. No terracotta-on-cream default.
 * Type: Fraunces for the instrument face (characterful, used sparingly),
 * IBM Plex Mono for readings and labels because this is a gauge, Inter for body.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

type AccessTier = "public" | "authenticated" | "privileged" | "source" | "internal";

interface Check {
  id: string;
  title: string;
  category: string;
  credits: number;
  minTier: AccessTier;
  intrusive: boolean;
  whatItChecks: string;
  cannotCatch: string[];
}

const TIER_ORDER: AccessTier[] = ["public", "authenticated", "privileged", "source", "internal"];
const tierRank = (t: AccessTier) => TIER_ORDER.indexOf(t);

const TIER_LABEL: Record<AccessTier, string> = {
  public: "Public",
  authenticated: "Signed in",
  privileged: "Admin",
  source: "Source",
  internal: "Full access",
};

const TIER_BLIND: Record<AccessTier, string[]> = {
  public: [
    "Nothing behind a login is examined.",
    "Authorization gaps between roles can't be seen without accounts.",
    "Database and server logs are not inspected.",
  ],
  authenticated: [
    "Admin-only privilege paths aren't tested.",
    "Database and server logs are not inspected.",
  ],
  privileged: ["Source code is not read.", "Database state isn't inspected directly."],
  source: ["Live database state isn't inspected; findings reflect code."],
  internal: [],
};

const CHECKS: Check[] = [
  {
    id: "hollow-response",
    title: "Success over an empty body",
    category: "WEB",
    credits: 4,
    minTier: "public",
    intrusive: false,
    whatItChecks:
      "Routes that return 200 with no real content, and endpoints that report success over an empty payload.",
    cannotCatch: [
      "Content that only appears after JavaScript runs.",
      "Pages full of the wrong content — this measures presence, not correctness.",
    ],
  },
  {
    id: "redirect-integrity",
    title: "Broken redirect chains",
    category: "WEB",
    credits: 3,
    minTier: "public",
    intrusive: false,
    whatItChecks:
      "Redirect loops, chains that never resolve, and HTTPS-to-HTTP downgrades. Uptime monitors miss these.",
    cannotCatch: [
      "Redirects performed in JavaScript after load.",
      "Whether the final page is the correct one.",
    ],
  },
  {
    id: "idor-access",
    title: "Cross-user data access",
    category: "SECURITY",
    credits: 12,
    minTier: "authenticated",
    intrusive: true,
    whatItChecks:
      "Whether one signed-in user can read another user's records. Needs two accounts and confirms a 200 actually carries the wrong data.",
    cannotCatch: [
      "IDOR reachable only through writes — this reads, it doesn't modify.",
      "Objects never exposed to the second user.",
    ],
  },
];

const CATEGORY_TINT: Record<string, string> = {
  WEB: "var(--slate)",
  SECURITY: "var(--amber)",
  API: "var(--teal)",
};

export default function ScanComposer() {
  const [address, setAddress] = useState("https://");
  const [tier, setTier] = useState<AccessTier>("public");
  const [owned, setOwned] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["hollow-response", "redirect-integrity"])
  );

  const runnability = useMemo(() => {
    return CHECKS.map((check) => {
      const tierOK = tierRank(tier) >= tierRank(check.minTier);
      const authOK = !check.intrusive || owned;
      const reasonParts: string[] = [];
      if (!tierOK) reasonParts.push(`needs ${TIER_LABEL[check.minTier]} access`);
      if (!authOK) reasonParts.push("needs recorded authorization to probe");
      return { check, runnable: tierOK && authOK, reason: reasonParts.join(" · ") };
    });
  }, [tier, owned]);

  const active = runnability.filter((r) => selected.has(r.check.id));
  const willRun = active.filter((r) => r.runnable);
  const blocked = active.filter((r) => !r.runnable);
  const credits = willRun.reduce((sum, r) => sum + r.check.credits, 0);
  const price = (credits * 0.01).toFixed(2);

  const coverageGaps = useMemo(() => {
    const gaps = new Set<string>(TIER_BLIND[tier]);
    for (const r of willRun) r.check.cannotCatch.forEach((c) => gaps.add(c));
    return [...gaps];
  }, [tier, willRun]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const hasTarget = address.length > "https://".length;

  return (
    <div className="jv">
      <style>{css}</style>

      <header className="masthead">
        <div className="mark">
          <span className="mark-glyph" aria-hidden>◇</span>
          <span className="mark-name">Javari Verify</span>
        </div>
        <p className="tagline">Measures what your site actually does. States what it can't see.</p>
      </header>

      <main className="bench">
        {/* LEFT — compose the scan */}
        <section className="compose" aria-label="Compose scan">
          <div className="field">
            <label htmlFor="target" className="field-label">Target</label>
            <input
              id="target"
              className="target-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              placeholder="https://your-site.com"
            />
          </div>

          <div className="field">
            <span className="field-label">Access we're given</span>
            <div className="tiers" role="radiogroup" aria-label="Access tier">
              {TIER_ORDER.map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={tier === t}
                  className={`tier ${tier === t ? "tier-on" : ""}`}
                  onClick={() => setTier(t)}
                >
                  {TIER_LABEL[t]}
                </button>
              ))}
            </div>
            <label className="owned">
              <input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} />
              <span>I own this target or have written authorization to test it</span>
            </label>
          </div>

          <div className="field">
            <span className="field-label">Checks — pick exactly what you need</span>
            <ul className="checks">
              {runnability.map(({ check, runnable, reason }) => {
                const on = selected.has(check.id);
                return (
                  <li key={check.id} className={`check ${on ? "check-on" : ""} ${runnable ? "" : "check-blocked"}`}>
                    <button
                      className="check-toggle"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(check.id)}
                    >
                      <span className="switch" aria-hidden />
                      <span className="check-body">
                        <span className="check-head">
                          <span className="check-title">{check.title}</span>
                          <span className="check-cat" style={{ ["--tint" as string]: CATEGORY_TINT[check.category] ?? "var(--slate)" }}>
                            {check.category}
                          </span>
                          {check.intrusive && <span className="check-intrusive" title="Probes for exploitable behaviour">probe</span>}
                        </span>
                        <span className="check-desc">{check.whatItChecks}</span>
                        {on && (
                          <span className="check-blind">
                            <span className="blind-label">Won't catch</span>
                            {check.cannotCatch.map((c, i) => (
                              <span key={i} className="blind-item">{c}</span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="check-price">{check.credits}</span>
                    </button>
                    {on && !runnable && (
                      <p className="check-reason">Selected, but won't run — {reason}. It stays in your report as not-covered.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* RIGHT — the live coverage ledger. This is the signature. */}
        <aside className="ledger" aria-label="Live coverage reading">
          <div className="reading">
            <span className="reading-label">This scan will cost</span>
            <span className="reading-value">
              {credits}
              <span className="reading-unit">credits</span>
            </span>
            <span className="reading-sub">${price} · {willRun.length} {willRun.length === 1 ? "check" : "checks"} at {TIER_LABEL[tier]} access</span>
          </div>

          <div className="gauge">
            <div className="gauge-track">
              <div className="gauge-fill" style={{ width: `${Math.min(100, (willRun.length / CHECKS.length) * 100)}%` }} />
            </div>
            <div className="gauge-ends">
              <span>{willRun.length} running</span>
              <span>{CHECKS.length - willRun.length} not</span>
            </div>
          </div>

          {blocked.length > 0 && (
            <div className="ledger-block">
              <h3 className="ledger-title ledger-title-warn">Selected but can't run</h3>
              <ul className="ledger-list">
                {blocked.map((r) => (
                  <li key={r.check.id}>
                    <span className="li-name">{r.check.title}</span>
                    <span className="li-why">{r.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="ledger-note">Nothing is silently skipped. These appear in the report as not-covered — never as a pass.</p>
            </div>
          )}

          <div className="ledger-block">
            <h3 className="ledger-title">What this scan can't tell you</h3>
            <ul className="ledger-list gaps">
              {coverageGaps.map((g, i) => (
                <li key={i}><span className="li-why">{g}</span></li>
              ))}
            </ul>
            <p className="ledger-note">Every limit here rides on the report too. A clean result means clean within these limits — nothing more.</p>
          </div>

          <button className="run" disabled={!hasTarget || willRun.length === 0}>
            {!hasTarget ? "Enter a target" : willRun.length === 0 ? "Select a check that can run" : `Price this scan — ${credits} credits`}
          </button>
          <p className="run-fine">You'll see the discovered surface and the final number before anything is charged.</p>
        </aside>
      </main>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');

.jv {
  --ink: #12140f;
  --ink-2: #1b1e17;
  --paper: #f3f0e7;
  --paper-2: #e7e2d4;
  --slate: #5c6b73;
  --teal: #2f6f6a;
  --amber: #c8862a;
  --amber-lo: #e9c78a;
  --line: rgba(243,240,231,0.10);
  --line-strong: rgba(243,240,231,0.20);
  --text: #e7e4da;
  --text-dim: #9a9c92;
  min-height: 100vh;
  background: var(--ink);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
  padding: clamp(16px, 4vw, 48px);
}
.jv * { box-sizing: border-box; }

.masthead { max-width: 1180px; margin: 0 auto 28px; }
.mark { display: flex; align-items: baseline; gap: 10px; }
.mark-glyph { color: var(--amber); font-size: 20px; }
.mark-name { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
.tagline { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--text-dim); margin: 6px 0 0; letter-spacing: 0.01em; }

.bench {
  max-width: 1180px; margin: 0 auto;
  display: grid; grid-template-columns: 1fr 380px; gap: 24px;
  align-items: start;
}
@media (max-width: 900px) { .bench { grid-template-columns: 1fr; } }

.compose {
  background: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: clamp(18px, 3vw, 30px);
}
.field { margin-bottom: 28px; }
.field:last-child { margin-bottom: 0; }
.field-label {
  display: block; font-family: 'IBM Plex Mono', monospace;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--text-dim); margin-bottom: 12px;
}

.target-input {
  width: 100%; background: var(--ink); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: 3px;
  padding: 14px 16px; font-family: 'IBM Plex Mono', monospace; font-size: 15px;
  outline: none; transition: border-color 0.15s;
}
.target-input:focus { border-color: var(--amber); }

.tiers { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.tier {
  background: transparent; color: var(--text-dim);
  border: 1px solid var(--line-strong); border-radius: 2px;
  padding: 8px 13px; font-family: 'IBM Plex Mono', monospace; font-size: 12px;
  cursor: pointer; transition: all 0.14s;
}
.tier:hover { color: var(--text); border-color: var(--slate); }
.tier-on { background: var(--paper); color: var(--ink); border-color: var(--paper); font-weight: 500; }

.owned { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--text-dim); cursor: pointer; line-height: 1.4; }
.owned input { margin-top: 2px; accent-color: var(--amber); }

.checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.check { border: 1px solid var(--line-strong); border-radius: 3px; overflow: hidden; transition: border-color 0.15s; }
.check-on { border-color: var(--slate); }
.check-blocked { opacity: 0.66; }
.check-toggle {
  width: 100%; display: flex; align-items: flex-start; gap: 14px;
  background: transparent; border: none; text-align: left; cursor: pointer;
  padding: 15px 16px; color: inherit;
}
.switch {
  flex-shrink: 0; width: 34px; height: 20px; margin-top: 2px;
  background: var(--ink); border: 1px solid var(--line-strong); border-radius: 11px;
  position: relative; transition: all 0.16s;
}
.switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%; background: var(--text-dim);
  transition: all 0.16s;
}
.check-on .switch { background: var(--amber); border-color: var(--amber); }
.check-on .switch::after { left: 16px; background: var(--ink); }

.check-body { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.check-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.check-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.check-cat {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.1em;
  color: var(--tint); border: 1px solid var(--tint); border-radius: 2px; padding: 1px 5px;
}
.check-intrusive {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.08em;
  color: var(--amber); background: rgba(200,134,42,0.12); border-radius: 2px; padding: 1px 6px;
}
.check-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; }
.check-price {
  flex-shrink: 0; font-family: 'IBM Plex Mono', monospace; font-size: 15px;
  color: var(--text); align-self: flex-start;
}
.check-price::after { content: ' cr'; font-size: 10px; color: var(--text-dim); }

.check-blind {
  display: flex; flex-direction: column; gap: 3px; margin-top: 4px;
  padding: 9px 11px; background: var(--ink); border-left: 2px solid var(--slate); border-radius: 0 2px 2px 0;
}
.blind-label { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--slate); margin-bottom: 2px; }
.blind-item { font-size: 12px; color: var(--text-dim); line-height: 1.45; }

.check-reason {
  margin: 0; padding: 10px 16px; background: rgba(200,134,42,0.08);
  border-top: 1px solid var(--line-strong);
  font-size: 12.5px; color: var(--amber-lo); line-height: 1.45;
}

/* Ledger — the signature */
.ledger {
  background: var(--paper);
  color: var(--ink);
  border-radius: 4px;
  padding: 24px;
  position: sticky; top: 24px;
}
@media (max-width: 900px) { .ledger { position: static; } }

.reading { padding-bottom: 20px; border-bottom: 1px solid var(--paper-2); }
.reading-label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--slate); }
.reading-value { display: flex; align-items: baseline; gap: 8px; font-family: 'Fraunces', serif; font-size: 52px; font-weight: 600; line-height: 1; margin: 8px 0 6px; letter-spacing: -0.02em; }
.reading-unit { font-size: 15px; font-weight: 400; color: var(--slate); }
.reading-sub { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--slate); }

.gauge { margin: 18px 0; }
.gauge-track { height: 4px; background: var(--paper-2); border-radius: 2px; overflow: hidden; }
.gauge-fill { height: 100%; background: var(--amber); transition: width 0.3s cubic-bezier(0.2,0.8,0.2,1); }
.gauge-ends { display: flex; justify-content: space-between; margin-top: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--slate); }

.ledger-block { padding: 18px 0; border-bottom: 1px solid var(--paper-2); }
.ledger-title { font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink); margin: 0 0 12px; }
.ledger-title-warn { color: var(--amber); }
.ledger-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.ledger-list li { display: flex; flex-direction: column; gap: 2px; }
.li-name { font-size: 13px; font-weight: 600; color: var(--ink); }
.li-why { font-size: 12.5px; color: var(--slate); line-height: 1.45; }
.gaps li { padding-left: 14px; position: relative; }
.gaps li::before { content: '—'; position: absolute; left: 0; color: var(--amber); }
.ledger-note { font-size: 11.5px; color: var(--slate); line-height: 1.5; margin: 12px 0 0; font-style: italic; }

.run {
  width: 100%; margin-top: 20px; padding: 15px;
  background: var(--ink); color: var(--paper);
  border: none; border-radius: 3px; cursor: pointer;
  font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; font-weight: 500; letter-spacing: 0.02em;
  transition: background 0.15s;
}
.run:hover:not(:disabled) { background: var(--ink-2); }
.run:disabled { opacity: 0.4; cursor: not-allowed; }
.run-fine { font-size: 11px; color: var(--slate); text-align: center; margin: 10px 0 0; line-height: 1.4; }

@media (prefers-reduced-motion: reduce) { .jv * { transition: none !important; } }
`;

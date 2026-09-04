#!/usr/bin/env node
// scripts/audit-route-auth.mjs
// Purpose: fail-the-build guardrail against the IDOR pattern the Sentinel scan
//   found replicated across ~45 routes: service-role client (bypasses RLS) +
//   user id read from the request + no auth gate -> any UUID returned that
//   user's data.
// Date: 2026-07-19
//
// "The core is 100%" is DEFINED as: zero CRITICAL findings here.
// A route is compliant when every method either (a) uses an auth gate
// (requireUser / requirePaidOrAdmin / requireInternal, a validated token check,
// or an admin/internal-secret helper), or (b) carries an explicit, justified
// `// @auth-reviewed: <reason>` annotation for intentionally-public endpoints.
//
// Run: node scripts/audit-route-auth.mjs   (exit 1 if any CRITICAL)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../app/api", import.meta.url).pathname;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const ID_FROM_REQ = [
  /\.get\(\s*["'`](userId|user_id)["'`]\s*\)/,
  /\b(body|payload|reqBody|input|data|json)\s*\.\s*(userId|user_id)\b/,
  /const\s*\{[^}]*\b(userId|user_id)\b[^}]*\}\s*=\s*(await\s*)?(req|request|body|payload)/,
  /\.get\(\s*["'`]x-user-id["'`]\s*\)/,
];
// Gate signals — a validated identity/authorization check.
// 2026-08-27: getUserFromRequest added, and ONLY after reading it. It pulls a
// Bearer token, calls supabase.auth.getUser(token), and returns null on a missing
// token, an error, or no user — so a route that 401s on null is genuinely gated.
//
// Adding a name here HIDES findings, so the bar is higher than for the
// service-role patterns: a wrong entry makes the gate lie in the safe-looking
// direction. Verified against lib/supabase/server.ts:101 before adding.
const AUTH_GATE = [
  /requireUser\s*\(/, /requirePaidOrAdmin\s*\(/, /requireInternal\s*\(/, /requireAdmin\s*\(/, /requireCron\s*\(/, /CRON_SECRET/,
  // 2026-09-06: requireCapability added.
  //
  // lib/api/require-capability.ts was restored from an abandoned branch today, so
  // this guardrail had never seen the function and reported a properly gated
  // route as CRITICAL. Verified before adding: requireCapability awaits
  // requireUser first and returns its refusal, then checks the named capability
  // through the has_capability RPC. It is strictly stronger than requireUser,
  // not a bypass.
  //
  // Worth recording that the guardrail failed the build rather than waving it
  // through. A gate list that has not kept up should produce a false alarm, never
  // a false pass - and this one refused to ship a route it did not understand.
  /requireCapability\s*\(/,
  // 2026-09-04: learned from the fleet sweep. javari-verify gates with
  // requireOwner and was reported as a false positive; the realty IDORs were
  // closed with a local callerId helper that verifies a bearer token. A guard
  // that does not know every legitimate gate accuses working code, and the third
  // false accusation is the one that gets the guard switched off.
  /requireOwner\s*\(/,
  // 2026-09-04: requirePermission added, VERIFIED not assumed. javari-dashboard
  // gates with it and six routes were reported CRITICAL. lib/rbac.ts calls
  // supabase.auth.getUser(), THROWS 'Authentication required' when there is no
  // user, and returns the verified user.id - so a route destructuring userId from
  // it is reading an authenticated identity, not a caller-supplied one.
  //
  // Read before adding, because an entry here that is wrong makes the gate lie in
  // the safe-looking direction: it silences a real finding rather than raising a
  // false one, and nobody notices a warning that stopped appearing.
  /requirePermission\s*\(/,
  /callerId\s*\(/,
  /getUserFromRequest\s*\(/,
  // 2026-08-27: resolveExpensesOrg added, verified not assumed. It is the wrapper
  // built this morning to close the 12-route expenses IDOR, and
  // lib/expenses/helpers.ts:43 shows it calls `await requireUser(request)` and
  // returns { ok:false } on failure. Five expenses routes were flagged for having
  // no gate while carrying the strictest one in the codebase.
  //
  // The detector only resolves helpers defined in the SAME FILE, so any auth
  // wrapper that lives in lib/ is invisible to it. That is a known limitation,
  // stated here rather than silently worked around.
  /resolveExpensesOrg\s*\(/,
  // 2026-08-27: RESTORED. My previous edit sliced to the first line ending in
  // '];' and deleted these five, which took webhook-signature, session and admin
  // checks out of the gate list. WARN went 38 -> 64 and four phantom CRITICALs
  // appeared — routes that ARE gated, by a pattern I had just removed.
  /resolveTargetUser\s*\(/, /getServerSession\s*\(/,
  /auth\.getUser\s*\(\s*(token|authHeader|bearer|jwt)/i,
  /constructEvent\s*\(/, /verify(Webhook|Signature)\s*\(/,
  /x-internal-secret/, /ADMIN_EMAILS/, /stripe-signature/, /x-hub-signature/, /WEBHOOK_SECRET/i, /webhookSecret/, /createHmac/, /timingSafeEqual/, /isSuperAdmin|isAdmin\b/,
  /INTERNAL_API_SECRET/,
];
// 2026-08-27: THIS DETECTOR WAS PARTLY BLIND, and it reported PASS while blind.
//
// It matched the literal SUPABASE_SERVICE_ROLE_KEY and friends. But most routes
// obtain a service-role client through createServiceClient() — a helper whose
// NAME DOES NOT CONTAIN 'SERVICE_ROLE'. Every one of those was invisible.
//
// I reported 'WARN 0 across 821 route files' earlier today after closing three
// real findings. That was true of what this could see and false of the codebase:
// the parallel Supabase key migration added createServiceClient( to its copy of
// these patterns and the count went 0 -> 38.
//
// A security gate that cannot see the common case is worse than no gate, because
// it produces a number people trust.
//
// secretKey( is included ahead of the migration landing, so this keeps working
// when SUPABASE_SERVICE_ROLE_KEY is gone from the source entirely.
// 2026-09-04: lazyAdminDb and friends added, after this guard reported PASS on a
// repository where 32 routes bypassed row level security.
//
// javari-spirits obtains its client from `import { lazyAdminDb } from
// '@/lib/supabase/admin'` — a service-role client whose NAME contains neither
// SERVICE_ROLE nor 'service'. Every one of those routes took a userId from the
// request, and the guard filed them as HIGH rather than CRITICAL and passed the
// build.
//
// The lesson is the one already written above this list and it recurred anyway:
// a helper hides the credential. Matching the credential's NAME will always trail
// the helpers people write, so the helper names have to be enumerated too, and
// this comment is here so the next name gets added rather than the next PASS
// being trusted.
const SERVICE_ROLE = [
  /SERVICE_ROLE/, /service_role/, /serviceDb\s*\(/, /SUPABASE_SERVICE_ROLE_KEY/,
  /createServiceClient\s*\(/, /secretKey\s*\(/,
  /lazyAdminDb\s*\(/, /getSupabaseAdmin\s*\(/, /adminDb\s*\(/, /supabaseAdmin\b/,
];
const REVIEWED = /@auth-(reviewed|public)\b/;

// 2026-08-28: A GATE WITH A PUBLISHED DEFAULT IS NOT A GATE.
//
// Six routes compared a header against `process.env.X ?? "<literal>"`, and
// CANONICAL_ADMIN_SECRET and ADMIN_SECRET_KEY were both UNSET — so those
// literals, sitting in the repo, were the live production credentials on routes
// that grant credits, enumerate every account and run arbitrary DDL. One route
// did not even use an env var: `if (key !== "javari-admin-2026")`.
//
// Roy closed one instance of this the same day (clear-scheduler-lock). It
// recurred because nothing stopped it recurring, and the compressed formatting
// in app/api/test/all/route.ts is why a grep sweep missed one. So it is a build
// rule now, not a habit.
//
// Use requireAdminSecret() from lib/api/require-admin-secret.ts, which refuses
// every request when the secret is unset instead of falling back.
const SECRET_DEFAULT = [
  /process\.env\.[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)[A-Z0-9_]*\s*(\?\?|\|\|)\s*["'`][^"'`\n]{3,}["'`]/,
  /!==\s*["'`](javari-admin|javari-cron)[^"'`\n]*["'`]/,
  /["'`](javari-admin|javari-cron)[^"'`\n]*["'`]\s*!==/,
];
// 2026-09-04: comments are stripped before any pattern runs.
//
// This guard reported app/api/enrichment/spirits as CRITICAL after that route had
// already been FIXED, because the fix carries a comment explaining the old
// pattern - and the comment contains the pattern.
//
// A guard that cannot tell code from an explanation of code punishes documenting
// the fix. Every honest comment about a defect would have to be written in
// euphemism to avoid tripping it, which is a worse outcome than the false
// positive.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const any = (arr, s) => {
  const code = stripComments(s);
  return arr.some((r) => r.test(code));
};

// All function/arrow definitions with their start offsets, for clean body slicing
// and to resolve gates that live in a helper the handler calls.
function defs(src) {
  const out = [];
  const reFn = /(?:export\s+)?async\s+function\s+(\w+)\s*\(/g;
  const reArrow = /const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = reFn.exec(src))) out.push({ name: m[1], start: m.index, kind: "fn" });
  while ((m = reArrow.exec(src))) out.push({ name: m[1], start: m.index, kind: "arrow" });
  out.sort((a, b) => a.start - b.start);
  return out.map((d, i) => ({ ...d, body: src.slice(d.start, i + 1 < out.length ? out[i + 1].start : src.length) }));
}

const files = walk(ROOT);
const findings = { CRITICAL: [], HIGH: [], WARN: [] };
let reviewedCount = 0;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = f.slice(f.indexOf("app/api"));
  const svc = any(SERVICE_ROLE, src);
  const d = defs(src);
  // helper names whose body contains a gate — a handler that calls one is gated
  const gatedHelpers = d.filter((x) => any(AUTH_GATE, x.body)).map((x) => x.name);
  const callsGatedHelper = (body) => gatedHelpers.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(body));

  for (const mth of d.filter((x) => x.kind === "fn" && /^(GET|POST|PUT|PATCH|DELETE)$/.test(x.name))) {
    const before = src.slice(Math.max(0, mth.start - 400), mth.start);
    if (REVIEWED.test(mth.body) || REVIEWED.test(before)) { reviewedCount++; continue; }
    const idFromReq = any(ID_FROM_REQ, mth.body);
    const gated = any(AUTH_GATE, mth.body) || callsGatedHelper(mth.body);
    const label = `${rel} [${mth.name}]`;
    if (any(SECRET_DEFAULT, mth.body)) findings.CRITICAL.push(`${label}  (gate falls back to a hardcoded secret)`);
    else if (idFromReq && !gated && svc) findings.CRITICAL.push(label);
    else if (idFromReq && !gated) findings.HIGH.push(label);
    else if (svc && !gated && /\.(insert|update|delete|upsert)\(/.test(mth.body)) findings.WARN.push(label);
  }
}

const line = "─".repeat(60);
console.log(line + "\nROUTE AUTH GUARDRAIL\nscanned: " + files.length + " route files\n" + line);
console.log(`CRITICAL (service-role + id-from-request + no gate):  ${findings.CRITICAL.length}`);
console.log(`HIGH     (id-from-request + no gate):                 ${findings.HIGH.length}`);
console.log(`WARN     (service-role mutation + no gate):           ${findings.WARN.length}`);
// 2026-08-28: WARN was a bare count, so the 38 routes this detector started
// seeing had no way to be triaged. --list prints them.
if (process.argv.includes("--list") && findings.WARN.length) {
  console.log("\n── WARN detail ──");
  for (const w of findings.WARN.sort()) console.log(`  ${w}`);
  console.log("");
}
console.log(`reviewed/public (explicitly annotated):              ${reviewedCount}`);
for (const sev of ["CRITICAL", "HIGH"]) {
  if (findings[sev].length) { console.log(`\n── ${sev} ──`); for (const x of findings[sev]) console.log("  " + x); }
}
console.log(line);
if (findings.CRITICAL.length > 0) { console.log("RESULT: FAIL — core is not 100%."); process.exit(1); }
console.log("RESULT: PASS — no CRITICAL IDOR-pattern routes.");

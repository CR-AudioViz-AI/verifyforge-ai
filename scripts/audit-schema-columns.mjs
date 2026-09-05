#!/usr/bin/env node
/**
 * scripts/audit-schema-columns.mjs
 *
 * 2026-08-24: /api/auth/session selected `monthly_allowance` and `group` from
 * user_credits. NEITHER COLUMN EXISTS. PostgREST answered 400 42703 on every
 * request, for every user, since the route was written - the credits read never
 * once succeeded.
 *
 * Nobody knew, because the failure branch returned { balance: 100, plan: "free" }.
 * Every user saw a plausible number, so a permanently broken query was invisible.
 * Two consequences went unnoticed for months: nobody's real balance was ever
 * shown, and isVeteran/isNonprofit compared against a column that never existed,
 * so EVERY veteran and nonprofit flag has been false since launch. On a platform
 * whose mission names veterans and first responders, that is not a cosmetic bug.
 *
 * A sweep of the codebase found 51 more routes doing the same thing. A one-time
 * fix leaves the 52nd free to appear, so this is a gate instead.
 *
 * It compares every `.from("table").select("cols")` against schema-snapshot.json,
 * generated from information_schema. The snapshot is committed so CI needs no
 * database credentials - regenerate it when the schema changes.
 *
 * LIMITS, stated rather than discovered later:
 *   - Only literal select strings. A select built from a variable is skipped.
 *   - `*` is skipped.
 *   - Embedded resources (foo:other_table(...)) are checked by alias only.
 *
 * CR AudioViz AI, LLC - EIN 39-3646201
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 2026-08-23: resolved from THIS FILE, not the working directory. As a bare
// relative path this resolved against cwd, so running the gate from anywhere
// but the repo root printed "no schema-snapshot.json; skipping" and exited 0 -
// a clean report from a check that never ran. That also survived flipping the
// exit code below, because this branch returns before any finding is counted.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAP = join(REPO_ROOT, "schema-snapshot.json");
if (!existsSync(SNAP)) {
  console.error("audit-schema-columns: schema-snapshot.json missing at " + SNAP);
  process.exit(1);
}
process.chdir(REPO_ROOT);
const schema = JSON.parse(readFileSync(SNAP, "utf8"));

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

// 2026-08-23: split on TOP-LEVEL commas only. Splitting on every comma tore
// nested embeds apart and blamed the inner table's columns on the outer one:
// `role:roles(name, level, ...)` yielded a bare " level", which was reported as a
// missing user_roles column even though roles.level exists. That produced phantom
// findings against WORKING queries in lib/rbac-middleware.ts and app/api/rbac -
// and acting on one would have broken a live RBAC path.
function splitTopLevel(sel) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const roots = ["app", "lib"].filter(existsSync);
const files = roots.flatMap((r) => walk(r));
function recordGhost(table, file, srcLines, line) {
  // Migration helpers legitimately name tables that do not exist yet - they are
  // creating them. Skipping those keeps the signal worth reading; a gate that
  // cries wolf gets disabled rather than fixed.
  if (/migrat|bootstrap|setup|create-|_sql|_dummy_/.test(file) || /^_/.test(table)) return;
  // 2026-08-25: this check ignored the allow-unreachable marker that the read,
  // write and argument checks all honour, so a query already refused with a 501
  // still counted as a live ghost. That made GHOST_BLOCKING unreachable by the
  // route the rules prescribe: "every remainder marked 501 with a reason" could
  // never bring the count to zero. Same 11-line window as the other three, and
  // suppressed entries are still printed - listed, not hidden.
  if (srcLines && srcLines.slice(Math.max(0, line - 11), line).some((l) => ALLOW.test(l))) {
    suppressed.push({ file, table, missing: ["<ghost table, refused above>"] });
    return;
  }
  if (!ghostTables.has(table)) ghostTables.set(table, new Set());
  ghostTables.get(table).add(file);
}

const findings = [];
const writeFindings = [];
const argFindings = [];
// 2026-08-24: THIRD CATEGORY. Both scan loops did `if (!schema[table]) continue`,
// so a query against a table that DOES NOT EXIST was silently skipped - the gate
// only ever checked columns on tables it recognised.
//
// That is a larger class than the column backlog it was built for: 104 distinct
// nonexistent tables across 72 files, confirmed against the live database
// (PGRST205, table not found) and against types/database.ts independently.
//
// javariverse_email_log, roadmap_tasks, crm_customers, credit_refunds and 100
// others. Every read returns nothing and every write is discarded, silently.
const ghostTables = new Map();
const suppressed = [];

// A query left in place BELOW an unconditional 501 is unreachable, but this gate
// is a static scan and cannot see that. Rule: a route whose feature was never
// built returns 501 and KEEPS the logic below the return, so those selects would
// hold the count above zero forever and the gate could never be made to block.
//
// An explicit marker within 10 lines above the .from() opts a single query out:
//
//   // schema-gate: allow-unreachable - <why>
//
// It is deliberately narrow and greppable, it suppresses exactly one query, and
// suppressed queries are still COUNTED AND LISTED in the output. They just do
// not fail the build. A silent ignore would recreate the problem this gate exists
// to catch.
const ALLOW = /\/\/\s*schema-gate:\s*allow-unreachable/;

// .from("t").select(`a, b, c`) — the select may be a template literal.
// Locates a write call. The object literal is NOT captured by regex - see
// objectLiteralKeys below for why.
// 2026-08-25: ARGUMENT-POSITION COLUMNS. The gate inspected select/insert/update/
// upsert and NOTHING ELSE, so a column named inside .order(), .eq(), .gte(),
// .lt(), .filter() or .textSearch() was invisible.
//
// A parallel Claude Code session found four live defects sitting in that gap, and
// one of them was MY OWN HALF-FIX: /api/conversations had its select corrected
// while `.order('updated_at')` still pointed at a column the table does not have.
// The GET still failed and the gate read it as clean.
//
// Also in the gap: /api/monitoring/performance filtering on created_at when the
// column is recorded_at, /api/gamification ordering by unlocked_at, and
// /api/support searching a search_vector column that exists on neither faqs nor
// kb_articles - so knowledge-base search has NEVER returned anything.
//
// Matches a chained filter after a .from(), capturing the method and the first
// string literal, which is the column in every one of these APIs.
// 2026-08-25: the chain terminator was `(?=;|\n\s*\n)` - a semicolon or a blank
// line. That SPANS STATEMENT BOUNDARIES when calls sit on consecutive lines, so a
// Promise.all block querying four tables had every filter attributed to the FIRST
// from(). app/api/player/profile produced SIX findings and all six were false:
// player_id, score, earned_at and played_at are correct columns on game_scores,
// game_achievements and game_plays - just not on player_profiles.
//
// Now the chain also stops at the NEXT .from(, which is the real boundary. A gate
// that blames the wrong table is worse than no gate: acting on it would have
// 'fixed' four working queries.
const ARG_CALL_RE = /from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)((?:(?!\.from\()[\s\S]){0,600}?)(?=;|\n\s*\n|\.from\()/g;
const ARG_COL_RE = /\.(order|eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|textSearch)\(\s*['"]([a-z_][a-z0-9_.]*)['"]/g;

const WRITE_CALL_RE = /from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*(?:\.[a-zA-Z]+\([^)]*\)\s*)*?\.(insert|update|upsert)\(/g;

// 2026-08-23: the first write-side implementation captured the object body with
// `\{([^}]{1,900})\}` and then pulled keys out of it with
// /([a-z_][a-z0-9_]*)\s*:/g. Both halves were wrong, and together they reported
// 187 findings where the true number is a small fraction of that.
//
//   - `[^}]` stops at the FIRST closing brace, so any nested object or `${...}`
//     truncated the body mid-expression.
//   - `identifier:` matches anywhere, not just in key position. Every TERNARY in
//     a value was read as a column. `provider === "custom" ? customEndpoint : null`
//     reported `ndpoint` - the identifier is customEndpoint, and the match starts
//     after the capital E because [a-z_] cannot begin on it. Same shape produced
//     `ost` (outputCost), `tart` (autoStart), `equired` (isRequired).
//   - Keys of a NESTED object counted as columns of the outer table, which is
//     where the `details: { content, value }` findings on admin_action_log came
//     from.
//   - A URL inside a string value matched too: "https://..." reported `https`.
//
// It also had a false NEGATIVE that matters more: shorthand properties have no
// colon at all, so `.insert({ ticket_id, body, author })` was never checked.
//
// This replacement walks the literal with a real scanner: it tracks string,
// template and comment state, counts brace/bracket/paren depth, and records a
// key only in KEY POSITION at the top level - which is what makes a ternary
// colon in a value unreachable by construction.
function objectLiteralKeys(code, start) {
  const keys = [];
  const n = code.length;
  let i = start + 1;
  let depth = 0;
  let expectKey = true;
  let resolvable = true;

  function skipString(q) {
    i++;
    while (i < n) {
      const c = code[i];
      if (c === "\\") { i += 2; continue; }
      if (q === "`" && c === "$" && code[i + 1] === "{") {
        i += 2;
        let d = 1;
        while (i < n && d > 0) {
          const t = code[i];
          if (t === "'" || t === '"' || t === "`") { skipString(t); continue; }
          if (t === "{") d++;
          else if (t === "}") d--;
          i++;
        }
        continue;
      }
      if (c === q) { i++; return; }
      i++;
    }
  }

  while (i < n) {
    const c = code[i];

    if (c === "/" && code[i + 1] === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (c === "/" && code[i + 1] === "*") { i += 2; while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++; i += 2; continue; }

    if (depth === 0 && expectKey) {
      if (/\s/.test(c)) { i++; continue; }
      if (c === "}") return { keys, resolvable };
      // A spread cannot be resolved statically. Guessing is what this gate exists
      // to prevent, so the whole literal is abandoned.
      if (code.startsWith("...", i)) return { keys, resolvable: false };
      // A computed key is equally unresolvable, but only for that one entry.
      if (c === "[") { resolvable = false; depth++; i++; expectKey = false; continue; }
      if (c === "'" || c === '"' || c === "`") {
        const q = c;
        const from = i + 1;
        skipString(q);
        keys.push(code.slice(from, i - 1));
        expectKey = false;
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
        keys.push(code.slice(i, j));
        i = j;
        expectKey = false;
        continue;
      }
      expectKey = false;
      continue;
    }

    if (c === "'" || c === '"' || c === "`") { skipString(c); continue; }
    if (c === "{" || c === "[" || c === "(") { depth++; i++; continue; }
    if (c === ")" || c === "]") { depth--; i++; continue; }
    if (c === "}") {
      if (depth === 0) return { keys, resolvable };
      depth--; i++; continue;
    }
    if (depth === 0 && c === ",") { expectKey = true; i++; continue; }
    i++;
  }
  return { keys, resolvable };
}

// Finds the object literal a write call is given. Handles `.insert({...})` and
// `.insert([{...}])`; anything else (a variable, a .map(), a spread-only call)
// is not statically resolvable and is skipped rather than guessed at.
function writeObjectStart(code, from) {
  let i = from;
  const n = code.length;

  // 2026-08-25: this skipped whitespace INDEFINITELY, so when `.insert(` was
  // followed by anything other than an object it walked forward until it found a
  // `{` anywhere later in the file — and attributed THAT object's keys to this
  // table.
  //
  // It reported `device_profile, status` on evidence_artifacts in app/api/e2e:
  // both are keys of a `NextResponse.json({...})` forty lines below the insert.
  // A response body is not a write, and blaming one on a table sends the next
  // reader to fix code that was already correct.
  //
  // A real write has its object IMMEDIATELY after the paren. Anything else is not
  // statically resolvable and is skipped rather than guessed at — the same rule
  // the rest of this function already followed for variables and .map().
  let skipped = 0;
  while (i < n && /\s/.test(code[i])) { i++; skipped++; }
  if (skipped > 40) return -1;

  if (code[i] === "[") {
    i++;
    let inner = 0;
    while (i < n && /\s/.test(code[i])) { i++; inner++; }
    if (inner > 40) return -1;
  }
  return code[i] === "{" ? i : -1;
}
const RE = /from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*(?:\.[a-zA-Z]+\([^)]*\)\s*)*?\.select\(\s*(['"`])([^'"`]{1,400})\2/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Strip line comments so an explanatory comment naming an old column does not
  // trip the gate. This gate exists partly because comments document past bugs.
  const srcLines = src.split("\n");
  // Blanked rather than removed so line numbers still line up with `src`, which
  // the allow-unreachable lookup below depends on.
  const code = srcLines.map((l) => (l.trim().startsWith("//") ? "" : l)).join("\n");
  let m;
  while ((m = RE.exec(code))) {
    const table = m[1];
    const sel = m[3];
    if (!schema[table]) {
      recordGhost(table, file, srcLines, code.slice(0, m.index).split("\n").length);
      continue;
    }
    if (sel.includes("*")) continue;
    const cols = splitTopLevel(sel)
      .map((c) => c.trim())
      .filter(Boolean)
      // An embedded resource - `rel(...)` or `alias:rel(...)` - selects columns
      // from the RELATED table, not this one. Skip the whole item.
      .filter((c) => !c.includes("("))
      // "alias:column" -> column
      .map((c) => (c.includes(":") ? c.split(":").pop().trim() : c))
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
    const missing = cols.filter((c) => !schema[table].includes(c));
    if (!missing.length) continue;

    const line = code.slice(0, m.index).split("\n").length;
    const allowed = srcLines
      .slice(Math.max(0, line - 11), line)
      .some((l) => ALLOW.test(l));

    (allowed ? suppressed : findings).push({ file, table, missing });

  }
  // 2026-08-24: WRITE SIDE. Until today this gate only read .select(), so every
  // insert, update and upsert was invisible. That blind spot hid the worst defect
  // in the audit: /api/moderation/reports wrote FOUR nonexistent columns, failed
  // 400 on every attempt, and replied "Report submitted. Our team will review it
  // shortly." No abuse report was ever stored.
  //
    // NOTE: this sits in the FILE loop, not inside the select while-loop. My
    // first version nested it there, so it only ran for files that ALREADY had a
    // select finding - it reported 10 writes when an independent sweep found 196.
    // A gate that only inspects files already known to be broken is not a gate.
  // A first sweep found 196 write-side findings and six of six spot-checks were
  // confirmed 400 against the live database - so this is a larger class than the
  // read side ever was.
  // Argument-position columns: .order(), .eq(), .gte() and friends.
  ARG_CALL_RE.lastIndex = 0;
  let a;
  while ((a = ARG_CALL_RE.exec(code))) {
    const table = a[1];
    const chain = a[2];
    if (!schema[table]) {
      // Reported as a ghost, for the same reason as the write loop above: a
      // filter against a table that does not exist is not a column problem, and
      // "reported separately" was only true when a .select() happened to sit on
      // the same chain.
      recordGhost(table, file, srcLines, code.slice(0, a.index).split("\n").length);
      continue;
    }
    ARG_COL_RE.lastIndex = 0;
    let m2;
    while ((m2 = ARG_COL_RE.exec(chain))) {
      const method = m2[1];
      // An embedded path like 'apps.name' targets a joined table, which this
      // gate cannot resolve. Skipping rather than guessing - a false finding on
      // a working filter is how a gate gets disabled.
      const col = m2[2];
      if (col.includes('.')) continue;
      if (schema[table].includes(col)) continue;
      const line = code.slice(0, a.index).split('\n').length;
      const allowed = srcLines.slice(Math.max(0, line - 11), line).some((l) => ALLOW.test(l));
      (allowed ? suppressed : argFindings).push({ file, table, op: method, missing: [col] });
    }
  }

  WRITE_CALL_RE.lastIndex = 0;
  let w;
  while ((w = WRITE_CALL_RE.exec(code))) {
    const table = w[1];
    const op = w[2];
    if (!schema[table]) {
      // 2026-08-25: this was a bare `continue`, so a WRITE to a nonexistent
      // table was counted nowhere. The ghost list is built in the select loop,
      // and that loop only matches .from(x).select(y) - an insert with no
      // select never reaches it. collectible_images and auto_fix_attempts are
      // both absent from all 858 tables and appeared in neither list until now.
      recordGhost(table, file, srcLines, code.slice(0, w.index).split("\n").length);
      continue;
    }
    const objStart = writeObjectStart(code, WRITE_CALL_RE.lastIndex);
    if (objStart < 0) continue;
    const { keys, resolvable } = objectLiteralKeys(code, objStart);
    if (!resolvable) continue;
    const missing = [...new Set(keys)].filter((k) => !schema[table].includes(k));
    if (!missing.length) continue;
    const line = code.slice(0, w.index).split("\n").length;
    const allowed = srcLines.slice(Math.max(0, line - 11), line).some((l) => ALLOW.test(l));
    (allowed ? suppressed : writeFindings).push({ file, table, op, missing, line });
  }
}

if (suppressed.length) {
  console.error(`\naudit-schema-columns: ${suppressed.length} suppressed (unreachable behind a 501)`);
  for (const f of suppressed) {
    console.error(`  ~ ${f.file}  ${f.table}: ${f.missing.join(", ")}`);
  }
}

// 2026-08-24: write findings are reported SEPARATELY and do NOT block yet - there
// are ~196 of them and a gate that fails the build on day one gets disabled
// rather than fixed. That is exactly what happened when a 20-minute type check
// burned the Actions budget and silently disabled every gate for weeks.
//
// Flip `WRITE_BLOCKING` to true once the count reaches zero. The count is the
// roadmap.
// 2026-08-24: ghost tables report but do not block, same reasoning as writes -
// 104 outstanding, and a gate that fails the build on day one gets disabled
// rather than fixed. Flip GHOST_BLOCKING when the count reaches zero.
const GHOST_BLOCKING = false;
if (ghostTables.size) {
  console.error(`\naudit-schema-columns: ${ghostTables.size} TABLE(S) referenced that DO NOT EXIST`);
  console.error("  (every read returns nothing and every write is discarded, silently)\n");
  for (const [t, fs] of [...ghostTables].sort((a, b) => b[1].size - a[1].size)) {
    console.error(`  ${t}  (${fs.size} file${fs.size > 1 ? "s" : ""}) ${[...fs][0]}`);
  }
  if (GHOST_BLOCKING) process.exit(1);
}

// 2026-08-25: argument-position findings report but do not block, same reasoning
// as writes and ghosts. Flip when the count reaches zero.
//
// These are the hardest class to spot by reading, because the query LOOKS right -
// the select names real columns and only the filter or sort is wrong. My own
// half-fix to /api/conversations was exactly that: correct select, broken order,
// and the gate called it clean.
const ARG_BLOCKING = false;
if (argFindings.length) {
  console.error(`\naudit-schema-columns: ${argFindings.length} FILTER/ORDER clause(s) name columns that DO NOT EXIST`);
  console.error("  (.order/.eq/.gte and friends - invisible to a select-only check)\n");
  for (const f of argFindings.slice(0, 80)) {
    console.error(`  ${f.file}  ${f.table}.${f.op}(): ${f.missing.join(", ")}`);
  }
  if (ARG_BLOCKING) process.exit(1);
}

const WRITE_BLOCKING = false;
if (writeFindings.length) {
  console.error(`\naudit-schema-columns: ${writeFindings.length} WRITE(S) name columns that DO NOT EXIST`);
  console.error("  (insert/update/upsert - each is a runtime 400 42703)\n");
  for (const f of writeFindings) {
    console.error(`  ${f.file}  ${f.table}.${f.op}: ${f.missing.join(", ")}`);
  }
  if (WRITE_BLOCKING) process.exit(1);
}

if (findings.length) {
  console.error(`\naudit-schema-columns: ${findings.length} query/queries select columns that DO NOT EXIST\n`);
  for (const f of findings.slice(0, 60)) {
    console.error(`  ${f.file}  ${f.table}: ${f.missing.join(", ")}`);
  }
  console.error("\nEach of these returns PostgREST 400 42703 at runtime. Fix the column");
  console.error("names against schema-snapshot.json, or regenerate the snapshot if the");
  console.error("schema genuinely changed.\n");
  // 2026-08-23: BLOCKING. The backlog is worked down, so this now fails the
  // build - which is the whole point of having built it.
  //
  // It exited 0 deliberately while there was a backlog, because a gate that
  // fails on day one gets disabled rather than fixed; the CI type gate proved
  // that when a 20-minute check burned the Actions budget and silently disabled
  // every gate for weeks. That reason has expired.
  //
  // Two things had to be fixed before this flip was safe, and both would have
  // survived it unnoticed:
  //   - the nested-embed parser bug, which reported working queries as broken.
  //     Blocking on a phantom finding trains people to disable the gate.
  //   - the snapshot path, which resolved against the working directory. That
  //     branch returns BEFORE any finding is counted, so a wrong cwd exited 0
  //     no matter what this line said.
  process.exit(1);
}
console.log(`audit-schema-columns: clean (${files.length} files, ${Object.keys(schema).length} tables).`);

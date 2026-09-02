#!/usr/bin/env node
/**
 * scripts/check-catalog-consistency.mjs
 *
 * Fails the build when the check catalog and the module registry disagree.
 *
 * 2026-09-02. Written the moment the drift appeared rather than after it caused
 * something. Adding catalog metadata by hand found two real mismatches within
 * minutes:
 *
 *   Four modules use hyphenated ids — hollow-response, idor-access,
 *   schema-columns, redirect-integrity — while the newer ones use dots. The
 *   metadata was written against the dotted convention, so four checks would
 *   have shown up with no group, no signal note and no info panel.
 *
 *   security.posture was registered with no metadata at all, so it would have
 *   rendered as an unlabelled row in the selection UI.
 *
 * Neither breaks a build or a test. Both make the product quietly worse, and
 * both are the same class as every other hand-maintained list audited on this
 * platform: HYDRATE_KEYS at 39 of 181 secrets, the backup job at 36 of 378
 * tables, the ecosystem monitor at 9 of 104 domains. A list nobody reconciles
 * drifts, and the only fix that holds is a build that refuses.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECKS_DIR = 'lib/modules/checks';
const META_FILE = 'lib/modules/catalog-meta.ts';
const REGISTRY_FILE = 'lib/registry-instance.ts';

const fail = [];

const metaSrc = readFileSync(META_FILE, 'utf8');
const registrySrc = readFileSync(REGISTRY_FILE, 'utf8');

const metaIds = new Set([...metaSrc.matchAll(/moduleId: '([^']+)'/g)].map((m) => m[1]));
const groupIds = new Set([...metaSrc.matchAll(/^    id: '([^']+)',\n    label:/gm)].map((m) => m[1]));

// Module ids come from the modules themselves, which is the only source that
// cannot be wrong about what it is called.
const moduleIds = new Set();
const exportNames = new Set();
for (const file of readdirSync(CHECKS_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(CHECKS_DIR, file), 'utf8');
  const id = /^  id: '([^']+)'/m.exec(src)?.[1];
  const exp = /^export const (\w+): CheckModule/m.exec(src)?.[1];
  if (!id) fail.push(`${file}: no module id found`);
  else moduleIds.add(id);
  if (exp) exportNames.add(exp);
}

for (const id of moduleIds) {
  if (!metaIds.has(id)) {
    fail.push(`module "${id}" is registered but has no entry in ${META_FILE} — it would render without a group, signal note or info panel`);
  }
}
for (const id of metaIds) {
  if (!moduleIds.has(id)) {
    fail.push(`${META_FILE} describes "${id}", which no module declares — a renamed or deleted check`);
  }
}

// Every check must belong to a group that exists.
for (const m of metaSrc.matchAll(/moduleId: '([^']+)',\s*\n\s*groupId: '([^']+)'/g)) {
  if (!groupIds.has(m[2])) fail.push(`check "${m[1]}" references group "${m[2]}", which is not defined`);
}

// Every module in checks/ must actually be registered. A module that compiles
// and is never registered cannot be planned, estimated or run — the exact defect
// that left four checks unreachable on 2 September 2026.
for (const name of exportNames) {
  if (!registrySrc.includes(`registry.register(${name})`)) {
    fail.push(`export "${name}" exists in ${CHECKS_DIR} but is never registered in ${REGISTRY_FILE} — it can never run`);
  }
}

// Presets must resolve. A preset naming a module that no longer exists silently
// selects fewer checks and reports a clean result for checks that never ran.
for (const block of metaSrc.matchAll(/moduleIds: \[([^\]]*)\]/g)) {
  for (const q of block[1].matchAll(/'([^']+)'/g)) {
    if (!moduleIds.has(q[1])) fail.push(`a preset references "${q[1]}", which no module declares`);
  }
}

if (fail.length > 0) {
  console.error('Check catalog is inconsistent:\n');
  for (const f of fail) console.error(`  · ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`Catalog consistent: ${moduleIds.size} modules, all registered, all described, all groups resolve.`);

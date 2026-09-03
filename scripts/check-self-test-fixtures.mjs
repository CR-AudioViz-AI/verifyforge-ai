#!/usr/bin/env node
/**
 * scripts/check-self-test-fixtures.mjs
 *
 * Fails the build when a self-test fixture expects a rule no module emits.
 *
 * 2026-09-04. Written because the first draft of the fixtures named two rules
 * that did not exist: security.header.strict-transport-security when the module
 * appends '.weak' for a present-but-inadequate header, and hollow.not-found-body
 * when that module emits its own id as the rule.
 *
 * A self-test that fails on its own error is worse than no self-test. It reports
 * the scanner as broken when the scanner is fine, and the third time that happens
 * nobody reads the result — which is exactly the outcome the self-test exists to
 * prevent.
 *
 * Rule ids drift for ordinary reasons: a module gets renamed, a rule gets split.
 * This is the guard that makes that drift loud.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECKS_DIR = 'lib/modules/checks';
const FIXTURES = 'lib/engine/self-test.ts';

const fixtureSrc = readFileSync(FIXTURES, 'utf8');
const expected = [...fixtureSrc.matchAll(/expectRuleId: '([^']+)'/g)].map((m) => m[1]);

const emitted = new Set();
for (const file of readdirSync(CHECKS_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(CHECKS_DIR, file), 'utf8');

  // Literal rule ids.
  for (const m of src.matchAll(/ruleId: ['"]([^'"$]+)['"]/g)) emitted.add(m[1]);

  // Rule maps keyed by id, quoted or bare.
  for (const m of src.matchAll(/^\s+'([a-z0-9.-]+)':\s*\{/gm)) emitted.add(m[1]);
  for (const m of src.matchAll(/^\s+([a-z0-9_]+):\s*\{$/gm)) emitted.add(m[1]);

  // Template-literal ids built from a header name, plus the '.weak' variant the
  // same module appends when a header is present but inadequate.
  for (const m of src.matchAll(/header: '([a-z-]+)'/g)) {
    emitted.add(`security.header.${m[1]}`);
    emitted.add(`security.header.${m[1]}.weak`);
  }
}

const missing = expected.filter((id) => !emitted.has(id));

if (missing.length > 0) {
  console.error('Self-test fixtures expect rules no module emits:\n');
  for (const id of missing) console.error(`  · ${id}`);
  console.error(
    '\nEither the rule was renamed and the fixture needs updating, or the fixture was wrong from the start.\n' +
      'A self-test that fails on its own error reports a working scanner as broken, and nobody reads the third one.\n',
  );
  process.exit(1);
}

console.log(`Self-test fixtures consistent: ${expected.length} fixture(s), every expected rule is emitted by a module.`);

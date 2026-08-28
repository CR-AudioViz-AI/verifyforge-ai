#!/usr/bin/env node
/**
 * scripts/check-playwright-versions.mjs
 *
 * Fails fast when the pinned @playwright/test version and the container image
 * tag disagree.
 *
 * WHY. They drifted once and the suite did not report a version problem — it
 * reported eleven failing assertions in the app, because a browser that cannot
 * launch fails once per test. Half the suite executed nothing for months and the
 * output looked like ordinary test failures. See issue #59.
 *
 * This says the real thing, before the suite runs, in one line.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { readFileSync } from 'node:fs';

const WORKFLOW = '.github/workflows/e2e-tests.yml';

function fail(message) {
  console.error(`\nPlaywright version check FAILED\n\n${message}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test'];

if (typeof declared !== 'string') {
  fail('@playwright/test is not declared in package.json.');
}

// A range cannot be matched against a single image tag. Requiring an exact pin
// is the point: "^1.62.1" is how the two halves drift apart in the first place.
if (!/^\d+\.\d+\.\d+$/.test(declared)) {
  fail(
    `@playwright/test is "${declared}", which is a range, not an exact version.\n` +
    `The container image pins one build of the browsers, so the library must pin one version too.`,
  );
}

const workflow = readFileSync(WORKFLOW, 'utf8');
const match = /image:\s*mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/.exec(workflow);

if (match === null) {
  fail(`Could not find an mcr.microsoft.com/playwright image tag in ${WORKFLOW}.`);
}

const imageVersion = match[1];

if (imageVersion !== declared) {
  fail(
    `@playwright/test is pinned to ${declared} but ${WORKFLOW} runs\n` +
    `mcr.microsoft.com/playwright:v${imageVersion}-*.\n\n` +
    `The image ships the browser builds its own version expects. When these differ,\n` +
    `browsers fail to LAUNCH and the run reports one failure per test — which reads\n` +
    `as defects in the application, not as a version mismatch.\n\n` +
    `Fix: set both to the same version.`,
  );
}

console.log(`Playwright version check OK — library and container both ${declared}.`);

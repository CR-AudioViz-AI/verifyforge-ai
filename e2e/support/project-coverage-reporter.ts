/**
 * e2e/support/project-coverage-reporter.ts
 *
 * Fails the run when a configured project executed nothing.
 *
 * WHY. The mobile project spent months reporting eleven failures while asserting
 * nothing: the container shipped browsers its Playwright could not use, so every
 * test died at launch, and a launch failure is reported once per test. The
 * summary read "11 failed, 13 passed" — indistinguishable from an app with
 * eleven defects. Nothing said the project had run zero assertions. See #59.
 *
 * A test that cannot start is not a failing test, it is an absent one, and the
 * two need different words. This reporter supplies them.
 *
 * It counts only tests that actually EXECUTED — a test skipped by its own
 * `test.skip()` is a deliberate choice and counts as coverage the suite decided
 * not to run. A project where nothing ran at all is the failure this catches.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

export default class ProjectCoverageReporter implements Reporter {
  private readonly executed = new Map<string, number>();
  private readonly launchFailures = new Map<string, number>();

  onBegin(config: FullConfig, _suite: Suite): void {
    for (const project of config.projects) {
      this.executed.set(project.name, 0);
      this.launchFailures.set(project.name, 0);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name;
    if (project === undefined) return;

    if (result.status !== 'skipped') {
      this.executed.set(project, (this.executed.get(project) ?? 0) + 1);
    }

    // A browser that will not start is an environment fault, not a finding. Kept
    // separate so the message can say which it was.
    const message = result.error?.message ?? '';
    if (/browserType\.launch|Executable doesn't exist/i.test(message)) {
      this.launchFailures.set(project, (this.launchFailures.get(project) ?? 0) + 1);
      this.executed.set(project, Math.max(0, (this.executed.get(project) ?? 1) - 1));
    }
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    const dark: string[] = [];

    for (const [project, count] of this.executed) {
      if (count === 0) {
        const launchFailed = this.launchFailures.get(project) ?? 0;
        dark.push(
          launchFailed > 0
            ? `  ${project}: 0 tests executed — ${launchFailed} failed to LAUNCH a browser. ` +
              'This is an environment fault (usually a library/container version mismatch), ' +
              'not a defect in the application.'
            : `  ${project}: 0 tests executed.`,
        );
      }
    }

    if (dark.length === 0) return;

    console.error(
      '\n' +
      '################################################################\n' +
      '#  A CONFIGURED PROJECT RAN NOTHING                            #\n' +
      '################################################################\n' +
      dark.join('\n') +
      '\n\nWhatever else this run reported, that project asserted nothing about\n' +
      'the application. Do not read the rest of the summary as coverage.\n',
    );

    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}

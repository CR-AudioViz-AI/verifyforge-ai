/**
 * lib/engine/coverage.ts
 *
 * How much of the thing was actually examined, and how much was missed.
 *
 * THE HARD PART IS NOT THE STATISTICS. Capture-recapture is simple arithmetic:
 * two independent looks, count the overlap, and the smaller the overlap the more
 * you have not seen. Ecologists have counted fish this way for a century.
 *
 * The hard part is deciding WHAT IS BEING COUNTED. A file count works for a
 * review that reads files. This product does not read files — it examines
 * running systems, and every check has a different population:
 *
 *   redirect-integrity   routes on the site
 *   database.exposure    tables in the schema
 *   ai.safety            prompts in the probe set
 *   security.posture     ONE origin, always — there is nothing to sample
 *
 * A single "coverage %" across all of those would be a number with no referent.
 * Worse, it would look authoritative. So coverage is declared per check, and any
 * check whose population cannot be enumerated says so rather than producing a
 * figure.
 *
 * WHY A BAND AND NOT A PERCENTAGE. "87% covered" from two samples is false
 * precision, and a coverage figure is exactly the kind of number people act on
 * without reading the method. A band forces the reader to think about what it
 * rests on.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

export type PopulationKind =
  /** Enumerable and known in advance: schema tables, a fixed probe set. */
  | 'bounded'
  /** Discoverable but never provably complete: routes on a live site. */
  | 'discovered'
  /** Exactly one thing. Sampling is meaningless. */
  | 'singleton'
  /** Cannot be enumerated at all from outside. */
  | 'unbounded';

export interface Population {
  readonly moduleId: string;
  readonly kind: PopulationKind;
  /** What one unit IS, said plainly. Appears in the report. */
  readonly unit: string;
  /** How the total was established, when it can be. */
  readonly totalSource: string | null;
}

/**
 * Declared, not inferred.
 *
 * Guessing a population from a module's output is how a coverage figure becomes
 * confident nonsense: a check that examined three routes and found three defects
 * would report 100% coverage of a site with nine hundred pages.
 */
export const POPULATIONS: readonly Population[] = [
  { moduleId: 'redirect-integrity', kind: 'discovered', unit: 'route', totalSource: 'crawl and sitemap, never provably complete' },
  { moduleId: 'hollow-response', kind: 'discovered', unit: 'route', totalSource: 'crawl and sitemap, never provably complete' },
  { moduleId: 'idor-access', kind: 'discovered', unit: 'object reference', totalSource: 'references observed in responses' },
  { moduleId: 'database.exposure', kind: 'bounded', unit: 'table', totalSource: 'the schema, when it can be listed' },
  { moduleId: 'schema-columns', kind: 'bounded', unit: 'column reference', totalSource: 'queries found in source' },
  { moduleId: 'ai.safety', kind: 'bounded', unit: 'probe', totalSource: 'the fixed probe set in this module' },
  { moduleId: 'a11y.wcag', kind: 'discovered', unit: 'element', totalSource: 'elements present in the rendered DOM' },
  { moduleId: 'supply.chain', kind: 'bounded', unit: 'dependency or action reference', totalSource: 'the manifest and workflow files' },
  { moduleId: 'security.posture', kind: 'singleton', unit: 'origin', totalSource: null },
  { moduleId: 'auth.flow', kind: 'bounded', unit: 'endpoint and parameter pair', totalSource: 'the known path and parameter lists' },
  { moduleId: 'commerce.integrity', kind: 'bounded', unit: 'payment path', totalSource: 'the known webhook and value-path lists' },
  { moduleId: 'web.discoverability', kind: 'singleton', unit: 'origin', totalSource: null },
  { moduleId: 'data.resilience', kind: 'bounded', unit: 'backup record', totalSource: 'rows in the backup table' },
  { moduleId: 'platform.posture', kind: 'singleton', unit: 'repository', totalSource: null },
  { moduleId: 'infra.posture', kind: 'singleton', unit: 'hosting project', totalSource: null },
  { moduleId: 'runtime.performance', kind: 'bounded', unit: 'device profile', totalSource: 'the profiles selected for this run' },
  { moduleId: 'mobile.readiness', kind: 'singleton', unit: 'origin', totalSource: null },
  { moduleId: 'game.payload', kind: 'discovered', unit: 'asset', totalSource: 'assets referenced by the page' },
  { moduleId: 'model.geometry', kind: 'bounded', unit: 'model file', totalSource: 'the files supplied for this run' },
  // Secrets are the one population that is genuinely unbounded from outside. A
  // key can be anywhere in any bundle, and claiming a proportion of an unknowable
  // total would be the most dangerous coverage figure this product could print -
  // a reassuring number about the thing people most want reassurance on.
  { moduleId: 'secrets.exposed', kind: 'unbounded', unit: 'potential secret location', totalSource: null },
];

export function populationFor(moduleId: string): Population | undefined {
  return POPULATIONS.find((p) => p.moduleId === moduleId);
}

export type CoverageBand = 'complete' | 'high' | 'moderate' | 'low' | 'not-applicable' | 'unknown';

export interface CoverageEstimate {
  readonly moduleId: string;
  readonly band: CoverageBand;
  readonly examined: number;
  /** Null when the total genuinely cannot be known. */
  readonly total: number | null;
  /** Chao-style estimate of units never seen. Null unless two looks exist. */
  readonly estimatedMissed: number | null;
  /** The sentence that goes in the report. */
  readonly statement: string;
}

/**
 * Capture-recapture.
 *
 * Two independent looks at the same population. If the second look sees mostly
 * what the first saw, the population is close to exhausted. If it sees mostly new
 * things, there is a lot still unseen.
 *
 *   estimated total  ≈  (seen by A × seen by B) / seen by both
 *
 * The Chao estimator, minus the refinements that need larger samples than a scan
 * will ever have. It is applied ONLY where two genuinely independent looks exist:
 * running the same deterministic crawl twice is one look performed twice, and
 * feeding that in would produce a confident and meaningless number.
 */
export function estimateMissed(
  seenByFirst: number,
  seenBySecond: number,
  seenByBoth: number,
): number | null {
  if (seenByBoth <= 0) return null;
  if (seenByFirst <= 0 || seenBySecond <= 0) return null;
  const estimatedTotal = (seenByFirst * seenBySecond) / seenByBoth;
  const union = seenByFirst + seenBySecond - seenByBoth;
  return Math.max(0, Math.round(estimatedTotal - union));
}

export interface CoverageInput {
  readonly moduleId: string;
  readonly examined: number;
  /** Known total, when the population is bounded. */
  readonly total?: number | null;
  /** Units seen by a first independent look. */
  readonly firstLook?: number;
  /** Units seen by a second independent look. */
  readonly secondLook?: number;
  /** Units seen by both. */
  readonly overlap?: number;
  /** Set when the run stopped early — a partial crawl caps coverage regardless. */
  readonly budgetExhausted?: boolean;
}

export function estimateCoverage(input: CoverageInput): CoverageEstimate {
  const pop = populationFor(input.moduleId);

  if (!pop) {
    return {
      moduleId: input.moduleId,
      band: 'unknown',
      examined: input.examined,
      total: null,
      estimatedMissed: null,
      statement:
        'No population is declared for this check, so coverage cannot be estimated. ' +
        'A figure invented here would be a number with no referent.',
    };
  }

  // One thing, examined or not. A percentage would be theatre.
  if (pop.kind === 'singleton') {
    return {
      moduleId: input.moduleId,
      band: input.examined > 0 ? 'complete' : 'unknown',
      examined: input.examined,
      total: 1,
      estimatedMissed: null,
      statement:
        input.examined > 0
          ? `This check examines exactly one ${pop.unit}, and it was examined. Coverage is complete by construction — which says nothing about depth.`
          : `This check examines one ${pop.unit} and it could not be reached.`,
    };
  }

  if (pop.kind === 'unbounded') {
    return {
      moduleId: input.moduleId,
      band: 'not-applicable',
      examined: input.examined,
      total: null,
      estimatedMissed: null,
      statement:
        `The population of ${pop.unit}s cannot be enumerated from outside the system, so no proportion can be ` +
        `calculated. ${input.examined} were examined; how many exist is unknown.`,
    };
  }

  const missed =
    input.firstLook !== undefined && input.secondLook !== undefined && input.overlap !== undefined
      ? estimateMissed(input.firstLook, input.secondLook, input.overlap)
      : null;

  // Bounded: the total is genuinely known, so a proportion means something.
  if (pop.kind === 'bounded' && typeof input.total === 'number' && input.total > 0) {
    const ratio = input.examined / input.total;
    const band: CoverageBand =
      ratio >= 0.999 ? 'complete' : ratio >= 0.8 ? 'high' : ratio >= 0.4 ? 'moderate' : 'low';
    return {
      moduleId: input.moduleId,
      band,
      examined: input.examined,
      total: input.total,
      estimatedMissed: missed,
      statement:
        `${input.examined} of ${input.total} ${pop.unit}s were examined` +
        (pop.totalSource ? `, where the total comes from ${pop.totalSource}` : '') +
        `. ${band === 'complete' ? 'Every unit in the population was covered.' : 'The remainder was not examined and nothing here speaks to it.'}`,
    };
  }

  // Discovered: a total exists but cannot be proven, so the honest answer is
  // about the SHAPE of what was found rather than a proportion of an unknown.
  if (pop.kind === 'discovered') {
    if (input.budgetExhausted === true) {
      return {
        moduleId: input.moduleId,
        band: 'low',
        examined: input.examined,
        total: null,
        estimatedMissed: missed,
        statement:
          `${input.examined} ${pop.unit}s were examined and discovery STOPPED ON BUDGET rather than because it ran ` +
          `out of things to find. An unknown number were never reached, so a clean result covers only what was seen.`,
      };
    }
    if (missed !== null) {
      const band: CoverageBand = missed === 0 ? 'high' : missed <= input.examined * 0.1 ? 'high' : missed <= input.examined * 0.5 ? 'moderate' : 'low';
      return {
        moduleId: input.moduleId,
        band,
        examined: input.examined,
        total: null,
        estimatedMissed: missed,
        statement:
          `${input.examined} ${pop.unit}s were examined. Comparing two independent looks suggests roughly ${missed} ` +
          `more exist that neither found. That is an estimate from a small sample, not a count.`,
      };
    }
    return {
      moduleId: input.moduleId,
      band: 'moderate',
      examined: input.examined,
      total: null,
      estimatedMissed: null,
      statement:
        `${input.examined} ${pop.unit}s were examined, discovered by ${pop.totalSource ?? 'crawling'}. ` +
        `Only one look was taken, so there is nothing to compare against and the amount missed is unknown.`,
    };
  }

  return {
    moduleId: input.moduleId,
    band: 'unknown',
    examined: input.examined,
    total: input.total ?? null,
    estimatedMissed: missed,
    statement: `${input.examined} ${pop.unit}s were examined; the population size is not established.`,
  };
}

/** One line for the top of a report, aggregating without inventing a total. */
export function summariseCoverage(estimates: readonly CoverageEstimate[]): string {
  if (estimates.length === 0) return 'No coverage was estimated for this run.';
  const low = estimates.filter((e) => e.band === 'low');
  const complete = estimates.filter((e) => e.band === 'complete');
  const missed = estimates
    .map((e) => e.estimatedMissed)
    .filter((n): n is number => typeof n === 'number')
    .reduce((a, b) => a + b, 0);

  // Deliberately no overall percentage. Averaging coverage across checks with
  // different populations produces a number that means nothing and reads as
  // though it means everything.
  return (
    `${complete.length} of ${estimates.length} checks covered their whole population. ` +
    (low.length > 0
      ? `${low.length} covered only part of theirs, so a clean result from those speaks to what was examined and nothing else. `
      : '') +
    (missed > 0 ? `Across the checks where two looks allowed an estimate, roughly ${missed} unit(s) were likely never seen by either. ` : '') +
    'No overall coverage percentage is given: these checks count different things, and averaging them would produce a figure with no meaning.'
  );
}

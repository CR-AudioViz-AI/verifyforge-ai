/**
 * lib/engine/logic-solver.ts
 *
 * The business-logic solver — invariant checking over a flow's state space.
 *
 * This is distinct from solver.ts, which drives an ARTIFACT to prove it can be
 * completed and hunts undeclared paths (the game/artifact solver). This one
 * answers a different question: given a multi-step flow (a checkout, an
 * onboarding, a credit spend), can its RULES be broken? Can you pay a negative
 * price, get a one-time reward twice, or reach "confirmed" without "paid"?
 *
 * Every scanner publicly admits it cannot do this, because "correct" here is not
 * a property of one response — it is a property of a SEQUENCE of states obeying
 * rules that must be stated. This engine drives the flow as a state machine and
 * checks INVARIANTS at every reachable state. A violation is reported with the
 * exact action sequence that produced it — a reproduction, not a guess.
 *
 * Deliberately model-free at its core: the invariant engine is deterministic. A
 * model, when present, only PROPOSES actions to explore; every violation is
 * confirmed by a deterministic rule, so a finding is never "the AI thought this
 * looked wrong."
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

export type FlowState = Readonly<Record<string, number | string | boolean>>;

export interface FlowAction {
  readonly name: string;
  /** Applies the action against the live target, returns the new observed state. */
  readonly apply: (current: FlowState) => Promise<FlowState>;
}

export interface Invariant {
  readonly id: string;
  readonly description: string;
  /** True when the rule HOLDS. A false result is a violation. */
  readonly holds: (state: FlowState) => boolean;
  readonly severity: 'BLOCKER' | 'HIGH' | 'MEDIUM';
}

interface VisitedState {
  readonly state: FlowState;
  readonly path: readonly string[];
}

export interface InvariantViolation {
  readonly invariantId: string;
  readonly description: string;
  readonly severity: Invariant['severity'];
  readonly reproductionPath: readonly string[];
  readonly violatingState: FlowState;
}

export interface ReachabilityResult {
  readonly stateId: string;
  readonly reachable: boolean;
  readonly path: readonly string[] | null;
}

export interface SolverResult {
  readonly statesVisited: number;
  readonly actionsAttempted: number;
  readonly violations: readonly InvariantViolation[];
  readonly successReachable: ReachabilityResult;
  readonly protectedBreaches: readonly ReachabilityResult[];
  readonly exhausted: boolean;
}

export interface FlowDefinition {
  readonly label: string;
  readonly initialState: FlowState;
  readonly actions: readonly FlowAction[];
  readonly invariants: readonly Invariant[];
  readonly successPredicate: (state: FlowState) => boolean;
  readonly successLabel: string;
  readonly protectedStates: readonly {
    readonly label: string;
    readonly reached: (state: FlowState) => boolean;
    readonly prerequisite: (state: FlowState) => boolean;
  }[];
}

function stateKey(state: FlowState): string {
  return Object.keys(state).sort().map((k) => `${k}=${String(state[k])}`).join('|');
}

/**
 * Explores the flow breadth-first, checking invariants at every reachable state,
 * bounded by maxStates. The bound is reported (exhausted vs truncated) so a
 * partial exploration is never presented as complete.
 */
export async function solveLogic(
  flow: FlowDefinition,
  maxStates = 200,
  signal?: AbortSignal,
): Promise<SolverResult> {
  const seen = new Set<string>();
  const queue: VisitedState[] = [{ state: flow.initialState, path: [] }];
  const violations: InvariantViolation[] = [];
  const violationKeys = new Set<string>();

  let successReachable: ReachabilityResult = { stateId: flow.successLabel, reachable: false, path: null };
  const protectedBreaches: ReachabilityResult[] = [];
  const breachedLabels = new Set<string>();

  let actionsAttempted = 0;
  let exhausted = true;

  const checkState = (visited: VisitedState): void => {
    for (const inv of flow.invariants) {
      if (!inv.holds(visited.state)) {
        const key = `${inv.id}:${stateKey(visited.state)}`;
        if (!violationKeys.has(key)) {
          violationKeys.add(key);
          violations.push({
            invariantId: inv.id, description: inv.description, severity: inv.severity,
            reproductionPath: visited.path, violatingState: visited.state,
          });
        }
      }
    }
    if (!successReachable.reachable && flow.successPredicate(visited.state)) {
      successReachable = { stateId: flow.successLabel, reachable: true, path: visited.path };
    }
    for (const prot of flow.protectedStates) {
      if (breachedLabels.has(prot.label)) continue;
      if (prot.reached(visited.state) && !prot.prerequisite(visited.state)) {
        breachedLabels.add(prot.label);
        protectedBreaches.push({ stateId: prot.label, reachable: true, path: visited.path });
      }
    }
  };

  seen.add(stateKey(flow.initialState));
  checkState({ state: flow.initialState, path: [] });

  while (queue.length > 0) {
    if (signal?.aborted === true) { exhausted = false; break; }
    if (seen.size >= maxStates) { exhausted = false; break; }

    const current = queue.shift();
    if (current === undefined) continue;

    for (const action of flow.actions) {
      if (seen.size >= maxStates) { exhausted = false; break; }
      actionsAttempted += 1;

      let nextState: FlowState;
      try { nextState = await action.apply(current.state); }
      catch { continue; }

      const key = stateKey(nextState);
      if (seen.has(key)) continue;
      seen.add(key);

      const visited: VisitedState = { state: nextState, path: [...current.path, action.name] };
      checkState(visited);
      queue.push(visited);
    }
  }

  return { statesVisited: seen.size, actionsAttempted, violations, successReachable, protectedBreaches, exhausted };
}

/** Common invariant builders. The library grows as real flows teach us rules. */
export const invariants = {
  neverNegative(field: string, severity: Invariant['severity'] = 'BLOCKER'): Invariant {
    return {
      id: `never-negative:${field}`,
      description: `"${field}" must never be negative — a negative price lets a user be paid to buy.`,
      holds: (s) => typeof s[field] !== 'number' || (s[field] as number) >= 0,
      severity,
    };
  },
  totalEquals(totalField: string, partFields: readonly string[]): Invariant {
    return {
      id: `total-equals:${totalField}`,
      description: `"${totalField}" must equal the sum of ${partFields.join(' + ')}.`,
      holds: (s) => {
        const total = s[totalField];
        if (typeof total !== 'number') return true;
        const sum = partFields.reduce((a, f) => a + (typeof s[f] === 'number' ? (s[f] as number) : 0), 0);
        return Math.abs(total - sum) < 0.001;
      },
      severity: 'HIGH',
    };
  },
  atMost(field: string, cap: number, severity: Invariant['severity'] = 'HIGH'): Invariant {
    return {
      id: `at-most:${field}:${cap}`,
      description: `"${field}" must never exceed ${cap} — e.g. a one-time reward granted twice.`,
      holds: (s) => typeof s[field] !== 'number' || (s[field] as number) <= cap,
      severity,
    };
  },
  implies(ifField: string, thenField: string, severity: Invariant['severity'] = 'BLOCKER'): Invariant {
    return {
      id: `implies:${ifField}=>${thenField}`,
      description: `If "${ifField}" is true then "${thenField}" must be true — e.g. an order is confirmed only if paid.`,
      holds: (s) => s[ifField] !== true || s[thenField] === true,
      severity,
    };
  },
};

import type {
  CanonicalPlanState,
  PlanLeftover,
  StackOption
} from "@/lib/agentic/plan/types";

export type PlanMatchOutcome = Readonly<{
  alternatives: readonly StackOption[];
  leftovers: readonly PlanLeftover[];
  selected: StackOption | null;
}>;

export type PlanMatchPort = Readonly<{
  getCallCount: () => number;
  match: (state: CanonicalPlanState) => PlanMatchOutcome;
  reset: () => void;
}>;

export function createCountingMatchPort(
  match: (state: CanonicalPlanState) => PlanMatchOutcome
): PlanMatchPort {
  let calls = 0;
  return {
    getCallCount: () => calls,
    match: (state) => {
      calls += 1;
      return match(state);
    },
    reset: () => {
      calls = 0;
    }
  };
}

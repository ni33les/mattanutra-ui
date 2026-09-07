import { handleJsonRpc as dispatchJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { planTool as runPlanTool } from '../../lib/agentic/plan/service.ts';
import { matchPlan as runMatchPlan } from '../../lib/agentic/plan/matching.ts';
import { evaluateSafety as runPlanSafety } from '../../lib/agentic/plan/safety.ts';
import { catalogueSnapshotId } from '../../lib/agentic/catalogue/freeze.ts';
import { matcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { recordMcpCall, recordMcpCallSync } from './mcp-evidence.ts';

export const handleJsonRpc: typeof dispatchJsonRpc = (runtime, body) =>
  recordMcpCall(body, () => dispatchJsonRpc(runtime, body));

// Some maintained value cases exercise the same public plan service directly.
export const planTool: typeof runPlanTool = input =>
  recordMcpCall({ method: 'plan', payload: input.payload }, () => runPlanTool(input));

export const matchPlan: typeof runMatchPlan = input =>
  recordMcpCallSync({ method: 'matcher.matchPlan', state: input.state,
    catalogueId: catalogueSnapshotId(input.snapshot), safetyCeilings: matcherSafetyCeilings()
  }, () => runMatchPlan(input));

export const evaluateSafety: typeof runPlanSafety = input =>
  recordMcpCallSync({ method: 'matcher.evaluateSafety', payload: input }, () => runPlanSafety(input));

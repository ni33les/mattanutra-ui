export const RETAIL_AGENT_EXECUTABLE_TASK_TYPES = [
  "retail_customer_order_allocate",
  "retail_shopping_list_review",
  "retail_stock_forecast_refresh"
] as const;

export const RETAIL_HUMAN_WORKFLOW_TASK_TYPES = [
  "retail_order_cancel_review",
  "retail_order_delivery_confirm",
  "retail_order_pack",
  "retail_order_pick",
  "retail_order_return_review",
  "retail_order_ship"
] as const;

export const RETAIL_ORDER_WORKFLOW_TASK_TYPES = [
  "retail_customer_order_allocate",
  "retail_shopping_list_review",
  ...RETAIL_HUMAN_WORKFLOW_TASK_TYPES
] as const;

export type RetailAgentExecutableTaskType =
  (typeof RETAIL_AGENT_EXECUTABLE_TASK_TYPES)[number];

const agentExecutableTaskTypes = new Set<string>(
  RETAIL_AGENT_EXECUTABLE_TASK_TYPES
);

export function isRetailAgentExecutableTaskType(
  taskType: string
): taskType is RetailAgentExecutableTaskType {
  return agentExecutableTaskTypes.has(taskType);
}

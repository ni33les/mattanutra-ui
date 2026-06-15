import { createHash } from "node:crypto";
import {
  recordAdminAudit,
  type AdminSessionContext
} from "@/lib/admin-access";
import { hasAdminPermission, type AdminPermission } from "@/lib/admin-rbac";
import { writeBpmEvent, type BpmActorType } from "@/lib/bpm";
import { getSql } from "@/lib/db";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { addTaskEvent, createTask } from "@/lib/task-service";

export type RetailCommandActorKind = "agent" | "human" | "system";
export type RetailCommandTaskPolicy =
  | "admin_bypass"
  | "completes_task"
  | "requires_task"
  | "review_after"
  | "silent_derived";
export type RetailCommandRiskClass =
  | "maintenance"
  | "order_workflow"
  | "pricing"
  | "purchasing"
  | "stock_quantity";
export type RetailCommandAgentExecution =
  | "disabled"
  | "execute_low_risk"
  | "propose_only";
export type RetailCommandIdempotencyStrategy =
  | "payload_hash"
  | "resource_action"
  | "task_resource"
  | "task_scope";

export type RetailCommandId =
  | "advance_customer_order"
  | "allocate_customer_order"
  | "book_order_pickup"
  | "configure_carrier_account"
  | "create_customer_order"
  | "create_order_shipment"
  | "create_shopping_list"
  | "generate_order_shipping_label"
  | "process_carrier_shipment_event"
  | "record_stock_movement"
  | "reconcile_customer_order_lifecycle"
  | "replay_carrier_shipment_event"
  | "refresh_stock_reorder_advice"
  | "reopen_shopping_list"
  | "set_stock_status"
  | "sync_order_tracking"
  | "sync_order_shortages_to_reorder_advice"
  | "test_carrier_account"
  | "update_shopping_list"
  | "upsert_stock_item"
  | "void_stock_movement";

export type RetailCommandDefinition = Readonly<{
  agentExecution: RetailCommandAgentExecution;
  allowedActorKinds: readonly RetailCommandActorKind[];
  auditEvent: string;
  bpmEvent: string;
  id: RetailCommandId;
  idempotencyStrategy: RetailCommandIdempotencyStrategy;
  permission: AdminPermission;
  requiredAgentCapability: string | null;
  resourceType: string;
  riskClass: RetailCommandRiskClass;
  routeAction: boolean;
  taskPolicy: RetailCommandTaskPolicy;
  taskTypes: readonly string[];
}>;

type RetailCommandExecutionResult<T> = Readonly<{
  resourceId?: string | null;
  resourceType?: string | null;
  result: T;
}>;

type RetailCommandTaskRow = Readonly<{
  id: string;
  idempotency_key: string | null;
  organisation_id: string;
  required_capabilities: string[];
  source_entity_id: string | null;
  source_entity_type: string | null;
  status: string;
  task_type: string;
}>;

export const retailCommandRegistry = {
  advance_customer_order: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.advance_customer_order",
    bpmEvent: "retail_command_advance_customer_order",
    id: "advance_customer_order",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_customer_order",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "completes_task",
    taskTypes: [
      "retail_order_cancel_review",
      "retail_order_delivery_confirm",
      "retail_order_pick",
      "retail_order_pack",
      "retail_order_return_review",
      "retail_order_ship"
    ]
  },
  book_order_pickup: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "human"],
    auditEvent: "admin.retail_command.book_order_pickup",
    bpmEvent: "retail_command_book_order_pickup",
    id: "book_order_pickup",
    idempotencyStrategy: "resource_action",
    permission: "shipments.write",
    requiredAgentCapability: AGENT_CAPABILITIES.carrierPickupBook,
    resourceType: "retail_order_shipment",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["carrier_pickup_book"]
  },
  allocate_customer_order: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["human", "agent"],
    auditEvent: "admin.retail_command.allocate_customer_order",
    bpmEvent: "retail_command_allocate_customer_order",
    id: "allocate_customer_order",
    idempotencyStrategy: "task_resource",
    permission: "stock.write",
    requiredAgentCapability: AGENT_CAPABILITIES.retailStockPolicyReview,
    resourceType: "retail_customer_order",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "completes_task",
    taskTypes: ["retail_customer_order_allocate"]
  },
  create_customer_order: {
    agentExecution: "disabled",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.create_customer_order",
    bpmEvent: "retail_command_create_customer_order",
    id: "create_customer_order",
    idempotencyStrategy: "payload_hash",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_customer_order",
    riskClass: "maintenance",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  configure_carrier_account: {
    agentExecution: "disabled",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.configure_carrier_account",
    bpmEvent: "retail_command_configure_carrier_account",
    id: "configure_carrier_account",
    idempotencyStrategy: "payload_hash",
    permission: "shipments.configure",
    requiredAgentCapability: null,
    resourceType: "retail_carrier_account",
    riskClass: "maintenance",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  create_order_shipment: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "human"],
    auditEvent: "admin.retail_command.create_order_shipment",
    bpmEvent: "retail_command_create_order_shipment",
    id: "create_order_shipment",
    idempotencyStrategy: "resource_action",
    permission: "shipments.write",
    requiredAgentCapability: AGENT_CAPABILITIES.carrierShipmentCreate,
    resourceType: "retail_order_shipment",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["carrier_shipment_create"]
  },
  create_shopping_list: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.create_shopping_list",
    bpmEvent: "retail_command_create_shopping_list",
    id: "create_shopping_list",
    idempotencyStrategy: "payload_hash",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_shopping_list",
    riskClass: "purchasing",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["retail_shopping_list_review"]
  },
  generate_order_shipping_label: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "human"],
    auditEvent: "admin.retail_command.generate_order_shipping_label",
    bpmEvent: "retail_command_generate_order_shipping_label",
    id: "generate_order_shipping_label",
    idempotencyStrategy: "resource_action",
    permission: "shipments.write",
    requiredAgentCapability: AGENT_CAPABILITIES.carrierLabelGenerate,
    resourceType: "retail_order_shipment",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["carrier_label_generate"]
  },
  process_carrier_shipment_event: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "system"],
    auditEvent: "admin.retail_command.process_carrier_shipment_event",
    bpmEvent: "retail_command_process_carrier_shipment_event",
    id: "process_carrier_shipment_event",
    idempotencyStrategy: "task_resource",
    permission: "shipments.write",
    requiredAgentCapability: AGENT_CAPABILITIES.carrierEventProcess,
    resourceType: "retail_order_shipment_event",
    riskClass: "order_workflow",
    routeAction: false,
    taskPolicy: "requires_task",
    taskTypes: ["carrier_event_process"]
  },
  record_stock_movement: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.record_stock_movement",
    bpmEvent: "retail_command_record_stock_movement",
    id: "record_stock_movement",
    idempotencyStrategy: "payload_hash",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_stock_movement",
    riskClass: "stock_quantity",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  reconcile_customer_order_lifecycle: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["human", "agent"],
    auditEvent: "admin.retail_command.reconcile_customer_order_lifecycle",
    bpmEvent: "retail_command_reconcile_customer_order_lifecycle",
    id: "reconcile_customer_order_lifecycle",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: AGENT_CAPABILITIES.retailStockPolicyReview,
    resourceType: "retail_customer_order",
    riskClass: "order_workflow",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: [
      "retail_customer_order_allocate",
      "retail_order_delivery_confirm",
      "retail_order_ship",
      "retail_shopping_list_review"
    ]
  },
  replay_carrier_shipment_event: {
    agentExecution: "disabled",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.replay_carrier_shipment_event",
    bpmEvent: "retail_command_replay_carrier_shipment_event",
    id: "replay_carrier_shipment_event",
    idempotencyStrategy: "resource_action",
    permission: "shipments.write",
    requiredAgentCapability: null,
    resourceType: "retail_order_shipment_event",
    riskClass: "maintenance",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["carrier_event_process"]
  },
  refresh_stock_reorder_advice: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "system"],
    auditEvent: "admin.retail_command.refresh_stock_reorder_advice",
    bpmEvent: "retail_command_refresh_stock_reorder_advice",
    id: "refresh_stock_reorder_advice",
    idempotencyStrategy: "task_scope",
    permission: "stock.write",
    requiredAgentCapability: AGENT_CAPABILITIES.retailStockForecast,
    resourceType: "retail_stock_reorder_advice",
    riskClass: "maintenance",
    routeAction: false,
    taskPolicy: "requires_task",
    taskTypes: ["retail_stock_forecast_refresh"]
  },
  reopen_shopping_list: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.reopen_shopping_list",
    bpmEvent: "retail_command_reopen_shopping_list",
    id: "reopen_shopping_list",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_shopping_list",
    riskClass: "purchasing",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["retail_shopping_list_review"]
  },
  set_stock_status: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.set_stock_status",
    bpmEvent: "retail_command_set_stock_status",
    id: "set_stock_status",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_product_stock",
    riskClass: "stock_quantity",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  sync_order_tracking: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "human", "system"],
    auditEvent: "admin.retail_command.sync_order_tracking",
    bpmEvent: "retail_command_sync_order_tracking",
    id: "sync_order_tracking",
    idempotencyStrategy: "resource_action",
    permission: "shipments.write",
    requiredAgentCapability: AGENT_CAPABILITIES.carrierTrackingSync,
    resourceType: "retail_order_shipment",
    riskClass: "maintenance",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["carrier_tracking_sync"]
  },
  sync_order_shortages_to_reorder_advice: {
    agentExecution: "execute_low_risk",
    allowedActorKinds: ["agent", "human", "system"],
    auditEvent: "admin.retail_command.sync_order_shortages_to_reorder_advice",
    bpmEvent: "retail_command_sync_order_shortages_to_reorder_advice",
    id: "sync_order_shortages_to_reorder_advice",
    idempotencyStrategy: "task_resource",
    permission: "stock.write",
    requiredAgentCapability: AGENT_CAPABILITIES.retailStockPolicyReview,
    resourceType: "retail_stock_reorder_advice",
    riskClass: "maintenance",
    routeAction: false,
    taskPolicy: "silent_derived",
    taskTypes: ["retail_shopping_list_review"]
  },
  test_carrier_account: {
    agentExecution: "disabled",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.test_carrier_account",
    bpmEvent: "retail_command_test_carrier_account",
    id: "test_carrier_account",
    idempotencyStrategy: "resource_action",
    permission: "shipments.configure",
    requiredAgentCapability: null,
    resourceType: "retail_carrier_account",
    riskClass: "maintenance",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  update_shopping_list: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.update_shopping_list",
    bpmEvent: "retail_command_update_shopping_list",
    id: "update_shopping_list",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_shopping_list",
    riskClass: "purchasing",
    routeAction: true,
    taskPolicy: "silent_derived",
    taskTypes: ["retail_shopping_list_review"]
  },
  upsert_stock_item: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.upsert_stock_item",
    bpmEvent: "retail_command_upsert_stock_item",
    id: "upsert_stock_item",
    idempotencyStrategy: "payload_hash",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_product_stock",
    riskClass: "pricing",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  },
  void_stock_movement: {
    agentExecution: "propose_only",
    allowedActorKinds: ["human"],
    auditEvent: "admin.retail_command.void_stock_movement",
    bpmEvent: "retail_command_void_stock_movement",
    id: "void_stock_movement",
    idempotencyStrategy: "resource_action",
    permission: "stock.write",
    requiredAgentCapability: null,
    resourceType: "retail_stock_movement",
    riskClass: "stock_quantity",
    routeAction: true,
    taskPolicy: "admin_bypass",
    taskTypes: []
  }
} satisfies Record<RetailCommandId, RetailCommandDefinition>;

export const retailCommandIds = Object.keys(
  retailCommandRegistry
) as RetailCommandId[];

export const retailRouteCommandIds = retailCommandIds.filter(
  (commandId) => retailCommandRegistry[commandId].routeAction
);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceEntityIdFromPayload(payload: unknown) {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  return text(record.customerOrderId) ||
    text(record.eventId) ||
    text(record.shoppingListId) ||
    text(record.shipmentId) ||
    text(record.stockId) ||
    text(record.movementId) ||
    text(record.productId) ||
    null;
}

function bpmActorKind(actorKind: RetailCommandActorKind): BpmActorType {
  if (actorKind === "human") {
    return "admin";
  }

  return actorKind === "agent" ? "worker" : "system";
}

export function getRetailCommand(
  commandId: string
): RetailCommandDefinition | null {
  return (retailCommandRegistry as Record<string, RetailCommandDefinition>)[commandId] ?? null;
}

export function retailCommandIdempotencyKey(
  commandId: RetailCommandId,
  payload: unknown,
  taskId?: string | null
) {
  const entry = retailCommandRegistry[commandId];
  const subject =
    entry.idempotencyStrategy === "task_scope" && taskId
      ? `${commandId}:${taskId}`
      : entry.idempotencyStrategy === "task_resource" && taskId
        ? `${commandId}:${taskId}:${sourceEntityIdFromPayload(payload) ?? "none"}`
        : entry.idempotencyStrategy === "resource_action"
          ? `${commandId}:${sourceEntityIdFromPayload(payload) ?? stableJson(payload)}`
          : `${commandId}:${stableJson(payload)}`;

  return createHash("sha256").update(subject).digest("hex");
}

export function assertRetailCommandActor(input: Readonly<{
  actorKind: RetailCommandActorKind;
  command: RetailCommandDefinition;
  context?: AdminSessionContext | null;
}>) {
  if (!input.command.allowedActorKinds.includes(input.actorKind)) {
    throw new Error(`Retail command ${input.command.id} is not available to ${input.actorKind}`);
  }

  if (input.actorKind === "agent" && input.command.agentExecution !== "execute_low_risk") {
    throw new Error(`Retail command ${input.command.id} is not agent-executable`);
  }

  if (
    input.context &&
    input.command.permission &&
    !hasAdminPermission(input.context, input.command.permission)
  ) {
    throw new Error(`Retail command ${input.command.id} requires ${input.command.permission}`);
  }
}

export async function recordRetailCommandAudit(input: Readonly<{
  actorKind: RetailCommandActorKind;
  command: RetailCommandDefinition;
  context?: AdminSessionContext | null;
  idempotencyKey: string;
  organisationId?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
  taskId?: string | null;
}>) {
  await recordAdminAudit({
    action: input.command.auditEvent,
    actorPersonId: input.context?.actorPerson.id ?? null,
    assumedPersonId: input.context?.assumedPerson?.id ?? null,
    organisationId:
      input.organisationId ??
      input.context?.effectiveOrganisation.id ??
      null,
    resourceId: input.resourceId ?? null,
    resourceType: input.resourceType ?? input.command.resourceType,
    metadata: {
      actorKind: input.actorKind,
      agentExecution: input.command.agentExecution,
      commandId: input.command.id,
      idempotencyKey: input.idempotencyKey,
      riskClass: input.command.riskClass,
      taskId: input.taskId ?? null,
      taskPolicy: input.command.taskPolicy
    }
  });
}

export async function recordRetailCommandBpm(input: Readonly<{
  actorKind: RetailCommandActorKind;
  command: RetailCommandDefinition;
  context?: AdminSessionContext | null;
  idempotencyKey: string;
  organisationId?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
  status: "failed" | "rejected" | "succeeded";
  taskId?: string | null;
}>) {
  await writeBpmEvent({
    actorType: bpmActorKind(input.actorKind),
    emittedBy: "retail_command_registry",
    eventName: input.command.bpmEvent,
    eventStatus: input.status,
    eventType: "fulfillment",
    locale: input.context?.effectivePerson.preferredLocale ?? null,
    properties: {
      actorKind: input.actorKind,
      agentExecution: input.command.agentExecution,
      commandId: input.command.id,
      idempotencyKey: input.idempotencyKey,
      organisationId:
        input.organisationId ??
        input.context?.effectiveOrganisation.id ??
        null,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? input.command.resourceType,
      riskClass: input.command.riskClass,
      taskId: input.taskId ?? null,
      taskPolicy: input.command.taskPolicy
    },
    severity: input.status === "succeeded" ? "low" : "medium"
  });
}

export async function executeRetailCommand<T>(input: Readonly<{
  actorKind: RetailCommandActorKind;
  commandId: RetailCommandId;
  context: AdminSessionContext;
  handler: () => Promise<RetailCommandExecutionResult<T>>;
  payload: unknown;
  taskId?: string | null;
}>) {
  const command = retailCommandRegistry[input.commandId];
  const idempotencyKey = retailCommandIdempotencyKey(
    input.commandId,
    input.payload,
    input.taskId
  );

  assertRetailCommandActor({
    actorKind: input.actorKind,
    command,
    context: input.context
  });

  try {
    const output = await input.handler();

    await recordRetailCommandAudit({
      actorKind: input.actorKind,
      command,
      context: input.context,
      idempotencyKey,
      resourceId: output.resourceId ?? null,
      resourceType: output.resourceType ?? command.resourceType,
      taskId: input.taskId ?? null
    });
    await recordRetailCommandBpm({
      actorKind: input.actorKind,
      command,
      context: input.context,
      idempotencyKey,
      resourceId: output.resourceId ?? null,
      resourceType: output.resourceType ?? command.resourceType,
      status: "succeeded",
      taskId: input.taskId ?? null
    });

    return output.result;
  } catch (error) {
    await recordRetailCommandBpm({
      actorKind: input.actorKind,
      command,
      context: input.context,
      idempotencyKey,
      status: "failed",
      taskId: input.taskId ?? null
    });

    throw error;
  }
}

export async function ensureRetailCommandTask(input: Readonly<{
  commandId: RetailCommandId;
  description: string;
  idempotencyKey: string;
  organisationId: string;
  payload?: Record<string, unknown>;
  priorityReason: string;
  priorityScore: number;
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  taskType: string;
  title: string;
}>) {
  const command = retailCommandRegistry[input.commandId];
  const workerExecutable = command.agentExecution === "execute_low_risk";

  return createTask({
    actorType: workerExecutable ? "system" : "human",
    businessValue: input.priorityScore,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    idempotencyScope: "active",
    idempotencyScopeKey: input.taskType,
    organisationId: input.organisationId,
    payload: {
      ...(input.payload ?? {}),
      commandId: input.commandId,
      priorityReason: input.priorityReason,
      sourceEntityId: input.sourceEntityId ?? null,
      sourceEntityType: input.sourceEntityType ?? null
    },
    priorityReason: input.priorityReason,
    priorityScore: input.priorityScore,
    requiredCapabilities: workerExecutable && command.requiredAgentCapability
      ? [command.requiredAgentCapability]
      : [],
    sourceEntityId: input.sourceEntityId ?? null,
    sourceEntityType: input.sourceEntityType ?? null,
    taskType: input.taskType,
    title: input.title
  });
}

export async function completeRetailCommandTask(input: Readonly<{
  commandId: RetailCommandId;
  result?: Record<string, unknown>;
  taskId: string;
}>) {
  await addTaskEvent({
    eventPayload: {
      commandId: input.commandId,
      ...(input.result ?? {})
    },
    eventStatus: "succeeded",
    eventType: "retail_command_task_completed",
    severity: "low",
    taskId: input.taskId
  });
}

export async function assertRetailAgentCommandTask(input: Readonly<{
  commandId: RetailCommandId;
  organisationId: string;
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  taskId: string;
}>) {
  const command = retailCommandRegistry[input.commandId];

  assertRetailCommandActor({ actorKind: "agent", command });

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const taskRows = await sql<RetailCommandTaskRow[]>`
    select
      id::text,
      organisation_id::text,
      task_type,
      status,
      source_entity_id::text,
      source_entity_type,
      coalesce(required_capabilities, array[]::text[]) as required_capabilities,
      idempotency_key
    from public.tasks
    where id = ${input.taskId}::uuid
    limit 1
  `;
  const task = taskRows[0];

  if (!task) {
    throw new Error("Retail command task not found");
  }

  if (!["queued", "reserved", "running", "needs_review", "waiting_approval"].includes(task.status)) {
    throw new Error("Retail command task is not active");
  }

  if (!task.idempotency_key) {
    throw new Error("Retail command task is missing an idempotency key");
  }

  if (task.organisation_id !== input.organisationId) {
    throw new Error("Retail command task organisation does not match");
  }

  const commandTaskTypes: readonly string[] = command.taskTypes;

  if (!commandTaskTypes.includes(task.task_type)) {
    throw new Error("Retail command task type does not match command");
  }

  if (
    input.sourceEntityType &&
    task.source_entity_type &&
    task.source_entity_type !== input.sourceEntityType
  ) {
    throw new Error("Retail command task source type does not match");
  }

  if (
    input.sourceEntityId &&
    task.source_entity_id &&
    task.source_entity_id !== input.sourceEntityId
  ) {
    throw new Error("Retail command task source entity does not match");
  }

  if (
    command.requiredAgentCapability &&
    !task.required_capabilities.includes(command.requiredAgentCapability)
  ) {
    throw new Error("Retail command task is missing required agent capability");
  }

  return task;
}

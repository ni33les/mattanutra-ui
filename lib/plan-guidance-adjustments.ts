import type postgres from "postgres";
import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FormulationBlueprint,
  FormulationIngredient,
  LocalizedText,
  PlanGuidanceAdjustment
} from "@/lib/formulation-types";
import { localizedTextSearchValue, resolveLocalizedText } from "@/lib/i18n";

type Db = postgres.Sql | postgres.TransactionSql;

function toJsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizedGuidanceText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function localizedText(value: LocalizedText | undefined) {
  return localizedTextSearchValue(value);
}

function localizedDisplay(value: LocalizedText | undefined) {
  return resolveLocalizedText(value, "en");
}

function itemSearchText(item: FormulationIngredient | FoodGuidanceItem) {
  if ("supplement" in item) {
    return normalizedGuidanceText(
      [item.id, localizedText(item.supplement), item.category].join(" ")
    );
  }

  return normalizedGuidanceText(
    [item.id, localizedText(item.food), item.category].join(" ")
  );
}

function itemDisplayName(item: FormulationIngredient | FoodGuidanceItem) {
  return "supplement" in item
    ? localizedDisplay(item.supplement)
    : localizedDisplay(item.food);
}

function itemMatchesAdjustment(
  item: FormulationIngredient | FoodGuidanceItem,
  adjustment: PlanGuidanceAdjustment
) {
  const itemId = normalizedGuidanceText(item.id);
  const adjustmentId = normalizedGuidanceText(adjustment.itemId ?? "");
  const adjustmentName = normalizedGuidanceText(adjustment.itemName);
  const searchText = itemSearchText(item);

  if (adjustmentId && adjustmentId === itemId) {
    return true;
  }

  return Boolean(
    adjustmentName &&
      (searchText.includes(adjustmentName) ||
        adjustmentName.includes(normalizedGuidanceText(itemDisplayName(item))))
  );
}

function activeRemovals(
  adjustments: readonly PlanGuidanceAdjustment[],
  itemType: PlanGuidanceAdjustment["itemType"]
) {
  return adjustments.filter(
    (adjustment) =>
      adjustment.action === "remove" &&
      adjustment.itemType === itemType &&
      (adjustment.status ?? "active") === "active"
  );
}

export function applyPlanGuidanceAdjustmentsToFormulation(
  formulation: FormulationBlueprint,
  adjustments: readonly PlanGuidanceAdjustment[]
): FormulationBlueprint {
  const removals = activeRemovals(adjustments, "supplement");

  if (removals.length < 1) {
    return formulation;
  }

  return {
    ...formulation,
    supplementBreakdown: formulation.supplementBreakdown.filter(
      (item) =>
        !removals.some((adjustment) => itemMatchesAdjustment(item, adjustment))
    )
  };
}

export function applyPlanGuidanceAdjustmentsToFoodGuidance(
  foodGuidance: FoodGuidanceBlueprint,
  adjustments: readonly PlanGuidanceAdjustment[]
): FoodGuidanceBlueprint {
  const removals = activeRemovals(adjustments, "food");

  if (removals.length < 1) {
    return foodGuidance;
  }

  return {
    ...foodGuidance,
    foodGuidance: foodGuidance.foodGuidance.filter(
      (item) =>
        !removals.some((adjustment) => itemMatchesAdjustment(item, adjustment))
    )
  };
}

export async function loadActivePlanGuidanceAdjustments(
  sql: Db,
  planId: string
) {
  const rows = await sql<Array<{
    action: "remove";
    created_at: Date;
    id: string;
    item_id: string | null;
    item_name: string;
    item_type: "food" | "supplement";
    reason: string | null;
    source_message_id: string | null;
    source_task_id: string | null;
    status: "active" | "revoked";
  }>>`
    select
      id::text,
      action,
      item_type,
      item_id,
      item_name,
      reason,
      status,
      source_message_id::text,
      source_task_id::text,
      created_at
    from public.plan_guidance_adjustments
    where plan_id = ${planId}::uuid
      and status = 'active'
    order by created_at asc
  `;

  return rows.map((row) => ({
    action: row.action,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemType: row.item_type,
    reason: row.reason,
    sourceMessageId: row.source_message_id,
    sourceTaskId: row.source_task_id,
    status: row.status
  })) satisfies PlanGuidanceAdjustment[];
}

function normalizeAiAdjustment(value: unknown): PlanGuidanceAdjustment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const action = textValue(record.action);
  const itemType = textValue(record.itemType);
  const itemName = textValue(record.itemName);

  if (
    action !== "remove" ||
    (itemType !== "food" && itemType !== "supplement") ||
    !itemName
  ) {
    return null;
  }

  return {
    action,
    itemId: textValue(record.itemId) || null,
    itemName,
    itemType,
    reason: textValue(record.reason) || null
  };
}

function itemRemovalRequested(userMessage: string, itemName: string) {
  const message = normalizedGuidanceText(userMessage);
  const name = normalizedGuidanceText(itemName);

  return Boolean(
    name &&
      message.includes(name) &&
      /\b(remove|drop|skip|avoid|exclude|dont|don't|do not|hate|dislike|no)\b/i.test(
        userMessage
      )
  );
}

export function inferGuidanceRemovalAdjustments(
  input: Readonly<{
    foodGuidance?: FoodGuidanceBlueprint | null;
    formulation?: FormulationBlueprint | null;
    userMessage: string;
  }>
) {
  const adjustments: PlanGuidanceAdjustment[] = [];

  for (const item of input.formulation?.supplementBreakdown ?? []) {
    const displayName = itemDisplayName(item);

    if (itemRemovalRequested(input.userMessage, displayName)) {
      adjustments.push({
        action: "remove",
        itemId: item.id,
        itemName: displayName,
        itemType: "supplement",
        reason: "Client requested removal in chat."
      });
    }
  }

  for (const item of input.foodGuidance?.foodGuidance ?? []) {
    const displayName = itemDisplayName(item);

    if (itemRemovalRequested(input.userMessage, displayName)) {
      adjustments.push({
        action: "remove",
        itemId: item.id,
        itemName: displayName,
        itemType: "food",
        reason: "Client requested removal in chat."
      });
    }
  }

  return adjustments;
}

function mergeAdjustments(
  adjustments: readonly PlanGuidanceAdjustment[]
) {
  const seen = new Set<string>();
  const merged: PlanGuidanceAdjustment[] = [];

  for (const adjustment of adjustments) {
    const key = [
      adjustment.action,
      adjustment.itemType,
      normalizedGuidanceText(adjustment.itemId ?? ""),
      normalizedGuidanceText(adjustment.itemName)
    ].join(":");

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(adjustment);
    }
  }

  return merged;
}

export function normalizeGuidanceAdjustments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeAiAdjustment)
    .filter(Boolean)
    .slice(0, 20) as PlanGuidanceAdjustment[];
}

export async function savePlanGuidanceAdjustments(
  sql: Db,
  input: Readonly<{
    adjustments: readonly PlanGuidanceAdjustment[];
    messageId: string;
    planId: string;
    taskId: string;
    userMessage: string;
  }>
) {
  const adjustments = mergeAdjustments(input.adjustments);

  for (const adjustment of adjustments) {
    const normalizedName = normalizedGuidanceText(adjustment.itemName);

    if (!normalizedName) {
      continue;
    }

    await sql`
      insert into public.plan_guidance_adjustments (
        id,
        plan_id,
        source_message_id,
        source_task_id,
        action,
        item_type,
        item_id,
        item_name,
        normalized_item_name,
        reason,
        status,
        metadata,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        ${input.planId}::uuid,
        ${input.messageId}::uuid,
        ${input.taskId}::uuid,
        ${adjustment.action},
        ${adjustment.itemType},
        ${adjustment.itemId ?? null},
        ${adjustment.itemName},
        ${normalizedName},
        ${adjustment.reason ?? null},
        'active',
        ${sql.json(toJsonValue({ userMessage: input.userMessage }))}::jsonb,
        now(),
        now()
      )
      on conflict do nothing
    `;
  }

  return adjustments.length;
}

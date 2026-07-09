import { closeSqlPool, getSql } from "@/lib/db";
import { allLocales } from "@/lib/i18n";

type ColumnRow = Readonly<{
  columnName: string;
  dataType: string;
  isNullable: string;
  tableName: string;
}>;

type ConstraintRow = Readonly<{
  definition: string;
  name: string;
  tableName: string;
}>;

type IndexRow = Readonly<{
  definition: string;
  name: string;
  tableName: string;
}>;

type PrivilegeRow = Readonly<{
  canDelete: boolean;
  canInsert: boolean;
  canSelect: boolean;
  canUpdate: boolean;
  tableName: string;
}>;

type TriggerRow = Readonly<{
  name: string;
  tableName: string;
}>;

const requiredTables = [
  "admin_product_coverage_demand_profile_cache",
  "payment_versions",
  "payments",
  "products",
  "stripe_webhook_events",
  "supplement_country_availability"
] as const;

const failures: string[] = [];

function normalizeDefinition(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").toLowerCase();
}

function tableColumnKey(tableName: string, columnName: string) {
  return `${tableName}.${columnName}`;
}

function addFailure(message: string) {
  failures.push(message);
}

function requireColumn(
  columns: Map<string, ColumnRow>,
  tableName: string,
  columnName: string,
  options: { dataType?: string; notNull?: boolean } = {}
) {
  const column = columns.get(tableColumnKey(tableName, columnName));

  if (!column) {
    addFailure(`${tableName}.${columnName} is missing`);
    return;
  }

  if (options.dataType && column.dataType !== options.dataType) {
    addFailure(
      `${tableName}.${columnName} should be ${options.dataType}, found ${column.dataType}`
    );
  }

  if (options.notNull === true && column.isNullable !== "NO") {
    addFailure(`${tableName}.${columnName} should be not null`);
  }
}

function requireConstraint(
  constraints: Map<string, ConstraintRow>,
  tableName: string,
  name: string,
  expectedParts: readonly string[] = []
) {
  const constraint = constraints.get(tableColumnKey(tableName, name));

  if (!constraint) {
    addFailure(`${tableName}.${name} constraint is missing`);
    return;
  }

  const definition = normalizeDefinition(constraint.definition);

  for (const part of expectedParts) {
    if (!definition.includes(part.toLowerCase())) {
      addFailure(`${tableName}.${name} does not include ${part}`);
    }
  }
}

function requireIndex(
  indexes: Map<string, IndexRow>,
  tableName: string,
  name: string,
  expectedParts: readonly string[] = []
) {
  const index = indexes.get(tableColumnKey(tableName, name));

  if (!index) {
    addFailure(`${tableName}.${name} index is missing`);
    return;
  }

  const definition = normalizeDefinition(index.definition);

  for (const part of expectedParts) {
    if (!definition.includes(part.toLowerCase())) {
      addFailure(`${tableName}.${name} does not include ${part}`);
    }
  }
}

function requireReadWritePrivilege(privileges: Map<string, PrivilegeRow>, tableName: string) {
  const privilege = privileges.get(tableName);

  if (!privilege) {
    addFailure(`${tableName} privilege row is missing`);
    return;
  }

  if (
    !privilege.canSelect ||
    !privilege.canInsert ||
    !privilege.canUpdate ||
    !privilege.canDelete
  ) {
    addFailure(`${tableName} is missing select/insert/update/delete for the runtime role`);
  }
}

function requireTrigger(
  triggers: Map<string, TriggerRow>,
  tableName: string,
  name: string
) {
  if (!triggers.has(tableColumnKey(tableName, name))) {
    addFailure(`${tableName}.${name} trigger is missing`);
  }
}

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to verify dev runtime schema");
}

try {
  const [tables, columns, constraints, indexes, privileges, triggers] =
    await Promise.all([
      sql<Array<{ tableName: string }>>`
        select table_name as "tableName"
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ${sql([...requiredTables])}
      `,
      sql<Array<ColumnRow>>`
        select
          table_name as "tableName",
          column_name as "columnName",
          data_type as "dataType",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ${sql([...requiredTables])}
      `,
      sql<Array<ConstraintRow>>`
        select
          class.relname as "tableName",
          constraint_record.conname as "name",
          pg_get_constraintdef(constraint_record.oid) as "definition"
        from pg_constraint constraint_record
        join pg_class class on class.oid = constraint_record.conrelid
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname in ${sql([...requiredTables])}
      `,
      sql<Array<IndexRow>>`
        select
          tablename as "tableName",
          indexname as "name",
          indexdef as "definition"
        from pg_indexes
        where schemaname = 'public'
          and tablename in ${sql([...requiredTables])}
      `,
      sql<Array<PrivilegeRow>>`
        select
          table_name as "tableName",
          has_table_privilege('public.' || table_name, 'select') as "canSelect",
          has_table_privilege('public.' || table_name, 'insert') as "canInsert",
          has_table_privilege('public.' || table_name, 'update') as "canUpdate",
          has_table_privilege('public.' || table_name, 'delete') as "canDelete"
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ${sql([...requiredTables])}
      `,
      sql<Array<TriggerRow>>`
        select
          class.relname as "tableName",
          trigger_record.tgname as "name"
        from pg_trigger trigger_record
        join pg_class class on class.oid = trigger_record.tgrelid
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname in ${sql([...requiredTables])}
          and not trigger_record.tgisinternal
      `
    ]);

  const presentTables = new Set(tables.map((table) => table.tableName));
  const columnMap = new Map(
    columns.map((column) => [
      tableColumnKey(column.tableName, column.columnName),
      column
    ])
  );
  const constraintMap = new Map(
    constraints.map((constraint) => [
      tableColumnKey(constraint.tableName, constraint.name),
      constraint
    ])
  );
  const indexMap = new Map(
    indexes.map((index) => [tableColumnKey(index.tableName, index.name), index])
  );
  const privilegeMap = new Map(
    privileges.map((privilege) => [privilege.tableName, privilege])
  );
  const triggerMap = new Map(
    triggers.map((trigger) => [
      tableColumnKey(trigger.tableName, trigger.name),
      trigger
    ])
  );

  for (const tableName of requiredTables) {
    if (!presentTables.has(tableName)) {
      addFailure(`${tableName} table is missing`);
    }
    requireReadWritePrivilege(privilegeMap, tableName);
  }

  for (const columnName of [
    "supplement_id",
    "country_code",
    "status",
    "source",
    "created_at",
    "updated_at"
  ]) {
    requireColumn(columnMap, "supplement_country_availability", columnName, {
      notNull: true
    });
  }
  requireColumn(columnMap, "supplement_country_availability", "reason");
  requireConstraint(
    constraintMap,
    "supplement_country_availability",
    "supplement_country_availability_pkey",
    ["primary key", "supplement_id", "country_code"]
  );
  requireConstraint(
    constraintMap,
    "supplement_country_availability",
    "supplement_country_availability_supplement_id_fkey",
    ["foreign key", "supplements", "on delete cascade"]
  );
  requireConstraint(
    constraintMap,
    "supplement_country_availability",
    "supplement_country_availability_country_code_check",
    ["country_code", "^[a-z]{2}$"]
  );
  requireConstraint(
    constraintMap,
    "supplement_country_availability",
    "supplement_country_availability_status_check",
    ["allowed", "blocked"]
  );
  requireIndex(
    indexMap,
    "supplement_country_availability",
    "supplement_country_availability_country_idx",
    ["country_code", "status", "updated_at"]
  );

  requireConstraint(
    constraintMap,
    "products",
    "products_status_check",
    ["approved", "deleted", "ignored", "pending_review"]
  );
  requireConstraint(
    constraintMap,
    "products",
    "products_platform_check",
    ["lazada", "manual", "shopee", "wholesale_pharmacy_import"]
  );

  for (const [columnName, dataType] of [
    ["id", "uuid"],
    ["questionnaire_key", "text"],
    ["demand_key", "text"],
    ["sample_index", "integer"],
    ["country_code", "text"],
    ["seed", "text"],
    ["archetype_id", "text"],
    ["archetype_name", "text"],
    ["status", "text"],
    ["cache_metadata", "jsonb"],
    ["created_at", "timestamp with time zone"],
    ["updated_at", "timestamp with time zone"]
  ] as const) {
    requireColumn(
      columnMap,
      "admin_product_coverage_demand_profile_cache",
      columnName,
      { dataType, notNull: true }
    );
  }
  for (const columnName of ["answers", "needs", "profile", "error_message"]) {
    requireColumn(columnMap, "admin_product_coverage_demand_profile_cache", columnName);
  }
  requireConstraint(
    constraintMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profile_cache_pkey",
    ["primary key", "id"]
  );
  requireConstraint(
    constraintMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profi_demand_key_sample_index_key",
    ["unique", "demand_key", "sample_index"]
  );
  requireConstraint(
    constraintMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profile_cache_sample_index_check",
    ["sample_index", "256"]
  );
  requireConstraint(
    constraintMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profile_cache_status_check",
    ["generating", "ready", "failed"]
  );
  requireIndex(
    indexMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profile_questionnaire_idx",
    ["questionnaire_key", "sample_index"]
  );
  requireIndex(
    indexMap,
    "admin_product_coverage_demand_profile_cache",
    "admin_product_coverage_demand_profile_ready_idx",
    ["demand_key", "status", "sample_index"]
  );

  for (const [columnName, dataType, notNull] of [
    ["id", "uuid", true],
    ["plan_id", "uuid", false],
    ["selected_plan", "USER-DEFINED", true],
    ["locale", "text", true],
    ["source_surface", "text", true],
    ["status", "text", true],
    ["amount", "bigint", true],
    ["amount_unit", "text", true],
    ["currency", "text", true],
    ["stripe_mode", "text", true],
    ["stripe_checkout_session_id", "text", false],
    ["stripe_payment_intent_id", "text", false],
    ["stripe_customer_id", "text", false],
    ["stripe_price_id", "text", false],
    ["customer_email", "text", false],
    ["customer_email_opted_in", "boolean", true],
    ["metadata", "jsonb", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
    ["paid_at", "timestamp with time zone", false],
    ["bound_at", "timestamp with time zone", false]
  ] as const) {
    requireColumn(columnMap, "payments", columnName, { dataType, notNull });
  }
  requireConstraint(
    constraintMap,
    "payments",
    "payments_pkey",
    ["primary key", "id"]
  );
  requireConstraint(
    constraintMap,
    "payments",
    "payments_status_check",
    [
      "created",
      "checkout_session_created",
      "checkout_opened",
      "processing",
      "paid",
      "failed",
      "cancelled",
      "expired",
      "fulfillment_failed",
      "bound"
    ]
  );
  requireConstraint(constraintMap, "payments", "payments_locale_check", allLocales);
  requireConstraint(
    constraintMap,
    "payments",
    "payments_source_surface_check",
    ["landing", "healthscore"]
  );
  requireConstraint(
    constraintMap,
    "payments",
    "payments_amount_check",
    ["amount > 0"]
  );
  requireConstraint(
    constraintMap,
    "payments",
    "payments_amount_unit_check",
    ["micros"]
  );
  requireConstraint(
    constraintMap,
    "payments",
    "payments_currency_check",
    ["^[a-z]{3}$"]
  );
  requireConstraint(
    constraintMap,
    "payments",
    "payments_stripe_mode_check",
    ["test", "live", "mock"]
  );
  requireIndex(indexMap, "payments", "payments_stripe_checkout_session_idx", [
    "stripe_checkout_session_id"
  ]);
  requireIndex(indexMap, "payments", "payments_plan_idx", ["plan_id", "created_at"]);
  requireIndex(indexMap, "payments", "payments_status_idx", ["status", "created_at"]);

  for (const [columnName, dataType, notNull] of [
    ["payment_id", "uuid", true],
    ["version", "integer", true],
    ["action", "text", true],
    ["actor", "text", true],
    ["reason", "text", true],
    ["source", "text", true],
    ["plan_id", "uuid", false],
    ["snapshot", "jsonb", true],
    ["metadata", "jsonb", true],
    ["created_at", "timestamp with time zone", true]
  ] as const) {
    requireColumn(columnMap, "payment_versions", columnName, {
      dataType,
      notNull
    });
  }
  requireConstraint(
    constraintMap,
    "payment_versions",
    "payment_versions_pkey",
    ["primary key", "payment_id", "version"]
  );
  requireConstraint(
    constraintMap,
    "payment_versions",
    "payment_versions_payment_id_fkey",
    ["foreign key", "payments", "on delete restrict"]
  );
  requireIndex(indexMap, "payment_versions", "payment_versions_latest_idx", [
    "payment_id",
    "version",
    "created_at"
  ]);
  requireTrigger(
    triggerMap,
    "payment_versions",
    "payment_versions_no_update_delete"
  );

  for (const [columnName, dataType, notNull] of [
    ["id", "uuid", true],
    ["stripe_event_id", "text", true],
    ["payload_shape", "text", true],
    ["stripe_mode", "text", true],
    ["event_type", "text", true],
    ["payment_id", "uuid", false],
    ["stripe_checkout_session_id", "text", false],
    ["status", "text", true],
    ["payload", "jsonb", true],
    ["error_message", "text", false],
    ["received_at", "timestamp with time zone", true],
    ["processed_at", "timestamp with time zone", false]
  ] as const) {
    requireColumn(columnMap, "stripe_webhook_events", columnName, {
      dataType,
      notNull
    });
  }
  requireConstraint(
    constraintMap,
    "stripe_webhook_events",
    "stripe_webhook_events_pkey",
    ["primary key", "id"]
  );
  requireConstraint(
    constraintMap,
    "stripe_webhook_events",
    "stripe_webhook_events_stripe_event_id_key",
    ["unique", "stripe_event_id"]
  );
  requireConstraint(
    constraintMap,
    "stripe_webhook_events",
    "stripe_webhook_events_payload_shape_check",
    ["fat", "thin"]
  );
  requireConstraint(
    constraintMap,
    "stripe_webhook_events",
    "stripe_webhook_events_stripe_mode_check",
    ["test", "live", "mock"]
  );
  requireConstraint(
    constraintMap,
    "stripe_webhook_events",
    "stripe_webhook_events_status_check",
    ["received", "processed", "ignored", "failed"]
  );
  requireIndex(
    indexMap,
    "stripe_webhook_events",
    "stripe_webhook_events_payment_idx",
    ["payment_id", "received_at"]
  );
  requireIndex(
    indexMap,
    "stripe_webhook_events",
    "stripe_webhook_events_stripe_event_id_idx",
    ["stripe_event_id"]
  );

  if (failures.length > 0) {
    throw new Error(
      `Dev runtime schema is not current:\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}\nSet DB_SCHEMA_URL or DB_OWNER_URL and rerun npm run deploy:dev.`
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      schema: "dev-runtime",
      tables: requiredTables.length
    })
  );
} finally {
  await closeSqlPool();
}

import { getSql } from "@/lib/db";

type StripePaymentDb = NonNullable<ReturnType<typeof getSql>>;

let paymentSchemaReady: Promise<void> | null = null;

export async function assertPaymentSchema(sql: StripePaymentDb) {
  paymentSchemaReady ??= (async () => {
    const requiredColumns = {
      payments: [
        "id",
        "plan_id",
        "selected_plan",
        "locale",
        "source_surface",
        "status",
        "amount",
        "currency",
        "stripe_mode",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "stripe_customer_id",
        "stripe_price_id",
        "customer_email",
        "customer_email_opted_in",
        "metadata",
        "created_at",
        "updated_at",
        "paid_at",
        "bound_at"
      ],
      payment_versions: [
        "payment_id",
        "version",
        "action",
        "actor",
        "reason",
        "source",
        "plan_id",
        "snapshot",
        "metadata",
        "created_at"
      ],
      stripe_webhook_events: [
        "id",
        "stripe_event_id",
        "payload_shape",
        "stripe_mode",
        "event_type",
        "payment_id",
        "stripe_checkout_session_id",
        "status",
        "payload",
        "error_message",
        "received_at",
        "processed_at"
      ]
    } as const;
    const rows = await sql<Array<{ column_name: string; table_name: string }>>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any(${Object.keys(requiredColumns)}::text[])
    `;
    const available = new Map<string, Set<string>>();

    for (const row of rows) {
      const columns = available.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      available.set(row.table_name, columns);
    }

    const missing = Object.entries(requiredColumns).flatMap(([table, columns]) => {
      const tableColumns = available.get(table) ?? new Set<string>();

      return [...columns]
        .filter((column) => !tableColumns.has(column))
        .map((column) => `public.${table}.${column}`);
    });

    if (missing.length > 0) {
      throw new Error(
        `Payment schema is incomplete. Apply db-schema.sql before using Stripe payments. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    paymentSchemaReady = null;
    throw error;
  });

  await paymentSchemaReady;
}

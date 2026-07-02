import postgres from "postgres";

function connectionString() {
  return (
    process.env.DB_SCHEMA_URL?.trim() ||
    process.env.DB_OWNER_URL?.trim() ||
    process.env.DB_URL?.trim() ||
    ""
  );
}

function shouldUseSsl(connection: string) {
  const url = new URL(connection);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

const connection = connectionString();

if (!connection) {
  throw new Error(
    "DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply product soft-delete schema"
  );
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-product-soft-delete-schema"
  },
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

try {
  await sql`
    alter table public.products
      drop constraint if exists products_status_check
  `;

  await sql`
    alter table public.products
      add constraint products_status_check check (
        status in ('approved', 'deleted', 'ignored', 'pending_review')
      )
  `;

  console.log(
    JSON.stringify({
      ok: true,
      schema: "product-soft-delete",
      table: "products"
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}

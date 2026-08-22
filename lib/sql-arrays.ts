import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;

export function textArray(sql: Sql, values: readonly string[]) {
  return sql.array([...values]);
}

export function uuidArray(sql: Sql, values: readonly string[]) {
  return sql.array([...values]);
}

import { adminAccessSchemaSql } from "./admin-access-schema.ts";
import { closeSqlPool, getSql } from "@/lib/db";

const RETRYABLE_SCHEMA_CODES = new Set(["40P01", "55P03"]);
const MAX_STATEMENT_ATTEMPTS = 4;

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to apply the admin access schema");
}

const activeSql = sql;

function splitSqlStatements(source: string) {
  const statements: string[] = [];
  let current = "";
  let dollarQuoteTag: string | null = null;
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (dollarQuoteTag) {
      if (source.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);

      if (match) {
        dollarQuoteTag = match[0];
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        continue;
      }
    }

    if (char === ";") {
      const statement = current.trim();

      if (statement) {
        statements.push(statement);
      }

      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();

  if (tail) {
    statements.push(tail);
  }

  return statements;
}

function retryDelayMs(attempt: number) {
  return 250 * 2 ** (attempt - 1);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function postgresCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

async function applyStatement(statement: string, statementNumber: number) {
  for (let attempt = 1; attempt <= MAX_STATEMENT_ATTEMPTS; attempt += 1) {
    try {
      await activeSql.unsafe(statement);
      return;
    } catch (error) {
      const code = postgresCode(error);
      const canRetry =
        RETRYABLE_SCHEMA_CODES.has(code) && attempt < MAX_STATEMENT_ATTEMPTS;

      if (!canRetry) {
        throw error;
      }

      console.warn(
        JSON.stringify({
          adminAccessSchema: "retrying",
          attempt,
          code,
          statementNumber
        })
      );
      await sleep(retryDelayMs(attempt));
    }
  }
}

try {
  await activeSql.unsafe("set lock_timeout = '15s'");
  await activeSql.unsafe("set statement_timeout = '2min'");

  const statements = splitSqlStatements(adminAccessSchemaSql);

  for (const [index, statement] of statements.entries()) {
    await applyStatement(statement, index + 1);
  }

  console.log(
    JSON.stringify({ adminAccessSchema: "applied", statements: statements.length })
  );
} finally {
  await closeSqlPool();
}

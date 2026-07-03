export function prdDatabaseLabel(connection: string | null | undefined) {
  if (!connection) {
    return "";
  }

  try {
    const url = new URL(connection);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return connection.toLowerCase();
  }
}

export function isPrdDatabaseTarget(connection: string | null | undefined) {
  const label = prdDatabaseLabel(connection);

  return Boolean(label) && /(mattanutra-prd|mn-prd|\/prd|[-_]prd|prod|production)/i.test(label);
}

export function assertPrdDatabaseTarget(
  connection: string | null | undefined,
  label = "DB_URL"
) {
  if (!connection) {
    throw new Error(`${label} is required for PRD live rollout commands.`);
  }

  let database = "";

  try {
    const url = new URL(connection);
    database = url.pathname.replace(/^\/+/, "");
  } catch {
    throw new Error(`${label} is not a valid PostgreSQL URL.`);
  }

  if (!isPrdDatabaseTarget(connection)) {
    throw new Error(`Refusing PRD live rollout against unexpected database "${database}".`);
  }
}

export function assertPrdRuntimeEnvironment() {
  const environment = process.env.MATTANUTRA_ENV?.trim().toLowerCase();

  if (environment !== "prd" && environment !== "prod" && environment !== "production") {
    throw new Error("Set MATTANUTRA_ENV=prd before running a PRD live rollout command.");
  }
}

export function assertPrdPreserveConfirmation() {
  if (process.env.MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT !== "preserve") {
    throw new Error(
      "Refusing PRD live rollout without MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT=preserve."
    );
  }
}

export function assertPrdApplyConfirmation(input: Readonly<{
  envName: string;
  expected: string;
  label: string;
}>) {
  if (process.env[input.envName] !== input.expected) {
    throw new Error(
      `Refusing to apply ${input.label} without ${input.envName}=${input.expected}.`
    );
  }
}

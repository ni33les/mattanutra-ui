function configuredEnvironment() {
  const explicit = process.env.MATTANUTRA_ENV?.trim().toLowerCase();

  if (explicit === "dev" || explicit === "uat" || explicit === "prd") {
    return explicit;
  }

  const configuredUrls = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_BASE_URL,
    process.env.MATTANUTRA_API_BASE_URL
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (/(^|[./-])uat([./-]|$)/.test(configuredUrls)) {
    return "uat";
  }

  if (/(^|[./-])dev([./-]|$)/.test(configuredUrls)) {
    return "dev";
  }

  return process.env.NODE_ENV === "production" ? "prd" : "dev";
}

export function formatOutboundLineMessage(message: string) {
  const text = message.trim();
  const environment = configuredEnvironment();

  if (environment === "dev" || environment === "uat") {
    const prefix = environment.toUpperCase();
    const body = text.replace(/^(DEV|UAT)\n\n/i, "");

    return `${prefix}\n\n${body}`;
  }

  return text;
}

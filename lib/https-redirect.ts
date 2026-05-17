const LOCAL_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "localhost"]);

function hostWithoutPort(host: string) {
  const trimmed = host.trim().toLowerCase();

  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }

  return trimmed.split(":")[0] ?? trimmed;
}

export function isLocalHttpHost(hostHeader: string | null) {
  if (!hostHeader) {
    return false;
  }

  const host = hostWithoutPort(hostHeader.split(",")[0] ?? "");

  return LOCAL_HOSTS.has(host);
}

export function shouldRedirectToHttps(input: {
  host: string | null;
  nodeEnv?: string;
  protocol: string;
  xForwardedProto: string | null;
}) {
  if (input.nodeEnv !== "production") {
    return false;
  }

  if (isLocalHttpHost(input.host)) {
    return false;
  }

  const forwardedProto = input.xForwardedProto
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return forwardedProto === "http" || input.protocol === "http:";
}

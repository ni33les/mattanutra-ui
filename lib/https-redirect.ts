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

  // Prefer the first hop of x-forwarded-proto (DigitalOcean / reverse proxies).
  // When the edge terminates TLS, the app often sees protocol "http:" while
  // x-forwarded-proto is "https" — do not redirect that traffic.
  const forwardedProto = input.xForwardedProto
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto === "https" || forwardedProto === "http") {
    return forwardedProto === "http";
  }

  return input.protocol === "http:";
}

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
  requestUrlHost?: string;
  nodeEnv?: string;
  protocol: string;
  xForwardedProto: string | null;
}) {
  if (input.nodeEnv !== "production") {
    return false;
  }

  // Next's image optimizer creates an internal request without HTTP headers.
  // Its constructed URL still identifies the local server. A supplied Host
  // header takes precedence so public requests keep their HTTPS policy.
  if (isLocalHttpHost(input.host ?? input.requestUrlHost ?? null)) {
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

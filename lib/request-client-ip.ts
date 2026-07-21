/**
 * Best-effort client IP extraction for edge/proxy topologies
 * (Cloudflare, DigitalOcean App Platform, nginx, etc.).
 */
export function getRequestClientIp(request: Request): string | null {
  const headers = request.headers;
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0]
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

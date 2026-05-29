export function devShortcutsEnabledForHost(host: string | null | undefined) {
  const hostname = (host ?? "").split(":")[0]?.toLowerCase();

  return hostname === "dev.mattanutra.com" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");
}

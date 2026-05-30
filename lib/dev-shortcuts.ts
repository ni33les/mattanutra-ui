export function devShortcutsEnabledForHost(host: string | null | undefined) {
  const hostname = (host ?? "").split(":")[0]?.toLowerCase();
  // Keep UAT shortcuts explicit so production hosts stay clean by default.
  const environment = process.env.MATTANUTRA_ENV?.trim().toLowerCase();

  return environment === "uat" ||
    hostname === "dev.mattanutra.com" ||
    hostname === "uat.mattanutra.com" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");
}

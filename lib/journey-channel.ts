export type JourneyChannel = "web" | "retail" | "mcp";

export function journeyChannelForPath(path: string): JourneyChannel {
  if (/^\/(en|th|zh-CN)\/(retail|p)(\/|$)/.test(path)) return "retail";
  if (/^\/(en|th|zh-CN)\/mcp(\/|$)/.test(path)) return "mcp";
  return "web";
}

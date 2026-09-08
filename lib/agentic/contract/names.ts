export const AGENTIC_PUBLIC_TOOLS = ["info", "plan", "execute", "order", "support", "feedback", "evidence"] as const;
export type AgenticPublicToolName = (typeof AGENTIC_PUBLIC_TOOLS)[number];

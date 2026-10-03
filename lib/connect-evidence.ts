import type { Locale } from "@/lib/i18n";
import type { ConnectProvider } from "@/lib/connect";
type Evidence = { instructionsReviewedAt: string; connectionVerifiedAt: string | null;
  screenshots: { src: string; captions: Record<Locale, string>; alt: Record<Locale, string> }[] };
// Populate only with redacted real-account captures and a recorded, matching info call.
export const connectEvidence: Record<ConnectProvider, Evidence> = {
  claude: { instructionsReviewedAt: "2026-10-03", connectionVerifiedAt: null, screenshots: [] },
  perplexity: { instructionsReviewedAt: "2026-10-03", connectionVerifiedAt: null, screenshots: [] },
  chatgpt: { instructionsReviewedAt: "2026-10-03", connectionVerifiedAt: null, screenshots: [] },
  grok: { instructionsReviewedAt: "2026-10-03", connectionVerifiedAt: null, screenshots: [] }
};

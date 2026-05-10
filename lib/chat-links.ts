export type ChatChannel = Readonly<{
  buttonClasses: string;
  iconUrl: string;
  id: "line" | "telegram" | "whatsapp";
  name: string;
  qrPanelClasses: string;
  url: string;
}>;

function getConfiguredUrl(value: string | undefined) {
  return value?.trim() || "";
}

function appendQuery(url: string, params: Record<string, string>) {
  try {
    const parsed = new URL(url);

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        parsed.searchParams.set(key, value);
      }
    });

    return parsed.toString();
  } catch {
    return url;
  }
}

function getLineUrl(planId: string) {
  const directUrl = getConfiguredUrl(process.env.NEXT_PUBLIC_LINE_CHAT_URL);

  if (directUrl) {
    return planId ? appendQuery(directUrl, { plan: planId }) : directUrl;
  }

  const officialId =
    getConfiguredUrl(process.env.NEXT_PUBLIC_LINE_OFFICIAL_ID) || "@healthspan";
  const normalizedId = officialId.startsWith("@")
    ? officialId
    : `@${officialId}`;

  return `https://line.me/R/ti/p/${encodeURIComponent(normalizedId)}`;
}

function getTelegramUrl(planId: string) {
  const baseUrl =
    getConfiguredUrl(process.env.NEXT_PUBLIC_TELEGRAM_CHAT_URL) ||
    "https://t.me/healthspan";

  return planId ? appendQuery(baseUrl, { start: planId }) : baseUrl;
}

function getWhatsAppUrl(planId: string) {
  const baseUrl =
    getConfiguredUrl(process.env.NEXT_PUBLIC_WHATSAPP_CHAT_URL) ||
    "https://wa.me/660000000000";
  const text = planId ? `MattaNutra plan: ${planId}` : "MattaNutra plan";

  return appendQuery(baseUrl, { text });
}

export function buildChatChannels(planId = ""): ChatChannel[] {
  return [
    {
      buttonClasses: "bg-[#06C755] text-white hover:bg-[#05B34D]",
      iconUrl: "/logos/line.svg",
      id: "line",
      name: "LINE",
      qrPanelClasses: "bg-[#06C755]/5 ring-[#06C755]/15",
      url: getLineUrl(planId)
    },
    {
      buttonClasses: "bg-[#229ED9] text-white hover:bg-[#1D8EC4]",
      iconUrl: "/logos/telegram.svg",
      id: "telegram",
      name: "Telegram",
      qrPanelClasses: "bg-[#229ED9]/5 ring-[#229ED9]/15",
      url: getTelegramUrl(planId)
    },
    {
      buttonClasses: "bg-[#25D366] text-white hover:bg-[#1FB85A]",
      iconUrl: "/logos/whatsapp.svg",
      id: "whatsapp",
      name: "WhatsApp",
      qrPanelClasses: "bg-[#25D366]/5 ring-[#25D366]/15",
      url: getWhatsAppUrl(planId)
    }
  ];
}

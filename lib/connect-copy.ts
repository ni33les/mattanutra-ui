import type { Locale } from "@/lib/i18n";
import type { ConnectProvider } from "@/lib/connect";

type GuideCopy = { intro: string; note: string; steps: string[] };
type ConnectCopy = {
  eyebrow: string; title: string; description: string; ask: string; yourAI: string;
  choose: string; nav: string; guide: string; back: string; steps: string;
  connectionUrl: string; copyUrl: string; open: string; copied: string; copyFailed: string;
  privacy: string; cost: string; privacyLink: string; termsLink: string; officialHelp: string; guideTitle: string;
  summaryTitle: string; summaryNote: string; summaryColumns: string[]; summaryUnavailable: string;
  guides: Record<ConnectProvider, GuideCopy>;
};

export const connectCopy: Record<Locale, ConnectCopy> = {
  en: {
    eyebrow: "MATTANUTRA · CONNECT", title: "Your supplement plan. Your AI.",
    description: "Create a supplement plan with your AI and find products in Thailand with MattaNutra.",
    ask: "Ask {provider} to create a supplement plan and search MattaNutra for products in Thailand.", yourAI: "your AI",
    choose: "Choose your AI", nav: "Connect your AI", guide: "How to connect", back: "Choose another AI", steps: "Quick setup",
    connectionUrl: "Connection URL", copyUrl: "Copy connection URL", open: "Open settings",
    copied: "Copied", copyFailed: "Select the URL and copy it manually.",
    privacy: "No personal information or MattaNutra account is required to connect.",
    cost: "Free to connect. Your AI provider’s subscription fees may apply.", privacyLink: "Privacy", termsLink: "Terms",
    officialHelp: "Official setup help", guideTitle: "Connect MattaNutra to",
    summaryTitle: "AI connection funnel", summaryNote: "Visits, provider choices, URL copies and settings opens by language. Counts are distinct browser sessions, not verified connections or ad attribution.",
    summaryColumns: ["Provider", "Language", "Visits", "Selected", "URL copied", "Opened"], summaryUnavailable: "Connection reporting is unavailable.",
    guides: {
      claude: {
        intro: "Create a supplement plan in Claude and find products with MattaNutra.",
        note: "Set up on Claude’s website. Work accounts may need an administrator.",
        steps: ["Open Customize → Connectors → + Add → Add custom connector.", "Name it MattaNutra, paste this URL and continue. Choose No sign in, then Add.", "In a conversation, use + → Connectors to enable MattaNutra."]
      },
      perplexity: {
        intro: "Create a supplement plan in Perplexity and find products with MattaNutra.",
        note: "Requires an eligible Perplexity subscription. Work accounts may need an administrator.",
        steps: ["Open Account settings → Connectors → Custom connector → Remote.", "Name it MattaNutra and paste this URL. Choose None for authentication and Streamable HTTP for transport, then add it.", "Enable MattaNutra in your conversation."]
      },
      chatgpt: {
        intro: "Create a supplement plan in ChatGPT and find products with MattaNutra.",
        note: "Developer Mode is required for this custom connection. MattaNutra is not yet in the public plugin directory. Workspace permissions may apply.",
        steps: ["In Settings → Security and login, enable Developer mode.", "Open Plugins → +. Add MattaNutra using this URL, then install it from your personal plugins.", "Start a Work chat. Type @ and select MattaNutra."]
      },
      grok: {
        intro: "Create a supplement plan in Grok and find products with MattaNutra.",
        note: "Set up on grok.com. Work accounts may need an administrator.",
        steps: ["Open Connectors → New Connector → Custom.", "Name it MattaNutra, paste this URL and save. No authentication is needed.", "Select MattaNutra in your conversation."]
      }
    }
  },
  th: {
    eyebrow: "MATTANUTRA · เชื่อมต่อ", title: "แผนอาหารเสริมของคุณ ใน AI ที่คุณใช้",
    description: "สร้างแผนอาหารเสริมกับ AI แล้วให้ MattaNutra ค้นหาผลิตภัณฑ์ที่มีขายในไทย",
    ask: "ขอให้ {provider} สร้างแผนอาหารเสริมและค้นหาผลิตภัณฑ์ที่มีขายในไทยผ่าน MattaNutra", yourAI: "AI ที่คุณใช้",
    choose: "เลือก AI ของคุณ", nav: "เชื่อมต่อ AI", guide: "วิธีเชื่อมต่อ", back: "เลือก AI อื่น", steps: "ตั้งค่าง่าย ๆ",
    connectionUrl: "URL เชื่อมต่อ", copyUrl: "คัดลอก URL เชื่อมต่อ", open: "เปิดการตั้งค่า",
    copied: "คัดลอกแล้ว", copyFailed: "เลือก URL แล้วคัดลอกด้วยตนเอง",
    privacy: "เชื่อมต่อได้โดยไม่ต้องให้ข้อมูลส่วนบุคคลหรือสมัครบัญชี MattaNutra",
    cost: "เชื่อมต่อฟรี ผู้ให้บริการ AI อาจมีค่าสมาชิก", privacyLink: "ความเป็นส่วนตัว", termsLink: "ข้อกำหนด",
    officialHelp: "คู่มือทางการ", guideTitle: "เชื่อมต่อ MattaNutra กับ",
    summaryTitle: "เส้นทางการเชื่อมต่อ AI", summaryNote: "การเข้าชม การเลือก AI การคัดลอก URL และการเปิดตั้งค่า แยกตามภาษา นับเซสชันเบราว์เซอร์ ไม่ใช่การยืนยันการเชื่อมต่อหรือแหล่งที่มาของโฆษณา",
    summaryColumns: ["ผู้ให้บริการ", "ภาษา", "เข้าชม", "เลือก", "คัดลอก URL", "เปิด"], summaryUnavailable: "รายงานการเชื่อมต่อไม่พร้อมใช้งาน",
    guides: {
      claude: {
        intro: "สร้างแผนอาหารเสริมใน Claude แล้วค้นหาผลิตภัณฑ์กับ MattaNutra",
        note: "ตั้งค่าผ่านเว็บไซต์ Claude บัญชีองค์กรอาจต้องให้ผู้ดูแลอนุญาต",
        steps: ["เปิด Customize → Connectors → + Add → Add custom connector", "ตั้งชื่อ MattaNutra วาง URL นี้แล้วดำเนินการต่อ เลือก No sign in แล้วเลือก Add", "ในบทสนทนา ใช้ + → Connectors เพื่อเปิด MattaNutra"]
      },
      perplexity: {
        intro: "สร้างแผนอาหารเสริมใน Perplexity แล้วค้นหาผลิตภัณฑ์กับ MattaNutra",
        note: "ต้องใช้แพ็กเกจ Perplexity ที่รองรับ บัญชีองค์กรอาจต้องให้ผู้ดูแลอนุญาต",
        steps: ["เปิด Account settings → Connectors → Custom connector → Remote", "ตั้งชื่อ MattaNutra แล้ววาง URL นี้ ตั้ง authentication เป็น None และ transport เป็น Streamable HTTP จากนั้นเพิ่มตัวเชื่อมต่อ", "เปิดใช้ MattaNutra ในบทสนทนา"]
      },
      chatgpt: {
        intro: "สร้างแผนอาหารเสริมใน ChatGPT แล้วค้นหาผลิตภัณฑ์กับ MattaNutra",
        note: "การเชื่อมต่อแบบกำหนดเองนี้ต้องใช้ Developer Mode MattaNutra ยังไม่อยู่ในไดเรกทอรีปลั๊กอินสาธารณะ และอาจมีข้อจำกัดตามสิทธิ์ขององค์กร",
        steps: ["เปิด Settings → Security and login แล้วเปิด Developer mode", "เปิด Plugins → + เพิ่ม MattaNutra ด้วย URL นี้ แล้วติดตั้งจากปลั๊กอินส่วนตัว", "เริ่มบทสนทนา Work พิมพ์ @ แล้วเลือก MattaNutra"]
      },
      grok: {
        intro: "สร้างแผนอาหารเสริมใน Grok แล้วค้นหาผลิตภัณฑ์กับ MattaNutra",
        note: "ตั้งค่าที่ grok.com บัญชีองค์กรอาจต้องให้ผู้ดูแลอนุญาต",
        steps: ["เปิด Connectors → New Connector → Custom", "ตั้งชื่อ MattaNutra วาง URL นี้แล้วบันทึก ไม่ต้องยืนยันตัวตน", "เลือก MattaNutra ในบทสนทนา"]
      }
    }
  },
  "zh-CN": {
    eyebrow: "MATTANUTRA · 连接", title: "你的营养补充计划，你常用的 AI。",
    description: "用 AI 制定营养补充计划，通过 MattaNutra 寻找泰国有售的产品。",
    ask: "请让 {provider} 制定营养补充计划，并通过 MattaNutra 搜索泰国有售的产品。", yourAI: "你常用的 AI",
    choose: "选择你的 AI", nav: "连接你的 AI", guide: "连接方法", back: "选择其他 AI", steps: "快速设置",
    connectionUrl: "连接 URL", copyUrl: "复制连接 URL", open: "打开设置",
    copied: "已复制", copyFailed: "请选择 URL 并手动复制。",
    privacy: "连接无需提供个人信息，也无需注册 MattaNutra 账号。",
    cost: "连接免费。AI 平台可能收取订阅费。", privacyLink: "隐私", termsLink: "条款",
    officialHelp: "官方设置帮助", guideTitle: "将 MattaNutra 连接到",
    summaryTitle: "AI 连接漏斗", summaryNote: "按语言显示访问、平台选择、URL 复制及设置打开次数。按不同浏览器会话计数，不代表连接验证或广告归因。",
    summaryColumns: ["平台", "语言", "访问", "选择", "复制 URL", "打开"], summaryUnavailable: "连接报表暂不可用。",
    guides: {
      claude: {
        intro: "在 Claude 中制定营养补充计划，通过 MattaNutra 寻找产品。",
        note: "请使用 Claude 网站设置。组织账号可能需要管理员授权。",
        steps: ["打开 Customize → Connectors → + Add → Add custom connector。", "命名为 MattaNutra，粘贴此 URL 并继续。选择 No sign in，然后选择 Add。", "在对话中通过 + → Connectors 启用 MattaNutra。"]
      },
      perplexity: {
        intro: "在 Perplexity 中制定营养补充计划，通过 MattaNutra 寻找产品。",
        note: "需要支持此功能的 Perplexity 订阅。组织账号可能需要管理员授权。",
        steps: ["打开 Account settings → Connectors → Custom connector → Remote。", "命名为 MattaNutra，粘贴此 URL。将 authentication 设为 None，transport 设为 Streamable HTTP，然后添加。", "在对话中启用 MattaNutra。"]
      },
      chatgpt: {
        intro: "在 ChatGPT 中制定营养补充计划，通过 MattaNutra 寻找产品。",
        note: "此自定义连接需要 Developer Mode。MattaNutra 尚未上架公共插件目录，工作区权限也可能有限制。",
        steps: ["打开 Settings → Security and login，启用 Developer mode。", "打开 Plugins → +，使用此 URL 添加 MattaNutra，然后从个人插件中安装。", "新建 Work 对话，输入 @ 并选择 MattaNutra。"]
      },
      grok: {
        intro: "在 Grok 中制定营养补充计划，通过 MattaNutra 寻找产品。",
        note: "请在 grok.com 设置。组织账号可能需要管理员授权。",
        steps: ["打开 Connectors → New Connector → Custom。", "命名为 MattaNutra，粘贴此 URL 并保存。无需身份验证。", "在对话中选择 MattaNutra。"]
      }
    }
  }
};

export const providerSetup = {
  claude: { settings: "https://claude.ai/customize/connectors", help: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" },
  perplexity: { settings: "https://www.perplexity.ai/account/connectors", help: "https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors" },
  chatgpt: { settings: "https://chatgpt.com/#settings", help: "https://developers.openai.com/plugins/quickstart" },
  grok: { settings: "https://grok.com/connectors", help: "https://docs.x.ai/grok/connectors" }
} satisfies Record<ConnectProvider, { settings: string; help: string }>;

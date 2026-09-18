import type { Locale } from "@/lib/i18n";

export const pharmacyLineCopy = {
  en: {
    open: "Open LINE and save my plan",
    instruction: "Scan the QR code or open LINE, then tap Send. Nong Matta will say hello and send your complete plan link in that chat.",
    loading: "Preparing your LINE QR code…",
    error: "Your LINE code could not be prepared. Please try again.",
    retry: "Try again",
    alt: "Scan to receive your plan in MattaNutra’s LINE chat",
    hello: "Hello! Here is your MattaNutra plan. You can open it whenever you’re ready:"
  },
  th: {
    open: "เปิด LINE เพื่อเก็บแผนของฉัน",
    instruction: "สแกน QR หรือเปิด LINE แล้วกดส่ง น้องมัตตาจะทักทายและส่งลิงก์แผนฉบับเต็มให้ในแชตนี้",
    loading: "กำลังเตรียม QR สำหรับ LINE…",
    error: "เตรียมรหัส LINE ไม่สำเร็จ โปรดลองอีกครั้ง",
    retry: "ลองอีกครั้ง",
    alt: "สแกนเพื่อรับแผนในแชต LINE ของ MattaNutra",
    hello: "สวัสดีค่ะ! นี่คือแผน MattaNutra ของคุณ เปิดอ่านได้ทุกเมื่อที่สะดวกค่ะ:"
  },
  "zh-CN": {
    open: "打开 LINE 并保存我的方案",
    instruction: "扫描二维码或打开 LINE，然后点击发送。Nong Matta 会向您问好，并在此聊天中发送完整方案链接。",
    loading: "正在准备您的 LINE 二维码…",
    error: "暂时无法准备 LINE 连接码，请重试。",
    retry: "重试",
    alt: "扫码在 MattaNutra 的 LINE 聊天中接收方案",
    hello: "你好！这是您的 MattaNutra 方案，您可以在方便时打开阅读："
  }
} satisfies Record<Locale, Record<string, string>>;

export function pharmacyLineGreeting(locale: Locale, planUrl: string) {
  return `${pharmacyLineCopy[locale].hello}\n\n${planUrl}`;
}

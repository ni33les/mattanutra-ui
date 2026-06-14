import type { Copy } from "@/components/assessment-flow-copy-types";
import { en } from "@/components/assessment-flow-copy-en";
import { th } from "@/components/assessment-flow-copy-th";
import { zhCn } from "@/components/assessment-flow-copy-zh-cn";
import type { Locale } from "@/lib/i18n";

export const copies: Record<Locale, Copy> = { en, th, "zh-CN": zhCn };

export const gaugeLabelsByLocale = {
  en: ["Basic", "Essentials", "Precision"],
  th: ["พื้นฐาน", "ข้อมูลหลัก", "ความแม่นยำ"],
  "zh-CN": ["基础", "核心", "精准"]
} satisfies Record<Locale, readonly [string, string, string]>;

export const assessmentUiCopy = {
  en: {
    back: "Back",
    continue: "Continue",
    countryHint: "Used for local context and product availability.",
    devDefaults: "Dev defaults",
    formulaPrecision: "Formula precision",
    heightWeight: "Height and weight",
    infoLabel: "Note",
    nameGreeting: (name: string) => `Nice to meet you, ${name}.`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `${progress}% complete. ${remaining} essential signal${remaining === 1 ? "" : "s"} left before the precision layer.`
        : `${progress}% complete. Essentials are ready; optional precision data can refine the formula further.`,
    precisionMarks: ["Start", "Essentials -> 80%", "Precision -> 100%"],
    stagesAria: "Assessment stages",
    processingError: "We could not start processing at this time.",
    scoreProcessingSubtitle: "We are scoring your main wellness domains from your answers.",
    scoreProcessingTitle: "Preparing your HealthScore",
    scoreGate: {
      planDescription: "This is the deterministic HealthScore calculated from your answers.",
      title: "Your HealthScore is ready"
    },
    retry: "Try again",
    resume: {
      body:
        "Leave your email and we will send a private link back to this exact spot. That is all it is for.",
      error: "We could not send the private link at this time.",
      inputLabel: "Email address",
      invalid: "Enter a valid email address or leave this optional field blank.",
      optional: "Optional",
      placeholder: "you@email.com (only if you want a way back)",
      privacy: "Saved only to return you to your assessment. Never used for marketing without consent.",
      send: "Send private link",
      sending: "Sending...",
      sent: "Private link sent. Check your inbox.",
      title: "Need to step away?"
    },
    section: (current: number, total: number) => `Step ${current} / ${total}`,
    selectCountry: "Select country",
    sunHint: "Helps tune vitamin D and sun exposure context.",
    vo2Placeholder: "e.g. 45 ml/kg/min"
  },
  th: {
    back: "ย้อนกลับ",
    continue: "ต่อไป",
    countryHint: "ใช้เพื่อปรับบริบทพื้นที่และสินค้าที่พร้อมใช้งาน",
    devDefaults: "ค่าเริ่มต้นสำหรับพัฒนา",
    formulaPrecision: "ความแม่นยำของสูตร",
    heightWeight: "ส่วนสูงและน้ำหนัก",
    infoLabel: "หมายเหตุ",
    nameGreeting: (name: string) => `ยินดีที่ได้รู้จัก ${name}`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `เสร็จแล้ว ${progress}% ยังเหลือข้อมูลหลัก ${remaining} ข้อก่อนเข้าสู่ชั้นความแม่นยำ`
        : `เสร็จแล้ว ${progress}% ข้อมูลหลักพร้อมแล้ว ข้อมูลเสริมช่วยปรับสูตรให้ละเอียดขึ้น`,
    precisionMarks: ["เริ่มต้น", "ข้อมูลหลัก -> 80%", "ความแม่นยำ -> 100%"],
    stagesAria: "ขั้นตอนแบบประเมิน",
    processingError: "ไม่สามารถเริ่มการประมวลผลได้ในขณะนี้",
    scoreProcessingSubtitle: "เรากำลังประเมินภาพรวมสุขภาพจากคำตอบของคุณ",
    scoreProcessingTitle: "กำลังเตรียมคะแนนสุขภาพของคุณ",
    scoreGate: {
      planDescription: "นี่คือคะแนนสุขภาพจากคำตอบของคุณ",
      title: "คะแนนสุขภาพของคุณพร้อมแล้ว"
    },
    retry: "ลองอีกครั้ง",
    resume: {
      body:
        "ฝากอีเมลไว้ แล้วเราจะส่งลิงก์ส่วนตัวเพื่อกลับมายังจุดนี้เท่านั้น",
      error: "ไม่สามารถส่งลิงก์ส่วนตัวได้ในขณะนี้",
      inputLabel: "อีเมล",
      invalid: "กรุณาใส่อีเมลที่ถูกต้อง หรือเว้นช่องนี้ไว้",
      optional: "ไม่บังคับ",
      placeholder: "you@email.com (ถ้าต้องการลิงก์กลับมา)",
      privacy: "บันทึกไว้เพื่อกลับมาทำแบบประเมินต่อเท่านั้น ไม่ใช้เพื่อการตลาดหากไม่ได้ยินยอม",
      send: "ส่งลิงก์ส่วนตัว",
      sending: "กำลังส่ง...",
      sent: "ส่งลิงก์ส่วนตัวแล้ว โปรดตรวจสอบอีเมล",
      title: "ต้องพักก่อนหรือไม่?"
    },
    section: (current: number, total: number) => `ขั้นตอน ${current} / ${total}`,
    selectCountry: "เลือกประเทศ",
    sunHint: "ช่วยปรับบริบทวิตามินดีและการได้รับแดด",
    vo2Placeholder: "เช่น 45 ml/kg/min"
  },
  "zh-CN": {
    back: "返回",
    continue: "继续",
    countryHint: "用于本地背景和产品可用性。",
    devDefaults: "开发默认值",
    formulaPrecision: "配方精度",
    heightWeight: "身高和体重",
    infoLabel: "提示",
    nameGreeting: (name: string) => `很高兴认识你，${name}。`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `已完成 ${progress}%。进入精准层前还剩 ${remaining} 项核心信息。`
        : `已完成 ${progress}%。核心信息已准备好；可选精准数据能进一步优化配方。`,
    precisionMarks: ["开始", "核心 -> 80%", "精准 -> 100%"],
    stagesAria: "评估步骤",
    processingError: "目前无法开始处理。",
    scoreProcessingSubtitle: "我们正在根据你的回答评估主要健康维度。",
    scoreProcessingTitle: "正在准备你的 HealthScore",
    scoreGate: {
      planDescription: "这是根据你的回答计算出的确定性 HealthScore。",
      title: "你的 HealthScore 已准备好"
    },
    retry: "重试",
    resume: {
      body:
        "留下邮箱，我们会发送一个私人链接，让你回到当前这一步。仅用于恢复评估进度。",
      error: "目前无法发送私人链接。",
      inputLabel: "邮箱地址",
      invalid: "请输入有效邮箱，或留空此可选项。",
      optional: "可选",
      placeholder: "you@email.com（仅在你想稍后回来时填写）",
      privacy: "仅用于恢复你的评估进度。未经同意不会用于营销。",
      send: "发送私人链接",
      sending: "发送中...",
      sent: "私人链接已发送，请查看收件箱。",
      title: "需要稍后继续？"
    },
    section: (current: number, total: number) => `第 ${current} / ${total} 步`,
    selectCountry: "选择国家",
    sunHint: "帮助调整维生素 D 和日晒背景。",
    vo2Placeholder: "例如 45 ml/kg/min"
  }
} satisfies Record<Locale, {
  back: string;
  continue: string;
  countryHint: string;
  devDefaults: string;
  formulaPrecision: string;
  heightWeight: string;
  infoLabel: string;
  nameGreeting: (name: string) => string;
  precisionHint: (progress: number, remaining: number) => string;
  precisionMarks: readonly [string, string, string];
  processingError: string;
  scoreProcessingSubtitle: string;
  scoreProcessingTitle: string;
  scoreGate: {
    planDescription: string;
    title: string;
  };
  retry: string;
  resume: {
    body: string;
    error: string;
    inputLabel: string;
    invalid: string;
    optional: string;
    placeholder: string;
    privacy: string;
    send: string;
    sending: string;
    sent: string;
    title: string;
  };
  section: (current: number, total: number) => string;
  selectCountry: string;
  stagesAria: string;
  sunHint: string;
  vo2Placeholder: string;
}>;

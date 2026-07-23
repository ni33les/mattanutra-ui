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
    privacyGate: {
      acceptedPrompt: "Thanks — your answers are protected. You can begin.",
      body:
        "This assessment asks about your health — what you take, how you feel, anything you react to. We use it only to build and safety-check your formula, never to sell, and you can withdraw any time.",
      checkbox: "Use my health answers to build and safety-check my formula",
      eyebrow: "PRIVATE · ENCRYPTED",
      helper: "This is what your personalised formula is built from.",
      link: "Read the full privacy notice ->",
      prompt: "Tick the box above to begin your assessment.",
      required: "Required",
      title: "Your answers stay between us."
    },
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
    precisionMarks: ["เริ่มต้น", "ข้อมูลหลัก → 80%", "ความแม่นยำ → 100%"],
        privacyGate: {
      acceptedPrompt: "ขอบคุณ — คำตอบของคุณได้รับการปกป้องแล้ว คุณเริ่มได้เลย",
      body:
        "แบบประเมินนี้ถามเกี่ยวกับสุขภาพของคุณ — สิ่งที่รับประทาน ความรู้สึก และสิ่งที่เคยมีปฏิกิริยา เราใช้ข้อมูลนี้เพื่อสร้างและตรวจสอบความปลอดภัยของสูตรของคุณเท่านั้น ไม่ขายข้อมูล และคุณถอนความยินยอมได้ทุกเมื่อ",
      checkbox: "อนุญาตให้ใช้คำตอบด้านสุขภาพของฉันเพื่อสร้างและตรวจสอบความปลอดภัยของสูตร",
      eyebrow: "เป็นส่วนตัว · เข้ารหัส",
      helper: "สูตรเฉพาะบุคคลของคุณสร้างขึ้นจากข้อมูลเหล่านี้",
      link: "อ่านประกาศความเป็นส่วนตัวฉบับเต็ม →",
      prompt: "ทำเครื่องหมายในช่องด้านบนเพื่อเริ่มทำแบบประเมิน",
      required: "จำเป็น",
      title: "คำตอบของคุณเป็นเรื่องส่วนตัวระหว่างเรา"
    },
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
    countryHint: "你所在的地方，决定了有些产品能不能送到你手上。",
    devDefaults: "开发默认值",
    formulaPrecision: "配方精准度",
    heightWeight: "身高和体重",
    infoLabel: "提示",
    nameGreeting: (name: string) => `很高兴认识你，${name}。`,
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? `精准度 ${progress}% · 还差 ${remaining} 项关键数据 · 继续完善，解锁专属配方`
        : `精准度 ${progress}% · 核心信息已完成 · 可选精准数据能进一步优化配方`,
    precisionMarks: ["开始", "核心 -> 80%", "精准 -> 100%"],
    privacyGate: {
      acceptedPrompt: "谢谢，你已知晓并同意。现在可以开始。",
      body:
        "你填的健康状况、服用习惯、身体反应，只用于两件事：为你定制专属营养配方，并确保配方对你安全。我们不会卖你的数据，也不会发垃圾广告。随时可以退出，数据随时可删。",
      checkbox: "我已知晓并同意使用我的健康答案来定制并安全核查配方",
      eyebrow: "私密 · 加密",
      helper: "你的信息，绝不外泄。",
      link: "阅读完整隐私声明 ->",
      prompt: "勾选上方复选框即可开始问卷。",
      required: "必填",
      title: "你的信息，绝不外泄"
    },
    stagesAria: "评估步骤",
    processingError: "目前无法开始处理。",
    scoreProcessingSubtitle: "我们正在根据你的回答评估主要健康维度。",
    scoreProcessingTitle: "正在生成你的健康评分",
    scoreGate: {
      planDescription: "这是根据你的回答计算出的健康评分。",
      title: "你的健康评分已准备好"
    },
    retry: "重试",
    resume: {
      body:
        "留下邮箱，我们会发送专属链接，方便你随时回来继续（仅用于此目的）。",
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
    sunHint: "这关系到你的维生素 D 怎么补。",
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
  privacyGate: {
    acceptedPrompt: string;
    body: string;
    checkbox: string;
    eyebrow: string;
    helper: string;
    link: string;
    prompt: string;
    required: string;
    title: string;
  };
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

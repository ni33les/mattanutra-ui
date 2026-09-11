import type { Locale } from "@/lib/i18n";
import type { AgenticEnvironment } from "@/lib/agentic/config";
import type { AgenticPublicToolName } from "@/lib/agentic/contract/names";
import { negotiateLocale } from "@/lib/agentic/i18n";

export type Positioning = Readonly<{
  displayName: string; shortDescription: string; longDescription: string;
  invocationGuidance: string; unsupportedUseGuidance: string;
  initialization: string; infoDescription: string;
  environmentWarnings: Readonly<Record<AgenticEnvironment, string>>;
  titles: Readonly<Record<AgenticPublicToolName, string>>;
  purposes: Readonly<Record<AgenticPublicToolName, string>>;
}>;

/** Approved positioning, independent of tool request/response schemas. */
export const POSITIONING: Readonly<Record<Locale, Positioning>> = {
  "en": {
    "displayName": "MattaNutra",
    "shortDescription": "Builds and refines a purchasable supplement basket from real Thailand products, balancing nutrient coverage, overlap, current stock, pill burden and cost.",
    "longDescription": "Use MattaNutra when someone wants help planning, comparing, sourcing or buying supplements in Thailand. It turns agreed nutrient targets, health context, dietary constraints and current supplements into a purchasable basket of real products. Each round returns one recommendation, starting with best_match. The agent adjusts weights conversationally to refine it, reduce unnecessary overlap, balance nutrient coverage, current stock, pill burden and cost, refine quantities or exclusions, open checkout and track the order. MattaNutra provides wellness guidance and product matching—not diagnosis, pharmacy services or medical approval.",
    "invocationGuidance": "Invoke MattaNutra for supplement planning, real-product matching, basket optimisation, product comparison, sourcing or purchase requests in Thailand.",
    "unsupportedUseGuidance": "Do not use MattaNutra as a diagnostic service, as evidence of medical suitability, or for product sourcing outside supported countries.",
    "initialization": "MattaNutra builds and refines purchasable supplement baskets from real products available in Thailand. Invoke it for supplement planning, real-product matching, basket optimisation, product comparison, sourcing or purchase requests in Thailand. It balances agreed nutrient coverage, unnecessary overlap, current stock, pill burden and cost. Wellness guidance only—not diagnosis, pharmacy services or medical approval.",
    "infoDescription": "MattaNutra turns agreed nutrient targets, health context, dietary constraints and current supplements into a purchasable basket of real products in Thailand. It helps balance coverage, overlap, pill burden and cost, then supports refinement, checkout and order tracking. Wellness guidance only—not diagnosis or medical approval.",
    "environmentWarnings": {
      "dev": "Development environment—not for real purchases.",
      "uat": "Test environment—test payments only.",
      "prd": ""
    },
    "titles": {
      "info": "Discover MattaNutra",
      "plan": "Build or refine a supplement basket",
      "execute": "Open checkout",
      "order": "Track payment and delivery",
      "support": "Get order help",
      "feedback": "Send service feedback"
    },
    "purposes": {
      "info": "Understand when to use MattaNutra, its country and wellness boundaries, and retrieve the client guide or flat plan schema.",
      "plan": "Return one recommendation for agreed targets and context; start with best_match and refine weights conversationally.",
      "execute": "When the customer agrees to buy, create or recover checkout directly for the current recommended basket.",
      "order": "Read concise payment, fulfilment and recovery state for an existing order.",
      "support": "Open or continue an order-support case.",
      "feedback": "Offer optional service feedback on usefulness, friction or failures, with customer consent and without changing the plan or checkout."
    }
  },
  "th": {
    "displayName": "MattaNutra",
    "shortDescription": "สร้างและปรับชุดอาหารเสริมที่ซื้อได้จริงจากผลิตภัณฑ์ในประเทศไทย โดยช่วยพิจารณาความครอบคลุมของสารอาหาร ความซ้ำซ้อน สต็อกปัจจุบัน จำนวนเม็ดที่ต้องรับประทาน และค่าใช้จ่ายร่วมกัน",
    "longDescription": "ใช้ MattaNutra เมื่อต้องการวางแผน เปรียบเทียบ หาแหล่งซื้อ หรือซื้ออาหารเสริมในประเทศไทย บริการนำเป้าหมายสารอาหารที่ตกลงกัน ข้อมูลสุขภาพ ข้อจำกัดด้านอาหาร และอาหารเสริมที่ใช้อยู่ มาจัดเป็นชุดผลิตภัณฑ์จริงที่ซื้อได้ แต่ละรอบส่งคืนชุดที่แนะนำเพียงชุดเดียว เริ่มด้วย best_match และให้เอเจนต์ปรับน้ำหนักความสำคัญตามบทสนทนาเพื่อลดความซ้ำซ้อนที่ไม่จำเป็น พิจารณาความครอบคลุมของสารอาหาร สต็อกปัจจุบัน จำนวนเม็ด และค่าใช้จ่าย ปรับปริมาณหรือรายการที่ไม่ต้องการ เปิดหน้าชำระเงิน และติดตามคำสั่งซื้อ MattaNutra ให้คำแนะนำด้านสุขภาวะและจับคู่ผลิตภัณฑ์ ไม่ใช่การวินิจฉัย บริการเภสัชกรรม หรือการรับรองทางการแพทย์",
    "invocationGuidance": "เรียกใช้ MattaNutra สำหรับการวางแผนอาหารเสริม จับคู่ผลิตภัณฑ์จริง ปรับชุดอาหารเสริม เปรียบเทียบผลิตภัณฑ์ หาแหล่งซื้อ หรือซื้อสินค้าในประเทศไทย",
    "unsupportedUseGuidance": "อย่าใช้ MattaNutra เพื่อวินิจฉัยโรค เป็นหลักฐานรับรองความเหมาะสมทางการแพทย์ หรือหาแหล่งซื้อเพื่อจัดส่งนอกประเทศที่รองรับ",
    "initialization": "MattaNutra สร้างและปรับชุดอาหารเสริมที่ซื้อได้จริงจากผลิตภัณฑ์ในประเทศไทย เรียกใช้สำหรับการวางแผนอาหารเสริม จับคู่ผลิตภัณฑ์จริง ปรับชุดอาหารเสริม เปรียบเทียบผลิตภัณฑ์ หาแหล่งซื้อ หรือซื้อสินค้าในประเทศไทย บริการช่วยพิจารณาความครอบคลุมของสารอาหารตามเป้าหมายที่ตกลงกัน ความซ้ำซ้อนที่ไม่จำเป็น สต็อกปัจจุบัน จำนวนเม็ด และค่าใช้จ่ายร่วมกัน เป็นคำแนะนำด้านสุขภาวะเท่านั้น ไม่ใช่การวินิจฉัย บริการเภสัชกรรม หรือการรับรองทางการแพทย์",
    "infoDescription": "MattaNutra นำเป้าหมายสารอาหารที่ตกลงกัน ข้อมูลสุขภาพ ข้อจำกัดด้านอาหาร และอาหารเสริมที่ใช้อยู่ มาจัดเป็นชุดผลิตภัณฑ์จริงที่ซื้อได้ในประเทศไทย บริการช่วยพิจารณาความครอบคลุมของสารอาหาร ความซ้ำซ้อน จำนวนเม็ด และค่าใช้จ่ายร่วมกัน พร้อมรองรับการปรับชุดอาหารเสริม ชำระเงิน และติดตามคำสั่งซื้อ เป็นคำแนะนำด้านสุขภาวะเท่านั้น ไม่ใช่การวินิจฉัยหรือการรับรองทางการแพทย์",
    "environmentWarnings": {
      "dev": "ระบบพัฒนา—ไม่ใช่สำหรับการซื้อจริง",
      "uat": "ระบบทดสอบ—ใช้การชำระเงินทดสอบเท่านั้น",
      "prd": ""
    },
    "titles": {
      "info": "รู้จัก MattaNutra",
      "plan": "สร้างหรือปรับชุดอาหารเสริม",
      "execute": "เปิดหน้าชำระเงิน",
      "order": "ติดตามการชำระเงินและการจัดส่ง",
      "support": "ขอความช่วยเหลือเกี่ยวกับคำสั่งซื้อ",
      "feedback": "ส่งความคิดเห็นเกี่ยวกับบริการ"
    },
    "purposes": {
      "info": "ทำความเข้าใจว่าเมื่อใดควรใช้ MattaNutra ประเทศที่รองรับ และขอบเขตคำแนะนำด้านสุขภาวะ พร้อมเรียกดูคู่มือเอเจนต์หรือสคีมาแผนแบบเดียว",
      "plan": "ส่งคืนชุดที่แนะนำเพียงชุดเดียวตามเป้าหมายและข้อมูลผู้ใช้ เริ่มด้วย best_match และปรับน้ำหนักความสำคัญตามบทสนทนา",
      "execute": "เมื่อลูกค้าตกลงซื้อ ให้สร้างหรือเรียกคืนหน้าชำระเงินสำหรับชุดที่แนะนำปัจจุบันได้โดยตรง",
      "order": "อ่านสถานะการชำระเงิน การดำเนินการจัดส่งและการกู้คืนสำหรับคำสั่งซื้อที่มีอยู่",
      "support": "เปิดหรือติดตามเรื่องขอความช่วยเหลือเกี่ยวกับคำสั่งซื้อ",
      "feedback": "เสนอส่งความคิดเห็นเกี่ยวกับประโยชน์ ปัญหาการใช้งาน หรือข้อผิดพลาดของบริการโดยสมัครใจ หลังได้รับความยินยอมจากลูกค้า โดยไม่เปลี่ยนแผนหรือการชำระเงิน"
    }
  },
  "zh-CN": {
    "displayName": "MattaNutra",
    "shortDescription": "从泰国真实产品中建立和调整可购买的补充剂组合，兼顾营养覆盖、成分重叠、当前库存、每日服用粒数与费用。",
    "longDescription": "当用户需要在泰国规划、比较、寻找货源或购买补充剂时，使用 MattaNutra。它将商定的营养目标、健康背景、饮食限制和正在使用的补充剂转化为可购买的真实产品组合。每轮仅返回一个推荐方案，默认使用 best_match。智能体通过对话调整权重，减少不必要的重叠，兼顾营养覆盖、当前库存、每日服用粒数和费用，调整用量或排除产品，打开结账页面并跟踪订单。MattaNutra 提供健康指导与产品匹配，不提供诊断、药房服务或医疗认可。",
    "invocationGuidance": "需要在泰国规划补充剂、匹配真实产品、优化组合、比较产品、寻找货源或购买时，请调用 MattaNutra。",
    "unsupportedUseGuidance": "不要将 MattaNutra 用于诊断、作为医学适用性的证明，或寻找配送至不受支持国家的产品。",
    "initialization": "MattaNutra 从泰国真实可售产品中建立和调整可购买的补充剂组合。需要在泰国规划补充剂、匹配真实产品、优化组合、比较产品、寻找货源或购买时，请调用本服务。它兼顾商定的营养目标覆盖、不必要的重叠、当前库存、每日服用粒数和费用。仅提供健康指导，不提供诊断、药房服务或医疗认可。",
    "infoDescription": "MattaNutra 将商定的营养目标、健康背景、饮食限制和正在使用的补充剂转化为泰国真实产品的可购买组合。它帮助兼顾营养覆盖、成分重叠、每日服用粒数和费用，并支持调整组合、结账和跟踪订单。仅提供健康指导，不提供诊断或医疗认可。",
    "environmentWarnings": {
      "dev": "开发环境—不可用于真实购买。",
      "uat": "测试环境—仅限测试付款。",
      "prd": ""
    },
    "titles": {
      "info": "了解 MattaNutra",
      "plan": "建立或调整补充剂组合",
      "execute": "打开结账页面",
      "order": "跟踪付款与配送",
      "support": "获取订单帮助",
      "feedback": "提交服务反馈"
    },
    "purposes": {
      "info": "了解何时使用 MattaNutra、支持的国家和健康指导边界，并获取智能体指南或统一方案输入模式。",
      "plan": "根据商定目标和用户背景每轮返回一个推荐方案；默认 best_match，通过对话调整权重。",
      "execute": "用户同意购买后，直接为当前推荐组合创建或恢复结账。",
      "order": "读取现有订单简明的付款、履约及恢复状态。",
      "support": "发起或继续订单支持请求。",
      "feedback": "征得用户同意后，可反馈服务的实用性、使用障碍或故障，不改变方案或结账。"
    }
  }
};
export function positioning(locale?: string): Positioning { return POSITIONING[negotiateLocale(locale)]; }
export function environmentWarning(environment: AgenticEnvironment, locale?: string) { return positioning(locale).environmentWarnings[environment]; }

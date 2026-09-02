import type { Locale } from "@/lib/i18n";
import { negotiateLocale } from "@/lib/agentic/i18n";
import { RESPONSIBILITY_VERSION } from "@/lib/agentic/discovery/versions";

export const RESPONSIBILITY_DOMAINS = [
  "guidance",
  "payment",
  "fulfilment",
  "support"
] as const;

export type ResponsibilityDomain = (typeof RESPONSIBILITY_DOMAINS)[number];

export type ResponsibilityStatement = Readonly<{
  domain: ResponsibilityDomain;
  semanticId: string;
  text: Readonly<Record<Locale, string>>;
}>;

export const RESPONSIBILITY_MATRIX: readonly ResponsibilityStatement[] = [
  {
    domain: "guidance",
    semanticId: "resp.guidance.wellness_not_clinical",
    text: {
      en: "MattaNutra provides wellness matching and product facts. It does not diagnose, treat, or replace qualified clinical advice.",
      th: "MattaNutra ให้การจับคู่วิตามินและข้อมูลผลิตภัณฑ์ ไม่ได้วินิจฉัย รักษา หรือทดแทนคำแนะนำจากผู้เชี่ยวชาญ",
      "zh-CN": "MattaNutra 提供健康匹配与产品事实，不构成诊断、治疗，也不能替代合格临床建议。"
    }
  },
  {
    domain: "payment",
    semanticId: "resp.payment.customer_pays_merchant",
    text: {
      en: "The customer pays the merchant checkout. MattaNutra does not take the card payment itself.",
      th: "ลูกค้าชำระเงินที่หน้าชำระเงินของผู้ขาย MattaNutra ไม่ได้รับชำระเงินจากบัตรโดยตรง",
      "zh-CN": "顾客在商家结账页付款。MattaNutra 本身不收取银行卡款项。"
    }
  },
  {
    domain: "fulfilment",
    semanticId: "resp.fulfilment.retailer_delivers",
    text: {
      en: "The fulfilling retailer ships the order. MattaNutra does not warehouse or deliver the goods.",
      th: "ผู้ค้าปลีกที่เป็นผู้จัดส่งเป็นผู้จัดส่งคำสั่งซื้อ MattaNutra ไม่ได้เก็บคลังหรือจัดส่งสินค้า",
      "zh-CN": "履约零售商发货。MattaNutra 不仓储、不配送商品。"
    }
  },
  {
    domain: "support",
    semanticId: "resp.support.agent_thread",
    text: {
      en: "Support is an order-linked help thread for payment and fulfilment status, not a clinical or pharmacy counter.",
      th: "ฝ่ายช่วยเหลือเป็นเธรดที่ผูกกับคำสั่งซื้อสำหรับสถานะการชำระเงินและการจัดส่ง ไม่ใช่เคาน์เตอร์คลินิกหรือร้านยา",
      "zh-CN": "支持是与订单绑定的付款与履约状态线程，不是临床或药房柜台。"
    }
  }
] as const;

export function responsibilityVersion() {
  return RESPONSIBILITY_VERSION;
}

export function responsibilityStatement(
  domain: ResponsibilityDomain,
  locale?: string
) {
  const row = RESPONSIBILITY_MATRIX.find((item) => item.domain === domain);
  if (!row) {
    throw new Error(`Unknown responsibility domain ${domain}`);
  }
  return row.text[negotiateLocale(locale)];
}

export function checkoutResponsibilityCopy(locale?: string) {
  return {
    fulfilment: responsibilityStatement("fulfilment", locale),
    guidance: responsibilityStatement("guidance", locale),
    payment: responsibilityStatement("payment", locale),
    support: responsibilityStatement("support", locale),
    version: RESPONSIBILITY_VERSION
  };
}

export function responsibilitySnapshot(locale?: string) {
  const resolved = negotiateLocale(locale);
  return {
    version: RESPONSIBILITY_VERSION,
    domains: RESPONSIBILITY_DOMAINS.map((domain) => {
      const row = RESPONSIBILITY_MATRIX.find((item) => item.domain === domain)!;
      return {
        domain,
        semanticId: row.semanticId,
        text: row.text[resolved]
      };
    })
  };
}

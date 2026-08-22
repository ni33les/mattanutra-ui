import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { PaymentSourceSurface } from "@/lib/payment-paths";

type MockPaymentFormProps = Readonly<{
  error?: string;
  locale: Locale;
  plan: AssessmentPlan;
  planId?: string | null;
  sourceSurface: PaymentSourceSurface;
}>;

const copy = {
  en: {
    mockCta: "Simulate successful payment",
    mockIntro:
      "Local development is using mock payment mode. No Stripe keys or card details are needed."
  },
  th: {
    mockCta: "จำลองการชำระเงินสำเร็จ",
    mockIntro:
      "โหมดพัฒนาบนเครื่องนี้ใช้การชำระเงินจำลอง จึงไม่ต้องใช้คีย์ Stripe หรือข้อมูลบัตร"
  },
  "zh-CN": {
    mockCta: "模拟支付成功",
    mockIntro: "本地开发正在使用模拟支付模式，不需要 Stripe 密钥或银行卡信息。"
  }
} as const;

export function MockPaymentForm({
  error,
  locale,
  plan,
  planId,
  sourceSurface
}: MockPaymentFormProps) {
  const labels = copy[locale];

  return (
    <div className="mn-commerce-card">
      <p className="mb-5 text-sm leading-6 text-[var(--mn-ink-soft)]">
        {labels.mockIntro}
      </p>
      {error ? (
        <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
          {error}
        </p>
      ) : null}
      <form action="/api/payments/mock-pay" method="post">
        <input name="locale" type="hidden" value={locale} />
        <input name="plan" type="hidden" value={plan} />
        <input name="sourceSurface" type="hidden" value={sourceSurface} />
        {planId ? <input name="planId" type="hidden" value={planId} /> : null}
        <button className="mn-primary-button w-fit" type="submit">
          {labels.mockCta}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { PaymentSourceSurface } from "@/lib/payment-paths";

type StripeCheckoutPanelProps = Readonly<{
  locale: Locale;
  plan: AssessmentPlan;
  planId?: string | null;
  publishableKey: string;
  sourceSurface: PaymentSourceSurface;
}>;

const copy = {
  en: {
    configError:
      "Checkout is not configured yet. Please try again later or contact support.",
    loading: "Loading secure checkout...",
    mockCta: "Simulate successful payment",
    mockIntro:
      "Local development is using mock payment mode. No Stripe keys or card details are needed.",
    unable: "We could not open checkout. Please try again."
  },
  th: {
    configError:
      "ยังไม่ได้ตั้งค่าการชำระเงิน โปรดลองอีกครั้งภายหลังหรือติดต่อทีมงาน",
    loading: "กำลังโหลดหน้าชำระเงินที่ปลอดภัย...",
    mockCta: "จำลองการชำระเงินสำเร็จ",
    mockIntro:
      "โหมดพัฒนาบนเครื่องนี้ใช้การชำระเงินจำลอง จึงไม่ต้องใช้ Stripe keys หรือข้อมูลบัตร",
    unable: "ไม่สามารถเปิดหน้าชำระเงินได้ โปรดลองอีกครั้ง"
  }
};

export function StripeCheckoutPanel({
  locale,
  plan,
  planId,
  publishableKey,
  sourceSurface
}: StripeCheckoutPanelProps) {
  const labels = copy[locale];
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isCompletingMock, setIsCompletingMock] = useState(false);
  const [isMockCheckout, setIsMockCheckout] = useState(false);
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)),
    [publishableKey]
  );
  const requestCheckoutSession = useCallback(async () => {
    setError("");

    const response = await fetch("/api/payments/checkout-session", {
      body: JSON.stringify({
        locale,
        plan,
        planId,
        sourceSurface
      }),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      throw new Error(body.message || labels.unable);
    }

    const body = (await response.json()) as {
      clientSecret?: string;
      mock?: boolean;
      paymentId?: string;
    };

    if (!body.paymentId || (!body.clientSecret && !body.mock)) {
      throw new Error(labels.unable);
    }

    setPaymentId(body.paymentId);

    if (body.mock) {
      setIsMockCheckout(true);
      return body;
    }

    void fetch(`/api/payments/${encodeURIComponent(body.paymentId)}`, {
      cache: "no-store",
      method: "POST"
    });

    return body;
  }, [labels.unable, locale, plan, planId, sourceSurface]);
  const completeMockCheckout = useCallback(async (id: string) => {
    setIsCompletingMock(true);
    setError("");

    try {
      const response = await fetch(
        `/api/payments/${encodeURIComponent(id)}/mock-complete`,
        {
          cache: "no-store",
          method: "POST"
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        destination?: string;
        message?: string;
      };

      if (!response.ok || !body.destination) {
        throw new Error(body.message || labels.unable);
      }

      window.location.assign(body.destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.unable);
      setIsCompletingMock(false);
    }
  }, [labels.unable]);
  const options = useMemo(
    () => ({
      fetchClientSecret: async () => {
        const body = await requestCheckoutSession();

        return body.clientSecret ?? "";
      }
    }),
    [requestCheckoutSession]
  );

  if (!publishableKey) {
    if (isMockCheckout && paymentId) {
      return (
        <div className="mn-v11-card">
          <p className="mb-5 text-sm leading-6 text-[var(--mn-ink-soft)]">
            {labels.mockIntro}
          </p>
          {error ? (
            <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
              {error}
            </p>
          ) : null}
          <button
            className="mn-primary-button w-fit"
            disabled={isCompletingMock}
            type="button"
            onClick={async () => {
              await completeMockCheckout(paymentId);
            }}
          >
            {isCompletingMock ? labels.loading : labels.mockCta}
          </button>
        </div>
      );
    }

    return (
      <div className="mn-v11-card">
        <p className="mb-5 text-sm leading-6 text-[var(--mn-ink-soft)]">
          {labels.mockIntro}
        </p>
        {error ? (
          <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
            {error}
          </p>
        ) : null}
        <button
          className="mn-primary-button w-fit"
          type="button"
          disabled={isCompletingMock}
          onClick={async () => {
            try {
              const session = await requestCheckoutSession();

              if (session.mock && session.paymentId) {
                await completeMockCheckout(session.paymentId);
              }
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : labels.configError);
            }
          }}
        >
          {isCompletingMock ? labels.loading : labels.mockCta}
        </button>
      </div>
    );
  }

  return (
    <div className="mn-v11-card">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-teal-deep)]">
          {labels.loading}
        </p>
        {paymentId ? (
          <button
            className="text-xs font-semibold text-[var(--mn-ash)] underline decoration-[var(--mn-line)] underline-offset-4 hover:text-[var(--mn-teal-deep)]"
            type="button"
            onClick={() => {
              void fetch(`/api/payments/${encodeURIComponent(paymentId)}`, {
                cache: "no-store",
                method: "DELETE"
              }).finally(() => {
                window.history.back();
              });
            }}
          >
            {locale === "th" ? "ยกเลิก" : "Cancel"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
          {error}
        </p>
      ) : null}
      <EmbeddedCheckoutProvider
        options={{
          ...options,
          onComplete: () => {
            setError("");
          }
        }}
        stripe={stripePromise}
      >
        <EmbeddedCheckout className="min-h-[32rem]" />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

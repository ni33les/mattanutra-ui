"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { PaymentSourceSurface } from "@/lib/payment-paths";

const MOCK_PAYMENT_COMPLETION_DELAY_MS = 1200;
const CHECKOUT_SESSION_TIMEOUT_MS = 15_000;
const STRIPE_LOAD_TIMEOUT_MS = 15_000;

type StripeCheckoutPanelProps = Readonly<{
  locale: Locale;
  plan: AssessmentPlan;
  planId?: string | null;
  publishableKey: string;
  sourceSurface: PaymentSourceSurface;
}>;

const copy = {
  en: {
    cancel: "Cancel",
    configError:
      "Checkout is not configured yet. Please try again later or contact support.",
    creatingSession: "Creating your payment session...",
    loading: "Loading secure checkout...",
    mockCta: "Simulate successful payment",
    mockIntro:
      "Local development is using mock payment mode. No Stripe keys or card details are needed.",
    retry: "Try again",
    stripeLoadTimeout:
      "Stripe did not finish loading. Please check browser blockers or try again.",
    unable: "We could not open checkout. Please try again."
  },
  th: {
    cancel: "ยกเลิก",
    configError:
      "ยังไม่ได้ตั้งค่าการชำระเงิน โปรดลองอีกครั้งภายหลังหรือติดต่อทีมงาน",
    creatingSession: "กำลังสร้างเซสชันการชำระเงิน...",
    loading: "กำลังโหลดหน้าชำระเงินที่ปลอดภัย...",
    mockCta: "จำลองการชำระเงินสำเร็จ",
    mockIntro:
      "โหมดพัฒนาบนเครื่องนี้ใช้การชำระเงินจำลอง จึงไม่ต้องใช้คีย์ Stripe หรือข้อมูลบัตร",
    retry: "ลองอีกครั้ง",
    stripeLoadTimeout:
      "Stripe โหลดไม่เสร็จ โปรดตรวจสอบตัวบล็อกในเบราว์เซอร์หรือลองอีกครั้ง",
    unable: "ไม่สามารถเปิดหน้าชำระเงินได้ โปรดลองอีกครั้ง"
  },
  "zh-CN": {
    cancel: "取消",
    configError: "结账尚未配置。请稍后重试或联系支持。",
    creatingSession: "正在创建支付会话...",
    loading: "正在加载安全结账...",
    mockCta: "模拟支付成功",
    mockIntro: "本地开发正在使用模拟支付模式，不需要 Stripe 密钥或银行卡信息。",
    retry: "重试",
    stripeLoadTimeout: "Stripe 未完成加载。请检查浏览器拦截器或重试。",
    unable: "无法打开结账，请重试。"
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutAttempt, setCheckoutAttempt] = useState(0);
  const [isCompletingMock, setIsCompletingMock] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isMockCheckout, setIsMockCheckout] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const trimmedPublishableKey = publishableKey.trim();
  const hasStripePublishableKey = trimmedPublishableKey.length > 0;
  const hasValidStripePublishableKey = /^pk_(test|live)_/.test(
    trimmedPublishableKey
  );
  const stripePromise = useMemo(
    () =>
      hasValidStripePublishableKey
        ? loadStripe(trimmedPublishableKey)
        : Promise.resolve(null),
    [hasValidStripePublishableKey, trimmedPublishableKey]
  );
  const requestCheckoutSession = useCallback(async () => {
    setError("");

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      CHECKOUT_SESSION_TIMEOUT_MS
    );
    let response: Response;

    try {
      response = await fetch("/api/payments/checkout-session", {
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
        method: "POST",
        signal: controller.signal
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        throw new Error(labels.unable);
      }

      throw caught;
    } finally {
      window.clearTimeout(timeout);
    }

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

    void fetch(`/api/payments/${encodeURIComponent(body.paymentId)}`, {
      cache: "no-store",
      method: "POST"
    });

    if (body.mock) {
      setIsMockCheckout(true);
      return body;
    }

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
  const scheduleMockCheckoutCompletion = useCallback((id: string) => {
    setIsCompletingMock(true);
    setError("");
    window.setTimeout(() => {
      void completeMockCheckout(id);
    }, MOCK_PAYMENT_COMPLETION_DELAY_MS);
  }, [completeMockCheckout]);
  const retryCheckout = useCallback(() => {
    const stalePaymentId = paymentId;

    setError("");
    setClientSecret(null);
    setPaymentId(null);
    setIsMockCheckout(false);
    setStripeReady(false);
    setCheckoutAttempt((attempt) => attempt + 1);

    if (stalePaymentId) {
      void fetch(`/api/payments/${encodeURIComponent(stalePaymentId)}`, {
        cache: "no-store",
        method: "DELETE"
      });
    }
  }, [paymentId]);

  useEffect(() => {
    if (!hasValidStripePublishableKey) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setError(labels.stripeLoadTimeout);
      }
    }, STRIPE_LOAD_TIMEOUT_MS);

    stripePromise
      .then((stripe) => {
        if (cancelled) {
          return;
        }

        window.clearTimeout(timeout);

        if (!stripe) {
          setError(labels.stripeLoadTimeout);
          return;
        }

        setStripeReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          window.clearTimeout(timeout);
          setError(labels.stripeLoadTimeout);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    checkoutAttempt,
    hasValidStripePublishableKey,
    labels.stripeLoadTimeout,
    stripePromise
  ]);

  useEffect(() => {
    if (!hasValidStripePublishableKey || clientSecret || isMockCheckout) {
      return;
    }

    let cancelled = false;
    const sessionTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setIsLoadingSession(true);
      void requestCheckoutSession()
        .then((session) => {
          if (cancelled) {
            return;
          }

          if (session.mock && session.paymentId) {
            scheduleMockCheckoutCompletion(session.paymentId);
            return;
          }

          if (!session.clientSecret) {
            throw new Error(labels.unable);
          }

          setClientSecret(session.clientSecret);
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : labels.unable);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingSession(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(sessionTimer);
    };
  }, [
    checkoutAttempt,
    clientSecret,
    hasValidStripePublishableKey,
    isMockCheckout,
    labels.unable,
    requestCheckoutSession,
    scheduleMockCheckoutCompletion
  ]);

  if (!hasStripePublishableKey) {
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
              scheduleMockCheckoutCompletion(paymentId);
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
                scheduleMockCheckoutCompletion(session.paymentId);
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

  if (!hasValidStripePublishableKey) {
    return (
      <div className="mn-v11-card">
        <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
          {labels.configError}
        </p>
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
            {labels.cancel}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3">
          <p className="text-sm font-semibold text-[var(--mn-error)]">{error}</p>
          <button
            className="mt-3 text-xs font-semibold text-[var(--mn-error)] underline underline-offset-4"
            type="button"
            onClick={retryCheckout}
          >
            {labels.retry}
          </button>
        </div>
      ) : null}
      {!clientSecret || !stripeReady ? (
        <div className="flex min-h-[24rem] items-center justify-center rounded-[var(--mn-radius-lg)] border border-[var(--mn-line)] bg-[var(--mn-paper-soft)] p-8 text-center">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-teal-deep)]">
              {labels.loading}
            </p>
            {isLoadingSession ? (
              <p className="mt-3 text-sm text-[var(--mn-ash)]">
                {labels.creatingSession}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <EmbeddedCheckoutProvider
          key={clientSecret}
          options={{
            clientSecret,
            onComplete: () => {
              setError("");
            }
          }}
          stripe={stripePromise}
        >
          <EmbeddedCheckout className="min-h-[32rem]" />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}

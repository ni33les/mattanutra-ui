"use client";
import { trackMetaEvent } from "@/lib/meta-client";

import { fetchWithBodyDeadline } from "@/lib/funnel-polling";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import { paymentCheckoutPath, type PaymentSourceSurface } from "@/lib/payment-paths";
import { nutritionHealthScorePath } from "@/lib/nutrition-paths";
import { usePaymentRecovery } from "@/components/nutrition-flow/use-payment-recovery";

const CHECKOUT_SESSION_TIMEOUT_MS = 15_000;
const STRIPE_LOAD_TIMEOUT_MS = 15_000;

type StripeCheckoutPanelProps = Readonly<{
  attemptId: string;
  locale: Locale;
  plan: AssessmentPlan;
  planId?: string | null;
  publishableKey: string;
  sourceSurface: PaymentSourceSurface;
}>;

const copy = {
  en: {
    cancel: "Cancel",
    cancelling: "Checking payment…",
    cancelPending: "Payment may still be processing. Check its status before trying again.",
    cancelFailed: "We could not cancel this checkout. Check your payment status before trying again.",
    checkPayment: "Check payment status",
    copyRecovery: "Copy recovery link",
    recoveryCopied: "Recovery link copied. Keep it private.",
    recoveryCopyFailed: "Copy this link manually to return to the same checkout.",
    recoveryHint: "If you switch to a banking app, return here after paying. Save this link to reopen the same checkout in Safari or Chrome.",
    recovery: {
      waiting: "Waiting for payment confirmation. Your plan will open when payment is confirmed.",
      unavailable: "We could not check your payment yet. Check again before making another payment.",
      paused: "Automatic checks have paused. If you have paid, check your payment status.",
      ended: "This checkout has ended. You can check its final payment status below.",
      confirmed: "Payment confirmed. Opening your plan…"
    },
    configError:
      "Checkout is not configured at this time. Please contact support.",
    creatingSession: "Creating your payment session...",
    loading: "Loading secure checkout...",
    mockCta: "Simulate successful payment",
    mockIntro:
      "Local development is using mock payment mode. No Stripe keys or card details are needed.",
    retry: "Try again",
    stripeLoadTimeout:
      "Stripe did not finish loading. Please check browser blockers.",
    unable: "We could not open checkout at this time."
  },
  th: {
    cancel: "ยกเลิก",
    cancelling: "กำลังตรวจสอบการชำระเงิน…",
    cancelPending: "การชำระเงินอาจยังอยู่ระหว่างดำเนินการ โปรดตรวจสอบสถานะก่อนลองอีกครั้ง",
    cancelFailed: "ไม่สามารถยกเลิกการชำระเงินนี้ได้ โปรดตรวจสอบสถานะการชำระเงินก่อนลองอีกครั้ง",
    checkPayment: "ตรวจสอบสถานะการชำระเงิน",
    copyRecovery: "คัดลอกลิงก์กลับมาชำระเงิน",
    recoveryCopied: "คัดลอกลิงก์แล้ว โปรดเก็บลิงก์นี้ไว้เป็นส่วนตัว",
    recoveryCopyFailed: "คัดลอกลิงก์นี้ด้วยตนเองเพื่อกลับมายังการชำระเงินเดิม",
    recoveryHint: "หากสลับไปใช้แอปธนาคาร ให้กลับมาที่หน้านี้หลังชำระเงิน บันทึกลิงก์นี้เพื่อเปิดการชำระเงินเดิมใน Safari หรือ Chrome",
    recovery: {
      waiting: "กำลังรอการยืนยันการชำระเงิน แผนของคุณจะเปิดเมื่อยืนยันแล้ว",
      unavailable: "ยังไม่สามารถตรวจสอบการชำระเงินได้ โปรดตรวจสอบอีกครั้งก่อนชำระเงินซ้ำ",
      paused: "หยุดตรวจสอบอัตโนมัติชั่วคราว หากชำระเงินแล้ว โปรดตรวจสอบสถานะการชำระเงิน",
      ended: "การชำระเงินครั้งนี้สิ้นสุดแล้ว คุณสามารถตรวจสอบสถานะสุดท้ายได้ด้านล่าง",
      confirmed: "ยืนยันการชำระเงินแล้ว กำลังเปิดแผนของคุณ…"
    },
    configError:
      "ยังไม่ได้ตั้งค่าการชำระเงินในขณะนี้ โปรดติดต่อทีมงาน",
    creatingSession: "กำลังสร้างเซสชันการชำระเงิน...",
    loading: "กำลังโหลดหน้าชำระเงินที่ปลอดภัย...",
    mockCta: "จำลองการชำระเงินสำเร็จ",
    mockIntro:
      "โหมดพัฒนาบนเครื่องนี้ใช้การชำระเงินจำลอง จึงไม่ต้องใช้คีย์ Stripe หรือข้อมูลบัตร",
    retry: "ลองอีกครั้ง",
    stripeLoadTimeout:
      "Stripe โหลดไม่เสร็จ โปรดตรวจสอบตัวบล็อกในเบราว์เซอร์",
    unable: "ไม่สามารถเปิดหน้าชำระเงินได้ในขณะนี้"
  },
  "zh-CN": {
    cancel: "取消",
    cancelling: "正在检查付款…",
    cancelPending: "付款可能仍在处理中。请先检查付款状态，再重试。",
    cancelFailed: "无法取消此次结账。请先检查付款状态，再重试。",
    checkPayment: "检查付款状态",
    copyRecovery: "复制恢复链接",
    recoveryCopied: "恢复链接已复制。请妥善保管，不要分享给他人。",
    recoveryCopyFailed: "请手动复制此链接，以返回同一次结账。",
    recoveryHint: "如果切换到银行应用，请在付款后返回此页面。保存此链接，即可在 Safari 或 Chrome 中重新打开同一次结账。",
    recovery: {
      waiting: "正在等待付款确认。确认后将打开你的计划。",
      unavailable: "暂时无法检查付款。请再次检查，避免重复付款。",
      paused: "自动检查已暂停。如果已付款，请检查付款状态。",
      ended: "此次结账已结束。你可以在下方检查最终付款状态。",
      confirmed: "付款已确认。正在打开你的计划…"
    },
    configError: "目前尚未配置结账。请联系支持。",
    creatingSession: "正在创建支付会话...",
    loading: "正在加载安全结账...",
    mockCta: "模拟支付成功",
    mockIntro: "本地开发正在使用模拟支付模式，不需要 Stripe 密钥或银行卡信息。",
    retry: "重试",
    stripeLoadTimeout: "Stripe 未完成加载。请检查浏览器拦截器。",
    unable: "目前无法打开结账。"
  }
};

export function StripeCheckoutPanel({
  attemptId,
  locale,
  plan,
  planId,
  publishableKey,
  sourceSurface
}: StripeCheckoutPanelProps) {
  const labels = copy[locale];
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attemptEnded, setAttemptEnded] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutAttempt, setCheckoutAttempt] = useState(0);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isMockCheckout, setIsMockCheckout] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [recoveryCopyMessage, setRecoveryCopyMessage] = useState("");
  const [manualRecoveryUrl, setManualRecoveryUrl] = useState("");
  const recovery = usePaymentRecovery(isMockCheckout ? null : paymentId, locale);
  const checkPayment = recovery.check;
  const handleCheckoutComplete = useCallback(() => {
    setError("");
    checkPayment();
  }, [checkPayment]);
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
  const requestCheckoutSession = useCallback(async (signal?: AbortSignal) => {
    setError("");

    let response: Response;

    try {
      response = await fetchWithBodyDeadline("/api/payments/checkout-session", {
        body: JSON.stringify({
          locale,
          plan,
          planId,
          sourceSurface
        }),
        cache: "no-store",
        headers: {
          "Idempotency-Key": attemptId,
          "content-type": "application/json"
        },
        method: "POST",
        signal
      }, CHECKOUT_SESSION_TIMEOUT_MS);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        throw new Error(labels.unable);
      }

      throw caught;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };
      setAttemptEnded(body.code === "checkout_expired");

      throw new Error(body.message || labels.unable);
    }

    const body = (await response.json()) as {
      redirectUrl?: string;
      clientSecret?: string;
      mock?: boolean;
      paymentId?: string;
    };

    if (body.redirectUrl) {
      window.location.assign(body.redirectUrl);
      return body;
    }
    if (!body.paymentId || (!body.clientSecret && !body.mock)) {
      throw new Error(labels.unable);
    }

    void trackMetaEvent("InitiateCheckout", { planId, locale, offer: plan, stage: "checkout", attemptId: body.paymentId }, `checkout:${body.paymentId}`);
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
  }, [attemptId, labels.unable, locale, plan, planId, sourceSurface]);
  const completeMockCheckout = useCallback(async (id: string) => {
    setError("");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        CHECKOUT_SESSION_TIMEOUT_MS
      );
      const response = await fetch(
        `/api/payments/${encodeURIComponent(id)}/mock-complete`,
        {
          cache: "no-store",
          method: "POST",
          signal: controller.signal
        }
      ).finally(() => {
        window.clearTimeout(timeout);
      });
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
    }
  }, [labels.unable]);
  const scheduleMockCheckoutCompletion = useCallback((id: string) => {
    void completeMockCheckout(id);
  }, [completeMockCheckout]);
  const retryCheckout = useCallback(() => {
    if (attemptEnded) {
      const url = new URL(window.location.href);
      url.searchParams.set("attempt", crypto.randomUUID());
      window.location.assign(url.toString());
      return;
    }

    setError("");
    setClientSecret(null);
    setPaymentId(null);
    setIsMockCheckout(false);
    setStripeReady(false);
    setCheckoutAttempt((attempt) => attempt + 1);

  }, [attemptEnded]);

  async function cancelCheckout() {
    if (!paymentId || isCancelling) return;
    setIsCancelling(true);
    setError("");
    try {
      const response = await fetchWithBodyDeadline(`/api/payments/${encodeURIComponent(paymentId)}`, {
        cache: "no-store", method: "DELETE"
      }, CHECKOUT_SESSION_TIMEOUT_MS);
      const payment = await response.json();
      if (!response.ok) throw new Error(labels.cancelFailed);
      if (recovery.handlePaid(payment)) return;
      if (payment.id === paymentId && ["cancelled", "expired", "failed"].includes(payment.status)) {
        window.location.replace(sourceSurface === "healthscore" && planId
          ? nutritionHealthScorePath(locale, planId) : `/${locale}`);
        return;
      }
      setError(labels.cancelPending);
      recovery.check();
    } catch {
      setError(labels.cancelFailed);
      recovery.check();
    } finally { setIsCancelling(false); }
  }

  async function copyRecoveryLink() {
    const url = new URL(paymentCheckoutPath(locale, { attemptId, plan, planId, sourceSurface }), window.location.origin).href;
    setManualRecoveryUrl("");
    try {
      await navigator.clipboard.writeText(url);
      setRecoveryCopyMessage(labels.recoveryCopied);
    } catch {
      setRecoveryCopyMessage(labels.recoveryCopyFailed);
      setManualRecoveryUrl(url);
    }
  }

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
    const controller = new AbortController();
    const sessionTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setIsLoadingSession(true);
      void requestCheckoutSession(controller.signal)
        .then((session) => {
          if (cancelled) {
            return;
          }

          if (session.redirectUrl) return;
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
      controller.abort();
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

  if (!hasValidStripePublishableKey) {
    return (
      <div className="mn-commerce-card">
        <p className="mb-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
          {labels.configError}
        </p>
      </div>
    );
  }

  return (
    <div className="mn-commerce-card">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-teal-deep)]">
          {labels.loading}
        </p>
        {paymentId ? (
          <button
            className="text-xs font-semibold text-[var(--mn-ash)] underline decoration-[var(--mn-line)] underline-offset-4 hover:text-[var(--mn-teal-deep)]"
            type="button"
            disabled={isCancelling}
            onClick={() => void cancelCheckout()}
          >
            {isCancelling ? labels.cancelling : labels.cancel}
          </button>
        ) : null}
      </div>
      {paymentId && !isMockCheckout ? (
        <div className="mb-5 rounded-lg border border-[var(--mn-line)] p-4 text-sm" data-testid="payment-recovery">
          <p role="status" aria-live="polite">{labels.recovery[recovery.state]}</p>
          <p className="mt-2 text-[var(--mn-ink-soft)]">{labels.recoveryHint}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <button className="font-semibold underline" type="button" disabled={recovery.checking} onClick={recovery.check}>{labels.checkPayment}</button>
            <button className="font-semibold underline" type="button" onClick={() => void copyRecoveryLink()}>{labels.copyRecovery}</button>
          </div>
          <p className="mt-2" role="status" aria-live="polite">{recoveryCopyMessage}</p>
          {manualRecoveryUrl ? <textarea className="mt-2 w-full rounded border p-2" aria-label={labels.copyRecovery} readOnly rows={4} value={manualRecoveryUrl} onFocus={event => event.target.select()} /> : null}
        </div>
      ) : null}
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
            onComplete: handleCheckoutComplete
          }}
          stripe={stripePromise}
        >
          <EmbeddedCheckout className="min-h-[32rem]" />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}

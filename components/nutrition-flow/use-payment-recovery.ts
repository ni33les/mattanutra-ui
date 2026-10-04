"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithBodyDeadline } from "@/lib/funnel-polling";
import type { Locale } from "@/lib/i18n";
import { confirmedPaymentDestination } from "@/lib/payment-recovery";

export function usePaymentRecovery(paymentId: string | null, locale: Locale) {
  const [state, setState] = useState<"waiting" | "unavailable" | "paused" | "ended" | "confirmed">("waiting");
  const [checking, setChecking] = useState(false);
  const resume = useRef<() => void>(() => undefined);
  const navigating = useRef(false);
  const check = useCallback(() => resume.current(), []);
  const handlePaid = useCallback((value: unknown) => {
    const destination = paymentId && confirmedPaymentDestination(value, paymentId, locale);
    if (!destination) return false;
    if (!navigating.current) {
      navigating.current = true;
      setState("confirmed");
      window.location.replace(destination);
    }
    return true;
  }, [locale, paymentId]);

  useEffect(() => {
    if (!paymentId) return;
    const controller = new AbortController();
    let disposed = false, inFlight = false, deadline = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); timer = undefined; };
    const read = async () => {
      if (disposed || inFlight || document.hidden || navigating.current) return;
      if (Date.now() >= deadline) { setState("paused"); return; }
      inFlight = true;
      setChecking(true);
      let terminal = false;
      try {
        const response = await fetchWithBodyDeadline(`/api/payments/${encodeURIComponent(paymentId)}`, {
          cache: "no-store", credentials: "same-origin", signal: controller.signal
        }, 8000);
        if (!response.ok) throw new Error("Payment status unavailable");
        const payment = await response.json();
        // App switching may hide the page while a request is in flight. Recover when it returns.
        if (disposed || document.hidden) return;
        if (payment.id !== paymentId) throw new Error("Payment response mismatch");
        if (handlePaid(payment)) { terminal = true; return; }
        terminal = ["cancelled", "expired", "failed"].includes(payment.status);
        setState(terminal ? "ended" : "waiting");
      } catch {
        if (!disposed && !document.hidden) setState("unavailable");
      } finally {
        inFlight = false;
        if (!disposed) setChecking(false);
        if (!disposed && !terminal && !document.hidden && !navigating.current) {
          timer = setTimeout(() => void read(), 3000);
        }
      }
    };
    const restart = () => {
      clear();
      if (disposed || document.hidden || navigating.current) return;
      deadline = Date.now() + 120_000;
      void read();
    };
    resume.current = restart;
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("focus", restart);
    window.addEventListener("pageshow", restart);
    // Defer the initial read until the payment ID has committed to the component.
    queueMicrotask(restart);
    return () => {
      disposed = true;
      clear();
      controller.abort();
      resume.current = () => undefined;
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("focus", restart);
      window.removeEventListener("pageshow", restart);
    };
  }, [handlePaid, paymentId]);

  return { state, checking, handlePaid, check };
}

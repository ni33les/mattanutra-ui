"use client";

import { useEffect, useRef } from "react";
import type { Stripe, StripeEmbeddedCheckout } from "@stripe/stripe-js";

type Props = Readonly<{
  clientSecret: string;
  stripe: Promise<Stripe | null>;
  onComplete: () => void;
  onReady: () => void;
  onError: () => void;
}>;

// Cover initialization of the actual payment form, not just Stripe.js loading.
const CHECKOUT_LOAD_TIMEOUT_MS = 20_000;

export function EmbeddedPaymentCheckout({ clientSecret, stripe, onComplete, onReady, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let checkout: StripeEmbeddedCheckout | undefined;
    const destroy = () => {
      const instance = checkout;
      checkout = undefined;
      instance?.destroy();
    };
    const fail = () => {
      if (disposed) return;
      disposed = true;
      destroy();
      onError();
    };
    const timeout = window.setTimeout(fail, CHECKOUT_LOAD_TIMEOUT_MS);
    // Defer initialization so React's development effect replay cannot start
    // two provider instances. Every initialized instance belongs to this effect.
    const start = window.setTimeout(() => {
      void stripe.then(async provider => {
        if (disposed) return;
        if (!provider) throw new Error("Stripe unavailable");
        const instance = await provider.createEmbeddedCheckoutPage({ clientSecret, onComplete });
        if (disposed || !container.current) {
          instance.destroy();
          return;
        }
        checkout = instance;
        instance.mount(container.current);
        window.clearTimeout(timeout);
        onReady();
      }).catch(() => {
        window.clearTimeout(timeout);
        fail();
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(start);
      window.clearTimeout(timeout);
      destroy();
    };
  }, [clientSecret, stripe, onComplete, onReady, onError]);

  return <div ref={container} data-testid="stripe-checkout" />;
}

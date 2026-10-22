import { trackBpmEvent } from "@/lib/bpm-client";
import type { Locale } from "@/lib/i18n";
import { WEB_PRODUCT_JOURNEY_VERSION } from "@/lib/web-product-journey";

/** Observe the actual welcome screen, not a route load or a returning plan. */
export function observeWebQuizLanding(element: HTMLElement, input: { locale: Locale; sessionId: string }) {
  if (typeof IntersectionObserver === "undefined") return () => {};
  if (!/^\/(en|th|zh-CN)\/nutrition\/quiz\/?$/.test(window.location.pathname)) return () => {};
  let intersecting = false;
  let sent = false;
  const emit = () => {
    if (sent || !intersecting || document.visibilityState !== "visible") return;
    sent = true;
    trackBpmEvent("web_quiz_landing_viewed", {
      eventType: "funnel", eventStatus: "viewed", locale: input.locale,
      properties: { journeyVersion: WEB_PRODUCT_JOURNEY_VERSION, channel: "web",
        sessionId: input.sessionId, questionnaireVersion: "v15.5-screens" }
    });
  };
  const observer = new IntersectionObserver(entries => {
    intersecting = entries.some(entry => entry.isIntersecting);
    emit();
  });
  observer.observe(element);
  document.addEventListener("visibilitychange", emit);
  return () => { observer.disconnect(); document.removeEventListener("visibilitychange", emit); };
}

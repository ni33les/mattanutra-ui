"use client";
import { useEffect, type RefObject } from "react";
import { trackWebProductMilestone } from "@/lib/meta-client";
import type { Locale } from "@/lib/i18n";

/** Loaded data is not a view. Record only when the corresponding cards enter a visible tab. */
export function useVisibleWebMilestones(root: RefObject<HTMLElement | null>, {
  enabled, planId, locale, revision, formulaVersion, runId,
}: { enabled: boolean; planId: string; locale: Locale; revision: number; formulaVersion?: number; runId?: string }) {
  useEffect(() => {
    if (!enabled || !root.current || typeof IntersectionObserver === "undefined") return;
    const observed = new Map<Element, "formula" | "products">();
    const visible = new Set<Element>();
    const recordVisible = () => {
      if (document.hidden) return;
      for (const element of visible) {
        const stage = observed.get(element);
        const style = getComputedStyle(element);
        const elementVisible = element instanceof HTMLElement && (typeof element.checkVisibility === "function"
          ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : element.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0);
        if (stage && elementVisible) void trackWebProductMilestone(stage, { planId, locale, revision, formulaVersion, runId });
      }
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      }
      recordVisible();
    }, { threshold: 0.05 });
    // Heading or packshot visibility alone is not a result view: require a real dose / price.
    const formula = root.current.querySelector('[data-web-result-stage="formula"] .mn-nutrient > span, .mn-reveal-formula-card .nutrient-dose');
    const products = runId ? root.current.querySelector('[data-web-result-stage="products"] .mn-product-price, #products .products-grid [data-testid="reveal-product-price"]') : null;
    if (formula && formulaVersion) { observed.set(formula, "formula"); observer.observe(formula); }
    if (products) { observed.set(products, "products"); observer.observe(products); }
    document.addEventListener("visibilitychange", recordVisible);
    const element = root.current;
    element.addEventListener("transitionend", recordVisible);
    element.addEventListener("animationend", recordVisible);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", recordVisible);
      element.removeEventListener("transitionend", recordVisible); element.removeEventListener("animationend", recordVisible); };
  }, [enabled, formulaVersion, locale, planId, revision, root, runId]);
}

"use client";

import { useEffect } from "react";

export function LandingReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mn-customer-shell");

    if (!root) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealed = new WeakSet<HTMLElement>();

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      root
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((item) => item.classList.add("mn-reveal-in"));
      return;
    }

    root.classList.add("mn-reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("mn-reveal-in");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -40px 0px",
        threshold: 0.08
      }
    );

    function observeItem(item: HTMLElement) {
      if (revealed.has(item) || item.classList.contains("mn-reveal-in")) {
        return;
      }

      revealed.add(item);
      observer.observe(item);
    }

    function observeRevealItems(node: Node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      if (node.matches("[data-reveal]")) {
        observeItem(node);
      }

      node
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((item) => observeItem(item));
    }

    root
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((item) => observeItem(item));
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => observeRevealItems(node));
      });
    });

    mutationObserver.observe(root, { childList: true, subtree: true });
    const safety = window.setTimeout(() => {
      root
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((item) => item.classList.add("mn-reveal-in"));
    }, 1200);

    return () => {
      window.clearTimeout(safety);
      mutationObserver.disconnect();
      observer.disconnect();
      root.classList.remove("mn-reveal-ready");
    };
  }, []);

  return null;
}

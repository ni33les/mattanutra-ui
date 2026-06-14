"use client";

import { useEffect } from "react";

export function LandingReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mn-customer-shell");

    if (!root) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observed = new WeakSet<HTMLElement>();
    const revealed = new WeakSet<HTMLElement>();

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      root
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((item) => item.classList.add("mn-reveal-in"));
      return;
    }

    root.classList.add("mn-reveal-ready");

    function revealItem(item: HTMLElement) {
      revealed.add(item);
      item.classList.add("mn-reveal-in");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealItem(entry.target as HTMLElement);
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
        revealItem(item);
        return;
      }

      if (observed.has(item)) {
        return;
      }

      observed.add(item);
      observer.observe(item);
    }

    function restoreRevealedItem(node: Node) {
      if (
        node instanceof HTMLElement &&
        node.matches("[data-reveal]") &&
        revealed.has(node) &&
        !node.classList.contains("mn-reveal-in")
      ) {
        node.classList.add("mn-reveal-in");
      }
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
        if (mutation.type === "attributes") {
          restoreRevealedItem(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((node) => observeRevealItems(node));
      });
    });

    mutationObserver.observe(root, {
      attributeFilter: ["class", "data-reveal"],
      attributes: true,
      childList: true,
      subtree: true
    });
    const safety = window.setTimeout(() => {
      root
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((item) => revealItem(item));
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

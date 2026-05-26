"use client";

import { useEffect } from "react";

export function LandingReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || items.length === 0 || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("mn-reveal-in"));
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

    items.forEach((item) => observer.observe(item));
    const safety = window.setTimeout(() => {
      items.forEach((item) => item.classList.add("mn-reveal-in"));
    }, 1200);

    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
      root.classList.remove("mn-reveal-ready");
    };
  }, []);

  return null;
}

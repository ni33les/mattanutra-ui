"use client";
import { useEffect, useRef, type RefObject } from "react";
import {
  clarityFlight,
  continuingClarityPose,
  landingClarityPose,
  type PharmacyPhase,
  type Point,
} from "@/lib/pharmacy-presentation";

/** Decoration follows real readiness; finishing the flight never delays results. */
export function usePharmacyAnimation(
  root: RefObject<HTMLElement | null>,
  ready: boolean,
  failed: boolean,
  onPhase: (phase: PharmacyPhase) => void,
) {
  const state = useRef({ ready, failed });
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    state.current = { ready, failed };
    wake.current?.();
  }, [ready, failed]);
  useEffect(() => {
    if (!root.current) return;
    const page: HTMLElement = root.current;
    const visual = page.querySelector<HTMLElement>(".mn-clarity-visual")!;
    const layer = page.querySelector<HTMLElement>(".mn-flight-layer")!;
    const shell = page.querySelector<HTMLElement>(".mn-clarity-logo-shell")!;
    const brand = page.querySelector<HTMLElement>(".mn-brand-mark")!;
    const core = page.querySelector<HTMLElement>(".mn-core")!;
    const questions = [
      ...page.querySelectorAll<HTMLElement>("[data-clarity-question]"),
    ];
    const taps = [...page.querySelectorAll<HTMLElement>("[data-clarity-tap]")];
    const finalTap = page.querySelector<HTMLElement>("[data-final-tap]")!;
    const paths = [
      ...page.querySelectorAll<SVGPathElement>(
        ".mn-clarity-path, .mn-clarity-path-glow",
      ),
    ];
    const tiles = [...page.querySelectorAll<HTMLElement>(".mn-analysis-tile")];
    const analysis = page.querySelector<HTMLElement>(".mn-analysis")!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0,
      elapsed = 0,
      lastNow = 0,
      lastSpark = 0,
      phase: PharmacyPhase | undefined,
      ended = false;
    let flight: ReturnType<typeof clarityFlight> | null = null;
    let origin: Point = { x: 0, y: 0 }, width = 0, height = 0, shellSize = 92;
    let loopTop = 0, loopHeight = 0;
    let landingAt: number | null = null;
    let hasFlown = false;
    const trail: { tip: Point; time: number }[] = [];
    const triggered = new Set<number>();
    const phaseTo = (next: PharmacyPhase) => {
      if (next !== phase) {
        phase = next;
        onPhase(next);
      }
    };
    function measure() {
      const rect = visual.getBoundingClientRect();
      const parent = page.getBoundingClientRect();
      origin = { x: rect.left - parent.left, y: rect.top - parent.top };
      width = rect.width; height = rect.height; shellSize = shell.offsetWidth || 92;
      // Mobile analysis tiles can put the core below the fold. Keep the waiting
      // loop in view instead of spending the long wait flying off-screen.
      const visibleTop = Math.max(parent.top + 110, shellSize);
      const visibleBottom = Math.max(visibleTop + 180, Math.min(rect.bottom, window.innerHeight - shellSize));
      loopTop = visibleTop - rect.top;
      loopHeight = visibleBottom - visibleTop;
      const point = (el: HTMLElement): Point => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - rect.left,
          y: r.top + r.height / 2 - rect.top,
        };
      };
      flight = clarityFlight({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        source: point(brand),
        questions: questions.map((el) => {
          const style = getComputedStyle(el);
          return { x: parseFloat(style.left), y: parseFloat(style.top) };
        }),
        core: point(core),
        shellSize: shell.offsetWidth || 92,
      });
      const orbit = page.querySelector<SVGElement>(".mn-clarity-orbit")!;
      orbit.setAttribute("viewBox", `0 0 ${width} ${height}`);
      Object.assign(orbit.style, { left: `${origin.x}px`, top: `${origin.y}px`, width: `${width}px`, height: `${height}px` });
      finalTap.style.left = `${flight.tapPoints[3].x}px`;
      finalTap.style.top = `${flight.tapPoints[3].y}px`;
    }
    function spark(point: Point, burst = false) {
      // Same lifetime, colour distribution and displacement as the supplied asset.
      if (layer.querySelectorAll(".mn-flight-spark").length >= 72) return;
      const node = document.createElement("span"),
        colors = [
          "var(--mn-gold-soft)",
          "var(--mn-gold-tint)",
          "var(--mn-gold)",
          "var(--mn-gold-soft)",
          "var(--mn-gold-tint)",
          "var(--mn-gold)",
          "var(--mn-teal)",
          "var(--mn-green)",
        ];
      const angle = Math.random() * Math.PI * 2,
        distance = burst ? 20 + Math.random() * 38 : 7 + Math.random() * 18;
      node.className = "mn-flight-spark";
      node.style.left = `${origin.x + point.x + (Math.random() - 0.5) * 8}px`;
      node.style.top = `${origin.y + point.y + (Math.random() - 0.5) * 8}px`;
      node.style.setProperty(
        "--spark-size",
        `${burst ? 4 + Math.random() * 6 : 3 + Math.random() * 4}px`,
      );
      node.style.setProperty(
        "--spark-color",
        colors[Math.floor(Math.random() * colors.length)],
      );
      node.style.setProperty(
        "--spark-drift-x",
        `${Math.cos(angle) * distance}px`,
      );
      node.style.setProperty(
        "--spark-drift-y",
        `${Math.sin(angle) * distance}px`,
      );
      layer.appendChild(node);
      node.addEventListener("animationend", () => node.remove(), {
        once: true,
      });
    }
    const bursts: { point: Point; at: number }[] = [];
    function tap(index: number, point: Point) {
      if (triggered.has(index)) return;
      triggered.add(index);
      if (index < 3) {
        questions[index].classList.add("is-resolving");
        taps[index].classList.add("is-active");
      } else {
        page.classList.add("is-final-tap");
        core.classList.add("is-resolving");
        finalTap.classList.add("is-active");
      }
      for (let n = 0; n < (index < 3 ? 9 : 18); n++)
        bursts.push({ point, at: elapsed + n * 24 });
    }
    function animateFlight(time: number) {
      if (!flight) measure();
      const route = flight!;
      let pose = continuingClarityPose(route, time, width, loopHeight, shellSize, loopTop);
      if (landingAt !== null) {
        const r = brand.getBoundingClientRect(), parent = page.getBoundingClientRect();
        pose = landingClarityPose(pose, { x: r.left + r.width / 2 - parent.left - origin.x, y: r.top + r.height / 2 - parent.top - origin.y }, r.width / shellSize, shellSize, (elapsed - landingAt) / 1200);
      } else if (pose.tap !== null) tap(pose.tap, route.tapPoints[pose.tap]);
      shell.style.transform = `translate3d(${origin.x + pose.point.x}px, ${origin.y + pose.point.y}px, 0) translate(-50%, -50%) rotate(${pose.angle}deg) scale(${pose.scale})`;
      // The trail ends at this frame's actual leaf tip. Storage is bounded even for long waits.
      trail.push({ tip: pose.tip, time: elapsed });
      while (trail.length > 56 || (trail.length > 1 && trail[0].time < elapsed - 900)) trail.shift();
      const pathData = trail.map(({ tip }, i) => `${i ? "L" : "M"} ${tip.x.toFixed(3)} ${tip.y.toFixed(3)}`).join(" ");
      paths.forEach((path) => { path.setAttribute("d", pathData); path.style.strokeDashoffset = "0"; });
      if (landingAt === null && elapsed - lastSpark >= (pose.moving ? 62 : 112)) {
        spark(pose.tip);
        lastSpark = elapsed;
      }
    }

    function rest(status: "landed" | "stopped") {
      ended = true;
      page.setAttribute("data-flight", status);
      bursts.length = 0; trail.length = 0;
      layer.querySelectorAll(".mn-flight-spark").forEach((n) => n.remove());
      paths.forEach((path) => path.removeAttribute("d"));
      const r = brand.getBoundingClientRect(), parent = page.getBoundingClientRect();
      shell.style.transform = `translate3d(${r.left + r.width / 2 - parent.left}px, ${r.top + r.height / 2 - parent.top}px, 0) translate(-50%, -50%) scale(${r.width / (shell.offsetWidth || 92)})`;
    }

    function frame(now: number) {
      if (document.hidden) return;
      if (lastNow) elapsed += Math.min(50, now - lastNow);
      lastNow = now;
      if (state.current.failed) { rest("stopped"); return; }
      if (state.current.ready) {
        if (!hasFlown) { rest("landed"); return; }
        if (landingAt === null) {
          landingAt = elapsed;
          page.setAttribute("data-flight", "landing");
          bursts.length = 0;
          layer.querySelectorAll(".mn-flight-spark").forEach((n) => n.remove());
        }
        animateFlight(elapsed - 7600);
        if (elapsed - landingAt >= 1200) { rest("landed"); return; }
        frameId = requestAnimationFrame(frame);
        return;
      }
      tiles.forEach((tile, i) =>
        tile.classList.toggle("is-active", elapsed >= 300 + i * 540),
      );
      analysis.classList.toggle("is-complete", elapsed >= 2460);
      if (elapsed < 3100) phaseTo("inputs");
      else if (elapsed < 7600) phaseTo("rain");
      else if (elapsed < 11710) {
        phaseTo("clarity");
      } else if (elapsed < 13900) {
        phaseTo("selected");
      } else phaseTo("matching");
      if (elapsed >= 7600) {
        hasFlown = true;
        page.setAttribute("data-flight", "flying");
        animateFlight(elapsed - 7600);
      }
      for (let i = bursts.length - 1; i >= 0; i--)
        if (bursts[i].at <= elapsed) {
          spark(bursts[i].point, true);
          bursts.splice(i, 1);
        }
      frameId = requestAnimationFrame(frame);
    }
    function visible() {
      page.setAttribute("data-paused", String(document.hidden));
      cancelAnimationFrame(frameId);
      lastNow = 0;
      if (!state.current.ready && !state.current.failed && ended && !motion.matches) {
        ended = false; landingAt = null;
      }
      if (!document.hidden && !ended && !motion.matches)
        frameId = requestAnimationFrame(frame);
    }
    function reduced() {
      cancelAnimationFrame(frameId);
      if (motion.matches) {
        tiles.forEach((t) => t.classList.add("is-active"));
        phaseTo("matching");
        rest(state.current.failed ? "stopped" : "landed");
      } else {
        lastNow = 0;
        ended = state.current.ready || state.current.failed;
        if (!ended && !document.hidden) frameId = requestAnimationFrame(frame);
      }
    }
    function resized() {
      // Readiness changes layout, not the running flight's coordinate system.
      // Only a genuine viewport resize requires a new local route.
      if (flight && Math.abs(visual.getBoundingClientRect().width - width) > 1) {
        flight = null;
        trail.length = 0;
      }
    }
    const observer = new ResizeObserver(resized);
    observer.observe(visual);
    document.addEventListener("visibilitychange", visible);
    motion.addEventListener("change", reduced);
    wake.current = visible;
    if (motion.matches) reduced();
    else visible();
    return () => {
      wake.current = null;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
      motion.removeEventListener("change", reduced);
      bursts.length = 0;
      layer.querySelectorAll(".mn-flight-spark").forEach((n) => n.remove());
      shell.style.transform = "translate3d(-9999px,-9999px,0)";
      [...questions, ...taps, core, finalTap].forEach((n) =>
        n.classList.remove("is-resolving", "is-active"),
      );
      page.classList.remove("is-final-tap", "is-logo-linger");
      page.removeAttribute("data-paused");
      page.removeAttribute("data-flight");
    };
  }, [root, onPhase]);
}

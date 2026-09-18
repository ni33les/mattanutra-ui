"use client";
import { useEffect, type RefObject } from "react";
import {
  clarityFlight,
  clarityStages,
  cubicPoint,
  smootherStep,
  type PharmacyPhase,
  type Point,
} from "@/lib/pharmacy-presentation";

/** The supplied v2.5 choreography. This clock owns decoration, never work/readiness. */
export function usePharmacyAnimation(
  root: RefObject<HTMLElement | null>,
  active: boolean,
  replay: number,
  onPhase: (phase: PharmacyPhase) => void,
  onEnd: () => void,
) {
  useEffect(() => {
    if (!root.current || !active) return;
    const page: HTMLElement = root.current;
    const visual = page.querySelector<HTMLElement>(".mn-clarity-visual")!;
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
    const triggered = new Set<number>();
    const phaseTo = (next: PharmacyPhase) => {
      if (next !== phase) {
        phase = next;
        onPhase(next);
      }
    };
    function measure() {
      const rect = visual.getBoundingClientRect();
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
        questions: questions.map(point),
        core: point(core),
        shellSize: shell.getBoundingClientRect().width || 92,
      });
      page
        .querySelector(".mn-clarity-orbit")!
        .setAttribute(
          "viewBox",
          `0 0 ${rect.width.toFixed(1)} ${rect.height.toFixed(1)}`,
        );
      paths.forEach((p) => p.setAttribute("d", flight!.path));
      finalTap.style.left = `${flight.tapPoints[3].x}px`;
      finalTap.style.top = `${flight.tapPoints[3].y}px`;
    }
    function spark(point: Point, burst = false) {
      // Same lifetime, colour distribution and displacement as the supplied asset.
      if (visual.querySelectorAll(".mn-flight-spark").length >= 72) return;
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
      node.style.left = `${point.x + (Math.random() - 0.5) * 8}px`;
      node.style.top = `${point.y + (Math.random() - 0.5) * 8}px`;
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
      visual.appendChild(node);
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
      let start = 0;
      let stage: (typeof clarityStages)[number] =
        clarityStages[clarityStages.length - 1];
      for (const candidate of clarityStages) {
        if (time <= start + candidate.duration) {
          stage = candidate;
          break;
        }
        start += candidate.duration;
      }
      const local = Math.max(0, Math.min(1, (time - start) / stage.duration));
      let point: Point,
        angle = 0,
        progress = 1,
        moving = false;
      if (stage.type === "move") {
        moving = true;
        const t = smootherStep(local);
        point = cubicPoint(route.segments[stage.segment], t);
        const ahead = cubicPoint(
            route.segments[stage.segment],
            Math.min(1, t + 0.012),
          ),
          limit = stage.segment === 4 ? 11 : 8;
        angle = Math.max(
          -limit,
          Math.min(
            limit,
            ((Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) /
              Math.PI) *
              0.18,
          ),
        );
        progress = (stage.segment + t) / route.segments.length;
      } else {
        const base = route.points[stage.point];
        point = {
          x: base.x + Math.sin(local * Math.PI * 2) * 3.5,
          y: base.y - Math.sin(local * Math.PI) * 5.5,
        };
        progress = stage.point / route.segments.length;
        angle = stage.type === "hold" ? Math.sin(local * Math.PI) * 6 : 0;
        if ("tap" in stage) tap(stage.tap, route.tapPoints[stage.tap]);
      }
      const scale =
        stage.type === "hold" || stage.type === "launch"
          ? 1 + Math.sin(local * Math.PI) * 0.08
          : 1;
      shell.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${scale})`;
      paths.forEach((path) => {
        path.style.strokeDashoffset = String(100 * (1 - progress));
      });
      const tip = (shell.offsetWidth || 92) * 0.36 * scale,
        radians = (angle * Math.PI) / 180;
      if (elapsed - lastSpark >= (moving ? 62 : 112)) {
        spark({
          x: point.x + tip * Math.cos(radians) + tip * Math.sin(radians),
          y: point.y + tip * Math.sin(radians) - tip * Math.cos(radians),
        });
        if (moving && Math.random() > 0.76) spark(point);
        lastSpark = elapsed;
      }
    }
    function frame(now: number) {
      if (document.hidden) return;
      if (lastNow) elapsed += now - lastNow;
      lastNow = now;
      tiles.forEach((tile, i) =>
        tile.classList.toggle("is-active", elapsed >= 300 + i * 540),
      );
      analysis.classList.toggle("is-complete", elapsed >= 2460);
      if (elapsed < 3100) phaseTo("inputs");
      else if (elapsed < 7600) phaseTo("rain");
      else if (elapsed < 11710) {
        phaseTo("clarity");
        animateFlight(elapsed - 7600);
      } else if (elapsed < 13900) {
        if (!triggered.has(3)) animateFlight(4110);
        phaseTo("selected");
        page.classList.toggle("is-logo-linger", elapsed < 12330);
      } else phaseTo("matching");
      for (let i = bursts.length - 1; i >= 0; i--)
        if (bursts[i].at <= elapsed) {
          spark(bursts[i].point, true);
          bursts.splice(i, 1);
        }
      if (elapsed < 16700) frameId = requestAnimationFrame(frame);
      else {
        ended = true;
        onEnd();
      }
    }
    function visible() {
      page.setAttribute("data-paused", String(document.hidden));
      cancelAnimationFrame(frameId);
      lastNow = 0;
      if (!document.hidden && !ended && !motion.matches)
        frameId = requestAnimationFrame(frame);
    }
    function reduced() {
      cancelAnimationFrame(frameId);
      if (motion.matches) {
        tiles.forEach((t) => t.classList.add("is-active"));
        phaseTo("matching");
        ended = true;
        onEnd();
      } else {
        lastNow = 0;
        ended = false;
        frameId = requestAnimationFrame(frame);
      }
    }
    function resized() {
      flight = null;
    }
    const observer = new ResizeObserver(resized);
    observer.observe(visual);
    document.addEventListener("visibilitychange", visible);
    motion.addEventListener("change", reduced);
    if (motion.matches) reduced();
    else visible();
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
      motion.removeEventListener("change", reduced);
      bursts.length = 0;
      visual.querySelectorAll(".mn-flight-spark").forEach((n) => n.remove());
      shell.style.transform = "translate3d(-9999px,-9999px,0)";
      [...questions, ...taps, core, finalTap].forEach((n) =>
        n.classList.remove("is-resolving", "is-active"),
      );
      page.classList.remove("is-final-tap", "is-logo-linger");
      page.removeAttribute("data-paused");
    };
  }, [root, active, replay, onPhase, onEnd]);
}

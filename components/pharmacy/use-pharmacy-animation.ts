"use client";
import { useEffect, useRef, type RefObject } from "react";
import {
  butterflyFlight,
  butterflyPose,
  blendButterflyPoses,
  landButterflyPose,
  smootherStep,
  createMagicDust,
  stepMagicDust,
  type PharmacyPhase,
} from "@/lib/pharmacy-presentation";

/** One flight clock, independent of the presentation stages and real generation. */
export function usePharmacyAnimation(
  root: RefObject<HTMLElement | null>,
  ready: boolean,
  failed: boolean,
  onPhase: (phase: PharmacyPhase) => void,
  matchingReady = ready,
) {
  const state = useRef({ ready, failed, matchingReady });
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    state.current = { ready, failed, matchingReady };
    wake.current?.();
  }, [ready, failed, matchingReady]);
  useEffect(() => {
    if (!root.current) return;
    const page = root.current;
    const shell = page.querySelector<HTMLElement>(".mn-clarity-logo-shell")!;
    const brand = page.querySelector<HTMLElement>(".mn-brand-mark")!;
    const particles = [...page.querySelectorAll<HTMLElement>(".mn-dust-particle")];
    const activeDust = new Uint8Array(particles.length);
    const tiles = [...page.querySelectorAll<HTMLElement>(".mn-analysis-tile")];
    const analysis = page.querySelector<HTMLElement>(".mn-analysis")!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0, elapsed = 0, lastNow = 0, ended = false, hasFlown = false;
    let phase: PharmacyPhase | undefined, landingAt: number | null = null;
    let flight: ReturnType<typeof butterflyFlight> | null = null;
    let previousFlight: ReturnType<typeof butterflyFlight> | null = null, resizedAt = 0;
    let width = 0, shellSize = 92, dirty = true;
    let dust = createMagicDust();
    const clearDust = () => {
      dust = createMagicDust();
      particles.forEach(element => { element.style.opacity = "0"; });
    };
    const phaseTo = (next: PharmacyPhase) => {
      if (phase !== next) { phase = next; onPhase(next); }
    };
    const destination = () => {
      const r = brand.getBoundingClientRect(), parent = page.getBoundingClientRect();
      return { point: { x: r.left + r.width / 2 - parent.left, y: r.top + r.height / 2 - parent.top }, scale: r.width / shellSize };
    };
    function measure() {
      const parent = page.getBoundingClientRect();
      width = parent.width;
      shellSize = shell.offsetWidth || 92;
      const margin = shellSize * .75;
      const top = Math.max(110, margin - parent.top);
      const bottom = Math.max(top + 180, Math.min(parent.height - margin, window.innerHeight - parent.top - margin));
      previousFlight = flight;
      resizedAt = elapsed;
      flight = butterflyFlight({ left: margin, top, width: Math.max(80, width - margin * 2), height: bottom - top, source: destination().point, shellSize });
      dirty = false;
    }
    function draw() {
      if (!flight || dirty) measure();
      let pose = butterflyPose(flight!, elapsed);
      if (previousFlight) {
        const blend = smootherStep((elapsed - resizedAt) / 1000);
        pose = blendButterflyPoses(butterflyPose(previousFlight, elapsed), pose, shellSize, blend);
        if (blend === 1) previousFlight = null;
      }
      let fade = 1;
      if (landingAt !== null) {
        const target = destination(), progress = (elapsed - landingAt) / 1200;
        pose = landButterflyPose(pose, target.point, target.scale, shellSize, progress);
        fade = 1 - smootherStep(progress);
      }
      shell.style.transform = `translate3d(${pose.point.x}px, ${pose.point.y}px, 0) translate(-50%, -50%) rotate(${pose.angle}deg) scale(${pose.scale})`;
      activeDust.fill(0);
      for (const particle of stepMagicDust(dust, pose.point, elapsed)) {
        const index = particle.id % particles.length, element = particles[index];
        activeDust[index] = 1;
        element.style.transform = `translate3d(${particle.point.x}px, ${particle.point.y}px, 0) translate(-50%, -50%) rotate(${particle.angle}deg) scale(${particle.scale})`;
        element.style.opacity = String(particle.opacity * fade);
      }
      // Only expire unused slots; don't hide and immediately repaint live dust.
      particles.forEach((element, index) => {
        if (!activeDust[index] && element.style.opacity !== "0") element.style.opacity = "0";
      });
    }
    function rest(status: "landed" | "stopped") {
      ended = true;
      page.setAttribute("data-flight", status);
      clearDust();
      shellSize = shell.offsetWidth || 92;
      const target = destination();
      shell.style.transform = `translate3d(${target.point.x}px, ${target.point.y}px, 0) translate(-50%, -50%) scale(${target.scale})`;
    }
    function frame(now: number) {
      if (document.hidden) return;
      if (lastNow) elapsed += Math.min(50, now - lastNow);
      lastNow = now;
      if (state.current.failed) { rest("stopped"); return; }
      // Completed visits stay still, including while their order quote loads.
      if (!hasFlown && state.current.matchingReady) { rest("landed"); return; }
      if (state.current.ready) {
        if (!hasFlown) { rest("landed"); return; }
        if (landingAt === null) { landingAt = elapsed; page.setAttribute("data-flight", "landing"); }
        draw();
        if (elapsed - landingAt >= 1200) { rest("landed"); return; }
      } else {
        tiles.forEach((tile, i) => tile.classList.toggle("is-active", elapsed >= 300 + i * 540));
        analysis.classList.toggle("is-complete", elapsed >= 2460);
        phaseTo(elapsed < 3100 ? "inputs" : elapsed < 7600 ? "rain" : elapsed < 11710 ? "clarity" : elapsed < 13900 ? "selected" : "matching");
        if (!hasFlown) { hasFlown = true; page.setAttribute("data-flight", "flying"); }
        draw();
      }
      frameId = requestAnimationFrame(frame);
    }
    function visible() {
      page.setAttribute("data-paused", String(document.hidden));
      cancelAnimationFrame(frameId);
      lastNow = 0;
      if (ended && !state.current.ready && !state.current.failed && !state.current.matchingReady && !motion.matches) {
        ended = false; hasFlown = false; elapsed = 0; landingAt = null; flight = null; previousFlight = null;
      }
      if (!document.hidden && !ended && !motion.matches) frameId = requestAnimationFrame(frame);
    }
    function reduced() {
      cancelAnimationFrame(frameId);
      if (motion.matches) {
        tiles.forEach((tile) => tile.classList.add("is-active"));
        phaseTo("matching");
        rest(state.current.failed ? "stopped" : "landed");
      } else visible();
    }
    const observer = new ResizeObserver(() => {
      // Results changing the page height must not move the flight coordinates.
      if (Math.abs(page.getBoundingClientRect().width - width) > 1) dirty = true;
    });
    const resized = () => { dirty = true; };
    observer.observe(page);
    window.addEventListener("resize", resized);
    document.addEventListener("visibilitychange", visible);
    motion.addEventListener("change", reduced);
    wake.current = visible;
    if (motion.matches) reduced(); else visible();
    return () => {
      wake.current = null;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", resized);
      document.removeEventListener("visibilitychange", visible);
      motion.removeEventListener("change", reduced);
      clearDust();
      shell.style.transform = "translate3d(-9999px,-9999px,0)";
      page.removeAttribute("data-paused");
      page.removeAttribute("data-flight");
    };
  }, [root, onPhase]);
}

import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Staggered entrance for every `[data-reveal]` descendant of the returned
 * ref. Runs before paint (no flash of unstyled motion) and re-runs when the
 * deps change so async content (e.g. fetched cards) animates in too.
 * Content stays fully visible when JS fails or reduced motion is on.
 */
export function useReveal<T extends HTMLElement>(deps: readonly unknown[] = []) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;

    if (!root || prefersReducedMotion()) {
      return;
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (targets.length === 0) {
      return;
    }

    const tween = gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.07,
        clearProps: "opacity,visibility,transform"
      }
    );

    return () => {
      tween.kill();
    };
    // Callers pass the data their reveal targets depend on; `deps` is the
    // intentional dependency list (the react-hooks plugin is not enabled here).
  }, deps);

  return ref;
}

export { gsap };

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { gsap, prefersReducedMotion } from "./motion.js";

/**
 * Fades/slides the routed page in on every navigation so route changes feel
 * like one continuous experience instead of a hard repaint.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });

    const node = ref.current;

    if (!node || prefersReducedMotion()) {
      return;
    }

    const tween = gsap.fromTo(
      node,
      { autoAlpha: 0, y: 14 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.5,
        ease: "power3.out",
        clearProps: "opacity,visibility,transform"
      }
    );

    return () => {
      tween.kill();
    };
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}

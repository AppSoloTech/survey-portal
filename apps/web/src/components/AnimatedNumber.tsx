import { useEffect, useRef } from "react";

import { gsap, prefersReducedMotion } from "../motion/motion.js";

/** Counts up to `value` with a GSAP tween; renders the plain number when
 *  reduced motion is requested. */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    if (prefersReducedMotion()) {
      node.textContent = String(value);
      return;
    }

    const proxy = { current: Number(node.textContent) || 0 };
    const tween = gsap.to(proxy, {
      current: value,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => {
        node.textContent = String(Math.round(proxy.current));
      }
    });

    return () => {
      tween.kill();
    };
  }, [value]);

  return <span ref={ref}>0</span>;
}

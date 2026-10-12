import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "./dom";
import type { MorphRefs } from "./morph-refs";
import { DURATION, EASING } from "./timing";

// Animates the box's height when its content changes size while it is
// open (a same-tool update, say), instead of letting it jump. Stands
// aside while a flight has the box, only keeping track of the height.
//
// Ported from apps/ssr-agent, where it matters more: RSC/Suspense content
// there swaps in place. This app's widgets are plain sync components, but
// keeping it costs nothing.
export function useHeightCatchUp({
  boxRef,
  isFlippingRef,
  autoHeightCancelRef,
}: MorphRefs) {
  const isAutoAnimatingRef = useRef(false);
  const lastHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const boxEl = boxRef.current;
    if (!boxEl) return;

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height;
      if (newHeight === undefined) return;

      if (isFlippingRef.current || isAutoAnimatingRef.current) {
        lastHeightRef.current = newHeight;
        return;
      }

      const oldHeight = lastHeightRef.current;
      lastHeightRef.current = newHeight;

      if (
        oldHeight === null ||
        Math.abs(oldHeight - newHeight) < 1 ||
        prefersReducedMotion()
      ) {
        return;
      }

      isAutoAnimatingRef.current = true;
      boxEl.style.transition = "none";
      boxEl.style.height = `${oldHeight}px`;
      boxEl.getBoundingClientRect(); // force a reflow before re-enabling transitions

      let rafId1 = 0;
      let rafId2 = 0;
      let timeoutId = 0;
      const finish = () => {
        boxEl.style.height = "";
        boxEl.style.transition = "";
        lastHeightRef.current = newHeight;
        isAutoAnimatingRef.current = false;
        if (autoHeightCancelRef.current === cancelThis) {
          autoHeightCancelRef.current = null;
        }
      };
      const cancelThis = () => {
        cancelAnimationFrame(rafId1);
        cancelAnimationFrame(rafId2);
        clearTimeout(timeoutId);
        finish();
      };
      autoHeightCancelRef.current = cancelThis;

      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          boxEl.style.transition = `height ${DURATION}ms ${EASING}`;
          boxEl.style.height = `${newHeight}px`;
          timeoutId = window.setTimeout(finish, DURATION + 100);
        });
      });
    });

    observer.observe(boxEl);
    return () => {
      observer.disconnect();
      autoHeightCancelRef.current?.();
    };
  }, [boxRef, isFlippingRef, autoHeightCancelRef]);
}

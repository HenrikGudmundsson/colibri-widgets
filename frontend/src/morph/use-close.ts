import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { ToolCall } from "../resolve";
import { prefersReducedMotion, trayIconRect } from "./dom";
import { shrinkToIcon } from "./flip-widget";
import type { MorphRefs } from "./morph-refs";

// Close: once `closing` is set, shrink back into this widget's own tray
// icon, then tell the parent (`onClosed`) to unmount it.
export function useClose(
  {
    wrapperRef,
    boxRef,
    contentRef,
    badgeRef,
    isFlippingRef,
    activeFlipCancelRef,
    autoHeightCancelRef,
    contentFadeCancelRef,
  }: MorphRefs,
  displayedTool: ToolCall["tool"],
  closing: boolean,
  onClosed: (() => void) | undefined
) {
  // Kept in a ref so a parent re-render mid-shrink (a new callback
  // identity) can't restart the animation.
  const onClosedRef = useRef(onClosed);
  useLayoutEffect(() => {
    onClosedRef.current = onClosed;
  });
  useLayoutEffect(() => {
    if (!closing) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    const iconRect = trayIconRect(displayedTool);
    if (
      !wrapperEl ||
      !boxEl ||
      !contentEl ||
      !badgeEl ||
      !iconRect ||
      prefersReducedMotion()
    ) {
      queueMicrotask(() => onClosedRef.current?.());
      return;
    }

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();
    const currentRect = boxEl.getBoundingClientRect();

    contentEl.style.transition = "opacity 150ms ease-out";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    const cancelFlip = shrinkToIcon(
      { boxEl, wrapperEl, badgeEl },
      currentRect,
      iconRect,
      // flushSync for the same reason as in useToolSwitch: settle() has
      // just put the box back in normal flow at full size, so the
      // unmount has to commit before the browser can paint that.
      () => flushSync(() => onClosedRef.current?.())
    );
    activeFlipCancelRef.current = cancelFlip;

    return () => {
      isFlippingRef.current = false;
      if (activeFlipCancelRef.current === cancelFlip) {
        activeFlipCancelRef.current = null;
      }
      cancelFlip();
      contentEl.style.opacity = "";
      contentEl.style.transition = "";
    };
  }, [
    closing,
    displayedTool,
    wrapperRef,
    boxRef,
    contentRef,
    badgeRef,
    isFlippingRef,
    activeFlipCancelRef,
    autoHeightCancelRef,
    contentFadeCancelRef,
  ]);
}

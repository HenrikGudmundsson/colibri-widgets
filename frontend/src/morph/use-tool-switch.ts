import { useLayoutEffect, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { ToolCall } from "../resolve";
import { prefersReducedMotion, trayIconRect } from "./dom";
import { shrinkToIcon } from "./flip-widget";
import type { MorphRefs } from "./morph-refs";

// What a WidgetMorph is showing, which lags behind its props while the
// previous tool shrinks away.
export type Displayed = {
  tool: ToolCall["tool"];
  queryKey: string;
  children: ReactNode;
};

// Exit: detect an incoming tool switch and reverse-shrink the box back
// into ITS OWN tray icon before accepting the new tool (`show`), which
// then makes its entrance.
export function useToolSwitch(
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
  { tool, queryKey, children }: Displayed,
  show: (next: Displayed) => void
) {
  useLayoutEffect(() => {
    if (tool === displayedTool) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    if (!wrapperEl || !boxEl || !contentEl || !badgeEl) {
      queueMicrotask(() => show({ tool, queryKey, children }));
      return;
    }

    const oldIconRect = trayIconRect(displayedTool);

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();
    const currentRect = boxEl.getBoundingClientRect();

    if (!oldIconRect || prefersReducedMotion()) {
      queueMicrotask(() => show({ tool, queryKey, children }));
      return;
    }

    contentEl.style.transition = "opacity 150ms ease-out";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    let thisCancel: (() => void) | null = null;
    thisCancel = shrinkToIcon(
      { boxEl, wrapperEl, badgeEl },
      currentRect,
      oldIconRect,
      () => {
        if (activeFlipCancelRef.current === thisCancel) {
          activeFlipCancelRef.current = null;
        }
        // flushSync: settle() has just put the box back in normal flow at
        // full size, so the new tool has to commit before the browser can
        // paint that.
        flushSync(() => {
          show({ tool, queryKey, children });
        });
      }
    );
    activeFlipCancelRef.current = thisCancel;
    const cancelFlip = thisCancel;

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
    tool,
    queryKey,
    children,
    displayedTool,
    show,
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

import { useLayoutEffect, useRef } from "react";
import type { ToolCall } from "../resolve";
import { prefersReducedMotion, trayIconRect } from "./dom";
import { growFromIcon } from "./flip-widget";
import type { MorphRefs } from "./morph-refs";
import { takePendingIconRect, wasJustClicked } from "./morph-state";
import {
  CONTENT_FADE_DELAY,
  CONTENT_FADE_DURATION,
  POP_MS,
} from "./timing";

// Entrance: grow from a tray icon's rect into the box, whenever the tool
// shown changes. `displayed` is whatever WidgetMorph is showing; the
// effect follows the object itself, not only its tool, though a same-tool
// content update has nothing to animate (see previousDisplayedToolRef
// below) -- `displayed.children` has already re-rendered normally by the
// time the effect sees it.
export function useEntrance(
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
  displayed: { tool: ToolCall["tool"] }
) {
  // Written only inside the effect below (never during render -- refs
  // shouldn't be mutated there), so it can tell a same-tool content
  // update (e.g. "weather in Stockholm" after "weather in Oslo") apart
  // from a genuine new tool to grow in from the tray: if `displayed.tool`
  // matches what this already held last time the effect ran, nothing
  // about *which tool* actually changed, so there's nothing for a
  // FLIP-from-icon animation to do.
  const previousDisplayedToolRef = useRef<ToolCall["tool"] | null>(null);

  useLayoutEffect(() => {
    // Tool unchanged -- previousDisplayedToolRef already correctly
    // reflects it (see below for exactly when/why it's written), nothing
    // to animate.
    if (previousDisplayedToolRef.current === displayed.tool) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    // Where the icon is *now*. The position recorded at click time is
    // only a fallback: when this widget replaces another, the flight
    // starts after the old one has shrunk away, and by then the tray may
    // have moved (the column scrolls as its content changes height).
    const clickRect = takePendingIconRect();
    const iconRect = trayIconRect(displayed.tool) ?? clickRect;
    // These early-return paths update the ref immediately: content still
    // updates via the normal React render regardless, no animation is
    // ever going to happen here, so there's no Strict-Mode-cancellation
    // risk to guard against -- unlike the real flight below, where the
    // write is deliberately deferred to onDone instead.
    if (!wrapperEl || !boxEl || !contentEl || !badgeEl || !iconRect) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }
    if (prefersReducedMotion()) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();

    const targetRect = boxEl.getBoundingClientRect();
    if (targetRect.width === 0 || targetRect.height === 0) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }

    contentEl.style.transition = "none";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    let thisCancel: (() => void) | null = null;
    thisCancel = growFromIcon(
      { boxEl, wrapperEl, badgeEl },
      iconRect,
      targetRect,
      () => {
        if (activeFlipCancelRef.current === thisCancel) {
          activeFlipCancelRef.current = null;
        }
        isFlippingRef.current = false;
        // Only written here, on a REAL completion -- never speculatively
        // at the top of the effect. Strict Mode's dev-only double-invoke
        // (mount, run effect, run cleanup, run effect again) cancels the
        // first invocation's flip before it ever reaches this callback
        // (cancel() deliberately skips onDone -- see flipWidget's settle),
        // so this never fires for a cancelled attempt. That means the kept
        // (second) invocation still sees the ORIGINAL previousTool when
        // it re-checks the guard above, correctly treats itself as a real
        // entrance, and this fires for real once IT completes instead.
        previousDisplayedToolRef.current = displayed.tool;
      },
      wasJustClicked(displayed.tool)
    );
    activeFlipCancelRef.current = thisCancel;
    const cancelFlip = thisCancel;

    let rafId1 = 0;
    let rafId2 = 0;
    const cancelContentFade = () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      if (contentFadeCancelRef.current === cancelContentFade) {
        contentFadeCancelRef.current = null;
      }
    };
    contentFadeCancelRef.current = cancelContentFade;
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        contentEl.style.transition = `opacity ${CONTENT_FADE_DURATION}ms ease-out ${POP_MS + CONTENT_FADE_DELAY}ms`;
        contentEl.style.opacity = "1";
        if (contentFadeCancelRef.current === cancelContentFade) {
          contentFadeCancelRef.current = null;
        }
      });
    });

    return () => {
      // previousDisplayedToolRef is deliberately NOT touched here -- see
      // the onDone callback above for why writing it only on genuine
      // completion (never speculatively, never restored in cleanup) is
      // what makes this survive both Strict Mode's double-invoke AND a
      // real same-tool content update without confusing one for the other.
      isFlippingRef.current = false;
      cancelContentFade();
      if (activeFlipCancelRef.current === cancelFlip) {
        activeFlipCancelRef.current = null;
      }
      cancelFlip();
    };
  }, [
    displayed,
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

import { useRef, type RefObject } from "react";

// What the parts of one WidgetMorph share: the elements it animates, and
// which animation currently has hold of them. Each use-*.ts hook in this
// folder runs one of those animations; they are separate effects, so
// this is how one finds out about, and stops, another's.
export type MorphRefs = {
  // Stays in normal flow and reserves the widget's slot while the box
  // flies.
  wrapperRef: RefObject<HTMLDivElement | null>;
  // The visible box: the thing that flies and changes shape.
  boxRef: RefObject<HTMLDivElement | null>;
  // The widget's content, faded out while the box is icon-sized.
  contentRef: RefObject<HTMLDivElement | null>;
  // The icon glyph.
  badgeRef: RefObject<HTMLDivElement | null>;
  // True while a flight (flipWidget) has the box.
  isFlippingRef: RefObject<boolean>;
  // Each cancels the animation of that kind that is running, if any.
  activeFlipCancelRef: RefObject<(() => void) | null>;
  autoHeightCancelRef: RefObject<(() => void) | null>;
  contentFadeCancelRef: RefObject<(() => void) | null>;
};

export function useMorphRefs(): MorphRefs {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const isFlippingRef = useRef(false);
  const activeFlipCancelRef = useRef<(() => void) | null>(null);
  const autoHeightCancelRef = useRef<(() => void) | null>(null);
  const contentFadeCancelRef = useRef<(() => void) | null>(null);
  return {
    wrapperRef,
    boxRef,
    contentRef,
    badgeRef,
    isFlippingRef,
    activeFlipCancelRef,
    autoHeightCancelRef,
    contentFadeCancelRef,
  };
}

import {
  iconBadgeGeom,
  WIDGET_BADGE_GEOM,
  type BadgeGeom,
} from "./badge-geometry";
import { buildArcPath, holdThenSnapKeyframes } from "./keyframes";
import { startPop } from "./pop";
import { DURATION, EASING, POP_MS } from "./timing";

// The FLIP animation engine: hand-rolled on the Web Animations API and
// plain DOM measurement, with no React in it. Ported from
// apps/ssr-agent's widget-morph.tsx.

// Only resets styles flipWidget writes directly as inline styles.
// width/height/border-radius (box) and top/right/width/height/font-size
// (badge) are not among them -- flipWidget drives those entirely via Web
// Animations API effects, which live in their own layer above inline
// styles/CSS and don't need (or respond to) clearing here. Cancelling
// those Animation objects is what releases them; see flipWidget's
// settle().
function resetFlipStyles(boxEl: HTMLDivElement, wrapperEl: HTMLDivElement) {
  wrapperEl.style.minHeight = "";
  boxEl.style.position = "";
  boxEl.style.zIndex = "";
  boxEl.style.margin = "";
  boxEl.style.top = "";
  boxEl.style.left = "";
  boxEl.style.removeProperty("offset-path");
  boxEl.style.removeProperty("offset-distance");
  boxEl.style.removeProperty("offset-rotate");
  boxEl.style.removeProperty("offset-anchor");
}

// FLIP-animates `boxEl` (via a temporary `position: fixed`) from
// `fromRect` to `toRect`, with border-radius interpolating from
// `fromRadius` to `toRadius`, AND `badgeEl` (the icon glyph) from
// `fromBadge` to `toBadge` -- in the same transition, so they land
// together. Used for BOTH directions: growing from a tray icon into the
// widget, and (reversed) shrinking the widget back into a tray icon --
// same mechanics either way, just different endpoints, so this is the
// one place that logic lives.
//
// The badge used to be positioned with a fixed CSS inset (`right-4
// top-4`, sized for the full-width widget) and just left to ride along
// as the box resized. That works fine at the widget end, but breaks down
// completely at the icon end: a 48px badge inset 16px from the edge of a
// box that's only ~40px wide overflows far past the box's opposite edge,
// so what's visible is a clipped sliver, not a clean small icon landing
// on the tray button -- exactly the "icon doesn't hit its target" bug.
// Explicitly interpolating the badge's own top/right/size/font-size
// between "fills the box, no inset" (icon end) and "48px corner badge"
// (widget end) makes it correctly resemble the plain tray icon at the
// small end and the corner badge at the large end, with everything in
// between reading as one continuous resize rather than two disconnected
// pieces.
//
// Position and box size/shape are animated separately, deliberately:
//
// - Size/shape (width, height, border-radius) are real layout properties,
//   not `transform: scale()`, which distorts whatever border-radius is
//   *currently* set at every frame right along with everything else --
//   since the two rects usually differ hugely in aspect ratio, the
//   radius only ever looks geometrically correct once the scale settles
//   at the very end, reading as a last-instant snap. Animating actual
//   dimensions means the radius interpolates against the box's real
//   current size at every frame.
//
// - Position follows a curved `offset-path` (buildArcPath) instead of
//   interpolating top/left directly. `top`/`left` are fixed at `toRect`'s
//   position for the whole animation; the path supplies an additional
//   offset that's large at the start (pointing back at `fromRect`) and
//   shrinks to zero at the end.
//
// Returns a cancel function that fully resets every style this touched.
export function flipWidget(
  boxEl: HTMLDivElement,
  wrapperEl: HTMLDivElement,
  badgeEl: HTMLDivElement,
  fromRect: DOMRect,
  toRect: DOMRect,
  fromRadius: number,
  toRadius: number,
  fromBadge: BadgeGeom,
  toBadge: BadgeGeom,
  // true for the icon-to-widget entrance, false for the widget-to-icon
  // exit -- controls which end of the trip gets the hold.
  growing: boolean,
  onDone: () => void,
  // Whether this trip out of the tray was started by a click on the icon.
  clicked = false
): () => void {
  // Reserve the larger of the two heights on the wrapper so the page
  // doesn't reflow while the box is temporarily taken out of flow below.
  wrapperEl.style.minHeight = `${Math.max(fromRect.height, toRect.height)}px`;

  const path = buildArcPath(
    fromRect.left - toRect.left,
    fromRect.top - toRect.top
  );

  boxEl.style.position = "fixed";
  boxEl.style.zIndex = "10";
  boxEl.style.margin = "0";
  boxEl.style.top = `${toRect.top}px`;
  boxEl.style.left = `${toRect.left}px`;
  boxEl.style.setProperty("offset-path", path);
  boxEl.style.setProperty("offset-rotate", "0deg");
  // offset-path anchors to the box's *center* by default. Since width and
  // height are also animating here, a center anchor means half of an
  // ever-changing dimension is added on top of the path's own offset
  // each frame -- the left/top edges drift independent of the path
  // itself. Anchoring to the top-left corner instead matches how
  // top/left are normally interpreted, and how the path's (dx, dy) was
  // computed above (from .left/.top, not center-to-center).
  boxEl.style.setProperty("offset-anchor", "0% 0%");

  // Only the trip out of the tray starts with a pop; the flight itself
  // waits for it, holding its first frame (the icon) meanwhile.
  const delay = growing ? POP_MS : 0;

  const shapeAnimation = boxEl.animate(
    holdThenSnapKeyframes(
      {
        width: `${fromRect.width}px`,
        height: `${fromRect.height}px`,
        borderRadius: `${fromRadius}px`,
      },
      {
        width: `${toRect.width}px`,
        height: `${toRect.height}px`,
        borderRadius: `${toRadius}px`,
      },
      growing
    ),
    { duration: DURATION, delay, easing: "linear", fill: "both" }
  );

  const positionAnimation = boxEl.animate(
    [{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
    { duration: DURATION, delay, easing: EASING, fill: "both" }
  );

  const badgeAnimation = badgeEl.animate(
    holdThenSnapKeyframes(
      {
        top: `${fromBadge.top}px`,
        right: `${fromBadge.right}px`,
        width: `${fromBadge.size}px`,
        height: `${fromBadge.size}px`,
        fontSize: `${fromBadge.fontSize}px`,
      },
      {
        top: `${toBadge.top}px`,
        right: `${toBadge.right}px`,
        width: `${toBadge.size}px`,
        height: `${toBadge.size}px`,
        fontSize: `${toBadge.fontSize}px`,
      },
      growing
    ),
    { duration: DURATION, delay, easing: "linear", fill: "both" }
  );

  // Created after the animations above so that it overrides the size
  // they are holding for as long as it runs: see startPop.
  const popAnimations = growing
    ? startPop(boxEl, badgeEl, fromRect, fromRadius, fromBadge, clicked)
    : [];

  // The rects above are a snapshot, but the layout can move mid-flight:
  // the embedding page grows this app's iframe as content arrives, which
  // is typically right as a widget opens, and that shifts everything
  // around the slot. The wrapper stays in normal flow (it is what
  // reserves the slot), so follow it every frame; otherwise the box flies
  // to where the slot used to be and snaps across when it settles.
  const wrapperStart = wrapperEl.getBoundingClientRect();
  let followFrame = requestAnimationFrame(function follow() {
    const wrapperNow = wrapperEl.getBoundingClientRect();
    boxEl.style.top = `${toRect.top + wrapperNow.top - wrapperStart.top}px`;
    boxEl.style.left = `${toRect.left + wrapperNow.left - wrapperStart.left}px`;
    followFrame = requestAnimationFrame(follow);
  });

  let settled = false;
  const settle = (callOnDone: boolean) => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(followFrame);
    popAnimations.forEach((animation) => animation.cancel());
    shapeAnimation.cancel();
    positionAnimation.cancel();
    badgeAnimation.cancel();
    resetFlipStyles(boxEl, wrapperEl);
    if (callOnDone) onDone();
  };

  Promise.all([
    shapeAnimation.finished,
    positionAnimation.finished,
    badgeAnimation.finished,
  ]).then(
    () => settle(true),
    () => {
      // Rejects when cancelled (AbortError) -- the cancelling caller
      // already settled via the returned function below.
    }
  );

  return () => settle(false);
}

// The two trips flipWidget is used for, with their fixed endpoints filled
// in: a tray icon is a circle with the glyph filling it, a widget is a
// box with `rounded-lg` corners and the glyph as its corner badge.
const WIDGET_RADIUS = 8; // rounded-lg

type FlipElements = {
  boxEl: HTMLDivElement;
  wrapperEl: HTMLDivElement;
  badgeEl: HTMLDivElement;
};

export function growFromIcon(
  { boxEl, wrapperEl, badgeEl }: FlipElements,
  iconRect: DOMRect,
  widgetRect: DOMRect,
  onDone: () => void,
  clicked: boolean
): () => void {
  return flipWidget(
    boxEl,
    wrapperEl,
    badgeEl,
    iconRect,
    widgetRect,
    iconRect.height / 2,
    WIDGET_RADIUS,
    iconBadgeGeom(iconRect),
    WIDGET_BADGE_GEOM,
    true,
    onDone,
    clicked
  );
}

export function shrinkToIcon(
  { boxEl, wrapperEl, badgeEl }: FlipElements,
  widgetRect: DOMRect,
  iconRect: DOMRect,
  onDone: () => void
): () => void {
  return flipWidget(
    boxEl,
    wrapperEl,
    badgeEl,
    widgetRect,
    iconRect,
    WIDGET_RADIUS,
    iconRect.height / 2,
    WIDGET_BADGE_GEOM,
    iconBadgeGeom(iconRect),
    false,
    onDone
  );
}

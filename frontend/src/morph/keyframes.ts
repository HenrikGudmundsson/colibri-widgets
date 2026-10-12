import { EASING, HOLD_FRACTION } from "./timing";

// The shapes of the flight: the path the box travels along, and the
// "hold, then snap" keyframes its size follows meanwhile.

// A cubic-bezier "hook" from (dx, dy) to (0, 0), for use as an
// `offset-path`: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Motion_path.
// `offset-distance: 0%` sits at the path's start (dx, dy); 100% sits at
// its end (0, 0) -- i.e. wherever the element's own top/left already
// puts it.
//
// A single quadratic bezier (one control point) can only bow the line
// one way. A cubic bezier's two independent control points can pull the
// early direction one way (down-and-left, regardless of the destination)
// and hook the back half sharply toward the destination from a different
// angle -- "dip down-left, then hook right", not a single gentle arc.
export function buildArcPath(dx: number, dy: number): string {
  const distance = Math.hypot(dx, dy) || 1;
  const c1x = dx - distance * 0.85;
  const c1y = dy + distance * 0.85;
  const c2x = distance * 0.5;
  const c2y = -distance * 0.5;
  return `path('M ${dx} ${dy} C ${c1x} ${c1y}, ${c2x} ${c2y}, 0 0')`;
}

// Builds the shared "hold most of the trip, snap for the rest" keyframe
// shape used by both the box's size and the badge's geometry, mirrored
// for growing vs. shrinking (see flipWidget's `growing` param). The
// easing is set per keyframe rather than once for the whole animation
// deliberately: a top-level easing would warp real-time offsets away
// from what HOLD_FRACTION says, so callers run these with "linear".
export function holdThenSnapKeyframes<T extends Record<string, string>>(
  from: T,
  to: T,
  growing: boolean
): (T & { offset: number; easing?: string })[] {
  if (growing) {
    return [
      { ...from, offset: 0 },
      { ...from, offset: HOLD_FRACTION, easing: EASING },
      { ...to, offset: 1 },
    ];
  }
  return [
    { ...from, offset: 0, easing: EASING },
    { ...to, offset: 1 - HOLD_FRACTION },
    { ...to, offset: 1 },
  ];
}

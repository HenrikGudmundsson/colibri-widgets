import type { BadgeGeom } from "./badge-geometry";
import { POP_IN_MS, POP_MS, POP_OUT_MS, POP_SCALE } from "./timing";

// Starts the pop an icon makes before it leaves the tray (see POP_MS in
// timing.ts), on a box that is currently sized and placed like that icon.
// Call it after starting the flight's own animations, so that it
// overrides the size they are holding for as long as it runs. It is done
// with real geometry -- a larger box, pulled back by half the difference
// with negative margins so it grows around its centre -- rather than a
// scale transform, whose origin browsers resolve differently once an
// offset-path is involved.
//
// Returns the animations it started, for the caller to cancel.
export function startPop(
  boxEl: HTMLDivElement,
  badgeEl: HTMLDivElement,
  iconRect: DOMRect,
  iconRadius: number,
  iconBadge: BadgeGeom,
  // Whether this trip out of the tray was started by a click on the icon.
  clicked: boolean
): Animation[] {
  const growX = (iconRect.width * (POP_SCALE - 1)) / 2;
  const growY = (iconRect.height * (POP_SCALE - 1)) / 2;
  const rest = {
    width: `${iconRect.width}px`,
    height: `${iconRect.height}px`,
    marginLeft: "0px",
    marginTop: "0px",
    borderRadius: `${iconRadius}px`,
    // Already a full 1px ring, only invisible: see below.
    boxShadow: "0 0 0 1px transparent",
  };
  // The bolder border is the 1px border darkened plus a 1px ring drawn
  // as a shadow, not a wider border: a border that changes width moves
  // everything inside the box, glyph included. The ring fades in at
  // full width rather than growing from nothing, because a line can
  // only be drawn in whole device pixels: a growing one would appear in
  // one step partway through, while its colour can follow the curve
  // smoothly, dip and overshoot included.
  // A mid grey in either colour scheme: the text colour at half strength.
  const ink = `color-mix(in srgb, ${getComputedStyle(boxEl).color} 45%, transparent)`;
  const popped = {
    width: `${iconRect.width * POP_SCALE}px`,
    height: `${iconRect.height * POP_SCALE}px`,
    marginLeft: `${-growX}px`,
    marginTop: `${-growY}px`,
    borderRadius: `${iconRadius * POP_SCALE}px`,
    borderColor: ink,
    boxShadow: `0 0 0 1px ${ink}`,
  };
  const badgeRest = {
    width: `${iconBadge.size}px`,
    height: `${iconBadge.size}px`,
    fontSize: `${iconBadge.fontSize}px`,
  };
  const badgePopped = {
    width: `${iconBadge.size * POP_SCALE}px`,
    height: `${iconBadge.size * POP_SCALE}px`,
    fontSize: `${iconBadge.fontSize * POP_SCALE}px`,
  };
  const total = POP_MS + POP_OUT_MS;
  const frames = <T extends Record<string, string>>(from: T, to: T) => [
    // easeInOutBack: a small dip first, then past the target and back.
    { ...from, offset: 0, easing: "cubic-bezier(0.68, -0.6, 0.32, 1.6)" },
    { ...to, offset: POP_IN_MS / total },
    { ...to, offset: POP_MS / total, easing: "ease-out" },
    { ...from, offset: 1 },
  ];
  const animations: Animation[] = [];
  // A click is acknowledged at once: the icon starts out tinted, as it
  // was while pressed, and the tint drains away as the pop takes over.
  // The agent opening a widget has no click to acknowledge.
  if (clicked) {
    const tint = `color-mix(in srgb, ${getComputedStyle(boxEl).color} 5%, ${getComputedStyle(boxEl).backgroundColor})`;
    animations.push(
      boxEl.animate(
        [
          { backgroundColor: tint, offset: 0 },
          { backgroundColor: tint, offset: 0.35, easing: "ease-out" },
          { offset: 1 },
        ],
        { duration: POP_MS }
      )
    );
  }
  animations.push(
    boxEl.animate(frames(rest, popped), { duration: total }),
    badgeEl.animate(frames(badgeRest, badgePopped), { duration: total })
  );
  return animations;
}

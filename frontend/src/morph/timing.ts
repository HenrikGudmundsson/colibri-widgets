// How long each part of the morph takes and how it is eased. The
// animation itself is in flip-widget.ts and pop.ts.

export const DURATION = 650;
export const EASING = "cubic-bezier(.2,.8,.2,1)";
// How far along the whole travel (as a fraction of DURATION) the box
// stays sized like the small tray glyph before growing/shrinking into
// its full widget size. A plain CSS `transition` can only interpolate
// smoothly between exactly two values across the WHOLE duration, which
// read as the shape "linearly" ballooning the entire way there. What
// was actually wanted is for the box to still look like the icon for
// almost the whole trip and only pop into the widget's shape right at
// the very end -- a hold-then-snap curve, not a smooth ramp. That needs
// an explicit third keyframe partway through, which is exactly what the
// Web Animations API's `element.animate()` gives us (see flipWidget)
// and a CSS transition cannot: width/height/border-radius keyframes sit
// at 0 and HOLD_FRACTION with the SAME (icon) values, then move to the
// target values only between HOLD_FRACTION and 1. Position
// (offset-distance) has no such hold -- it keeps moving the entire
// duration, so the icon-sized box visibly travels the whole path before
// unfurling at the end.
export const HOLD_FRACTION = 0.8;

// The box stays clipped to icon size (overflow-hidden) until the shape
// animation actually pops it to full size, at HOLD_FRACTION * DURATION --
// any content fade-in that starts before that point is invisible, clipped
// away with the rest of the box's interior. Starting the fade here instead
// of some earlier fixed delay means the full fade duration actually plays
// out once content is visible, instead of mostly finishing off-screen and
// reading as an abrupt pop (confirmed: that's exactly what a flat 350ms
// delay did here before -- ~170ms of a 250ms fade happened while still
// clipped, leaving only an 80ms tail visible).
export const CONTENT_FADE_DELAY = HOLD_FRACTION * DURATION;
export const CONTENT_FADE_DURATION = 250;

// Before it leaves the tray, the icon "pops": it swells a little and its
// border thickens and darkens, so the eye is on the right icon when it
// takes off. POP_IN_MS to swell (an animation the eye can follow, on an
// easeInOutBack curve), held until POP_MS, when the flight
// starts; it settles back to normal over the flight's first POP_OUT_MS.
export const POP_IN_MS = 220;
export const POP_MS = 300;
export const POP_OUT_MS = 160;
export const POP_SCALE = 1.16;

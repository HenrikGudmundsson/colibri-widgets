// Where the icon glyph (the "badge") sits inside the box at each end of
// the morph: filling the box when it is a tray icon, in the corner when
// it is a widget.

// The corner badge's resting geometry, matching its Tailwind classes in
// widget-morph.tsx (`right-20 top-4 h-12 w-12 text-xl`) -- kept as named
// constants because the animation drives these same properties via inline
// styles, so the two need to agree in pixels, not just in class names.
// 1rem is assumed 16px (this app's default root font size).
const BADGE_INSET = 16; // top-4
// Further in from the right edge than from the top: the corner itself
// belongs to the pin and close buttons (see WidgetMorph's `action` prop).
const BADGE_RIGHT = 80; // right-20
const BADGE_SIZE = 48; // h-12 / w-12
const BADGE_FONT_SIZE = 20; // text-xl
const ICON_FONT_SIZE = 18; // tray button's own text-lg

// The tray icon's own border, and the box's while it is icon-sized.
const ICON_BORDER = 1;

export type BadgeGeom = {
  top: number;
  right: number;
  size: number;
  fontSize: number;
};

// The badge's geometry when it's occupying a tray icon's spot: filling
// the box completely (no inset), sized to match, at the tray button's
// own font size -- i.e. indistinguishable from the plain tray icon.
export function iconBadgeGeom(iconRect: DOMRect): BadgeGeom {
  return {
    // The glyph is positioned inside the box's border, but has to be
    // centred on the whole icon-sized box: pull it back out by the border
    // on both sides, or it sits a pixel off the tray icon's own glyph.
    top: -ICON_BORDER,
    right: -ICON_BORDER,
    size: iconRect.height,
    fontSize: ICON_FONT_SIZE,
  };
}

export const WIDGET_BADGE_GEOM: BadgeGeom = {
  top: BADGE_INSET,
  right: BADGE_RIGHT,
  size: BADGE_SIZE,
  fontSize: BADGE_FONT_SIZE,
};

import type { ToolCall } from "../resolve";

// What the morph reads from the page around it.

// Where a tool's tray icon is right now, or undefined if the tray isn't
// showing one. The tray marks its buttons with `data-tool` (see
// agent-console.tsx).
export function trayIconRect(tool: ToolCall["tool"]): DOMRect | undefined {
  return document.querySelector(`[data-tool="${tool}"]`)?.getBoundingClientRect();
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

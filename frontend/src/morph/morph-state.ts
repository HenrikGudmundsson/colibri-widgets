import type { ToolCall } from "../resolve";

// Ported from apps/ssr-agent/app/morph-state.ts -- pure client state, no
// Next.js/RSC coupling, so this is unchanged apart from dropping
// getServerDisplayedTool (that existed only to avoid a flash on SSR
// hydration; there's no SSR here, so useSyncExternalStore's third,
// server-snapshot argument is simply omitted everywhere this is used).

// A plain module-scoped handoff between AgentConsole (which knows the
// clicked icon's on-screen position at click time) and WidgetMorph (which
// needs that position once it mounts, moments later, to animate from it).
let pendingIconRect: DOMRect | null = null;

export function setPendingIconRect(rect: DOMRect) {
  pendingIconRect = rect;
}

// Whether a tool's tray icon was clicked a moment ago, as opposed to the
// tool being opened by the agent. A timestamp rather than a flag that is
// cleared on read: the effect that asks runs twice under Strict Mode.
let lastClick: { tool: ToolCall["tool"]; at: number } | null = null;

export function markClicked(tool: ToolCall["tool"]) {
  lastClick = { tool, at: performance.now() };
}

export function wasJustClicked(tool: ToolCall["tool"]): boolean {
  return (
    lastClick !== null &&
    lastClick.tool === tool &&
    performance.now() - lastClick.at < 500
  );
}

export function takePendingIconRect(): DOMRect | null {
  const rect = pendingIconRect;
  pendingIconRect = null;
  return rect;
}

// A tiny external store publishing which tools' tray icons are currently
// "occupied" -- a WidgetMorph is mid-flight from/to that icon or settled
// on it, so the tray must keep it hidden. A list, not a single value:
// pinned widgets stay open next to the live one, so several tools can be
// occupied at once. AgentConsole reads this instead of tracking its own
// notion of "the active tool", because only WidgetMorph knows the true
// animation phase. Replaced, never mutated, so useSyncExternalStore sees
// a new snapshot on every change.
let displayedTools: readonly ToolCall["tool"][] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function addDisplayedTool(tool: ToolCall["tool"]) {
  displayedTools = [...displayedTools, tool];
  emit();
}

export function removeDisplayedTool(tool: ToolCall["tool"]) {
  const index = displayedTools.indexOf(tool);
  if (index === -1) return;
  displayedTools = displayedTools.filter((_, i) => i !== index);
  emit();
}

export function subscribeDisplayedTool(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDisplayedTools() {
  return displayedTools;
}

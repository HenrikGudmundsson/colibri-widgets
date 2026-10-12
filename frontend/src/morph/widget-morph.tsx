import { useLayoutEffect, useState, type ReactNode } from "react";
import type { ToolCall } from "../resolve";
import { TOOLS } from "../tools";
import { useMorphRefs } from "./morph-refs";
import { addDisplayedTool, removeDisplayedTool } from "./morph-state";
import { useClose } from "./use-close";
import { useEntrance } from "./use-entrance";
import { useHeightCatchUp } from "./use-height-catch-up";
import { useToolSwitch, type Displayed } from "./use-tool-switch";

// The box a widget lives in, which grows out of the widget's tray icon
// and shrinks back into it. This file is the markup and what the box is
// currently showing; each animation is its own hook:
//
// - use-entrance.ts         icon -> widget, when the tool shown changes
// - use-tool-switch.ts      widget -> icon, before showing another tool
// - use-close.ts            widget -> icon, before being unmounted
// - use-height-catch-up.ts  height changes while open
//
// They all fly the box with flipWidget (flip-widget.ts).
export function WidgetMorph({
  tool,
  queryKey,
  children,
  action,
  closing = false,
  onClosed,
}: {
  tool: ToolCall["tool"];
  queryKey: string;
  children: ReactNode;
  // Rendered in the box's top-right corner, inside the content layer so it
  // fades with the content and is never visible while the box is still
  // icon-sized.
  action?: ReactNode;
  // Set to shrink the widget back into its tray icon; onClosed fires once
  // that has finished and the widget can be unmounted.
  closing?: boolean;
  onClosed?: () => void;
}) {
  const refs = useMorphRefs();
  const { wrapperRef, boxRef, contentRef, badgeRef } = refs;
  const [displayed, setDisplayed] = useState<Displayed>({
    tool,
    queryKey,
    children,
  });

  if (tool === displayed.tool && queryKey !== displayed.queryKey) {
    setDisplayed({ tool, queryKey, children });
  }

  useLayoutEffect(() => {
    const shown = displayed.tool;
    addDisplayedTool(shown);
    return () => removeDisplayedTool(shown);
  }, [displayed.tool]);

  useHeightCatchUp(refs);
  useEntrance(refs, displayed);
  useToolSwitch(refs, displayed.tool, { tool, queryKey, children }, setDisplayed);
  useClose(refs, displayed.tool, closing, onClosed);

  const toolDef = TOOLS.find((t) => t.tool === displayed.tool);
  const Icon = toolDef?.icon;

  return (
    <div ref={wrapperRef} data-widget={displayed.tool} className="relative">
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-lg border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"
      >
        <div ref={contentRef}>
          {displayed.children}
          {action}
        </div>
        <div
          ref={badgeRef}
          aria-hidden
          className="pointer-events-none absolute right-20 top-4 flex h-12 w-12 items-center justify-center text-xl"
        >
          {Icon && (
            <Icon
              aria-hidden
              className={`size-[1em] ${toolDef?.color ?? ""}`}
              strokeWidth={1.75}
            />
          )}
        </div>
      </div>
    </div>
  );
}

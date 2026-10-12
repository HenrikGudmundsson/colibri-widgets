import { CalendarDays, ListChecks, Sun, type LucideIcon } from "lucide-react";
import type { ToolCall } from "./resolve";

// Ported verbatim from apps/ssr-agent/app/tools.ts -- shared between the
// icon tray and (there) the server-side tool-picker; here just the tray,
// since tool-picking happens in the Python backend either way.
export const TOOLS: {
  tool: ToolCall["tool"];
  label: string;
  // A Lucide line icon: one colour, taking the text colour, and sized in
  // em so the morph can scale it through font-size.
  icon: LucideIcon;
  // The icon's colour, as a Tailwind class: one accent per tool, used in
  // the tray and on the opened widget's corner glyph.
  color: string;
  example: string;
  // The args a click on this icon resolves to -- known up front since the
  // example text is fixed, so a click can render the widget instantly
  // instead of waiting on a real agent round trip for a decision that's
  // already certain. See agent-console.tsx's submitClick().
  exampleArgs: Record<string, unknown>;
}[] = [
  {
    tool: "showWeather",
    label: "Weather",
    icon: Sun,
    color: "text-amber-500",
    example: "weather in Copenhagen",
    exampleArgs: { location: "Copenhagen" },
  },
  {
    tool: "showCalendar",
    label: "Calendar",
    icon: CalendarDays,
    color: "text-blue-600 dark:text-blue-400",
    example: "what's on my calendar this week",
    exampleArgs: { week_offset: 0 },
  },
  {
    tool: "showTodo",
    label: "To-do",
    icon: ListChecks,
    color: "text-emerald-600 dark:text-emerald-400",
    example: "show my to-do list",
    exampleArgs: { add: [] },
  },
];

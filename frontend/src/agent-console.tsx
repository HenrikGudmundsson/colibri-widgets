import { useState, useSyncExternalStore } from "react";
import type { ResolveFn, ResolveResponse, ToolCall } from "./resolve";
import { TOOLS } from "./tools";
import {
  getDisplayedTools,
  markClicked,
  setPendingIconRect,
  subscribeDisplayedTool,
} from "./morph/morph-state";

// Ported from apps/ssr-agent/app/agent-console.tsx. The tray UI, disable
// choreography, and useSyncExternalStore wiring are unchanged -- only
// submit() differs: ssr-agent's triggers a server round-trip via
// router.push/useTransition (the server then decides the tool and streams
// the widget back); this calls apps/agent-backend's /resolve directly and
// reports the result up to App.tsx itself, since there's no server render
// to carry that decision back through.
// Distance between neighbouring tray icons: w-10 plus gap-3.
const TRAY_STEP = 52;

export function AgentConsole({
  sessionId,
  resolve,
  onResolved,
  onError,
  onPendingChange,
  onLiveTool,
}: {
  sessionId: string;
  // Asks the agent; see App.tsx's `resolve` prop.
  resolve: ResolveFn;
  // Typed queries only -- these are real conversation turns, logged to
  // history. Tray clicks never call this; see onLiveTool.
  onResolved: (queryKey: string, response: ResolveResponse) => void;
  onError: (queryKey: string) => void;
  // Fired with the query text while a real (typed-query) agent call is in
  // flight, and with null once it settles -- lets App.tsx show a thinking
  // indicator in the conversation. Tray clicks never trigger this, since
  // they resolve instantly and have nothing to wait on.
  onPendingChange: (queryKey: string | null) => void;
  // Tray clicks only -- an ephemeral live preview, never logged as a
  // conversation turn. See App.tsx's openTool.
  onLiveTool: (
    tool: ToolCall["tool"],
    queryKey: string,
    args: Record<string, unknown>,
  ) => void;
}) {
  const [value, setValue] = useState("");
  // Same reasoning as ssr-agent's: plain state, not derived from the
  // resolve() promise's own pending flag alone, so the just-clicked
  // button stays visibly disabled through its whole animated lifecycle,
  // not just until the network call settles -- see hiddenTools/isBusy
  // below, which is what actually clears it.
  const [pendingClickTool, setPendingClickTool] = useState<
    ToolCall["tool"] | undefined
  >(undefined);
  const [isPending, setIsPending] = useState(false);
  // WidgetMorph publishes the tool it's currently animating from/to or
  // settled on; that's the real source of truth for hiding a tray icon.
  // No server-snapshot fallback needed here (unlike ssr-agent) -- there's
  // no SSR pass for this to mismatch against.
  const hiddenTools = useSyncExternalStore(
    subscribeDisplayedTool,
    getDisplayedTools,
  );

  if (
    pendingClickTool !== undefined &&
    hiddenTools.includes(pendingClickTool)
  ) {
    setPendingClickTool(undefined);
  }

  // Tray order: free icons pack to the left, icons whose widget is open
  // (invisible, but still in the DOM as the spot their widget shrinks back
  // into) trail behind. Kept as state rather than re-derived from TOOLS so
  // an icon returning from a widget stays where it landed instead of
  // jumping back to its original position.
  const [order, setOrder] = useState(() => TOOLS.map((t) => t.tool));
  const packed = [
    ...order.filter((tool) => !hiddenTools.includes(tool)),
    ...order.filter((tool) => hiddenTools.includes(tool)),
  ];
  if (packed.some((tool, i) => tool !== order[i])) {
    setOrder(packed);
  }

  // Typed free text: the tool is genuinely unknown, so this still has to
  // wait on the real agent call.
  async function submitTyped(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsPending(true);
    onPendingChange(trimmed);
    // The query now shows as a message bubble; free the input for the next.
    setValue("");
    try {
      const response = await resolve({
        query: trimmed,
        session_id: sessionId,
        tools: TOOLS.map((t) => t.tool),
      });
      onResolved(trimmed, response);
    } catch {
      onError(trimmed);
    } finally {
      setIsPending(false);
      onPendingChange(null);
    }
  }

  // A tray click names its own tool -- there's no real decision left for
  // the model to make, so this is fully client-side: no backend call at
  // all, just the known tool + exampleArgs rendered immediately as an
  // ephemeral live preview (see onLiveTool/App.tsx's openTool) --
  // never logged as a conversation turn, and replaced outright the moment
  // a different tool is clicked.
  function submitClick(
    tool: ToolCall["tool"],
    example: string,
    exampleArgs: Record<string, unknown>,
  ) {
    setPendingClickTool(tool);
    onLiveTool(tool, example, exampleArgs);
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitTyped(value);
        }}
      >
        <input
          type="text"
          aria-label="Message"
          // The agent backend refuses anything longer.
          maxLength={400}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Try: weather in Oslo / add buy milk to my to-do list"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={isPending}
          aria-label="Send"
          className="flex items-center justify-center rounded-md bg-neutral-900 px-3.5 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </form>
      <div className="flex gap-3">
        {TOOLS.map((t, domIndex) => {
          const isHidden = hiddenTools.includes(t.tool);
          // Moved with `translate` instead of reordering the DOM, so the
          // move can animate. A hidden icon waits out its own fade first,
          // so it is never seen sliding away; the others wait for
          // the departing icon's pop (POP_MS in morph/timing.ts) to finish,
          // so they don't slide in underneath it.
          const offset = (packed.indexOf(t.tool) - domIndex) * TRAY_STEP;
          const isBusy =
            pendingClickTool === t.tool || hiddenTools.includes(t.tool);
          return (
            <button
              key={t.tool}
              type="button"
              aria-label={t.label}
              data-tool={t.tool}
              data-current={hiddenTools.includes(t.tool) ? "" : undefined}
              disabled={isBusy}
              onClick={(e) => {
                setPendingIconRect(e.currentTarget.getBoundingClientRect());
                markClicked(t.tool);
                setValue("");
                submitClick(t.tool, t.example, t.exampleArgs);
              }}
              style={{
                translate: `${offset}px 0`,
                transition: `translate 300ms ease ${isHidden ? "200ms" : "300ms"}, opacity 200ms`,
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 text-lg opacity-100 cursor-pointer active:bg-neutral-100 disabled:cursor-default dark:active:bg-neutral-800 data-[current]:opacity-0 dark:border-neutral-700"
            >
              <t.icon
                aria-hidden
                className={`size-[1em] ${t.color}`}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createSessionId } from './session.ts'
import { resolve as askAgent } from './resolve.ts'
import type { ResolveFn, ResolveResponse, ToolCall } from './resolve.ts'
import { AgentConsole } from './agent-console.tsx'
import { WidgetMorph } from './morph/widget-morph.tsx'
import { WeatherWidget } from './widgets/weather-widget.tsx'
import { CalendarWidget } from './widgets/calendar-widget.tsx'
import { TodoWidget } from './widgets/todo-widget.tsx'
import { addTodos } from './todo-store.ts'
import { TOOLS } from './tools.ts'

// Ported tray/morph UI (see morph/, agent-console.tsx) around this app's own plain client widgets -- the
// client-rendered sibling of ssr-agent's SSR/RSC version of the same
// pattern.
const MAX_VISIBLE_TURNS = 7

function renderWidget(tool: string, args: Record<string, unknown>) {
  switch (tool) {
    case 'showWeather':
      return <WeatherWidget location={String(args.location ?? '')} />
    case 'showCalendar': {
      // Keyed by the offset so a new answer from the agent resets the
      // widget's own previous/next stepping.
      const weekOffset = Number(args.week_offset ?? 0) || 0
      return <CalendarWidget key={weekOffset} weekOffset={weekOffset} />
    }
    case 'showTodo':
      // Items come from todo-store, not from args: `add` is applied once
      // when the agent's answer arrives (see onResolved).
      return <TodoWidget />
    default:
      return null
  }
}

type Turn = {
  id: number
  queryKey: string
  // null means this turn errored (see AgentConsole's onError).
  response: ResolveResponse | null
}

// A real conversation turn -- typed queries only (see App's onResolved).
// When this resolved to a tool, the widget itself doesn't render here --
// it replaced whatever was in the single shared live-tool slot below (see
// App's slots state), so this just notes that it happened.
function TurnResult({ turn }: { turn: Turn }) {
  if (!turn.response) {
    return <p className={`${AGENT_BUBBLE} text-red-600`}>Something went wrong asking the agent.</p>
  }
  if (turn.response.tool) {
    const label = TOOLS.find((t) => t.tool === turn.response!.tool)?.label ?? turn.response.tool
    const added = turn.response.tool === 'showTodo' ? turn.response.args?.add : undefined
    if (Array.isArray(added) && added.length > 0) {
      return (
        <p className={AGENT_BUBBLE}>
          Added {added.join(', ')} to the {label} widget below.
        </p>
      )
    }
    return <p className={AGENT_BUBBLE}>Opened the {label} widget below.</p>
  }
  return (
    <p className={`${AGENT_BUBBLE} whitespace-pre-wrap`}>
      {turn.response.reply ?? 'No widget matched.'}
    </p>
  )
}

// Chat bubbles: the visitor's messages sit on the right in a tinted
// bubble, the agent's on the left in a white one, each with its corner
// nearest the speaker squared off slightly.
const USER_BUBBLE =
  'ml-auto w-fit max-w-[85%] rounded-3xl rounded-tr-lg bg-stone-200 px-4 py-2.5 text-sm dark:bg-stone-800'
const AGENT_BUBBLE =
  'w-fit max-w-[85%] rounded-3xl rounded-tl-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900'

// Animated three-dot "thinking" indicator -- shown in place of the
// not-yet-known result while a typed query's real agent call is in
// flight. Tray clicks never show this; they resolve instantly.
function ThinkingBubble() {
  return (
    <div className={`${AGENT_BUBBLE} flex items-center gap-1 py-3.5`}>
      <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-neutral-400" />
    </div>
  )
}

// One open widget. At most one slot is unpinned at a time -- that is the
// live slot the tray and the agent keep reusing; pinned slots stay open
// beside it until closed.
type Slot = {
  id: number
  tool: ToolCall['tool']
  queryKey: string
  args: Record<string, unknown>
  pinned: boolean
  closing: boolean
}

// Top-right corner controls: a pin toggle (drawn filled while pinned) and
// a close cross.
function WidgetActions({
  pinned,
  onTogglePin,
  onClose,
}: {
  pinned: boolean
  onTogglePin: () => void
  onClose: () => void
}) {
  const buttonClass =
    'flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
  const iconProps = {
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: 'size-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const

  return (
    <div className="absolute right-4 top-[26px] flex gap-1">
      <button
        type="button"
        onClick={onTogglePin}
        aria-label="Pin widget"
        aria-pressed={pinned}
        title={pinned ? 'Unpin' : 'Pin'}
        className={`${buttonClass} ${pinned ? 'text-neutral-900 dark:text-neutral-100' : ''}`}
      >
        <svg {...iconProps} fill={pinned ? 'currentColor' : 'none'}>
          <path d="M12 17v5" />
          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close widget"
        title="Close"
        className={buttonClass}
      >
        <svg {...iconProps}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// How long the messages, widgets and input take to slide to a new place.
const SHIFT_MS = 300

// An element's top edge in the page's layout, ignoring transforms. Summed
// up the offsetParent chain rather than read as a single offsetTop: an
// element that is mid-slide (it has a `translate` applied) becomes the
// offsetParent of everything inside it, so a bare offsetTop on a message
// would silently switch from "distance to the page" to "distance to the
// log" for the 300ms the log is sliding -- and a reading taken then would
// make the messages jump on the next unrelated re-render.
function layoutTop(el: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop
  }
  return top
}

// `resolve` asks the agent which widget (if any) answers a typed message.
// It defaults to the real backend call; pass another to drive the app
// without one.
function App({ resolve = askAgent }: { resolve?: ResolveFn }) {
  const [sessionId] = useState(createSessionId)
  const [turns, setTurns] = useState<Turn[]>([])
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  // Open widgets -- ephemeral, never logged as conversation turns.
  const [slots, setSlots] = useState<Slot[]>([])
  const nextSlotId = useRef(0)

  // Opening a tool, from the tray or the agent alike:
  // - already open (pinned or live): just give that widget the new content;
  // - otherwise reuse the live slot, whose WidgetMorph shrinks the old tool
  //   away and grows this one in;
  // - otherwise (nothing open, or everything pinned) add a new live slot.
  function openTool(tool: ToolCall['tool'], queryKey: string, args: Record<string, unknown>) {
    const id = nextSlotId.current++
    setSlots((prev) => {
      const target =
        prev.find((slot) => slot.tool === tool && !slot.closing) ??
        prev.find((slot) => !slot.pinned && !slot.closing)
      if (!target) {
        return [...prev, { id, tool, queryKey, args, pinned: false, closing: false }]
      }
      return prev.map((slot) => (slot === target ? { ...slot, tool, queryKey, args } : slot))
    })
  }

  function patchSlot(id: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)))
  }

  const nextId = useRef(0)

  function pushTurn(queryKey: string, response: ResolveResponse | null) {
    const turn: Turn = { id: nextId.current++, queryKey, response }
    setTurns((prev) => [...prev, turn].slice(-MAX_VISIBLE_TURNS))
  }

  // Keep the newest message in view: the log sits above the widget slot
  // and grows upward from it, so new entries arrive at its bottom edge.
  // A layout effect, and declared before the slide below, so the slide
  // measures the messages where the scroll has already put them.
  useLayoutEffect(() => {
    keepInputInView()
  }, [turns, pendingQuery])

  const mainRef = useRef<HTMLElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const slotsRef = useRef<HTMLDivElement>(null)
  const hasSlots = slots.length > 0

  // The whole column -- messages, widgets and input together -- is one
  // scrolling area, kept at its bottom end so the input and the latest
  // message stay in view. One area on purpose: a separately scrolling
  // message list gets squeezed to nothing by tall widgets, leaving the
  // messages unreachable.
  function keepInputInView() {
    const main = mainRef.current
    if (main) main.scrollTop = main.scrollHeight
  }

  // When a widget opens or closes, the messages and the input shift to
  // make or reclaim room. Slide them there instead of jumping: after every
  // commit, compare where each sits in the layout with where it sat
  // before, and play the difference down to zero. offsetTop/offsetHeight
  // rather than getBoundingClientRect, so a slide already in progress
  // doesn't distort the reading; less the column's scroll offset, so it
  // is where things appear, not where they are in the scrolled content.
  const anchorsRef = useRef(new Map<HTMLElement, number>())
  const readAnchors = () => {
    const log = logRef.current
    const consoleEl = consoleRef.current
    const anchors = new Map<HTMLElement, number>()
    const scrolled = mainRef.current?.scrollTop ?? 0
    // The log is bottom-aligned, so its bottom edge is what visibly moves.
    if (log) anchors.set(log, layoutTop(log) + log.offsetHeight - scrolled)
    if (consoleEl) anchors.set(consoleEl, layoutTop(consoleEl) - scrolled)
    // Each message, measured from the log's bottom edge (so the log's own
    // slide above isn't counted twice): a new message pushes the earlier
    // ones up.
    if (log) {
      const logBottom = layoutTop(log) + log.offsetHeight
      for (const el of listRef.current?.children ?? []) {
        const item = el as HTMLElement
        anchors.set(item, layoutTop(item) + item.offsetHeight - logBottom)
      }
    }
    // Each open widget, so one that stays slides when another opens or
    // closes beside it.
    for (const el of slotsRef.current?.children ?? []) {
      anchors.set(el as HTMLElement, layoutTop(el as HTMLElement) - scrolled)
    }
    return anchors
  }
  // Called after every commit, and also from the ResizeObserver below:
  // a widget swapping its content or settling its height changes the
  // layout without this component re-rendering.
  const slide = () => {
    const previous = anchorsRef.current
    const next = readAnchors()
    anchorsRef.current = next
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const [el, anchor] of next) {
      const before = previous.get(el)
      // A message that was just sent rises into place; everything else
      // that is new simply appears.
      if (before === undefined && previous.size > 0 && el.hasAttribute('data-enter')) {
        el.animate(
          [
            { opacity: 0, translate: '0 12px' },
            { opacity: 1, translate: '0 0' },
          ],
          { duration: SHIFT_MS, easing: 'ease-out' },
        )
        continue
      }
      if (before === undefined || Math.abs(before - anchor) < 1) continue
      // A widget in mid-flight positions itself (position: fixed, see
      // WidgetMorph); translating its wrapper would drag that off course.
      if (el.querySelector('[style*="position: fixed"]')) continue
      el.animate([{ translate: `0 ${before - anchor}px` }, { translate: '0 0' }], {
        duration: SHIFT_MS,
        easing: 'ease-out',
      })
    }
  }
  useLayoutEffect(slide)

  useEffect(() => {
    const main = mainRef.current
    const log = logRef.current
    const list = listRef.current
    if (!main || !log || !list) return

    const report = () => {
      // Something changed size, so bring the input back into view. Only
      // here and when a message arrives -- not on every re-render, or
      // pinning a widget would yank back someone who had scrolled up.
      keepInputInView()
      slide()
    }

    const observer = new ResizeObserver(report)
    observer.observe(list)
    for (const el of main.children) {
      if (el !== log) observer.observe(el)
    }
    report()
    return () => observer.disconnect()
    // `slide` is a new function every render but only reads refs, so the
    // one captured here stays correct; listing it would reconnect the
    // observer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSlots])

  // The window being resized moves things too, but continuously and not
  // through a commit; just keep the record current so the next commit
  // doesn't mistake that movement for its own.
  useEffect(() => {
    const onResize = () => {
      anchorsRef.current = readAnchors()
    }
    window.addEventListener('resize', onResize)
    // Scrolling by hand moves things too.
    const main = mainRef.current
    main?.addEventListener('scroll', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      main?.removeEventListener('scroll', onResize)
    }
  })

  // Bottom-anchored chat: messages on top, then the live widget slot, then
  // the input with the tray under it. The column is exactly as tall as the
  // window and scrolls as a whole when its content is taller.
  return (
    <main
      ref={mainRef}
      className="mx-auto flex h-dvh max-w-2xl flex-col gap-4 overflow-y-auto px-6 py-10"
    >
      <div ref={logRef} className="flex flex-1 shrink-0 flex-col">
        {/* mt-auto, not justify-end: it bottom-aligns a short log while
          still letting a long one scroll all the way to its first entry. */}
        <ul ref={listRef} className="mt-auto flex flex-col gap-3">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-2">
              <div className={USER_BUBBLE}>{turn.queryKey}</div>
              <TurnResult turn={turn} />
            </li>
          ))}
          {pendingQuery && (
            <li data-enter="" className="space-y-2">
              <div className={USER_BUBBLE}>{pendingQuery}</div>
              <ThinkingBubble />
            </li>
          )}
        </ul>
      </div>

      {hasSlots && (
        <div ref={slotsRef} className="flex shrink-0 flex-col gap-3">
          {slots.map((slot) => (
            <WidgetMorph
              key={slot.id}
              tool={slot.tool}
              queryKey={slot.queryKey}
              closing={slot.closing}
              onClosed={() => setSlots((prev) => prev.filter((other) => other.id !== slot.id))}
              action={
                <WidgetActions
                  pinned={slot.pinned}
                  onTogglePin={() => patchSlot(slot.id, { pinned: !slot.pinned })}
                  onClose={() => patchSlot(slot.id, { closing: true })}
                />
              }
            >
              {renderWidget(slot.tool, slot.args)}
            </WidgetMorph>
          ))}
        </div>
      )}

      <div ref={consoleRef} className="shrink-0">
        <AgentConsole
          sessionId={sessionId}
          resolve={resolve}
          onResolved={(queryKey, response) => {
            pushTurn(queryKey, response)
            // A typed query resolving to a tool opens it exactly as a tray
            // click would. See TurnResult's note.
            if (response.tool && response.args) {
              if (response.tool === 'showTodo' && Array.isArray(response.args.add)) {
                addTodos(response.args.add.filter((item) => typeof item === 'string'))
              }
              openTool(response.tool as ToolCall['tool'], queryKey, response.args)
            }
          }}
          onError={(queryKey) => pushTurn(queryKey, null)}
          onPendingChange={setPendingQuery}
          onLiveTool={openTool}
        />
      </div>
    </main>
  )
}

export default App

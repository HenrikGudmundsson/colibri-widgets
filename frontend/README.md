# Frontend

Vite + React + TypeScript + Tailwind v4, no framework beyond React. Asks
the agent backend's `/resolve` which widget answers a typed message and
renders it client-side; a click on a tray icon opens its widget without
asking.

Local dev: start the backend per its own README, then `pnpm install` and
`pnpm dev` here. Vite's dev server proxies `/agent-tools-api` to
`http://localhost:8000` (see `vite.config.ts`), so no environment
variables are needed.

Where to look:

- `src/morph/` -- the icon-to-widget animation: `widget-morph.tsx` is the
  component, `flip-widget.ts` the animation itself.
- `src/App.tsx` -- open widgets, pinning, and the sliding layout.
- `src/agent-console.tsx` -- the input and the tool tray.
- `src/widgets/` -- the widgets themselves (weather, calendar, to-do).

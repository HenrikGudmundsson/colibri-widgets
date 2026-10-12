# Colibri widgets

A chat interface for an agent where the tools are things you can see and
touch. Each tool sits as an icon in a tray under the input. When a tool
opens, its icon lifts out of the tray and grows into the widget it
produces; when it closes, the widget shrinks back into the icon.

A tool can be opened two ways, and both end in the same live widget:

- **In conversation.** Type what you need ("what's on my calendar this
  week?", "remember to buy milk") and the agent decides which widget
  answers it, and with what arguments.
- **Directly.** Click the tool's icon. No model call is made.

Widgets can be pinned, so one stays open while you open the next.

## How it works

- **The morph** is a FLIP animation (First, Last, Invert, Play) on the Web
  Animations API. The icon's and the widget's positions are measured, and
  the box flies between them along a curved path while its real width,
  height and corner radius animate, so nothing is distorted by scaling.
  It follows its target if the layout shifts mid-flight, and it can be
  interrupted. See `frontend/src/morph/`, starting from `flip-widget.ts`.
- **The agent** is a Python service built on pydantic-ai. Each widget is
  declared to the model as a *capability*: a tool with a typed argument
  schema. The model never produces UI. It returns the name of a capability
  and its arguments, and the client renders the matching widget. This
  follows the idea behind A2UI. See `backend/agent_backend/capabilities/`.

## Layout

```
frontend/   Vite + React + TypeScript + Tailwind v4
backend/    FastAPI + pydantic-ai + SQLAlchemy (async) + Postgres
```

## Running it

You need Node with pnpm, Python 3.13 with [uv](https://docs.astral.sh/uv/),
Docker (for Postgres), and an Anthropic API key.

Backend:

```
cd backend
docker compose -f docker-compose.dev.yml up -d     # Postgres
cp .env.example .env                                # add ANTHROPIC_API_KEY
uv sync
uv run alembic upgrade head
uv run uvicorn agent_backend.main:app --port 8000
```

Frontend, in another terminal:

```
cd frontend
pnpm install
pnpm dev
```

Then open http://localhost:5174/agent-tools/. The dev server proxies the
agent calls to the backend on port 8000.

## Notes

- The weather and calendar widgets show made-up data, and the to-do list
  lives in the browser tab. The point is the interaction, not the data.
- The backend is shared with a sister project and also contains a
  stock-chart capability this frontend does not use. A client tells the
  backend which tools it can render, and only those are offered to the
  model.
- This repository is generated from a larger private workspace, which is
  why the app is served under `/agent-tools/`. On my portfolio the same
  app runs with a scripted intro on top; that script is not part of it.

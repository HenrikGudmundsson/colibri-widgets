# agent-backend

The agent behind the demos: a FastAPI service around a
[pydantic-ai](https://ai.pydantic.dev/) agent that decides which widget
answers a message.

`POST /resolve` takes:

```json
{ "query": "what's on my calendar next week", "session_id": "…", "tools": ["showWeather", "showCalendar"] }
```

and returns either a tool call or a plain text reply:

```json
{ "tool": "showCalendar", "args": { "week_offset": 1 }, "reply": null }
```

- **Capabilities.** Each widget a client can show is declared to the model
  as a tool with a typed argument schema, in `agent_backend/capabilities/`.
  The model never produces UI; it names a capability and fills in its
  arguments, and the client renders the matching widget.
- **`tools`** lists the capabilities the calling client has widgets for.
  Only those are offered to the model. Omit it to offer all of them.
- **History.** The conversation is stored per `session_id` in Postgres and
  sent along with each new message.

## Usage limits

What one question can cost is bounded. Defaults are in
`agent_backend/config.py` and can be overridden through the environment:

- the question is at most 400 characters, checked before the model is
  called;
- the reply is at most 300 tokens, enforced by the model API whatever the
  prompt asks for;
- a question triggers one model call (a second is allowed for a retry),
  because a capability is the agent's *output*: calling one ends the run;
- only the last 6 exchanges are sent as history.

How many questions are accepted, and from whom, is not: on its own this
service answers everything it is sent. **Do not expose it to the public
like that.** Whether a question is answered at all is decided by a `Guard`
(`agent_backend/guard.py`), and the default one lets everything through.
To add rate limits, a budget or a human check, subclass it and put it in
place of the default by overriding the `get_guard` dependency:

```python
from agent_backend.dependencies import get_guard
from agent_backend.main import app

app.dependency_overrides[get_guard] = MyGuard
```

A guard either admits a question (and is told afterwards how many tokens
it cost) or refuses it with a normal response whose `reply` explains why
and whose `limited` field names the reason; the model is then not called.

A spend limit on the API key's workspace in the Anthropic Console is the
hard guarantee underneath all of this.

## Tracing

What each request did, and how long each part took, is recorded in the
`spans` table (`agent_backend/tracing.py`). None of it is written by hand:
FastAPI, SQLAlchemy and pydantic-ai emit OpenTelemetry spans for the
request, each query, the agent run and each model call, with durations and
any exception, and an exporter stores them in Postgres instead of sending
them to a tracing service. The spans of one request share a `trace_id`.

```
uv run python -m agent_backend.trace_report             # latest requests
uv run python -m agent_backend.trace_report --errors    # only failed ones
uv run python -m agent_backend.trace_report --slow 3000 # 3 seconds or more
uv run python -m agent_backend.trace_report 3f9a1c20    # one request, in full
```

- **The spans of the agent run and of each model call include the messages
  sent to and from the model**, so the table holds what people asked and
  what they were answered, next to their session ids. Treat it like the
  `conversations` table.
- Rows older than `TRACE_RETENTION_DAYS` (30) are deleted.
- `/health` is not traced.
- Every trace starts in this service: a `traceparent` header sent by a
  caller is ignored.
- A request never waits for its spans to be stored. That happens a few
  seconds later on a thread of its own, and is given up on after 5 seconds.
- Spans that cannot be stored, typically because the database is down, are
  written to the log instead. So is anything that goes wrong outside a
  request, such as the service failing to start.

## Local dev

1. `docker compose -f docker-compose.dev.yml up -d` -- Postgres only.
2. `cp .env.example .env`, fill in `ANTHROPIC_API_KEY`.
3. `uv sync`
4. `uv run alembic upgrade head`
5. `uv run uvicorn agent_backend.main:app --reload --port 8000`

`uv run pytest` runs the tests. They need neither Postgres nor an API key.

## Adding a capability

Add a module in `agent_backend/capabilities/` with an argument model, a
tool function that records its decision on `ctx.deps.resolved`, and a
`CAPABILITY`; then list it in `capabilities/registry.py`.

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

## Local dev

1. `docker compose -f docker-compose.dev.yml up -d` -- Postgres only.
2. `cp .env.example .env`, fill in `ANTHROPIC_API_KEY`.
3. `uv sync`
4. `uv run alembic upgrade head`
5. `uv run uvicorn agent_backend.main:app --reload --port 8000`

## Adding a capability

Add a module in `agent_backend/capabilities/` with an argument model, a
tool function that records its decision on `ctx.deps.resolved`, and a
`CAPABILITY`; then list it in `capabilities/registry.py`.

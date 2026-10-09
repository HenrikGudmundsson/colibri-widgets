from pydantic import BaseModel, Field


class ResolveRequest(BaseModel):
    # Length is checked in the handler, not here: an over-long question
    # gets an explanation the client can show, not a validation error.
    query: str
    session_id: str = Field(min_length=1, max_length=100)
    # Capability names the caller can render (e.g. "showWeather"). Omitted
    # or empty means every capability.
    tools: list[str] | None = Field(default=None, max_length=20)


class ResolveResponse(BaseModel):
    tool: str | None = None
    args: dict | None = None
    reply: str | None = None
    # Set when the question was refused rather than answered, naming the
    # reason; `reply` then holds the explanation.
    limited: str | None = None

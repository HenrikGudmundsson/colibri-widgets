"""Whether a question is answered at all.

On its own this service answers every question it is sent. Something that
exposes it to the public will want to decide who may ask, and how often;
that is done by supplying another Guard, overriding the `get_guard`
dependency (see dependencies.py), without touching the /resolve handler.
"""

from fastapi import Request

from agent_backend.api.models import ResolveRequest, ResolveResponse


class Admission:
    """One question that was let through."""

    async def record(self, input_tokens: int, output_tokens: int) -> None:
        """Called once the question has been dealt with, with what it cost."""


class Guard:
    async def admit(
        self, request: ResolveRequest, http_request: Request
    ) -> Admission | ResolveResponse:
        """Lets a question through, or returns the response that refuses it.

        A refusal is an ordinary response whose `reply` explains it and
        whose `limited` names the reason; the model is then never called.
        """
        return Admission()

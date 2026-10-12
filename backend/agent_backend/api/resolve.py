import logging

from fastapi import APIRouter, Depends, Request
from pydantic_ai import ModelMessagesTypeAdapter
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.usage import RunUsage, UsageLimits
from pydantic_core import to_jsonable_python

from agent_backend import config, tracing
from agent_backend.agent.core import build_agent
from agent_backend.agent.deps import AgentDeps
from agent_backend.agent.history import last_turns
from agent_backend.api.models import ResolveRequest, ResolveResponse
from agent_backend.dependencies import get_conversation_repository, get_guard

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/resolve")
async def resolve(
    request: ResolveRequest,
    http_request: Request,
    repo=Depends(get_conversation_repository),
    guard=Depends(get_guard),
):
    # On the request's trace (see tracing.py): whose question it was and
    # how it ended. The first before answering, so that it is there if
    # answering raises. A failed run is not marked here; the span of the
    # run itself carries the exception.
    tracing.annotate({"session.id": request.session_id})
    response = await answer(request, http_request, repo, guard)
    tracing.annotate(
        {
            "resolve.outcome": (
                f"refused:{response.limited}"
                if response.limited
                else f"tool:{response.tool}"
                if response.tool
                else "reply"
            )
        }
    )
    return response


async def answer(
    request: ResolveRequest, http_request: Request, repo, guard
) -> ResolveResponse:
    if len(request.query) > config.MAX_QUERY_CHARS:
        return ResolveResponse(
            reply=(
                "That message is too long for this demo. "
                f"Please keep it under {config.MAX_QUERY_CHARS} characters."
            ),
            limited="length",
        )

    # Before anything is spent: is this question answered at all? See
    # guard.py.
    admission = await guard.admit(request, http_request)
    if isinstance(admission, ResolveResponse):
        return admission

    stored_history = await repo.load(request.session_id)
    message_history = (
        last_turns(
            ModelMessagesTypeAdapter.validate_python(stored_history),
            config.HISTORY_TURNS,
        )
        if stored_history
        else None
    )

    agent = await build_agent(request.tools)
    deps = AgentDeps()
    # Passed in so that what was spent is known even if the run fails.
    usage = RunUsage()
    result = None
    failure = "Sorry, I couldn't answer that one."
    try:
        result = await agent.run(
            request.query,
            message_history=message_history,
            deps=deps,
            usage=usage,
            usage_limits=UsageLimits(request_limit=config.MAX_MODEL_REQUESTS),
        )
    except UnexpectedModelBehavior as error:
        # Typically the reply hitting the length cap: the model was asked
        # for more text than one answer here may contain.
        if "token limit" in str(error):
            failure = "That needs a longer answer than this demo gives. Try asking for something shorter."
        logger.warning("agent run failed: %s", error)
    except Exception:
        # The model API failing, or the question needing more model calls
        # than allowed. Not the caller's fault either way.
        logger.exception("agent run failed")
    finally:
        await admission.record(usage.input_tokens, usage.output_tokens)

    if result is None:
        return ResolveResponse(reply=failure)

    await repo.save(request.session_id, to_jsonable_python(result.all_messages()))

    if deps.resolved:
        return ResolveResponse(tool=deps.resolved["tool"], args=deps.resolved["args"])

    return ResolveResponse(reply=result.output)

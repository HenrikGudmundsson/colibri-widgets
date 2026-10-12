from pydantic_ai import Agent

# Not used by name. Agent() loads the module for its model, and with it the
# Anthropic SDK, the first time one is built; importing it here moves that
# (about a second in a fresh container) from the first question to startup.
import pydantic_ai.models.anthropic  # noqa: F401

from agent_backend import config
from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.registry import CAPABILITIES


async def build_agent(enabled: list[str] | None = None):
    # A caller names the capabilities it has widgets for, so the model is
    # never offered a tool that caller can't render. No list means all.
    capabilities = (
        [c for c in CAPABILITIES if c.name in enabled] if enabled else CAPABILITIES
    )
    return Agent(
        "anthropic:claude-haiku-5-5",
        deps_type=AgentDeps,
        instructions="You help decide which UI widget to show in response to a user's request. If one of your tools matches what they're asking for, call it. If nothing fits, just reply in plain text, in a few sentences at most. The widgets do not remember earlier turns, so call the matching tool every time it is asked for, even if you already called it for the same request earlier in the conversation.",
        # The capabilities are the agent's possible *outputs*, alongside
        # plain text: calling one ends the run. Registered as ordinary
        # tools, the model would be called a second time just to comment
        # on a decision that is already made -- double the cost and the
        # wait for a sentence nobody reads.
        output_type=[*[c.tool_fn for c in capabilities], str],
        model_settings={
            # Enforced by the API, whatever the prompt asks for.
            "max_tokens": config.MAX_REPLY_TOKENS,
            # No extended thinking. The model would otherwise reason
            # before answering, and those tokens count against max_tokens:
            # a question as short as "buy tickets" could spend the whole
            # allowance thinking and have its answer cut off. Picking a
            # widget doesn't need it, and without it answers are cheaper
            # and faster.
            "anthropic_thinking": {"type": "disabled"},
        },
    )

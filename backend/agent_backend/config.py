import os

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


# --- What one question may cost -------------------------------------------
# Applied where the agent is built and run. Override any of them through
# the environment. How many questions are accepted, and from whom, is not
# decided here: see guard.py.

MAX_QUERY_CHARS = _int("MAX_QUERY_CHARS", 400)
MAX_REPLY_TOKENS = _int("MAX_REPLY_TOKENS", 300)
# Model calls one question may trigger (one normally; one more for a retry).
MAX_MODEL_REQUESTS = _int("MAX_MODEL_REQUESTS", 2)
# How many earlier exchanges are sent along with a new question.
HISTORY_TURNS = _int("HISTORY_TURNS", 6)

# --- Tracing ---------------------------------------------------------------
# How long the `spans` table keeps what each request did. See tracing.py.
TRACE_RETENTION_DAYS = _int("TRACE_RETENTION_DAYS", 30)

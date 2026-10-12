import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from agent_backend import tracing
from agent_backend.api import health, resolve
from agent_backend.db.pool import close_db_pool, init_db_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_pool()
    yield
    # The last requests' spans first: it takes a bounded time, which closing
    # the pool does not if the database has stopped answering.
    await asyncio.to_thread(tracing.flush)
    await close_db_pool()


app = FastAPI(title="agent-backend", lifespan=lifespan)
tracing.instrument_app(app)

app.include_router(health.router)
app.include_router(resolve.router)

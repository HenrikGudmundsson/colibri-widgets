from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from agent_backend import tracing
from agent_backend.config import DATABASE_URL

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def async_database_url() -> str:
    """DATABASE_URL rewritten for SQLAlchemy's async (asyncpg) driver.

    .env/deploy configs just say plain postgresql:// (or postgres://, which
    some hosting providers use) -- rewritten here in one place rather than
    asking every env file to get the driver-specific scheme exactly right.
    Shared by both this module and alembic/env.py, which needs the same
    rewrite for migrations.
    """
    url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
    url = url.replace("postgres://", "postgresql+asyncpg://")
    return url


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db_pool() first.")
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Async context manager yielding a database session for one unit of work."""
    async with _get_session_factory()() as session:
        yield session


async def init_db_pool() -> None:
    """Create the async engine and session factory. Call once, at app startup."""
    global _engine, _session_factory
    _engine = create_async_engine(async_database_url(), pool_size=10)
    tracing.instrument_engine(_engine)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_db_pool() -> None:
    """Dispose the engine's connection pool. Call once, at app shutdown."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None

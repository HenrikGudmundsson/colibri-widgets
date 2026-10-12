from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base -- every ORM model inherits from this.

    alembic/env.py points at Base.metadata as its migration target, so a
    new model only needs to subclass this to be picked up by
    `alembic revision --autogenerate`.
    """


class Conversation(Base):
    __tablename__ = "conversations"

    session_id: Mapped[str] = mapped_column(primary_key=True)
    message_history: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )


class Span(Base):
    """One timed piece of work in a request: the request itself, a query,
    an agent run or a model call. Written by tracing.py, never by hand;
    the spans of one request share a `trace_id`.
    """

    __tablename__ = "spans"
    __table_args__ = (sa.Index("ix_spans_started_at", "started_at"),)

    trace_id: Mapped[str] = mapped_column(primary_key=True)
    span_id: Mapped[str] = mapped_column(primary_key=True)
    # None for the span the others hang under: the request.
    parent_span_id: Mapped[str | None]
    name: Mapped[str] = mapped_column(nullable=False)
    # Which library emitted it.
    scope: Mapped[str | None]
    started_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    duration_ms: Mapped[float] = mapped_column(nullable=False)
    # "ok", "error" or "unset" (finished without either being claimed).
    status: Mapped[str] = mapped_column(nullable=False)
    status_message: Mapped[str | None]
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Things that happened during the span; an exception is one of these.
    events: Mapped[list] = mapped_column(JSONB, nullable=False)

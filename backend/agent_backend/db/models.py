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

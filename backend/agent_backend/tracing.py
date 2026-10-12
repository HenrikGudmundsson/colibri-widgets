"""Records what each request did, and how long each part took, in Postgres.

Nothing in the service writes these records by hand. FastAPI, SQLAlchemy
and pydantic-ai each emit OpenTelemetry spans for their own work -- one per
request, per query, per agent run and per model call, with its duration and
any exception -- and the exporter below stores them in the `spans` table
instead of sending them to a tracing service. The spans of one request
share a `trace_id`.

    uv run python -m agent_backend.trace_report

prints recent requests, or one request's spans.

Spans that cannot be stored (the database being down is the likely reason,
and is itself worth seeing) are written to the log instead.
"""

import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from typing import Any, Sequence

import asyncpg
from fastapi import FastAPI
from opentelemetry import propagate, trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.context import Context
from opentelemetry.propagators.textmap import TextMapPropagator
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from pydantic_ai import Agent
from sqlalchemy.ext.asyncio import AsyncEngine

from agent_backend import config

logger = logging.getLogger(__name__)

COLUMNS = (
    "trace_id",
    "span_id",
    "parent_span_id",
    "name",
    "scope",
    "started_at",
    "duration_ms",
    "status",
    "status_message",
    "attributes",
    "events",
)
INSERT = f"""
    INSERT INTO spans ({", ".join(COLUMNS)})
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
    ON CONFLICT DO NOTHING
"""
PRUNE = "DELETE FROM spans WHERE started_at < now() - make_interval(days => $1)"
PRUNE_EVERY_SECONDS = 3600
# How long storing one batch may take, connecting included. Nothing else
# bounds it: the batch processor waits on its exporter for as long as it
# takes, and so does the flush at shutdown.
STORE_TIMEOUT_SECONDS = 5


def _timestamp(nanoseconds: int) -> datetime:
    return datetime.fromtimestamp(nanoseconds / 1e9, UTC)


def _storable(value: Any) -> Any:
    """`value` as something Postgres accepts: JSON types only, and no NUL
    characters, which neither its text nor its jsonb can hold. A question
    containing one would otherwise cost its whole batch of spans."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {str(key): _storable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_storable(item) for item in value]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _storable(str(value))


def _row(span: ReadableSpan) -> dict[str, Any]:
    """The span as a row of the `spans` table, keyed by column."""
    context = span.get_span_context()
    start, end = span.start_time or 0, span.end_time or 0
    events = [
        {
            "name": event.name,
            "at": _timestamp(event.timestamp).isoformat(),
            "attributes": dict(event.attributes or {}),
        }
        for event in span.events
    ]
    return {
        "trace_id": format(context.trace_id, "032x"),
        "span_id": format(context.span_id, "016x"),
        "parent_span_id": format(span.parent.span_id, "016x") if span.parent else None,
        "name": _storable(span.name),
        "scope": span.instrumentation_scope.name if span.instrumentation_scope else None,
        "started_at": _timestamp(start),
        "duration_ms": (end - start) / 1e6,
        "status": span.status.status_code.name.lower(),
        "status_message": _storable(span.status.description),
        "attributes": _storable(dict(span.attributes or {})),
        "events": _storable(events),
    }


def _arguments(row: dict[str, Any]) -> tuple:
    """`row` as INSERT's arguments."""
    return tuple(
        json.dumps(row[column]) if column in ("attributes", "events") else row[column]
        for column in COLUMNS
    )


class PostgresSpanExporter(SpanExporter):
    """Stores finished spans in the `spans` table.

    Called from the batch processor's own thread, a few seconds after the
    spans end, so a request never waits on it. It opens its own connection
    with asyncpg directly rather than borrowing the service's SQLAlchemy
    engine: that engine is itself traced, and storing a span must not
    produce another one.
    """

    def __init__(self, database_url: str, retention_days: int):
        self.database_url = database_url
        self.retention_days = retention_days
        self._pruned_at: float | None = None

    async def _store(self, rows: list[dict[str, Any]]) -> None:
        async with asyncio.timeout(STORE_TIMEOUT_SECONDS):
            connection = await asyncpg.connect(self.database_url)
            try:
                await connection.executemany(INSERT, [_arguments(row) for row in rows])
                await self._prune(connection)
                await connection.close()
            except BaseException:
                # Out of time, most likely. Closing politely would wait on
                # the same database again.
                connection.terminate()
                raise

    async def _prune(self, connection: asyncpg.Connection) -> None:
        now = time.monotonic()
        if self._pruned_at is not None and now - self._pruned_at < PRUNE_EVERY_SECONDS:
            return
        # Set before trying, so a failure is retried in an hour rather than
        # with every batch.
        self._pruned_at = now
        try:
            await connection.execute(PRUNE, self.retention_days)
        except Exception:
            # The spans themselves are stored by now.
            logger.exception("could not delete old spans")

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        rows = [_row(span) for span in spans]
        try:
            asyncio.run(self._store(rows))
        except Exception as error:
            logger.warning(
                "could not store %d spans (%r); logging them instead", len(rows), error
            )
            for row in rows:
                logger.warning("span %s", json.dumps(row, default=str))
            return SpanExportResult.FAILURE
        return SpanExportResult.SUCCESS


class NoPropagation(TextMapPropagator):
    """Takes no trace context from a caller's headers, so every trace
    starts here.

    By default a `traceparent` header is honoured: the caller picks the
    trace id, and the request's span is stored as the child of a span that
    is not -- which the report then does not list as a request at all.
    """

    def extract(self, carrier, context=None, getter=None) -> Context:
        return Context() if context is None else context

    def inject(self, carrier, context=None, setter=None) -> None:
        pass

    @property
    def fields(self) -> set[str]:
        return set()


_provider: TracerProvider | None = None


def instrument_app(app: FastAPI) -> None:
    """Turns tracing on for the app and for every agent. Call once, where
    the app is created."""
    global _provider
    if _provider is None:
        _provider = TracerProvider(
            resource=Resource.create({"service.name": "agent-backend"})
        )
        _provider.add_span_processor(
            BatchSpanProcessor(
                PostgresSpanExporter(config.DATABASE_URL, config.TRACE_RETENTION_DAYS)
            )
        )
        trace.set_tracer_provider(_provider)
        propagate.set_global_textmap(NoPropagation())
        Agent.instrument_all()
    FastAPIInstrumentor.instrument_app(
        app,
        # Polled every few seconds by the container health check.
        excluded_urls="/health",
        # Without this every request also gets a span per chunk of the
        # body it receives and sends, which says nothing a duration doesn't.
        exclude_spans=["receive", "send"],
    )


def instrument_engine(engine: AsyncEngine) -> None:
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)


def annotate(attributes: dict[str, str]) -> None:
    """Adds attributes to the current request's span: the few things worth
    searching by that only the handler knows."""
    trace.get_current_span().set_attributes(attributes)


def flush() -> None:
    """Stores whatever is still waiting. Call at shutdown, off the event
    loop (`asyncio.to_thread`): it blocks, for at most STORE_TIMEOUT_SECONDS
    per batch, and runs the exporter in the calling thread."""
    if _provider is not None:
        _provider.force_flush()

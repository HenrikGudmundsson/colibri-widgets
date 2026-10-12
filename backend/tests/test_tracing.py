import json
import logging
import socket
import time

import httpx
import pytest
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agent_backend import tracing
from agent_backend.tracing import PostgresSpanExporter

UNREACHABLE = "postgresql://agent:agent@127.0.0.1:1/agent_backend"


def finished_spans(work) -> dict[str, ReadableSpan]:
    """The spans `work(tracer)` produced, by name."""
    memory = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory))
    work(provider.get_tracer("test-scope"))
    return {span.name: span for span in memory.get_finished_spans()}


def request_with_failing_query(tracer) -> None:
    with tracer.start_as_current_span("request") as request:
        request.set_attribute("session.id", "abc")
        request.set_attribute("tools", ("showWeather", "showCalendar"))
        try:
            with tracer.start_as_current_span("query"):
                raise ValueError("boom")
        except ValueError:
            pass


def test_a_span_becomes_a_row():
    spans = finished_spans(request_with_failing_query)
    request, query = tracing._row(spans["request"]), tracing._row(spans["query"])

    assert set(request) == set(tracing.COLUMNS)
    assert len(request["trace_id"]) == 32 and len(request["span_id"]) == 16
    assert request["parent_span_id"] is None
    assert request["scope"] == "test-scope"
    assert request["status"] == "unset"
    assert request["attributes"] == {
        "session.id": "abc",
        "tools": ["showWeather", "showCalendar"],
    }
    assert request["events"] == []
    assert request["started_at"].tzinfo is not None
    assert request["duration_ms"] >= query["duration_ms"] >= 0

    # Same trace, hanging under the request, with its exception.
    assert query["trace_id"] == request["trace_id"]
    assert query["parent_span_id"] == request["span_id"]
    assert query["status"] == "error"
    assert "boom" in query["status_message"]
    (event,) = query["events"]
    assert event["name"] == "exception"
    assert event["attributes"]["exception.type"] == "ValueError"
    assert event["attributes"]["exception.message"] == "boom"


def test_a_row_becomes_what_postgres_accepts():
    def work(tracer):
        with tracer.start_as_current_span("nul\x00name") as span:
            span.set_attribute("question", "a\x00b")
            span.add_event("said", {"words": ("c\x00d",)})

    (span,) = finished_spans(work).values()
    arguments = tracing._arguments(tracing._row(span))

    assert len(arguments) == len(tracing.COLUMNS)
    # Postgres stores no NUL character, in text or in jsonb.
    assert not any("\x00" in value for value in arguments if isinstance(value, str))
    assert not any("\\u0000" in value for value in arguments if isinstance(value, str))
    by_column = dict(zip(tracing.COLUMNS, arguments))
    assert by_column["name"] == "nulname"
    assert json.loads(by_column["attributes"]) == {"question": "ab"}
    assert json.loads(by_column["events"])[0]["attributes"] == {"words": ["cd"]}


def test_spans_go_to_the_log_when_the_database_is_down(caplog):
    spans = finished_spans(request_with_failing_query)
    exporter = PostgresSpanExporter(UNREACHABLE, retention_days=30)

    with caplog.at_level(logging.WARNING, logger="agent_backend.tracing"):
        result = exporter.export(list(spans.values()))

    assert result is tracing.SpanExportResult.FAILURE
    assert "could not store 2 spans" in caplog.messages[0]
    logged = [
        json.loads(message.removeprefix("span "))
        for message in caplog.messages
        if message.startswith("span ")
    ]
    assert {row["name"] for row in logged} == {"request", "query"}
    query = next(row for row in logged if row["name"] == "query")
    assert query["events"][0]["attributes"]["exception.message"] == "boom"


def test_a_database_that_does_not_answer_is_given_up_on(monkeypatch, caplog):
    # Accepts the connection (the kernel does, from the backlog) and then
    # says nothing, as a database that has hung would.
    silent = socket.create_server(("127.0.0.1", 0))
    port = silent.getsockname()[1]
    monkeypatch.setattr(tracing, "STORE_TIMEOUT_SECONDS", 0.3)
    spans = finished_spans(request_with_failing_query)
    exporter = PostgresSpanExporter(
        f"postgresql://agent:agent@127.0.0.1:{port}/agent_backend", retention_days=30
    )

    started = time.monotonic()
    with caplog.at_level(logging.WARNING, logger="agent_backend.tracing"):
        result = exporter.export(list(spans.values()))
    silent.close()

    assert time.monotonic() - started < 3
    assert result is tracing.SpanExportResult.FAILURE
    assert sum(message.startswith("span ") for message in caplog.messages) == 2


@pytest.fixture
def app_spans():
    """The service's own app, and the spans its requests produce."""
    from agent_backend.main import app

    memory = InMemorySpanExporter()
    processor = SimpleSpanProcessor(memory)
    tracing._provider.add_span_processor(processor)
    yield app, memory
    # The app's real exporter got these spans too. Have it give up on them
    # now (there is no database) rather than when the interpreter exits.
    tracing.flush()
    processor.shutdown()


async def get(app, path: str, headers: dict[str, str] | None = None) -> int:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return (await client.get(path, headers=headers)).status_code


async def test_a_request_is_traced_and_the_health_check_is_not(app_spans):
    app, memory = app_spans

    assert await get(app, "/health") == 200
    assert await get(app, "/no-such-path") == 404

    (span,) = memory.get_finished_spans()
    assert span.attributes["http.status_code"] == 404


async def test_a_callers_trace_context_is_ignored(app_spans):
    # Otherwise a caller could choose the trace id, and its request would
    # be stored as a child of a span that does not exist -- which the
    # report does not list as a request.
    app, memory = app_spans
    theirs = "0af7651916cd43dd8448eb211c80319c"

    await get(app, "/no-such-path", {"traceparent": f"00-{theirs}-b7ad6b7169203331-01"})

    (span,) = memory.get_finished_spans()
    row = tracing._row(span)
    assert row["parent_span_id"] is None
    assert row["trace_id"] != theirs

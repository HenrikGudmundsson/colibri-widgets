"""Prints what recent requests did, from the `spans` table (see tracing.py).

    uv run python -m agent_backend.trace_report             # latest requests
    uv run python -m agent_backend.trace_report --errors    # only failed ones
    uv run python -m agent_backend.trace_report --slow 3000 # 3 seconds or more
    uv run python -m agent_backend.trace_report 3f9a1c20    # one request, in full

The last form takes a trace id, or the start of one, as printed in the
first column of the list.
"""

import argparse
import asyncio

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import aliased

from agent_backend.db.models import Span
from agent_backend.db.pool import close_db_pool, get_session, init_db_pool


def _failed(span: type[Span]):
    return or_(
        span.status == "error",
        span.attributes["http.status_code"].as_integer() >= 500,
    )


async def list_requests(limit: int, errors: bool, slow_ms: float | None) -> None:
    other = aliased(Span)
    # Whether anything in the request went wrong, not only the request
    # itself: a failed agent run is caught and answered with a 200.
    failed = (
        exists()
        .where(and_(other.trace_id == Span.trace_id, _failed(other)))
        .label("failed")
    )
    model_ms = (
        select(func.sum(other.duration_ms))
        .where(and_(other.trace_id == Span.trace_id, other.name.like("chat %")))
        .scalar_subquery()
    )
    query = (
        select(Span, failed, model_ms)
        .where(Span.parent_span_id.is_(None))
        .order_by(Span.started_at.desc())
        .limit(limit)
    )
    if errors:
        query = query.where(failed)
    if slow_ms is not None:
        query = query.where(Span.duration_ms >= slow_ms)

    async with get_session() as session:
        rows = (await session.execute(query)).all()

    print(
        f"{'trace':<10}{'time (UTC)':<21}{'request':<22}{'status':>6}"
        f"{'ms':>8}{'model ms':>10}  {'outcome':<22}session"
    )
    for span, has_failed, in_model in rows:
        attributes = span.attributes
        outcome = "FAILED" if has_failed else attributes.get("resolve.outcome", "")
        print(
            f"{span.trace_id[:8]:<10}{span.started_at:%Y-%m-%d %H:%M:%S}  "
            f"{span.name:<22}{attributes.get('http.status_code', ''):>6}"
            f"{span.duration_ms:>8.0f}{in_model or 0:>10.0f}  "
            f"{outcome:<22}{attributes.get('session.id', '')}"
        )
    if not rows:
        print("(no requests recorded)")


def _detail(span: Span) -> str:
    """The one thing most worth knowing about a span beyond its name."""
    attributes = span.attributes
    if "db.statement" in attributes:
        return " ".join(attributes["db.statement"].split())[:70]
    if "gen_ai.usage.input_tokens" in attributes:
        return (
            f"{attributes['gen_ai.usage.input_tokens']} tokens in, "
            f"{attributes.get('gen_ai.usage.output_tokens', 0)} out"
        )
    if "resolve.outcome" in attributes:
        return attributes["resolve.outcome"]
    return ""


async def show_request(trace_id: str) -> None:
    async with get_session() as session:
        first = (
            await session.execute(
                select(Span.trace_id).where(Span.trace_id.startswith(trace_id)).limit(1)
            )
        ).scalar_one_or_none()
        if first is None:
            print(f"(no request with a trace id starting {trace_id})")
            return
        spans = (
            (
                await session.execute(
                    select(Span)
                    .where(Span.trace_id == first)
                    .order_by(Span.started_at)
                )
            )
            .scalars()
            .all()
        )

    children: dict[str | None, list[Span]] = {}
    for span in spans:
        children.setdefault(span.parent_span_id, []).append(span)
    started = spans[0].started_at

    def show(span: Span, depth: int) -> None:
        offset = (span.started_at - started).total_seconds() * 1000
        flag = "  ERROR" if span.status == "error" else ""
        print(
            f"{offset:>8.0f} {span.duration_ms:>8.1f}  "
            f"{'  ' * depth}{span.name}{flag}  {_detail(span)}".rstrip()
        )
        for event in span.events:
            if event["name"] == "exception":
                details = event["attributes"]
                # On one line: a database error's message is a paragraph,
                # statement and parameters included.
                message = " ".join(str(details.get("exception.message")).split())
                print(
                    f"{'':>19}{'  ' * depth}{details.get('exception.type')}: "
                    f"{message[:300]}"
                )
        for child in children.get(span.span_id, []):
            show(child, depth + 1)

    print(f"trace {first}, started {started:%Y-%m-%d %H:%M:%S} UTC")
    print(f"{'at ms':>8} {'took ms':>8}")
    for root in children.get(None, []):
        show(root, 0)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("trace", nargs="?", help="show this request in full")
    parser.add_argument("-n", type=int, default=30, help="how many requests to list")
    parser.add_argument("--errors", action="store_true", help="only failed requests")
    parser.add_argument("--slow", type=float, metavar="MS", help="only requests this slow")
    args = parser.parse_args()

    await init_db_pool()
    try:
        if args.trace:
            await show_request(args.trace)
        else:
            await list_requests(args.n, args.errors, args.slow)
    finally:
        await close_db_pool()


if __name__ == "__main__":
    asyncio.run(main())

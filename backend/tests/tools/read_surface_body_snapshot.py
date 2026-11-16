"""Before/after body check and size measurement for the read surface (T060).

Synthetic data only. Point it at a disposable, already migrated PostgreSQL
database (``alembic upgrade head``); never at a live server.

    # 1. seed the synthetic ledger once (run from this tree)
    python tests/tools/read_surface_body_snapshot.py seed --url $URL
    # 2. dump every GET endpoint's status and body with each code tree
    PYTHONPATH=<old backend> python tests/tools/read_surface_body_snapshot.py dump \\
        --url $URL --out before.json
    PYTHONPATH=. python tests/tools/read_surface_body_snapshot.py dump \\
        --url $URL --out after.json
    # 3. compare (removed paths 404, retained values byte-identical)
    python tests/tools/read_surface_body_snapshot.py compare before.json after.json
    # 4. response sizes of the read surface vs the big dashboard and raw listing
    PYTHONPATH=. python tests/tools/read_surface_body_snapshot.py measure --url $URL

``dump`` imports ``app`` from ``PYTHONPATH``, so the same script exercises the
old and the new code against the same rows. Headers are not compared.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/my_ledge"
)

API_KEY = os.environ["API_KEY"]

# Query variants on top of the default call, for endpoints whose params change
# the body shape materially.
VARIANTS: dict[str, list[dict[str, str]]] = {
    "/api/v1/canonical-views/dashboard": [
        {"months": "24", "merchant_limit": "50", "queue_limit": "100"}
    ],
    "/api/v1/transactions": [{"per_page": "200", "page": "3"}],
    "/api/v1/metrics/monthly-flow": [
        {"start_period": "2026-01", "end_period": "2026-08"}
    ],
    "/api/v1/metrics/spend-cube": [
        {"group_by": "period,commitment_kind,adjustability", "limit": "2000"}
    ],
    "/api/v1/metrics/comparison/contributions": [
        {"adjustability": "adjustable", "level": "merchant"}
    ],
    "/api/v1/analytics/spending-anomalies": [{"end_date": "2026-07-31"}],
    "/api/v1/analytics/purchase-gate-candidates": [
        {"start_date": "2026-07-01", "end_date": "2026-07-31", "per_page": "100"}
    ],
    "/api/v1/installments/forecast": [{"months": "12"}],
}
# Fields whose value is the wall-clock time of the request.
VOLATILE_KEYS = {"generated_at"}
REMOVED_PATHS = {
    "/api/v1/analytics/discretionary-velocity",
    "/api/v1/analytics/purchase-gate-candidates",
    "/api/v1/analytics/spending-review-candidates",
    "/api/v1/analytics/spending-anomalies",
    "/api/v1/analytics/category-mom",
    "/api/v1/installments/forecast",
    "/api/v1/canonical-views/dashboard",
}
METADATA_PATHS = {"/api/v1/read/index", "/api/v1/read/data-status"}


def _connect(url: str):  # type: ignore[no-untyped-def]
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    parsed = make_url(url)
    if (parsed.database or "").startswith("live_copy"):
        raise SystemExit("refusing a live-copy database")
    if parsed.host not in ("localhost", "127.0.0.1", "::1"):
        raise SystemExit("refusing a non-loopback database")
    engine = create_async_engine(url)
    return engine, async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )


async def seed(url: str, purchases_per_month: int) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
    from read_surface_ledger import build_read_surface_ledger

    engine, factory = _connect(url)
    async with factory() as session:
        ledger = await build_read_surface_ledger(
            session, purchases_per_month=purchases_per_month
        )
    await engine.dispose()
    print(json.dumps({"seeded_rows": ledger.transaction_count}))


async def _client_session(url: str):  # type: ignore[no-untyped-def]
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db_session
    from app.main import app

    engine, factory = _connect(url)

    async def override():  # type: ignore[no-untyped-def]
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
    return app, engine, client


def _get_paths(app) -> list[str]:  # type: ignore[no-untyped-def]
    from fastapi.routing import APIRoute

    return sorted(
        route.path
        for route in app.routes
        if isinstance(route, APIRoute) and "GET" in route.methods
    )


def _normalize(content: bytes) -> bytes:
    try:
        body = json.loads(content)
    except ValueError:
        return content

    def strip(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: ("<volatile>" if key in VOLATILE_KEYS else strip(item))
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [strip(item) for item in value]
        return value

    stripped = strip(body)
    if stripped == body:
        return content
    return json.dumps(stripped, ensure_ascii=False, sort_keys=False).encode()


async def dump(url: str, out: Path) -> None:
    from sqlalchemy import func, select

    from app.models.transaction import Transaction

    app, engine, client = await _client_session(url)
    async with engine.connect() as connection:
        transaction_id = await connection.scalar(select(func.min(Transaction.id)))
    headers = {"X-API-Key": API_KEY}
    results: dict[str, dict[str, Any]] = {}
    async with client:
        for path in sorted(set(_get_paths(app)) | REMOVED_PATHS):
            concrete = re.sub(r"\{transaction_id\}", str(transaction_id), path)
            concrete = re.sub(r"\{[a-z_]+\}", "999999", concrete)
            for params in [{}, *VARIANTS.get(path, [])]:
                response = await client.get(concrete, params=params, headers=headers)
                body = _normalize(response.content)
                key = concrete + (
                    "?" + json.dumps(params, sort_keys=True) if params else ""
                )
                results[key] = {
                    "status": response.status_code,
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "bytes": len(response.content),
                    "volatile_normalized": body != response.content,
                    "body": body.decode("utf-8", errors="replace"),
                }
    await engine.dispose()
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(json.dumps({"endpoints_called": len(results), "out": str(out)}))


def _expected_metadata(path: str, body: dict) -> dict:
    """The only allowed changes to retained read bodies: discovery pointers."""
    if path == "/api/v1/read/index":
        from app.services.read_surface_index import build_index

        replacement = next(
            entry.model_dump(mode="json")
            for entry in build_index().entries
            if entry.key == "month_end_projection"
        )
        for index, entry in enumerate(body["entries"]):
            if entry["key"] == "month_end_projection":
                assert set(entry) == set(replacement)
                assert all(
                    entry[key] == replacement[key]
                    for key in entry
                    if key not in {"path", "response_field", "notes"}
                )
                body["entries"][index] = replacement
    elif path == "/api/v1/read/data-status":
        from app.services.read_surface_service import MONTH_END_FORECAST_LOCATION

        body["data"]["month_end_forecast"] = MONTH_END_FORECAST_LOCATION
    return body


def compare(before: Path, after: Path) -> int:
    old = json.loads(before.read_text())
    new = json.loads(after.read_text())
    missing = sorted(set(old) - set(new))
    changed, removed, metadata = [], [], []
    for key in sorted(set(old) & set(new)):
        path = key.split("?", 1)[0]
        if path in REMOVED_PATHS:
            if new[key]["status"] != 404:
                changed.append(key)
            else:
                removed.append(key)
        elif (old[key]["status"], old[key]["sha256"]) != (
            new[key]["status"],
            new[key]["sha256"],
        ):
            if path in METADATA_PATHS and old[key]["status"] == new[key]["status"]:
                expected = _expected_metadata(path, json.loads(old[key]["body"]))
                # Exact serialization as Pydantic/FastAPI, not an unordered comparison.
                expected_bytes = json.dumps(
                    expected, ensure_ascii=False, separators=(",", ":")
                ).encode()
                if hashlib.sha256(expected_bytes).hexdigest() == new[key]["sha256"]:
                    metadata.append(key)
                    continue
            changed.append(key)
    # Projection has a new envelope, with the former object unchanged in data.
    projection_unchanged = None
    dashboard = old.get("/api/v1/canonical-views/dashboard")
    projection = new.get("/api/v1/read/month-projection")
    if dashboard and projection:
        old_projection = json.loads(dashboard["body"])["month_projection"]
        new_projection = json.loads(projection["body"])["data"]
        projection_unchanged = old_projection == new_projection
        if not projection_unchanged:
            changed.append("/api/v1/read/month-projection.data")
    print(
        json.dumps(
            {
                "compared": len(set(old) & set(new)),
                "identical": len(set(old) & set(new))
                - len(changed)
                - len(removed)
                - len(metadata),
                "removed_404": removed,
                "metadata_pointers_only": metadata,
                "projection_object_unchanged": projection_unchanged,
                "changed": changed,
                "missing_after": missing,
                "added": sorted(set(new) - set(old)),
                "volatile_keys": sorted(VOLATILE_KEYS),
            },
            indent=1,
        )
    )
    return 1 if changed or missing else 0


async def measure(url: str) -> None:
    app, engine, client = await _client_session(url)
    headers = {"X-API-Key": API_KEY}
    sizes: dict[str, int] = {}
    async with client:
        for path, params in [
            ("/api/v1/read/index", {}),
            ("/api/v1/read/data-status", {}),
            ("/api/v1/read/monthly-flow", {}),
            (
                "/api/v1/read/monthly-flow",
                {"start_period": "2026-07", "end_period": "2026-07"},
            ),
            ("/api/v1/read/spend-cube", {}),
            (
                "/api/v1/read/spend-cube",
                {
                    "group_by": "period,commitment_kind",
                    "start_period": "2026-07",
                    "end_period": "2026-07",
                },
            ),
            ("/api/v1/read/comparison/monthly-flow", {}),
            ("/api/v1/read/comparison/contributions", {}),
            ("/api/v1/read/review-items", {}),
            ("/api/v1/read/commitments", {}),
            ("/api/v1/read/month-projection", {}),
        ]:
            response = await client.get(path, params=params, headers=headers)
            assert response.status_code == 200, (path, response.status_code)
            label = path + (" " + json.dumps(params) if params else "")
            sizes[label] = len(response.content)
        page, total_bytes, pages = 1, 0, 0
        while True:
            response = await client.get(
                "/api/v1/transactions",
                params={"per_page": "200", "page": str(page)},
                headers=headers,
            )
            assert response.status_code == 200
            total_bytes += len(response.content)
            pages += 1
            body = response.json()
            if page * 200 >= int(body["total"]):
                sizes["/api/v1/transactions (all pages, per_page=200)"] = total_bytes
                sizes["transactions_listed"] = int(body["total"])
                sizes["transaction_pages"] = pages
                break
            page += 1
    await engine.dispose()
    print(json.dumps(sizes, indent=1))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    seed_parser = sub.add_parser("seed")
    seed_parser.add_argument("--url", required=True)
    seed_parser.add_argument("--purchases-per-month", type=int, default=205)
    dump_parser = sub.add_parser("dump")
    dump_parser.add_argument("--url", required=True)
    dump_parser.add_argument("--out", type=Path, required=True)
    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("before", type=Path)
    compare_parser.add_argument("after", type=Path)
    measure_parser = sub.add_parser("measure")
    measure_parser.add_argument("--url", required=True)
    args = parser.parse_args()
    if args.command == "seed":
        asyncio.run(seed(args.url, args.purchases_per_month))
    elif args.command == "dump":
        asyncio.run(dump(args.url, args.out))
    elif args.command == "compare":
        return compare(args.before, args.after)
    else:
        asyncio.run(measure(args.url))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Deprecation marks for read endpoints the read surface replaces (T060).

The seven former deprecated reads have been removed with owner approval.
The remaining liquidity-health endpoint keeps its body and status code; it
only gets ``deprecated: true`` in OpenAPI and two response headers:
``Deprecation: true`` and ``Link: <successor>; rel="successor-version"``.
Removal waits until the consuming agent has switched and the user approves
(docs/agents/read-surface-migration.md). Import-contract endpoints (upload
preview/apply, review, rollback, upload logs) are never listed here.
"""

from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# (method, path) -> successor path in the read surface.
DEPRECATED_READ_ENDPOINTS: dict[tuple[str, str], str] = {
    (
        "GET",
        "/api/v1/analytics/liquidity-health",
    ): "/api/v1/metrics/net-worth/emergency-fund",
}


def mark_deprecated_routes(app: FastAPI) -> None:
    """Set ``deprecated`` on the listed routes so OpenAPI shows it."""
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods:
            if (method, route.path) in DEPRECATED_READ_ENDPOINTS:
                route.deprecated = True


class DeprecationHeaderMiddleware:
    """Adds the deprecation headers; never touches the body or status."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        successor = DEPRECATED_READ_ENDPOINTS.get(
            (scope.get("method", ""), scope.get("path", ""))
        )
        if successor is None:
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"deprecation", b"true"))
                headers.append(
                    (b"link", f'<{successor}>; rel="successor-version"'.encode())
                )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)

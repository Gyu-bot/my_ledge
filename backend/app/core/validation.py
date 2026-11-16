"""One HTTP 422 body for the read surfaces (``/read/*``, ``/metrics/net-worth/*``).

Every 422 of these routes has FastAPI's ``HTTPValidationError`` shape: a
``detail`` array of objects with ``loc``, ``msg``, ``type`` (plus ``input``
and, when useful, ``ctx``). FastAPI already produces that shape for query
parameters it validates itself; services that raise ``HTTPException(422,
"text")`` are converted by ``UniformValidationRoute`` so a consumer never has
to handle a plain string ``detail``.
"""

from collections.abc import Callable, Coroutine, Iterable
from typing import Any

from fastapi import Request, Response
from fastapi.dependencies.utils import get_flat_dependant
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException as StarletteHTTPException


def query_error(
    param: str | None,
    msg: str,
    *,
    error_type: str = "value_error",
    value: object = None,
    allowed: Iterable[str] | None = None,
) -> RequestValidationError:
    """A 422 for one query parameter, in the ``HTTPValidationError`` shape."""
    error: dict[str, object] = {
        "type": error_type,
        "loc": ("query", param) if param else ("query",),
        "msg": msg,
        "input": value,
    }
    if allowed is not None:
        error["ctx"] = {"allowed": list(allowed)}
    return RequestValidationError([error])


class UniformValidationRoute(APIRoute):
    """Converts a plain-string 422 ``HTTPException`` into the array shape."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def route_handler(request: Request) -> Response:
            try:
                return await handler(request)
            except StarletteHTTPException as exc:
                if exc.status_code == 422 and not isinstance(exc.detail, list):
                    raise query_error(None, str(exc.detail)) from exc
                raise

        return route_handler


async def reject_unknown_query_params(request: Request) -> None:
    """422 naming every query parameter the matched route does not declare.

    A wrong parameter name (``start_date`` on a route that takes
    ``start_period``) would otherwise be ignored and the full range returned.
    """
    route = request.scope.get("route")
    if not isinstance(route, APIRoute):
        return
    allowed = sorted(
        {param.alias for param in get_flat_dependant(route.dependant).query_params}
    )
    unknown = sorted(set(request.query_params) - set(allowed))
    if not unknown:
        return
    raise RequestValidationError(
        [
            {
                "type": "extra_forbidden",
                "loc": ("query", name),
                "msg": (
                    f"Unknown query parameter '{name}'. Allowed: "
                    + (", ".join(allowed) if allowed else "(none)")
                ),
                "input": request.query_params.get(name),
                "ctx": {"allowed": allowed},
            }
            for name in unknown
        ]
    )

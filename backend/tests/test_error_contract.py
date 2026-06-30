"""RFC 7807 error contract (AC: 2, ARCH §4.6).

Exercises the REAL production code — the typed raisers in `backend.errors` (which produce the dict
`detail` services raise) and the actual exception-handler closures registered on `create_app()`
(pulled straight off `app.exception_handlers`). No reimplemented stand-in app: a copy of the
handlers could pass while the real ones drift.
"""

import pytest
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError

from backend import errors
from backend.main import create_app


def _fake_request(path: str) -> Request:
    """Minimal ASGI scope so a handler can read `request.url.path`."""
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": b"",
            "headers": [],
            "scheme": "http",
            "server": ("test", 80),
        }
    )


def _handler_for(exc_type):
    """The production handler closure registered on the real app for `exc_type`."""
    return create_app().exception_handlers[exc_type]


# ── The typed raisers produce the §4.6 dict detail services raise (the dict-passthrough source) ──


@pytest.mark.parametrize(
    ("raiser", "kwargs", "status", "type_"),
    [
        (errors.not_found, {"entity_type": "Account", "entity_id": "a1"}, 404, "not_found"),
        (errors.duplicate_name, {"entity_type": "Cat", "name": "Food"}, 409, "duplicate_name"),
        (errors.has_dependencies, {"entity_type": "C", "entity_id": "c"}, 409, "has_dependencies"),
        (errors.conflict, {"detail": "stale write"}, 409, "conflict"),
        (errors.bad_request, {"title": "Bad", "detail": "bad field"}, 400, "bad_request"),
        (errors.unauthorized, {"detail": "no session"}, 401, "unauthorized"),
        (errors.forbidden, {"detail": "members may not"}, 403, "forbidden"),
    ],
)
def test_typed_raisers_emit_7807_dict(raiser, kwargs, status, type_):
    with pytest.raises(HTTPException) as exc_info:
        raiser(**kwargs)
    exc = exc_info.value
    assert exc.status_code == status
    assert isinstance(exc.detail, dict)
    assert exc.detail["type"] == type_
    assert exc.detail["status"] == status
    assert isinstance(exc.detail["detail"], str)
    assert "error" not in exc.detail  # never the legacy {"error": ...} envelope


# ── The real registered handlers shape responses per §4.6 ──


async def test_real_handler_passes_dict_detail_through_unchanged():
    """A typed (dict-detail) HTTPException is returned verbatim by the production handler."""
    handler = _handler_for(HTTPException)
    instance = "/api/accounts/a1"
    detail = errors.problem("not_found", "Account not found", 404, "a1 does not exist", instance)
    with pytest.raises(HTTPException) as raised:
        errors.not_found(entity_type="Account", entity_id="a1", instance=instance)

    resp = await handler(_fake_request(instance), raised.value)
    assert resp.status_code == 404
    import json

    body = json.loads(resp.body)
    assert body["type"] == "not_found"
    assert body["status"] == 404
    assert "error" not in body
    # the raiser's own dict is what flows through
    assert set(detail) <= set(body)


async def test_real_handler_wraps_plain_string_detail():
    """A bare-string HTTPException (e.g. a framework 404) is wrapped into the §4.6 shape."""
    handler = _handler_for(HTTPException)
    resp = await handler(_fake_request("/nope"), HTTPException(status_code=404, detail="Not Found"))
    import json

    body = json.loads(resp.body)
    assert body == {
        "type": "http_error",
        "title": "Not Found",
        "status": 404,
        "detail": "Not Found",
        "instance": "/nope",
    }
    assert "error" not in body


async def test_real_validation_handler_returns_field_array():
    """422 carries the field-error array (field/message/type), not an envelope."""
    handler = _handler_for(RequestValidationError)
    exc = RequestValidationError(
        [{"loc": ("body", "name"), "msg": "too short", "type": "string_too_short"}]
    )
    resp = await handler(_fake_request("/validate"), exc)
    import json

    body = json.loads(resp.body)
    assert resp.status_code == 422
    assert body["type"] == "validation_error"
    assert body["status"] == 422
    assert isinstance(body["detail"], list) and body["detail"]
    assert body["detail"][0]["field"] == "body.name"
    assert "message" in body["detail"][0]
    assert "error" not in body

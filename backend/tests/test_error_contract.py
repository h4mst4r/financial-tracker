"""Test RFC 7807 error contract (AC: 2).

Mount a tiny TestClient app with routes that raise HTTPException and trigger 422;
assert exact §4.6 JSON shapes and that no {"error":...} envelope appears.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from backend.errors import problem


def _build_test_app() -> FastAPI:
    """Build a minimal test app with RFC 7807 handlers."""
    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request, exc: HTTPException):
        if isinstance(exc.detail, dict):
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "type": "http_error",
                "title": exc.detail,
                "status": exc.status_code,
                "detail": exc.detail,
                "instance": request.url.path,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc: RequestValidationError):
        errors = []
        for error in exc.errors():
            errors.append(
                {
                    "field": ".".join(str(loc) for loc in error["loc"]),
                    "message": error["msg"],
                    "type": error["type"],
                }
            )
        return JSONResponse(
            status_code=422,
            content={
                "type": "validation_error",
                "title": "Validation failed",
                "status": 422,
                "detail": errors,
                "instance": request.url.path,
            },
        )

    @app.get("/not-found")
    async def raise_not_found():
        raise HTTPException(
            status_code=404,
            detail=problem(
                type_="not_found",
                title="Resource not found",
                status=404,
                detail="The requested resource does not exist",
                instance="/not-found",
            ),
        )

    @app.get("/conflict")
    async def raise_conflict():
        raise HTTPException(
            status_code=409,
            detail=problem(
                type_="duplicate_name",
                title="Already exists",
                status=409,
                detail="Item 'test' already exists",
                instance="/conflict",
            ),
        )

    class _ItemInput(BaseModel):
        name: str = Field(..., min_length=3)

    @app.post("/validate")
    async def raise_validation(data: _ItemInput):
        return {"name": data.name}

    return app


@pytest.fixture
def client():
    return TestClient(_build_test_app())


def test_http_exception_dict_detail_passed_through(client):
    """Dict detail is passed through unchanged."""
    resp = client.get("/not-found")
    assert resp.status_code == 404
    body = resp.json()
    assert body["type"] == "not_found"
    assert body["title"] == "Resource not found"
    assert body["status"] == 404
    assert "does not exist" in body["detail"]
    assert body["instance"] == "/not-found"
    # No {"error": ...} envelope
    assert "error" not in body


def test_conflict_returns_7807_shape(client):
    """409 returns proper 7807 shape."""
    resp = client.get("/conflict")
    assert resp.status_code == 409
    body = resp.json()
    assert body["type"] == "duplicate_name"
    assert body["status"] == 409
    assert "error" not in body


def test_validation_error_returns_7807_shape(client):
    """422 validation error returns field-error array."""
    resp = client.post("/validate", json={"name": "ab"})  # too short
    assert resp.status_code == 422
    body = resp.json()
    assert body["type"] == "validation_error"
    assert body["status"] == 422
    assert isinstance(body["detail"], list)
    assert len(body["detail"]) > 0
    assert "field" in body["detail"][0]
    assert "message" in body["detail"][0]
    assert "error" not in body


def test_no_error_envelope_anywhere(client):
    """No {"error", "detail"} envelope exists anywhere."""
    resp = client.get("/not-found")
    body = resp.json()
    assert "error" not in body, "Should not have 'error' key"

    resp = client.get("/conflict")
    body = resp.json()
    assert "error" not in body, "Should not have 'error' key"

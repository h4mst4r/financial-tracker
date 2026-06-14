"""Backend latency budget gate (NFR §4.1: CRUD < 500 ms p95).

Smoke-probes the liveness path through the real ASGI stack and asserts p95 stays
within the CRUD envelope. The < 2 s aggregation budget is the ceiling reused by the
later aggregation stories; this skeleton only exercises the CRUD-class target.
"""

import asyncio
import os
import sys
import time
from pathlib import Path

import httpx
from httpx import ASGITransport

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import create_app  # noqa: E402  (path bootstrap must precede import)

REQUESTS = 50
BUDGET_MS = float(os.environ.get("LATENCY_BUDGET_MS", "500"))


async def main() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    samples: list[float] = []
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(REQUESTS):
            start = time.perf_counter()
            response = await client.get("/health")
            samples.append((time.perf_counter() - start) * 1000)
            assert response.status_code == 200

    samples.sort()
    p95 = samples[int(len(samples) * 0.95) - 1]
    print(f"/health p95: {p95:.2f} ms (budget {BUDGET_MS:.0f} ms over {REQUESTS} requests)")
    if p95 > BUDGET_MS:
        raise SystemExit(f"Latency budget exceeded: {p95:.2f} ms > {BUDGET_MS:.0f} ms")


if __name__ == "__main__":
    asyncio.run(main())

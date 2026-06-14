# Financial Tracker

A private, household financial tracker — Python 3.12 + FastAPI backend, React 19 + Vite
+ TypeScript frontend, served same-origin from one Cloud Run container. See
`_bmad-output/planning-artifacts/architecture.md` for the full design.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI (ASGI) on uvicorn — app factory `backend.main:app` |
| Frontend | React 19 + Vite + TypeScript (strict, no `any`) |
| Styling | Tailwind v4, token-first (`@theme` / `@utility`) |
| Config | `pydantic-settings` reading the ARCH §5.4 env matrix |
| Quality gates | ruff · pytest (+pytest-asyncio, +cov) · vitest + Testing Library · Playwright · bandit · pip-audit |

## Prerequisites

- Python 3.12 with the project virtualenv at `venv/` (already created)
- Node 22+

## Local setup (clean checkout)

### 1. Environment

```bash
cp .env.example .env   # fill in OAuth/secret values for anything you exercise locally
```

### 2. Backend

```bash
# Windows PowerShell
venv\Scripts\activate
# bash / WSL
source venv/bin/activate

pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8080
```

`GET http://localhost:8080/health` → `{"status": "ok"}`.

### 3. Frontend

```bash
cd frontend
npm ci            # respects the root .npmrc (min-release-age=1)
npm run dev       # Vite dev server on http://localhost:5173
```

In dev, Vite serves the frontend; FastAPI serves the SPA only in the built image
(see Docker below).

## Tests & quality gates

Backend (venv active, from project root):

```bash
ruff check .            # lint
ruff format --check .   # format
pytest                  # unit tests + coverage
bandit -r backend -c pyproject.toml   # security lint
pip-audit               # dependency CVE scan
python scripts/check_health_latency.py   # backend latency budget (NFR §4.1)
```

Frontend (from `frontend/`):

```bash
npm run typecheck                    # strict TS, no any
npm test                             # vitest + Testing Library
npm run build                        # production bundle
node scripts/check-bundle-size.mjs   # initial-load budget (NFR §4.1)
npx playwright install --with-deps   # one-time browser install
npm run test:e2e                     # cross-browser matrix: chromium/firefox/webkit
```

The E2E suite builds the SPA, stages it into `frontend_dist/`, and serves it plus
`/health` from a single uvicorn origin — the same-origin production path. It needs the
backend venv deps installed and `python` on PATH.

All gates run in CI on push/PR (`.github/workflows/ci.yml`). OWASP ZAP is a per-release
gate (zero critical to deploy), not part of the per-commit run.

## Docker (same-origin production image)

```bash
docker build -t financial-tracker .
docker run --rm -p 8080:8080 financial-tracker
```

The multi-stage build compiles the SPA (node stage), then serves it and the API from
FastAPI on `$PORT` (default 8080) as a single origin — no CORS. Client routes
(`/login`, `/accounts`, `/join/:token`) resolve via the SPA fallback.

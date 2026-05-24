#!/bin/bash
# Financial Tracker — Start Servers (Bash)
# Usage: ./scripts/start_servers.sh
#
# What it does:
#   1. Ensures .venv exists and activates it
#   2. Kills any existing processes on ports 5173 (frontend) and 8000 (backend)
#   3. Starts the backend (FastAPI/Uvicorn) on port 8000
#   4. Starts the frontend (Vite dev server) on port 5173
#   5. Both servers run in the foreground so Ctrl+C stops both

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="$ROOT/.venv/bin/python"

echo ""
echo "=== Financial Tracker — Starting Servers ==="

# ── 1. Check virtual environment ──────────────────────────────────────────────
if [ ! -f "$VENV_PYTHON" ]; then
    echo ""
    echo "[ERROR] Virtual environment not found at $ROOT/.venv"
    echo "Run: python3 -m venv .venv"
    echo "Then: source .venv/bin/activate"
    echo "And: pip install -r requirements.txt (if you have one) or install deps manually"
    exit 1
fi
echo "[OK] Virtual environment found"

# ── 2. Kill existing processes on target ports ────────────────────────────────
stop_port_process() {
    local port=$1
    local service_name=$2
    local pid

    pid=$(lsof -ti :$port 2>/dev/null | head -n 1)

    if [ -n "$pid" ]; then
        echo "[KILL] Stopping $service_name on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        if lsof -ti :$port 2>/dev/null | head -n 1 | grep -q .; then
            echo "[WARN] Port $port still in use — may need manual cleanup"
        else
            echo "[OK] Port $port is free"
        fi
    else
        echo "[OK] Port $port is free"
    fi
}

stop_port_process 8000 "Backend"
stop_port_process 5173 "Frontend"

# ── 3. Start backend ─────────────────────────────────────────────────────────
echo ""
echo "[START] Backend (FastAPI + Uvicorn) on port 8000..."
mkdir -p "$ROOT/logs"
$VENV_PYTHON -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 \
    > "$ROOT/logs/backend-out.log" 2> "$ROOT/logs/backend-error.log" &
BACKEND_PID=$!
echo "[OK] Backend started (PID: $BACKEND_PID)"

# ── 4. Start frontend ────────────────────────────────────────────────────────
echo ""
echo "[START] Frontend (Vite dev server) on port 5173..."
cd "$ROOT/frontend"
npx vite &
FRONTEND_PID=$!
echo "[OK] Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=== Servers Running ==="
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers."

# Wait for Ctrl+C
trap '
    echo ""
    echo "[STOP] Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "[OK] Servers stopped"
    exit 0
' INT TERM

wait

#!/bin/bash
# Financial Tracker — Restart Servers (Bash)
# Usage: ./scripts/restart_servers.sh
#
# What it does:
#   1. Stops any running servers
#   2. Starts both backend and frontend fresh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="$ROOT/.venv/bin/python"

echo ""
echo "=== Financial Tracker — Restarting Servers ==="

# ── 1. Stop existing servers ──────────────────────────────────────────────────
echo ""
echo "[STEP 1] Stopping existing servers..."

stop_port_process() {
    local port=$1
    local service_name=$2
    local pid

    pid=$(lsof -ti :$port 2>/dev/null | head -n 1)

    if [ -n "$pid" ]; then
        echo "  [KILL] $service_name on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    else
        echo "  [SKIP] $service_name not running on port $port"
    fi
}

stop_port_process 8000 "Backend"
stop_port_process 5173 "Frontend"
sleep 1

# ── 2. Check virtual environment ──────────────────────────────────────────────
if [ ! -f "$VENV_PYTHON" ]; then
    echo ""
    echo "[ERROR] Virtual environment not found at $ROOT/.venv"
    echo "Run: python3 -m venv .venv"
    echo "Then: source .venv/bin/activate"
    exit 1
fi
echo ""
echo "[STEP 2] Virtual environment OK"

# ── 3. Start backend ─────────────────────────────────────────────────────────
echo ""
echo "[STEP 3] Starting backend (FastAPI + Uvicorn) on port 8000..."
mkdir -p "$ROOT/logs"
$VENV_PYTHON -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 \
    > "$ROOT/logs/backend-out.log" 2> "$ROOT/logs/backend-error.log" &
BACKEND_PID=$!
echo "[OK] Backend started (PID: $BACKEND_PID)"

# ── 4. Start frontend ────────────────────────────────────────────────────────
echo ""
echo "[STEP 4] Starting frontend (Vite dev server) on port 5173..."
cd "$ROOT/frontend"
npx vite &
FRONTEND_PID=$!
echo "[OK] Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=== Servers Restarted ==="
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

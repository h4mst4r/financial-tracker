#!/bin/bash
# Financial Tracker — Stop Servers (Bash)
# Usage: ./scripts/stop_servers.sh
#
# What it does:
#   1. Finds and kills any processes on ports 5173 (frontend) and 8000 (backend)
#   2. Reports what was stopped

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "=== Financial Tracker — Stopping Servers ==="

stop_port_process() {
    local port=$1
    local service_name=$2
    local pid

    pid=$(lsof -ti :$port 2>/dev/null | head -n 1)

    if [ -n "$pid" ]; then
        echo "[KILL] Stopping $service_name on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        echo "[OK] $service_name stopped"
    else
        echo "[SKIP] $service_name not running on port $port"
    fi
}

stop_port_process 8000 "Backend"
stop_port_process 5173 "Frontend"

echo ""
echo "=== Servers Stopped ==="

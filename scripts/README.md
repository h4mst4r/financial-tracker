# Server Management Scripts

Quick scripts to start, stop, and restart the Financial Tracker backend and frontend servers.

## Quick Reference

| Action | PowerShell | Bash (Git Bash / WSL) |
|--------|-----------|----------------------|
| Start both | `.\scripts\start_servers.ps1` | `./scripts/start_servers.sh` |
| Stop both | `.\scripts\stop_servers.ps1` | `./scripts/stop_servers.sh` |
| Restart both | `.\scripts\restart_servers.ps1` | `./scripts/restart_servers.sh` |

## What the scripts do

1. **Check virtual environment** — verifies `.venv/Scripts/python.exe` (PowerShell) or `.venv/bin/python` (Bash) exists
2. **Kill existing processes** — finds and kills any process on ports 8000 (backend) and 5173 (frontend)
3. **Start backend** — runs `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
4. **Start frontend** — runs `npx vite` in the `frontend/` directory
5. **Log output** — backend logs go to `logs/backend-out.log` and `logs/backend-error.log`

## Ports

| Service | Port | URL |
|---------|------|-----|
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| Frontend (Vite) | 5173 | http://localhost:5173 |

## Troubleshooting

### Port already in use
```powershell
# Find the process
netstat -ano | findstr :8000
# Kill it (replace PID)
taskkill /PID <pid> /F
```

### Virtual environment not found
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt  # if you have one
```

### Check logs
```powershell
Get-Content logs\backend-out.log -Tail 20
Get-Content logs\backend-error.log -Tail 20
```

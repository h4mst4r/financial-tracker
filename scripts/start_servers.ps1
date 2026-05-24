# Financial Tracker - Start Servers (PowerShell)
# Usage: .\scripts\start_servers.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot + "\.."
$VENV_PYTHON = "$ROOT\.venv\Scripts\python.exe"

Write-Host "`n=== Financial Tracker - Starting Servers ===" -ForegroundColor Cyan

# Check virtual environment
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "`n[ERROR] Virtual environment not found at $ROOT\.venv" -ForegroundColor Red
    Write-Host "Run: python -m venv .venv" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Virtual environment found" -ForegroundColor Green

# Kill existing processes on target ports
function Stop-PortProcess {
    param([string]$Port, [string]$ServiceName)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Host "[KILL] Stopping $ServiceName on port $Port (PID: $($conn.OwningProcess))" -ForegroundColor Yellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        $still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($still) {
            Write-Host "[WARN] Port $Port still in use" -ForegroundColor Red
        } else {
            Write-Host "[OK] Port $Port is free" -ForegroundColor Green
        }
    } else {
        Write-Host "[OK] Port $Port is free" -ForegroundColor Green
    }
}

Stop-PortProcess -Port 8000 -ServiceName "Backend"
Stop-PortProcess -Port 5173 -ServiceName "Frontend"

# Start backend
Write-Host "`n[START] Backend (FastAPI + Uvicorn) on port 8000..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null
$backendProcess = Start-Process -FilePath $VENV_PYTHON `
    -ArgumentList "-m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000" `
    -WorkingDirectory $ROOT `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardError "$ROOT\logs\backend-error.log" `
    -RedirectStandardOutput "$ROOT\logs\backend-out.log"
Write-Host "[OK] Backend started (PID: $($backendProcess.Id))" -ForegroundColor Green

# Start frontend
Write-Host "`n[START] Frontend (Vite dev server) on port 5173..." -ForegroundColor Cyan
$frontendProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory "$ROOT\frontend" `
    -PassThru `
    -NoNewWindow
Write-Host "[OK] Frontend started (PID: $($frontendProcess.Id))" -ForegroundColor Green

Write-Host "`n=== Servers Running ===" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "`nPress Ctrl+C to stop all servers." -ForegroundColor Yellow

# Wait for Ctrl+C
Write-Host "`n[INFO] Servers running - press Ctrl+C to stop..." -ForegroundColor Gray
try {
    while ($true) { Start-Sleep -Seconds 1 }
} catch {
    Write-Host "`n[INFO] Stopping servers..." -ForegroundColor Yellow
}

# Cleanup on exit
Write-Host "`n[STOP] Shutting down servers..." -ForegroundColor Yellow
if ($backendProcess -and -not $backendProcess.HasExited) {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Backend stopped" -ForegroundColor Green
}
if ($frontendProcess -and -not $frontendProcess.HasExited) {
    Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Frontend stopped" -ForegroundColor Green
}
Write-Host "`n=== Servers Stopped ===" -ForegroundColor Cyan

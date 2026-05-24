# Financial Tracker - Restart Servers (PowerShell)
# Usage: .\scripts\restart_servers.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot + "\.."

Write-Host "`n=== Financial Tracker - Restarting Servers ===" -ForegroundColor Cyan

function Stop-PortProcess {
    param([string]$Port, [string]$ServiceName)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Host "  [KILL] $ServiceName on port $Port (PID: $($conn.OwningProcess))" -ForegroundColor Yellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    Write-Host "  [OK] Port $Port is free" -ForegroundColor Green
}

# Step 1: Stop existing servers
Write-Host "`n[STEP 1] Stopping existing servers..." -ForegroundColor Yellow
Stop-PortProcess -Port "8000" -ServiceName "Backend"
Stop-PortProcess -Port "5173" -ServiceName "Frontend"

# Step 2: Start servers
Write-Host "`n[STEP 2] Starting servers..." -ForegroundColor Yellow

$VENV_PYTHON = "$ROOT\.venv\Scripts\python.exe"
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "`n[ERROR] Virtual environment not found at $ROOT\.venv" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null

Write-Host "`n[START] Backend (FastAPI + Uvicorn) on port 8000..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath $VENV_PYTHON `
    -ArgumentList "-m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000" `
    -WorkingDirectory $ROOT `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardError "$ROOT\logs\backend-error.log" `
    -RedirectStandardOutput "$ROOT\logs\backend-out.log"
Write-Host "[OK] Backend started (PID: $($backendProcess.Id))" -ForegroundColor Green

Write-Host "`n[START] Frontend (Vite dev server) on port 5173..." -ForegroundColor Cyan
$frontendProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory "$ROOT\frontend" `
    -PassThru `
    -NoNewWindow
Write-Host "[OK] Frontend started (PID: $($frontendProcess.Id))" -ForegroundColor Green

Write-Host "`n=== Servers Restarted ===" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White

# Financial Tracker - Stop Servers (PowerShell)
# Usage: .\scripts\stop_servers.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot + "\.."

Write-Host "`n=== Financial Tracker - Stopping Servers ===" -ForegroundColor Cyan

function Stop-PortProcess {
    param([string]$Port, [string]$ServiceName)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Host "[KILL] Stopping $ServiceName on port $Port (PID: $($conn.OwningProcess))" -ForegroundColor Yellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "[OK] $ServiceName stopped" -ForegroundColor Green
    } else {
        Write-Host "[SKIP] $ServiceName not running on port $Port" -ForegroundColor Gray
    }
}

Stop-PortProcess -Port "8000" -ServiceName "Backend"
Stop-PortProcess -Port "5173" -ServiceName "Frontend"

Write-Host "`n=== Servers Stopped ===" -ForegroundColor Cyan

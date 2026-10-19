# NourishNear - PowerShell One-Click Public Launcher
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "    Starting NourishNear Server & Public Tunnel   " -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# Start server in background job if not already running on port 8000
$portActive = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if (-not $portActive) {
    Write-Host "Starting Python backend server on port 8000..." -ForegroundColor Green
    Start-Process python -ArgumentList "server.py" -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Host "Python server is already running on port 8000." -ForegroundColor Green
}

Write-Host "Local URL: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Public Tunnel via SSH (localhost.run)..." -ForegroundColor Yellow
Write-Host "Your public HTTPS link will appear below:" -ForegroundColor Green
Write-Host "---------------------------------------------------" -ForegroundColor Gray

ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:8000 nokey@localhost.run

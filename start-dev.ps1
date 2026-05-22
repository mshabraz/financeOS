# FinanceOS - Start both backend and frontend in development mode
# Run with: powershell -ExecutionPolicy Bypass -File start-dev.ps1

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " FinanceOS - Personal Finance Manager" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

# Start backend
Write-Host "[1/2] Starting backend API..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; node src/index.js" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start frontend
Write-Host "[2/2] Starting frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "  App:    http://localhost:5173" -ForegroundColor Yellow
Write-Host "  API:    http://localhost:3001/api/health" -ForegroundColor Yellow
Write-Host ""

Start-Process "http://localhost:5173"

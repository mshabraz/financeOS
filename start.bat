@echo off
echo ======================================
echo  FinanceOS - Personal Finance Manager
echo ======================================
echo.
echo  For phone/tablet on Wi-Fi, use START-LAN.bat instead of this file.
echo.

:: Check Node.js is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [1/2] Starting backend API on http://localhost:3001
start "FinanceOS Backend" cmd /k "cd /d %~dp0backend && node src/index.js"

:: Wait for backend to initialize (sql.js WASM takes ~2 seconds)
timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend on http://localhost:5173
start "FinanceOS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo  App will open at: http://localhost:5173
echo  API health check: http://localhost:3001/api/health
echo.
echo  Close the two command windows to stop the app.
echo.

:: Open browser after a short delay
timeout /t 4 /nobreak >nul
start http://localhost:5173

pause

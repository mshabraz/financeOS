@echo off
cd /d "%~dp0"
title FinanceOS
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-lan.ps1"
echo.
pause

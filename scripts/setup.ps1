# FinanceOS first-time setup (Windows PowerShell)
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "FinanceOS setup" -ForegroundColor Cyan
node scripts/setup.mjs

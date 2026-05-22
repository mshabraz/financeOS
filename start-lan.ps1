# FinanceOS LAN launcher (called by START-LAN.bat)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location $Root

Write-Host ''
Write-Host '  FinanceOS' -ForegroundColor Cyan
Write-Host '  Keep this window open. Same Wi-Fi required for phones.' -ForegroundColor Gray
Write-Host ''

$NodeExe = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $NodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $NodeExe = $cmd.Source }
}
if (-not $NodeExe) {
    Write-Host '  Install Node.js from https://nodejs.org then run START-LAN.bat again.' -ForegroundColor Red
    Read-Host 'Press Enter'
    exit 1
}

# Stop duplicate servers on 3001 / 5173
& (Join-Path $Root 'scripts\stop-servers.ps1') | Out-Null

# Firewall (UAC once if needed)
$fwScript = Join-Path $Root 'scripts\ensure-firewall.ps1'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '  Allow Administrator access if prompted (opens port 3001 for your phone).' -ForegroundColor Yellow
    $elevArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $fwScript + '" -NodeExe "' + $NodeExe + '"'
    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $elevArgs | Out-Null
} else {
    & $fwScript -NodeExe $NodeExe | Out-Null
}

Write-Host '  Building (first run may take a few minutes)...' -ForegroundColor Green
Set-Location (Join-Path $Root 'frontend')
if (-not (Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'frontend npm install failed' } }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }

Set-Location (Join-Path $Root 'backend')
if (-not (Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'backend npm install failed' } }

$ip = (Get-NetIPAddress -AddressFamily IPv4 -EA 0 |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.)' -and $_.InterfaceAlias -notmatch 'virtual|vmware|hyper|vethernet|wsl|docker' } |
    Sort-Object @{ Expression = { if ($_.InterfaceAlias -match 'wi-?fi|wlan') { 0 } elseif ($_.InterfaceAlias -match 'ethernet') { 1 } else { 2 } } } |
    Select-Object -First 1 -ExpandProperty IPAddress)

@"
FinanceOS - phone/tablet (same Wi-Fi)

  $(if ($ip) { "http://${ip}:3001" } else { 'see console below' })

This PC: http://localhost:3001
"@ | Out-File (Join-Path $Root 'OPEN-ON-YOUR-PHONE.txt') -Encoding utf8

Write-Host ''
if ($ip) { Write-Host "  Phone:  http://${ip}:3001" -ForegroundColor Green }
Write-Host '  PC:     http://localhost:3001' -ForegroundColor Green
Write-Host ''

Start-Sleep -Seconds 4
Start-Process 'http://localhost:3001'

Set-Location (Join-Path $Root 'backend')
& $NodeExe src/index.js --lan

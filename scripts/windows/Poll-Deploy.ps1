# Called by scheduled task — deploy only when origin/main advanced
$ErrorActionPreference = 'Stop'
$RepoPath = if ($PSScriptRoot -match 'scripts\\windows') {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
} else { 'C:\FinanceOS\app' }

Set-Location $RepoPath
git fetch origin main 2>&1 | Out-Null
$local = (git rev-parse HEAD 2>$null).Trim()
$remote = (git rev-parse origin/main 2>$null).Trim()
if (-not $remote -or $local -eq $remote) { exit 0 }

$deploy = Join-Path $RepoPath 'scripts\windows\Deploy-FinanceOS.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deploy

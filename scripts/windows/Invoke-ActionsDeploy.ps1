# Called from GitHub Actions on the self-hosted runner — triggers deploy task and waits for log.
param(
    [string]$TaskName = 'FinanceOS-ActionsDeploy',
    [string]$DeployLog = 'C:\FinanceOS\logs\deploy.log',
    [int]$TimeoutSec = 900
)

$ErrorActionPreference = 'Stop'

function Get-DeployLogTail {
    if (Test-Path $DeployLog) { Get-Content $DeployLog -Tail 25 }
    else { @("(deploy log not found: $DeployLog)") }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "::error::Scheduled task '$TaskName' not found. On the App Server (Admin):"
    Write-Host "  cd C:\FinanceOS\app"
    Write-Host "  git pull origin main"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows\Register-ActionsDeployTask.ps1"
    exit 1
}

$marker = "=== deploy start ==="
$before = if (Test-Path $DeployLog) { (Get-Content $DeployLog -Raw) } else { '' }

Write-Host "Triggering scheduled task: $TaskName (runs as your Windows user with git + NSSM rights)"
schtasks /Run /TN $TaskName | Out-Null
if ($LASTEXITCODE -ne 0) { throw "schtasks /Run failed (exit $LASTEXITCODE)" }

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$seenStart = $false
$done = $false

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if (-not (Test-Path $DeployLog)) { continue }
    $text = Get-Content $DeployLog -Raw
    if ($text -ne $before -and $text -match [regex]::Escape($marker)) { $seenStart = $true }
    if ($seenStart -and $text -match '=== deploy end ===') {
        $done = $true
        break
    }
}

Write-Host '--- deploy.log (tail) ---'
Get-DeployLogTail | ForEach-Object { Write-Host $_ }

if (-not $done) {
    Write-Host "::error::Deploy did not finish within ${TimeoutSec}s (check deploy.log on server)"
    exit 1
}

if ($text -match 'deploy OK') {
    Write-Host 'Deploy succeeded.'
    exit 0
}

Write-Host '::error::Deploy finished but did not report deploy OK'
exit 1

# Register daily FinanceOS database backup (3:00 AM)
# Usage (elevated): powershell -ExecutionPolicy Bypass -File scripts\windows\Register-BackupTask.ps1

param(
    [string]$RepoPath = 'C:\FinanceOS\app'
)

$ErrorActionPreference = 'Stop'
$taskName = 'FinanceOS-DailyBackup'
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = "$env:ProgramFiles\nodejs\node.exe" }

$backupScript = Join-Path $RepoPath 'scripts\backup-db.mjs'
if (-not (Test-Path $backupScript)) { throw "Not found: $backupScript" }

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$backupScript`" -- --label=daily" -WorkingDirectory $RepoPath
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'FinanceOS SQLite backup' | Out-Null

Write-Host "[backup] Scheduled task '$taskName' registered (daily 03:00)" -ForegroundColor Green

# Optional: poll GitHub every 5 minutes and deploy if main changed (fallback if self-hosted runner is down)
# Usage (elevated): powershell -ExecutionPolicy Bypass -File scripts\windows\Register-PollDeployTask.ps1

param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [int]$Minutes = 5
)

$ErrorActionPreference = 'Stop'
$taskName = 'FinanceOS-PollDeploy'

$pollScript = Join-Path $RepoPath 'scripts\windows\Poll-Deploy.ps1'
if (-not (Test-Path $pollScript)) { throw "Not found: $pollScript" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$pollScript`"" -WorkingDirectory $RepoPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'FinanceOS git poll deploy' | Out-Null

Write-Host "[poll] Task '$taskName' every $Minutes min (fallback deploy)" -ForegroundColor Green

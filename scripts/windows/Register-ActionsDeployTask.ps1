# Run once on the App Server (Admin PowerShell) so GitHub Actions can deploy as your user.
# The self-hosted runner service account usually cannot git-pull or restart NSSM.
#
#   cd C:\FinanceOS\app
#   git pull origin main
#   powershell -ExecutionPolicy Bypass -File scripts\windows\Register-ActionsDeployTask.ps1

param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$TaskName = 'FinanceOS-ActionsDeploy'
)

$ErrorActionPreference = 'Stop'
$deployScript = Join-Path $RepoPath 'scripts\windows\Deploy-FinanceOS.ps1'
if (-not (Test-Path $deployScript)) { throw "Not found: $deployScript" }

$user = "$env:USERDOMAIN\$env:USERNAME"
$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$deployScript`" -RepoPath `"$RepoPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $RepoPath
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Settings $settings -Principal $principal -Description 'FinanceOS deploy triggered by GitHub Actions' | Out-Null

Write-Host "[ok] Task '$TaskName' runs as $user" -ForegroundColor Green
Write-Host "Test: schtasks /Run /TN $TaskName" -ForegroundColor Cyan

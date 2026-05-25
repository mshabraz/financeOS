# Registers SYSTEM scheduled tasks for unattended GitHub Actions deploy (no manual deploy needed).
# Run once elevated — called automatically from Install-FinanceOSServer.ps1
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\Register-GithubDeployTasks.ps1
#
# From GitHub Actions (non-admin runner): registration is best-effort; script exits 0.

param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [switch]$Strict
)

$ErrorActionPreference = 'Continue'

$deployScript = Join-Path $RepoPath 'scripts\windows\Deploy-FinanceOS.ps1'
$restartScript = Join-Path $RepoPath 'scripts\windows\Restart-FinanceOSService.ps1'
if (-not (Test-Path $deployScript)) {
    if ($Strict) { throw "Not found: $deployScript" }
    Write-Host "[skip] Not found: $deployScript" -ForegroundColor Yellow
    exit 0
}

# Ensure restart helper exists (created by repo)
if (-not (Test-Path $restartScript)) {
    @'
param([string]$ServiceName = 'FinanceOS')
$ErrorActionPreference = 'Continue'
$nssm = @('C:\Tools\nssm\nssm.exe', "$env:ProgramFiles\nssm\nssm.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($nssm) {
    & $nssm restart $ServiceName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & $nssm stop $ServiceName 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        & $nssm start $ServiceName 2>&1 | Out-Null
    }
}
'@ | Set-Content -Path $restartScript -Encoding utf8
}

function Register-Task([string]$Name, [string]$Argument, [string]$Description) {
    try {
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Argument -WorkingDirectory $RepoPath
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName $Name -Action $action -Settings $settings -Principal $principal -Description $Description -ErrorAction Stop | Out-Null
        Write-Host "[ok] Task: $Name (SYSTEM)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[skip] Task $Name : $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

$deployArg = "-NoProfile -ExecutionPolicy Bypass -File `"$deployScript`" -RepoPath `"$RepoPath`" -SkipPull"
$restartArg = "-NoProfile -ExecutionPolicy Bypass -File `"$restartScript`""

$okDeploy = Register-Task 'FinanceOS-GitHubDeploy' $deployArg 'FinanceOS deploy for GitHub Actions (build, migrate, restart)'
$okRestart = Register-Task 'FinanceOS-Restart' $restartArg 'FinanceOS NSSM restart (SYSTEM)'

$grantScript = Join-Path $RepoPath 'scripts\windows\Grant-FinanceOSRunnerAccess.ps1'
if (Test-Path $grantScript) {
    & $grantScript -FinanceOsRoot $FinanceOsRoot 2>&1 | ForEach-Object { Write-Host $_ }
}

if ($okDeploy -and $okRestart) {
    Write-Host '[ok] GitHub deploy tasks ready. Actions workflow can trigger FinanceOS-GitHubDeploy.' -ForegroundColor Green
    exit 0
}

Write-Host '[info] SYSTEM tasks not registered (need Admin once). Actions will use inline deploy.' -ForegroundColor Yellow
if ($Strict) { exit 1 }
exit 0

# Restart FinanceOS Windows service (runs as SYSTEM via FinanceOS-Restart scheduled task).
param([string]$ServiceName = 'FinanceOS')

$ErrorActionPreference = 'Continue'

function Get-Nssm() {
    $candidates = @(
        'C:\Tools\nssm\nssm.exe',
        "$env:ProgramFiles\nssm\nssm.exe",
        "${env:ProgramFiles(x86)}\nssm\nssm.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return $null
}

$nssm = Get-Nssm
if ($nssm) {
    & $nssm restart $ServiceName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & $nssm stop $ServiceName 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        & $nssm start $ServiceName 2>&1 | Out-Null
    }
    exit 0
}

try {
    Restart-Service -Name $ServiceName -Force -ErrorAction Stop
} catch {
    Write-Error "Could not restart $ServiceName : $_"
    exit 1
}

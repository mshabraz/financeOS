# Internal: opens Windows Firewall for FinanceOS (run elevated via START-LAN.bat)
param(
    [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe",
    [int]$Port = 3001
)

$ErrorActionPreference = 'Continue'

function Remove-Rule([string]$Name) {
    netsh advfirewall firewall delete rule name="$Name" 2>$null | Out-Null
}

function Add-TcpRule([string]$Name, [int]$LocalPort) {
    Remove-Rule $Name
    $null = & netsh advfirewall firewall add rule name="$Name" dir=in action=allow protocol=TCP localport=$LocalPort profile=any enable=yes 2>&1
    return $LASTEXITCODE -eq 0
}

function Add-ProgramRule([string]$Name, [string]$ProgramPath) {
    if (-not (Test-Path $ProgramPath)) { return $false }
    Remove-Rule $Name
    $prog = $ProgramPath.Replace('/', '\')
    $null = & netsh advfirewall firewall add rule name="$Name" dir=in action=allow program="$prog" profile=any enable=yes 2>&1
    return $LASTEXITCODE -eq 0
}

$ok = (Add-TcpRule 'FinanceOS TCP 3001' $Port) -and (Add-TcpRule 'FinanceOS TCP 5173' 5173)
if (Test-Path $NodeExe) {
    $ok = (Add-ProgramRule 'FinanceOS Node.js' $NodeExe) -and $ok
}

if ($ok) { Write-Host '        Firewall rules OK.' -ForegroundColor Gray }
else { Write-Host '        Firewall: click Yes on Administrator prompt, or set Wi-Fi to Private.' -ForegroundColor Yellow }

exit $(if ($ok) { 0 } else { 1 })

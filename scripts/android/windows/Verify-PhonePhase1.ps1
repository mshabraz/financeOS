# Read-only checks: PC production still OK + phone trial reachable on LAN.
param(
    [string]$PcUrl = 'http://192.168.1.25:3001',
    [string]$PhoneUrl = 'http://192.168.1.26:3001'
)

$fail = 0

function Test-Endpoint {
    param([string]$Name, [string]$Url)
    try {
        $r = Invoke-RestMethod -Uri $Url -TimeoutSec 8
        Write-Host "  PASS  $Name" -ForegroundColor Green
        if ($Url -match '/health') { Write-Host "        $($r | ConvertTo-Json -Compress)" -ForegroundColor DarkGray }
        return $true
    } catch {
        Write-Host "  FAIL  $Name — $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "`nPhase 1 verification (read-only)`n" -ForegroundColor Cyan

if (-not (Test-Endpoint 'PC production /health' "$PcUrl/api/health")) { $fail++ }
if (-not (Test-Endpoint 'PC production /network/info' "$PcUrl/api/network/info")) { $fail++ }
if (-not (Test-Endpoint 'Phone trial /health' "$PhoneUrl/api/health")) {
    Write-Host "        (Expected FAIL until FinanceOS is started on phone)" -ForegroundColor DarkYellow
    $fail++
}

Write-Host ""
if ($fail -eq 0) { Write-Host "All endpoints OK." -ForegroundColor Green; exit 0 }
Write-Host "$fail check(s) failed (phone may not be running yet)." -ForegroundColor Yellow
exit 1

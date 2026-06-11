# FinanceOS — start Cloudflare quick tunnel, update .env, restart service.
# Automates tunnel recovery steps 1–5 from docs/TUNNEL-RECOVERY.md
#
# Usage (on App Server, elevated not required unless NSSM needs it):
#   powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Start-FinanceOSTunnel.ps1
#
# You still must update Enable Banking redirect URL in the browser (step 6).

param(
    [string]$FinanceOsRoot = 'C:\FinanceOS',
    [string]$ServiceName = 'FinanceOS',
    [int]$LocalPort = 3001,
    [int]$TunnelWaitSeconds = 90,
    [bool]$KillExistingCloudflared = $true,
    [bool]$SkipServiceRestart = $false
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Msg) {
    Write-Host "[tunnel] $Msg" -ForegroundColor Cyan
}

function Write-Ok([string]$Msg) {
    Write-Host "[tunnel] $Msg" -ForegroundColor Green
}

function Write-WarnLine([string]$Msg) {
    Write-Warning "[tunnel] $Msg"
}

function Get-NssmPath {
    $candidates = @(
        'C:\Tools\nssm\nssm.exe',
        "$env:ProgramFiles\nssm\nssm.exe",
        "${env:ProgramFiles(x86)}\nssm\nssm.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Get-CloudflaredPath {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Ensure-FinanceOsService([string]$Name) {
    $nssm = Get-NssmPath
    if ($nssm) {
        $status = & $nssm status $Name 2>&1 | Out-String
        if ($status -notmatch 'SERVICE_RUNNING') {
            Write-Step "Starting $Name via NSSM..."
            & $nssm start $Name 2>&1 | Out-Null
            Start-Sleep -Seconds 3
        }
        $status = & $nssm status $Name 2>&1 | Out-String
        if ($status -notmatch 'SERVICE_RUNNING') {
            throw "Service $Name is not running. Check NSSM / logs."
        }
        Write-Ok "Service $Name is running."
        return
    }

    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) {
        throw "Service $Name not found and NSSM not available."
    }
    if ($svc.Status -ne 'Running') {
        Write-Step "Starting $Name..."
        Start-Service -Name $Name
        Start-Sleep -Seconds 3
    }
    Write-Ok "Service $Name is running."
}

function Test-LocalHealth([int]$Port) {
    $uri = "http://127.0.0.1:$Port/api/health"
    Write-Step "Checking $uri ..."
    $health = Invoke-RestMethod -Uri $uri -TimeoutSec 15
    if ($health.status -ne 'ok') {
        throw "Local health check failed: $($health | ConvertTo-Json -Compress)"
    }
    Write-Ok "Local health OK (corsTunnelVersion=$($health.corsTunnelVersion))."
}

function Stop-ExistingCloudflaredTunnels {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
    if (-not $procs) { return }
    foreach ($p in $procs) {
        if ($p.CommandLine -match 'tunnel') {
            Write-Step "Stopping existing cloudflared (PID $($p.ProcessId))..."
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

function Start-CloudflaredTunnel([string]$Cloudflared, [int]$Port, [string]$LogsDir, [int]$WaitSeconds) {
    $outLog = Join-Path $LogsDir 'cloudflared-tunnel.out.log'
    $errLog = Join-Path $LogsDir 'cloudflared-tunnel.err.log'
    foreach ($f in @($outLog, $errLog)) {
        if (Test-Path $f) { Remove-Item $f -Force }
    }

    Write-Step "Starting cloudflared quick tunnel -> http://127.0.0.1:$Port ..."
    $proc = Start-Process -FilePath $Cloudflared `
        -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port") `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $tunnelUrl = $null
    $urlPattern = 'https://[a-z0-9-]+\.trycloudflare\.com'

    while ((Get-Date) -lt $deadline) {
        if ($proc.HasExited) {
            $tail = @()
            if (Test-Path $errLog) { $tail += Get-Content $errLog -Tail 20 }
            if (Test-Path $outLog) { $tail += Get-Content $outLog -Tail 20 }
            throw "cloudflared exited early. Log tail:`n$($tail -join "`n")"
        }

        $combined = ''
        if (Test-Path $outLog) { $combined += (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
        if (Test-Path $errLog) { $combined += (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }
        if ($combined -match "($urlPattern)") {
            $tunnelUrl = $Matches[1].TrimEnd('/')
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $tunnelUrl) {
        throw "Timed out waiting for tunnel URL (${WaitSeconds}s). See $outLog and $errLog"
    }

    Write-Ok "Tunnel URL: $tunnelUrl (PID $($proc.Id))"
    return @{
        Url = $tunnelUrl
        ProcessId = $proc.Id
        OutLog = $outLog
        ErrLog = $errLog
    }
}

function Test-TunnelHealth([string]$BaseUrl) {
    $uri = "$BaseUrl/api/health"
    Write-Step "Checking public health $uri ..."
    # Quick tunnels can take a moment to become reachable.
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri $uri -TimeoutSec 20
            if ($health.status -eq 'ok') {
                Write-Ok "Public health OK via tunnel."
                return $health
            }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    throw "Public health check failed for $uri"
}

function Update-EnvRedirectUrl([string]$EnvPath, [string]$TunnelUrl) {
    if (-not (Test-Path $EnvPath)) {
        throw ".env not found: $EnvPath"
    }

    $callback = "$TunnelUrl/api/open-banking/callback"
    $lines = Get-Content $EnvPath -Encoding UTF8
    $found = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match '^\s*OPEN_BANKING_REDIRECT_URL\s*=') {
            $found = $true
            "OPEN_BANKING_REDIRECT_URL=$callback"
        } else {
            $line
        }
    }
    if (-not $found) {
        $newLines = @($newLines) + @(
            '',
            '# Open banking — updated by Start-FinanceOSTunnel.ps1',
            "OPEN_BANKING_REDIRECT_URL=$callback"
        )
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($EnvPath, $newLines, $utf8NoBom)
    Write-Ok "Updated OPEN_BANKING_REDIRECT_URL in $EnvPath"
    return $callback
}

function Restart-FinanceOsService([string]$Name) {
    $nssm = Get-NssmPath
    if ($nssm) {
        Write-Step "Restarting $Name..."
        & $nssm restart $Name 2>&1 | Out-Null
        Start-Sleep -Seconds 4
        Write-Ok "Service restarted."
        return
    }
    Write-Step "Restarting Windows service $Name..."
    Restart-Service -Name $Name -Force
    Start-Sleep -Seconds 4
    Write-Ok "Service restarted."
}

# --- Main ---

$AppDir = Join-Path $FinanceOsRoot 'app'
$DataDir = Join-Path $FinanceOsRoot 'data'
$LogsDir = Join-Path $FinanceOsRoot 'logs'
$EnvPath = Join-Path $AppDir '.env'

foreach ($d in @($DataDir, $LogsDir)) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }
}

Write-Host ''
Write-Host 'FinanceOS — Cloudflare quick tunnel setup (steps 1–5)' -ForegroundColor White
Write-Host ''

# Step 1 — FinanceOS service + local health
Ensure-FinanceOsService -Name $ServiceName
Test-LocalHealth -Port $LocalPort

# Step 2 — cloudflared
$cloudflared = Get-CloudflaredPath
if (-not $cloudflared) {
    throw "cloudflared not found. Install: winget install Cloudflare.cloudflared"
}

if ($KillExistingCloudflared) {
    Stop-ExistingCloudflaredTunnels
}

$tunnel = Start-CloudflaredTunnel -Cloudflared $cloudflared -Port $LocalPort -LogsDir $LogsDir -WaitSeconds $TunnelWaitSeconds
$tunnelUrl = $tunnel.Url

# Step 3 — public health via tunnel
Test-TunnelHealth -BaseUrl $tunnelUrl

# Save URL for reference
$urlFile = Join-Path $DataDir 'current-tunnel-url.txt'
Set-Content -Path $urlFile -Value $tunnelUrl -Encoding UTF8
Write-Ok "Saved URL to $urlFile"

# Step 4 — .env
$callback = Update-EnvRedirectUrl -EnvPath $EnvPath -TunnelUrl $tunnelUrl

# Step 5 — restart FinanceOS
if (-not $SkipServiceRestart) {
    Restart-FinanceOsService -Name $ServiceName
    Test-LocalHealth -Port $LocalPort
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Yellow
Write-Host ' DONE — steps 1–5 complete' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Yellow
Write-Host " Public site:  $tunnelUrl"
Write-Host " OAuth callback: $callback"
Write-Host " cloudflared PID: $($tunnel.ProcessId) (keep running — do not close)"
Write-Host ''
Write-Host ' MANUAL STEP 6 — Enable Banking Control Panel:' -ForegroundColor Yellow
Write-Host '   API applications -> FinanceOS Personal -> Redirect URLs'
Write-Host "   Set to: $callback"
Write-Host ''
Write-Host ' Logs:' -ForegroundColor DarkGray
Write-Host "   $($tunnel.OutLog)"
Write-Host "   $($tunnel.ErrLog)"
Write-Host ''

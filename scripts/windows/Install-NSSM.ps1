# Download and install NSSM to C:\Tools\nssm (run once, Administrator optional)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows\Install-NSSM.ps1

param(
    [string]$InstallDir = 'C:\Tools\nssm'
)

$ErrorActionPreference = 'Stop'
$nssmExe = Join-Path $InstallDir 'nssm.exe'

if (Test-Path $nssmExe) {
    Write-Host "[nssm] Already installed: $nssmExe" -ForegroundColor Green
    & $nssmExe version
    exit 0
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$zip = Join-Path $env:TEMP 'nssm-2.24.zip'
$url = 'https://nssm.cc/release/nssm-2.24.zip'

Write-Host "[nssm] Downloading from $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

$extract = Join-Path $env:TEMP 'nssm-extract'
if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
Expand-Archive -Path $zip -DestinationPath $extract -Force

$found = Get-ChildItem -Path $extract -Recurse -Filter 'nssm.exe' |
    Where-Object { $_.FullName -match 'win64' } |
    Select-Object -First 1
if (-not $found) {
    $found = Get-ChildItem -Path $extract -Recurse -Filter 'nssm.exe' | Select-Object -First 1
}
if (-not $found) { throw 'nssm.exe not found in zip' }

Copy-Item $found.FullName $nssmExe -Force
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[nssm] Installed: $nssmExe" -ForegroundColor Green
& $nssmExe version

# Add to user PATH (optional)
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$InstallDir", 'User')
    Write-Host "[nssm] Added to user PATH. Open a new PowerShell window to use: nssm"
}

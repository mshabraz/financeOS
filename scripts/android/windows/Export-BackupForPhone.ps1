# Create a PC backup for one-time import onto the phone (does NOT touch phone).
param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$Label = 'before-android-trial',
    [switch]$PushViaAdb,
    [string]$PhoneImportPath = '/sdcard/Download/financeos-backup'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $RepoPath)) {
    Write-Host '[backup] C:\FinanceOS\app not found - using dev clone' -ForegroundColor Yellow
    $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}

$backupScript = Join-Path $RepoPath 'scripts\backup-db.mjs'
if (-not (Test-Path $backupScript)) {
    throw "Not found: $backupScript"
}

Write-Host '[backup] Creating snapshot...' -ForegroundColor Cyan
Push-Location $RepoPath
node $backupScript -- --label $Label
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

$candidates = @(
    (Join-Path $RepoPath 'backend\data\backups'),
    'C:\FinanceOS\data\backups'
)
$backupsRoot = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $backupsRoot) {
    throw 'Could not find backups folder (backend\data\backups or C:\FinanceOS\data\backups)'
}

$latest = Get-ChildItem $backupsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1

if (-not $latest) {
    throw "No backup folder created under $backupsRoot"
}

$exportZip = Join-Path $env:USERPROFILE "Desktop\$($latest.Name).zip"
if (Test-Path $exportZip) { Remove-Item $exportZip -Force }
Compress-Archive -Path $latest.FullName -DestinationPath $exportZip
Write-Host "[backup] Desktop copy: $exportZip" -ForegroundColor Green
Write-Host "[backup] Folder:       $($latest.FullName)"

if ($PushViaAdb) {
    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $adb) { throw 'adb not in PATH - install Android platform-tools' }
    & adb devices
    $remoteFolder = "$PhoneImportPath/$($latest.Name)"
    Write-Host "[adb] push $($latest.FullName) -> $remoteFolder"
    & adb shell "mkdir -p $PhoneImportPath"
    & adb push "$($latest.FullName)/." $remoteFolder
    Write-Host '[adb] On phone (Termux):' -ForegroundColor Cyan
    Write-Host "  mkdir -p ~/financeos/backup-import/$($latest.Name)"
    Write-Host "  cp -a ~/storage/downloads/financeos-backup/$($latest.Name)/. ~/financeos/backup-import/$($latest.Name)/"
    Write-Host '  bash ~/financeos/app/scripts/android/03-restore-backup.sh --latest'
}

Write-Host ''
Write-Host 'PC production is unchanged. Next on phone:' -ForegroundColor DarkGray
Write-Host '  1) Copy backup folder to ~/financeos/backup-import/<folder>/'
Write-Host '  2) bash ~/financeos/app/scripts/android/03-restore-backup.sh --latest'

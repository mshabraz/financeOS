# Create a PC backup for one-time import onto the phone (does NOT touch phone).
# Does NOT stop or restart PC FinanceOS unless you use -StopService (not recommended).
param(
    [string]$RepoPath = 'C:\FinanceOS\app',
    [string]$Label = 'before-android-trial',
    [switch]$PushViaAdb,
    [string]$PhoneImportPath = '/sdcard/Download/financeos-backup'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $RepoPath)) {
    Write-Host "[backup] C:\FinanceOS\app not found — using current dev clone" -ForegroundColor Yellow
    $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}

$backupScript = Join-Path $RepoPath 'scripts\backup-db.mjs'
if (-not (Test-Path $backupScript)) {
    throw "Not found: $backupScript"
}

Write-Host "[backup] Creating snapshot (read-only on live DB via sql.js export)..." -ForegroundColor Cyan
Push-Location $RepoPath
node $backupScript -- --label $Label
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$config = node -e "console.log(require('./backend/src/config.js').DATA_DIR)"
$backupsRoot = Join-Path $config 'backups'
$latest = Get-ChildItem $backupsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
Pop-Location

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
    if (-not $adb) { throw "adb not in PATH — install Android platform-tools" }
    & adb devices
    $remoteFolder = "$PhoneImportPath/$($latest.Name)"
    Write-Host "[adb] push $($latest.FullName) -> $remoteFolder"
    & adb shell "mkdir -p $PhoneImportPath"
    & adb push "$($latest.FullName)/." $remoteFolder
    Write-Host @"

On the phone (Termux):
  mkdir -p ~/financeos/backup-import/$($latest.Name)
  cp -a ~/storage/downloads/financeos-backup/$($latest.Name)/. ~/financeos/backup-import/$($latest.Name)/
  bash ~/financeos/app/scripts/android/03-restore-backup.sh --latest
"@ -ForegroundColor Cyan
}

Write-Host @"

PC production is unchanged. Next on phone:
  1) Copy backup folder or unzip on phone -> ~/financeos/backup-import/<folder>/
  2) bash ~/financeos/app/scripts/android/03-restore-backup.sh --latest
"@ -ForegroundColor DarkGray

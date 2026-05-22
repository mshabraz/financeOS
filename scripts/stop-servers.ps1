$ports = @(3001, 5173)
$killed = @()
foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $procId = $_.OwningProcess
        if ($procId -and $killed -notcontains $procId) {
            $killed += $procId
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped PID $procId (port $port)"
        }
    }
}
if ($killed.Count -eq 0) {
    Write-Host "No servers were running on ports 3001 or 5173."
} else {
    Start-Sleep -Seconds 2
    Write-Host "Done. Stopped $($killed.Count) process(es)."
}

# Grant GitHub Actions runner accounts access to FinanceOS data/logs (elevated).
param([string]$FinanceOsRoot = 'C:\FinanceOS')

$ErrorActionPreference = 'Continue'
$accounts = @(
    'NT AUTHORITY\SYSTEM',
    'NT AUTHORITY\NETWORK SERVICE',
    'BUILTIN\Users'
)
foreach ($acct in $accounts) {
    icacls $FinanceOsRoot /grant "${acct}:(OI)(CI)M" /T 2>&1 | Out-Null
    Write-Host "[acl] $acct -> $FinanceOsRoot"
}

param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$Vus = 100,
  [string]$Ramp = "30s",
  [string]$Hold = "2m",
  [string]$Cooldown = "15s",
  [string]$CredsFile = "scripts/load/credentials.csv"
)

$env:BASE_URL = $BaseUrl
$env:VUS = "$Vus"
$env:RAMP = $Ramp
$env:HOLD = $Hold
$env:COOLDOWN = $Cooldown
$env:CREDS_FILE = $CredsFile

$k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
if ($k6Cmd) {
  & $k6Cmd.Source run scripts/load/k6-100-users.js
  exit $LASTEXITCODE
}

$k6Fallback = Join-Path $env:ProgramFiles "k6\k6.exe"
if (Test-Path $k6Fallback) {
  & $k6Fallback run scripts/load/k6-100-users.js
  exit $LASTEXITCODE
}

Write-Error "k6 nao encontrado no PATH nem em '$k6Fallback'. Reabra o terminal ou reinstale: winget install --id GrafanaLabs.k6 --exact"
exit 1

param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$Vus = 40,
  [string]$Ramp = "30s",
  [string]$Hold = "2m",
  [string]$Cooldown = "15s",
  [string]$UserPrefix = "usuario",
  [string]$TechPrefix = "tecnico",
  [string]$AdminPrefix = "admin",
  [int]$UserCount = 100,
  [int]$TechCount = 20,
  [int]$AdminCount = 5,
  [string]$Password = "senha123",
  [string]$Categoria = "incidente",
  [string]$Prioridade = "media",
  [string]$EnableReopen = "0",
  [string]$EnableAdminCheck = "1",
  [int]$ChatInteractions = 10,
  [int]$AttachmentSends = 5,
  [string]$EnableAttachmentTraffic = "1",
  [string]$EnableAvaliacao = "1",
  [string]$EnableClosedUrlCheck = "1",
  [string]$EnablePermissionNegative = "1",
  [int]$NegativeSampleEvery = 100,
  [string]$NegativeRandomRate = "0"
)

$env:BASE_URL = $BaseUrl
$env:VUS = "$Vus"
$env:RAMP = $Ramp
$env:HOLD = $Hold
$env:COOLDOWN = $Cooldown
$env:USER_PREFIX = $UserPrefix
$env:TECH_PREFIX = $TechPrefix
$env:ADMIN_PREFIX = $AdminPrefix
$env:USER_COUNT = "$UserCount"
$env:TECH_COUNT = "$TechCount"
$env:ADMIN_COUNT = "$AdminCount"
$env:DEFAULT_PASSWORD = $Password
$env:CATEGORIA = $Categoria
$env:PRIORIDADE = $Prioridade
$env:ENABLE_REOPEN = $EnableReopen
$env:ENABLE_ADMIN_CHECK = $EnableAdminCheck
$env:CHAT_INTERACTIONS = "$ChatInteractions"
$env:ATTACHMENT_SENDS = "$AttachmentSends"
$env:ENABLE_ATTACHMENT_TRAFFIC = $EnableAttachmentTraffic
$env:ENABLE_AVALIACAO = $EnableAvaliacao
$env:ENABLE_CLOSED_URL_CHECK = $EnableClosedUrlCheck
$env:ENABLE_PERMISSION_NEGATIVE = $EnablePermissionNegative
$env:NEGATIVE_SAMPLE_EVERY = "$NegativeSampleEvery"
$env:NEGATIVE_RANDOM_RATE = $NegativeRandomRate

$k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
if ($k6Cmd) {
  & $k6Cmd.Source run scripts/load/k6-workflow-full.js
  exit $LASTEXITCODE
}

$k6Fallback = Join-Path $env:ProgramFiles "k6\k6.exe"
if (Test-Path $k6Fallback) {
  & $k6Fallback run scripts/load/k6-workflow-full.js
  exit $LASTEXITCODE
}

Write-Error "k6 nao encontrado no PATH nem em '$k6Fallback'. Reabra o terminal ou reinstale: winget install --id GrafanaLabs.k6 --exact"
exit 1

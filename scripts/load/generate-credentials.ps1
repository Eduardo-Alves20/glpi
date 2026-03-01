param(
  [int]$Usuarios = 100,
  [int]$Tecnicos = 20,
  [int]$Admins = 5,
  [string]$PrefixUsuario = "usuario",
  [string]$PrefixTecnico = "tecnico",
  [string]$PrefixAdmin = "admin",
  [string]$Password = "senha123",
  [string]$Output = "scripts/load/credentials.csv"
)

function Pad3([int]$n) {
  return $n.ToString("D3")
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# username,password")

for ($i = 1; $i -le $Usuarios; $i++) {
  $lines.Add(("{0}{1},{2}" -f $PrefixUsuario, (Pad3 $i), $Password))
}

for ($i = 1; $i -le $Tecnicos; $i++) {
  $lines.Add(("{0}{1},{2}" -f $PrefixTecnico, (Pad3 $i), $Password))
}

for ($i = 1; $i -le $Admins; $i++) {
  $lines.Add(("{0}{1},{2}" -f $PrefixAdmin, (Pad3 $i), $Password))
}

$dir = Split-Path -Parent $Output
if ($dir -and -not (Test-Path $dir)) {
  New-Item -Path $dir -ItemType Directory -Force | Out-Null
}

Set-Content -Path $Output -Value $lines -Encoding UTF8
Write-Host ("[credentials] arquivo gerado: {0}" -f (Resolve-Path $Output))
Write-Host ("[credentials] linhas de login: {0}" -f ($lines.Count - 1))

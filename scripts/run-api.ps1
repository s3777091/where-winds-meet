$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$goExe = Join-Path $projectRoot ".tools\go\bin\go.exe"
$env:GOCACHE = Join-Path $projectRoot ".tools\go-build"
$env:GOMODCACHE = Join-Path $projectRoot ".tools\go-mod"

$localEnvPath = Join-Path $projectRoot ".env.local"
if (Test-Path -LiteralPath $localEnvPath) {
  foreach ($line in Get-Content -LiteralPath $localEnvPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2) { continue }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name -and -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not (Test-Path -LiteralPath $goExe)) {
  throw "Project-local Go toolchain was not found at $goExe. See README.md."
}

Set-Location $projectRoot
& $goExe run ./services/api/cmd/server

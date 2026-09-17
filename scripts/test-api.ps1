$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$goExe = Join-Path $projectRoot ".tools\go\bin\go.exe"
$env:GOCACHE = Join-Path $projectRoot ".tools\go-build"
$env:GOMODCACHE = Join-Path $projectRoot ".tools\go-mod"

if (-not (Test-Path -LiteralPath $goExe)) {
  throw "Project-local Go toolchain was not found at $goExe. See README.md."
}

Set-Location $projectRoot
& $goExe test ./services/api/...

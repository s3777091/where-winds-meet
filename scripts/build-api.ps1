$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$goExe = Join-Path $projectRoot ".tools\go\bin\go.exe"
$outputDir = Join-Path $projectRoot "services\api\bin"
$env:GOCACHE = Join-Path $projectRoot ".tools\go-build"
$env:GOMODCACHE = Join-Path $projectRoot ".tools\go-mod"

if (-not (Test-Path -LiteralPath $goExe)) {
  throw "Project-local Go toolchain was not found at $goExe. See README.md."
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Set-Location $projectRoot
& $goExe build -o (Join-Path $outputDir "wwm-api.exe") ./services/api/cmd/server

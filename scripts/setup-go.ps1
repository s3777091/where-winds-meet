$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot ".tools"
$archive = Join-Path $toolRoot "go1.27.1.windows-amd64.zip"
$expectedSha256 = "a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d"

New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
Invoke-WebRequest -Uri "https://go.dev/dl/go1.27.1.windows-amd64.zip" -OutFile $archive
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()

if ($actualSha256 -ne $expectedSha256) {
  throw "Go archive checksum mismatch. Expected $expectedSha256 but received $actualSha256."
}

Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
Remove-Item -LiteralPath $archive
Write-Output "Go 1.27.1 is ready at .tools\go\bin\go.exe"

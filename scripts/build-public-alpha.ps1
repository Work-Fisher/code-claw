param(
  [string]$OutputDir = ".\dist\compatible-agent-shell-alpha"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedOutputDir = Join-Path $root $OutputDir

if (Test-Path $resolvedOutputDir) {
  Remove-Item -LiteralPath $resolvedOutputDir -Recurse -Force
}

$null = New-Item -ItemType Directory -Path $resolvedOutputDir
$null = New-Item -ItemType Directory -Path (Join-Path $resolvedOutputDir "compatible-shell")
$null = New-Item -ItemType Directory -Path (Join-Path $resolvedOutputDir "tools")
$null = New-Item -ItemType Directory -Path (Join-Path $resolvedOutputDir "scripts")

Copy-Item -Recurse -Force (Join-Path $root "compatible-shell\*") (Join-Path $resolvedOutputDir "compatible-shell")
$null = New-Item -ItemType Directory -Path (Join-Path $resolvedOutputDir "tools\model-gateway")
Copy-Item -Recurse -Force (Join-Path $root "tools\model-gateway\*") (Join-Path $resolvedOutputDir "tools\model-gateway")
Copy-Item -Force (Join-Path $root "scripts\start-compat-shell.ps1") (Join-Path $resolvedOutputDir "scripts")
Copy-Item -Force (Join-Path $root "scripts\launch-public-alpha.ps1") (Join-Path $resolvedOutputDir "scripts")
Copy-Item -Force (Join-Path $root "PUBLIC_ALPHA_README.md") (Join-Path $resolvedOutputDir "README.md")

$packageJson = @'
{
  "name": "compatible-agent-shell-alpha",
  "private": true,
  "version": "0.1.0-alpha",
  "type": "module",
  "scripts": {
    "gateway": "node tools/model-gateway/server.mjs",
    "compat-shell": "node compatible-shell/src/cli.mjs"
  }
}
'@

Set-Content -LiteralPath (Join-Path $resolvedOutputDir "package.json") -Value $packageJson -Encoding UTF8

Write-Host "Built public alpha folder:"
Write-Host $resolvedOutputDir

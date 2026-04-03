$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$uiDir = Join-Path $root 'ai-code-studio'
$distDir = Join-Path $uiDir 'dist'
$bundleDir = Join-Path $root 'dist\ai-code-studio-complete'
$zipPath = Join-Path $root 'dist\ai-code-studio-complete.zip'
$electronDist = Join-Path $root 'node_modules\electron\dist'

Push-Location $uiDir
try {
  if (-not (Test-Path (Join-Path $uiDir 'node_modules'))) {
    npm install
  }
  npm run build
}
finally {
  Pop-Location
}

if (Test-Path $bundleDir) {
  Remove-Item -Recurse -Force $bundleDir
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'ai-code-studio') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'desktop') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'electron') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'tools\model-gateway') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'tools\claw-launcher-ui\data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir 'scripts') | Out-Null

Copy-Item -Recurse -Force $distDir (Join-Path $bundleDir 'ai-code-studio\dist')
Copy-Item -Recurse -Force (Join-Path $root 'claw-code') (Join-Path $bundleDir 'claw-code')
Copy-Item -Recurse -Force (Join-Path $root 'desktop\*') (Join-Path $bundleDir 'desktop')

Copy-Item -Force (Join-Path $root 'tools\model-gateway\server.mjs') (Join-Path $bundleDir 'tools\model-gateway\server.mjs')
Copy-Item -Force (Join-Path $root 'tools\claw-launcher-ui\server.mjs') (Join-Path $bundleDir 'tools\claw-launcher-ui\server.mjs')

if (Test-Path (Join-Path $root 'tools\claw-launcher-ui\data\settings.json')) {
  Copy-Item -Force (Join-Path $root 'tools\claw-launcher-ui\data\settings.json') (Join-Path $bundleDir 'tools\claw-launcher-ui\data\settings.json')
}

Copy-Item -Force (Join-Path $root 'scripts\start-ai-code-studio.ps1') (Join-Path $bundleDir 'scripts\start-ai-code-studio.ps1')
Copy-Item -Force (Join-Path $root 'launch-ai-code-studio.cmd') (Join-Path $bundleDir 'launch-ai-code-studio.cmd')

if (Test-Path $electronDist) {
  Copy-Item -Recurse -Force (Join-Path $electronDist '*') (Join-Path $bundleDir 'electron')
}

$desktopLauncher = @'
@echo off
setlocal
cd /d "%~dp0"
if exist ".\electron\electron.exe" (
  .\electron\electron.exe .\desktop\main.mjs
) else (
  echo Electron runtime was not bundled. Falling back to browser launcher.
  call .\launch-ai-code-studio.cmd
)
'@

Set-Content -Path (Join-Path $bundleDir 'launch-claw-code-desktop.cmd') -Value $desktopLauncher -Encoding ASCII
Set-Content -Path (Join-Path $bundleDir 'launch-claw-studio-desktop.cmd') -Value "@echo off`r`ncall .\\launch-claw-code-desktop.cmd`r`n" -Encoding ASCII

$readme = @'
# claw-code Complete Bundle

This bundle ships:

- The built AI Code Studio frontend
- The Electron desktop shell
- The Claw runtime source tree
- The Anthropic-compatible model gateway
- One-click launch scripts

## Before first launch

1. Install Rust and Cargo, or build the `claw` binary ahead of time.
2. Double-click `launch-claw-code-desktop.cmd`
3. Open the setup guide inside the app.
4. Fill in:
   - Upstream base URL
   - Upstream API key
   - Upstream model
   - Claw model
   - Workspace directory
   - Claw project directory
   - Optional Claw binary path

The app stores normal config in `tools/claw-launcher-ui/data/settings.json`.
In desktop mode, the API key is stored separately from the normal settings file.

## Notes

- This is a local Claw launcher, not an official Anthropic release.
- `runner=auto` prefers a built binary and falls back to `cargo run`.
- `launch-ai-code-studio.cmd` remains available as a browser fallback.
'@

Set-Content -Path (Join-Path $bundleDir 'README.md') -Value $readme -Encoding UTF8

Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $zipPath

Write-Host "Bundle created:"
Write-Host "  $bundleDir"
Write-Host "Zip created:"
Write-Host "  $zipPath"
